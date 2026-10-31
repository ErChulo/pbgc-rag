'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

test('extracted current package makes same-file restore visible and preserves cases after failed or cancelled restores',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-restore-feedback-'));
  const zip=path.join(directory,'workplace.zip'),extracted=path.join(directory,'extracted');
  let server,browser,context;
  try{
    execFileSync('python',[path.join(root,'tools/package.py'),'--out',zip],{encoding:'utf8'});
    execFileSync('python',['-c','import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])',zip,extracted]);
    const manifest=JSON.parse(await fs.readFile(path.join(extracted,'build-manifest.json'),'utf8'));
    assert.equal(manifest.version,'0.3');
    server=http.createServer(async(request,response)=>{
      try{
        const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
        const file=path.resolve(extracted,'.'+(pathname==='/'?'/index.html':pathname));
        if(!file.startsWith(extracted+path.sep))throw Error('Outside package');
        const bytes=await fs.readFile(file),type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
        response.writeHead(200,{'Content-Type':type});response.end(bytes);
      }catch{response.writeHead(404);response.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const url=`http://127.0.0.1:${server.address().port}/`,external=[],errors=[];
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
    context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&!request.url().startsWith(url))external.push(request.url());});
    await context.route(/^https?:\/\//,route=>route.request().url().startsWith(url)?route.continue():route.abort());
    page.on('pageerror',error=>errors.push(error.message));
    const idle=()=>page.waitForFunction(()=>!document.querySelector('#import-case').disabled);
    const exportData=async()=>{
      const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;
      const file=path.join(directory,`export-${Date.now()}.json`);await download.saveAs(file);return JSON.parse(await fs.readFile(file,'utf8'));
    };
    await page.goto(url);await idle();await page.locator('#demo').click();await idle();
    const initialId=await page.locator('#workspace-select').inputValue();
    const original=await exportData();const packagePath=path.join(directory,'same-synthetic-example.json');await fs.writeFile(packagePath,JSON.stringify(original));
    let lastId=initialId;
    for(let attempt=0;attempt<2;attempt++){
      const beforeCount=await page.locator('#workspace-select option').count();
      await page.locator('#import-case').setInputFiles(packagePath);await idle();
      assert.equal(await page.locator('#workspace-select option').count(),beforeCount+1);
      const activeId=await page.locator('#workspace-select').inputValue();assert.notEqual(activeId,lastId);lastId=activeId;
      const feedback=page.locator('#restore-feedback');assert.equal(await feedback.isVisible(),true);
      const text=await feedback.innerText();assert.match(text,/same-synthetic-example\.json/);assert.match(text,/1 (?:source|document)/i);assert.match(text,/3 (?:record|excerpt)/i);assert.match(text,/restor|active|opened/i);
      const selectedLabel=await page.locator('#workspace-select option:checked').innerText();assert.match(selectedLabel,/Synthetic example/);assert.ok(text.includes(selectedLabel),'summary identifies active restored copy');
      const labels=await page.locator('#workspace-select option').allTextContents();assert.equal(new Set(labels).size,labels.length,'saved workspaces have distinct display labels');
      assert.equal(await page.locator('#import-case').inputValue(),'','same file may be restored again');
      await feedback.getByRole('button',{name:'Search restored case',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'query');
      await page.locator('#query').fill('retirement');await page.locator('#search').click();await idle();assert.match(await page.locator('#results').innerText(),/Normal retirement age is 65/);
    }
    const restored=await exportData();assert.equal(restored.name,original.name,'display suffix does not mutate case name');assert.deepEqual(restored.sources.map(s=>[s.hash,s.bytesBase64,s.records]),original.sources.map(s=>[s.hash,s.bytesBase64,s.records]));
    const beforeFailureId=await page.locator('#workspace-select').inputValue(),beforeFailureCount=await page.locator('#workspace-select option').count();
    const corrupt=structuredClone(original);corrupt.sources[0].hash='0'.repeat(64);const corruptPath=path.join(directory,'tampered.json');await fs.writeFile(corruptPath,JSON.stringify(corrupt));
    await page.locator('#import-case').setInputFiles(corruptPath);await idle();
    assert.match(await page.locator('#restore-feedback').innerText(),/tampered\.json/);assert.match(await page.locator('#restore-feedback').innerText(),/integrity|hash|failed/i);assert.equal(await page.locator('#workspace-select').inputValue(),beforeFailureId);assert.equal(await page.locator('#workspace-select option').count(),beforeFailureCount);
    assert.deepEqual((await exportData()).sources,restored.sources,'failed restore leaves evidence unchanged');
    // Cancel in the same event turn, before asynchronous file reading can finish.
    await page.evaluate(text=>{
      const input=document.querySelector('#import-case'),transfer=new DataTransfer();transfer.items.add(new File([text],'cancelled-example.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#cancel-operation').click();
    },JSON.stringify(original));await idle();
    assert.match(await page.locator('#restore-feedback').innerText(),/cancel/i);assert.equal(await page.locator('#workspace-select').inputValue(),beforeFailureId);assert.equal(await page.locator('#workspace-select option').count(),beforeFailureCount);
    assert.deepEqual((await exportData()).sources,restored.sources,'cancelled restore leaves evidence unchanged');
    await page.locator('#import-case').setInputFiles(packagePath);await idle();await page.locator('#import-case').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/pbgc-restore-feedback-0.2.2.png'});
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    t.diagnostic('Verified extracted packaged build over supplementary loopback HTTP; managed Chromium file:// remains BLOCKED.');
  }finally{if(context)await context.close();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
