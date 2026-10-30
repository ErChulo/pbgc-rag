'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

test('extracted portable package serves all runtime assets, supports isolated import/search and clears both recovery snapshots',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-portable-')),zipPath=path.join(directory,'workplace.zip'),extracted=path.join(directory,'extracted');
  let server,browser,context;
  try{
    const metadata=JSON.parse(execFileSync('python',[path.join(root,'tools/package.py'),'--out',zipPath],{encoding:'utf8'}));
    execFileSync('python',['-c','import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])',zipPath,extracted]);
    const manifest=JSON.parse(await fs.readFile(path.join(extracted,'build-manifest.json'),'utf8'));
    assert.equal(manifest.kind,'pbgc-rag-workplace-build');assert.equal(manifest.official,false);assert.match(manifest.fileProfileAcceptance,/BLOCKED/);
    assert.ok(manifest.files.length>10);
    for(const entry of manifest.files){
      const file=path.resolve(extracted,entry.path);assert.ok(file.startsWith(extracted+path.sep));assert.doesNotMatch(entry.path,/(?:^|\/)(?:\.git|tests|fixtures)(?:\/|$)/);
      const contents=await fs.readFile(file);assert.equal(contents.length,entry.bytes);assert.equal(crypto.createHash('sha256').update(contents).digest('hex'),entry.sha256);
    }
    const html=await fs.readFile(path.join(extracted,'index.html'),'utf8');
    const references=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)].map(match=>match[1]);
    for(const ref of references){assert.doesNotMatch(ref,/^(?:[a-z]+:|\/\/)/i);assert.ok((await fs.stat(path.join(extracted,ref))).isFile());}
    const served=[];
    server=http.createServer(async(request,response)=>{
      try{
        const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname),relative=pathname==='/'?'/index.html':pathname,file=path.resolve(extracted,'.'+relative);
        if(!file.startsWith(extracted+path.sep))throw Error('path outside extracted package');
        const data=await fs.readFile(file);served.push(relative);const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'}[path.extname(file)]||'application/octet-stream';response.writeHead(200,{'Content-Type':mime});response.end(data);
      }catch{response.writeHead(404);response.end('Not found');}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const url=`http://127.0.0.1:${server.address().port}/`;
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});context=await browser.newContext();const page=await context.newPage(),external=[],errors=[];
    context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&!request.url().startsWith(url))external.push(request.url());});page.on('pageerror',error=>errors.push(error.message));
    await context.route(/^https?:\/\//,route=>route.request().url().startsWith(url)?route.continue():route.abort());
    await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#demo').disabled);await page.locator('#demo').click();await page.waitForFunction(()=>!document.querySelector('#demo').disabled);
    await page.locator('#files').setInputFiles({name:'packaged-worker.txt',mimeType:'text/plain',buffer:Buffer.from('PackagedWorkerEvidence814\n'+'synthetic retained text '.repeat(7000))});await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.locator('#query').fill('PackagedWorkerEvidence814');await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);assert.match(await page.locator('#results').innerText(),/PackagedWorkerEvidence814/);
    assert.ok(references.every(ref=>served.includes('/'+ref)),'all entry assets were served from extracted package');assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    await page.getByText('Recovery backups and privacy',{exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.locator('#erase-recovery').click();await page.waitForFunction(()=>!document.querySelector('#erase-recovery').disabled);assert.equal(await page.locator('#sources li').count(),0);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#demo').disabled);assert.equal(await page.locator('#sources li').count(),0);assert.equal(await page.locator('#workspace-select option').count(),2);
    await page.locator('#recover-previous').click();await page.waitForFunction(()=>!document.querySelector('#recover-previous').disabled);assert.match(await page.locator('#status').innerText(),/No previous recovery snapshot/);
    t.diagnostic(JSON.stringify({packageBytes:metadata.bytes,manifestFiles:manifest.files.length,runtimeEntryAssets:references.length,delivery:'supplementary loopback HTTP from extracted ZIP; file profile remains blocked'}));
  }finally{if(context)await context.close();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
