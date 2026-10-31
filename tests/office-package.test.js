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
const ROOT=path.resolve(__dirname,'..');
const ZIP=process.env.PBGC_OFFICE_ZIP||path.join(ROOT,'dist/PBGC-RAG-0.4-office.zip');
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
  let server,browser,context;
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
    const modelEntry=manifest.files.find(entry=>entry.path==='models/'+MODEL);assert.ok(modelEntry,'Model is inside this ZIP, not an external prerequisite');
    assert.equal(modelEntry.bytes,MODEL_BYTES);assert.equal(modelEntry.sha256,MODEL_SHA);
    assert.ok(manifest.files.some(entry=>entry.path==='models/LICENSE.Qwen2.5'),'Model license is delivered');
    assert.ok(manifest.files.some(entry=>entry.path==='OFFICE-START.md'),'Office-only instructions are delivered');
    for(const entry of manifest.files){
      assert.doesNotMatch(entry.path,/\\|^\/|^[A-Za-z]:|(?:^|\/)\.\.(?:\/|$)/);
      const file=path.resolve(extracted,entry.path);assert.ok(file.startsWith(extracted+path.sep));
      assert.equal((await fsp.stat(file)).size,entry.bytes,entry.path+' byte length');
      assert.equal(await hashFile(file),entry.sha256,entry.path+' exact bytes');
    }
    const modelPath=path.join(extracted,'models',MODEL),modelManifest=JSON.parse(await fsp.readFile(path.join(extracted,'models/qwen2.5-0.5b-instruct.manifest.json'),'utf8'));
    assert.equal(modelManifest.files[0].sha256,MODEL_SHA);
    const html=await fsp.readFile(path.join(extracted,'index.html'),'utf8');assert.match(html,/connect-src 'none'/);
    const prefix=pathToFileURL(extracted+path.sep).href;
    let target=pathToFileURL(path.join(extracted,'index.html')).href;
    if(!FILE){server=await serve(extracted);target=server.url;}
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    context=await browser.newContext();if(FILE)await context.setOffline(true);
    const page=await context.newPage(),external=[],outsidePackage=[],errors=[];
    context.on('request',request=>{
      const url=request.url();if(/^https?:|^wss?:/.test(url)&&(!server||!url.startsWith(server.url)))external.push(url);
      if(url.startsWith('file:')&&!url.startsWith(prefix))outsidePackage.push(url);
    });
    await context.route(/^https?:\/\//,route=>server&&route.request().url().startsWith(server.url)?route.continue():route.abort());
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(target);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Synthetic offline office package');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.locator('#files').setInputFiles({name:'office-offline-synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('Normal retirement age is 65.')});await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.getByText('Local model settings',{exact:true}).click();await page.locator('#rag-model-files').setInputFiles(modelPath);
    assert.equal(await page.locator('#rag-model-files').evaluate(input=>input.files[0].name),MODEL);
    const started=performance.now();await page.locator('#load-rag-model').click();await page.waitForFunction(()=>!document.querySelector('#load-rag-model').disabled,null,{timeout:180000});
    assert.match(await page.locator('#rag-model-status').innerText(),/Qwen.*loaded/i);
    await page.locator('#rag-answer-mode').selectOption('generated');await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();
    await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:180000});
    assert.match(await page.locator('#rag-status').innerText(),/^Generated answer\./);
    assert.match(await page.locator('#rag-answer').innerText(),/\b65\b/);
    const citations=await page.locator('#rag-citations').innerText();assert.match(citations,/office-offline-synthetic\.txt/);assert.match(citations,/Normal retirement age is 65\./);assert.doesNotMatch(citations,/\b[a-f0-9]{64}\b|"offset"|UTF-16/);
    await page.locator('#rag-citations').getByRole('button',{name:'View evidence',exact:true}).click();assert.match(await page.locator('#source-view').innerText(),/Normal retirement age is 65\./);await page.getByRole('button',{name:'Close evidence',exact:true}).click();
    await fsp.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results',`office-package-${FILE?'file':'http'}.png`),fullPage:true});
    assert.deepEqual(external,[],'No external connection attempts');assert.deepEqual(outsidePackage,[],'Every loaded file came from the extracted delivery');assert.deepEqual(errors,[]);
    t.diagnostic(JSON.stringify({profile:FILE?'actual file:// with browser network offline':'supplementary HTTP only',packageBytes:(await fsp.stat(ZIP)).size,manifestFiles:manifest.files.length,modelBytes:MODEL_BYTES,loadAndAnswerMs:Math.round(performance.now()-started),externalRequests:external.length,workplaceNeeds:'Extract ZIP; open index.html; choose included model using the app. No terminal, installation, server or network.'}));
  }finally{
    if(context)await context.close();if(browser)await browser.close();if(server)await server.close();await fsp.rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
