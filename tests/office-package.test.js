'use strict';
// Development acceptance test. The extracted office app needs none of these tools.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {monitorResources,DEFAULT_BUDGET}=require('../tools/measure-resources.js');
const {syntheticImagePdf}=require('./helpers/ocr-fixture.js');
const ROOT=path.resolve(__dirname,'..');
const ZIP=process.env.PBGC_OFFICE_ZIP||path.join(ROOT,'dist/PBGC-RAG-0.7-office.zip');
const FILE=process.env.PBGC_OFFICE_FILE==='1';
const MODEL='qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_BYTES=491400032;
const MODEL_SHA='74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db';
async function hashFile(filename){const digest=crypto.createHash('sha256');for await(const block of fs.createReadStream(filename))digest.update(block);return digest.digest('hex');}
async function serve(directory){
  const base=await fsp.realpath(directory),requests=[];
  const server=http.createServer(async(request,response)=>{
    try{
      if(request.method!=='GET'){response.writeHead(405);response.end();return;}
      const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
      if(pathname.includes('\\')||pathname.includes('\0'))throw Error('Invalid path');
      const file=await fsp.realpath(path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname)));
      if(!file.startsWith(base+path.sep)||(await fsp.stat(file)).isDirectory())throw Error('Path outside extracted package');
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream';
      requests.push(path.relative(base,file));response.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});fs.createReadStream(file).on('error',()=>response.destroy()).pipe(response);
    }catch{response.writeHead(404);response.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return{url:`http://127.0.0.1:${server.address().port}/`,requests,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();})};
}
const required=process.env.PBGC_REQUIRE_OFFICE==='1';
test(`${FILE?'actual offline file://':'supplementary HTTP only'} complete extracted office ZIP includes verified Qwen and generates an exact-source answer`,{
  timeout:480000,
  skip:!required&&!fs.existsSync(ZIP)?'Complete office ZIP absent; no office delivery acceptance is established by this run.':false
},async t=>{
  assert.ok(fs.existsSync(ZIP),'Required complete office ZIP is absent. Build it before running the office gate.');
  const temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'pbgc office package ')),extracted=path.join(temporary,'Extracted office app with spaces');
  let server,browser,context,monitor,resourceError;
  try{
    // Python is development tooling only; the delivered ZIP contains the ready model.
    execFileSync('python',['-c',`import pathlib,stat,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 for item in z.infolist():
  p=pathlib.PurePosixPath(item.filename)
  assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in item.filename and ':' not in item.filename, 'unsafe ZIP path'
  assert not stat.S_ISLNK(item.external_attr >> 16), 'ZIP symlink'
 assert z.testzip() is None, 'ZIP CRC failure'
 z.extractall(sys.argv[2])`,ZIP,extracted],{maxBuffer:1024*1024});
    const manifest=JSON.parse(await fsp.readFile(path.join(extracted,'build-manifest.json'),'utf8'));
    assert.equal(manifest.kind,'pbgc-rag-workplace-build');assert.equal(manifest.official,false);
    assert.ok(manifest.includedGenerationModel,'The complete delivery identifies its bundled Qwen model');
    assert.equal(manifest.includedGenerationModel.files[0].bytes,MODEL_BYTES);
    assert.equal(manifest.includedGenerationModel.files[0].sha256,MODEL_SHA);
    assert.ok(manifest.files.some(entry=>entry.path.startsWith('models/')&&entry.path.endsWith('.js')),'Qwen is inside classic offline script assets, not a user-selected prerequisite');
    assert.ok(manifest.files.some(entry=>entry.path==='models/LICENSE.Qwen2.5'),'Model license is delivered');
    assert.ok(manifest.files.some(entry=>entry.path==='OFFICE-START.md'),'Office-only instructions are delivered');
    for(const entry of manifest.files){
      assert.doesNotMatch(entry.path,/\\|^\/|^[A-Za-z]:|(?:^|\/)\.\.(?:\/|$)/);
      const file=path.resolve(extracted,entry.path);assert.ok(file.startsWith(extracted+path.sep));
      assert.equal((await fsp.stat(file)).size,entry.bytes,entry.path+' byte length');
      assert.equal(await hashFile(file),entry.sha256,entry.path+' exact bytes');
    }
    const modelManifest=JSON.parse(await fsp.readFile(path.join(extracted,'models/qwen2.5-0.5b-instruct.manifest.json'),'utf8'));
    assert.equal(modelManifest.files[0].sha256,MODEL_SHA);
    const html=await fsp.readFile(path.join(extracted,'index.html'),'utf8');assert.match(html,/connect-src 'none'/);
    const prefix=pathToFileURL(extracted+path.sep).href;
    let target=pathToFileURL(path.join(extracted,'index.html')).href;
    if(!FILE){server=await serve(extracted);target=server.url;}
    monitor=await monitorResources({onLimit:error=>{resourceError=error;browser?.close().catch(()=>{});}});
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    context=await browser.newContext();if(FILE)await context.setOffline(true);
    const page=await context.newPage(),external=[],outsidePackage=[],errors=[];
    context.on('request',request=>{
      const url=request.url();if(/^https?:|^wss?:/.test(url)&&(!server||!url.startsWith(server.url)))external.push(url);
      if(url.startsWith('file:')&&!url.startsWith(prefix))outsidePackage.push(url);
    });
    await context.route(/^https?:\/\//,route=>server&&route.request().url().startsWith(server.url)?route.continue():route.abort());
    page.on('pageerror',error=>errors.push(error.message));
    let fileChoosers=0;page.on('filechooser',()=>fileChoosers++);
    await page.goto(target);await page.waitForFunction(()=>!document.querySelector('#guide-start').disabled);
    assert.equal(await page.locator('#welcome').isVisible(),true);
    await page.locator('#guide-start').click();await page.waitForFunction(()=>document.querySelector('#guide').dataset.step==='qwen');
    assert.match(await page.locator('#panel-qwen').innerText(),/Qwen/i);
    const started=performance.now();await page.locator('#start-qwen').click();
    await page.waitForFunction(()=>!document.querySelector('#qwen-next').disabled,null,{timeout:180000});
    assert.equal(fileChoosers,0,'The complete office package starts Qwen without asking the user to find any model file');
    assert.match(await page.locator('#assistant-state').innerText(),/Qwen.*ready|ready.*Qwen/i);
    assert.match(await page.locator('#rag-model-status').textContent(),/Qwen.*loaded/i);
    await page.locator('#qwen-next').click();await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.locator('#files').setInputFiles({name:'office-offline-synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('Normal retirement age is 65.')});await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.locator('#continue-ask').click();await page.waitForFunction(()=>document.querySelector('#guide').dataset.step==='ask');
    assert.equal(await page.locator('#all-tools').getAttribute('aria-pressed'),'false','Real office acceptance uses the first-run wizard');
    assert.equal(await page.locator('#rag-answer-mode').inputValue(),'generated','Starting Qwen selects written answers without a second setting');
    await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();
    await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:180000});
    assert.match(await page.locator('#rag-status').innerText(),/^Generated answer\./);
    assert.match(await page.locator('#rag-answer').innerText(),/\b65\b/);
    const citations=await page.locator('#rag-citations').innerText();assert.match(citations,/office-offline-synthetic\.txt/);assert.match(citations,/Normal retirement age is 65\./);assert.doesNotMatch(citations,/\b[a-f0-9]{64}\b|"offset"|UTF-16/);
    await page.locator('#rag-citations').getByRole('button',{name:'View evidence',exact:true}).click();assert.match(await page.locator('#source-view').innerText(),/Normal retirement age is 65\./);await page.getByRole('button',{name:'Close evidence',exact:true}).click();
    await page.locator('#finish-guide').click();await page.locator('#flow-documents').click();const scanned=await syntheticImagePdf(page);await page.locator('#pdf-ocr').check();await page.locator('#files').setInputFiles({name:'office-synthetic-scanned.pdf',mimeType:'application/pdf',buffer:scanned});await page.waitForFunction(()=>!document.querySelector('#files').disabled,null,{timeout:180000});
    assert.match(await page.locator('#sources').innerText(),/office-synthetic-scanned\.pdf/);assert.match(await page.locator('#sources').innerText(),/machine-read text/i);
    await page.locator('#flow-search').click();await page.locator('#query').fill('retirement');await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);assert.match(await page.locator('#results').innerText(),/Machine-read line/);
    await fsp.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results',`office-package-${FILE?'file':'http'}.png`),fullPage:true});
    assert.deepEqual(external,[],'No external connection attempts');assert.deepEqual(outsidePackage,[],'Every loaded file came from the extracted delivery');assert.deepEqual(errors,[]);
    const resources=await monitor.stop();monitor=null;assert.equal(resourceError,undefined,resourceError?.message);assert.deepEqual(resources.errors,[]);assert.ok(resources.samples>=2);assert.equal(resources.exceeded,false);assert.ok(resources.peak.budgetMetricBytes<=DEFAULT_BUDGET);await fsp.mkdir(path.join(ROOT,'test-results'),{recursive:true});await fsp.writeFile(path.join(ROOT,'test-results',`office-resources-${FILE?'file':'http'}.json`),JSON.stringify({status:'PASS',scope:'Harness Node and full Chromium descendant tree: bundled Qwen script reconstruction, verified model load, one generated answer and scanned PDF OCR',budgetBytes:DEFAULT_BUDGET,...resources},null,2)+'\n');t.diagnostic(JSON.stringify({bundledStartupPeakWorkloadBytes:resources.peak.budgetMetricBytes,samples:resources.samples,budgetBytes:DEFAULT_BUDGET}));
    t.diagnostic(JSON.stringify({profile:FILE?'actual file:// with browser network offline':'supplementary HTTP only',packageBytes:(await fsp.stat(ZIP)).size,manifestFiles:manifest.files.length,modelBytes:MODEL_BYTES,loadAndAnswerMs:Math.round(performance.now()-started),externalRequests:external.length,workplaceNeeds:'Extract ZIP; open index.html; click Start and Start Qwen. No model picker, terminal, installation, server or network.'}));
  }finally{
    if(monitor)await monitor.stop();if(context)await context.close();if(browser)await browser.close();if(server)await server.close();await fsp.rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
