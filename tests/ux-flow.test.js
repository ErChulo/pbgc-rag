'use strict';
// Synthetic first-run acceptance: use the guide, never the all-tools shortcut.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const views=['case','documents','ask','search','save'];
async function session(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
 if(target.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage(),external=[],errors=[];
 context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
 page.on('pageerror',error=>errors.push(error.message));
 return {browser,context,page,external,errors};
}
const idle=page=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
async function guide(page,step){await page.waitForFunction(step=>document.querySelector('#guide')?.dataset.step===step,step);assert.equal(await page.locator('#guide').getAttribute('data-step'),step);}
async function capture(page,name){await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results','ux-flow-'+name+'.png'),fullPage:true,animations:'disabled'});}

test(`${profile} first-run wizard explains Qwen and guides a source-backed first question, save and reopen`,{timeout:240000},async t=>{
 const {browser,context,page,external,errors}=await session();
 try{
  await page.goto(target);await idle(page);await guide(page,'welcome');
  assert.equal(await page.locator('#welcome').isVisible(),true);
  assert.equal(await page.locator('#guide-start').isVisible(),true);
  assert.equal(await page.locator('#rag-question').isVisible(),false,'The question form does not compete with the welcome step');
  assert.equal(await page.locator('h1').count(),1);await capture(page,'01-welcome');
  await page.locator('#guide-start').click();await guide(page,'qwen');
  assert.equal(await page.locator('#start-qwen').isVisible(),true,'Qwen has a visible primary setup action');
  assert.match(await page.locator('#panel-qwen').innerText(),/Qwen/i);
  assert.match(await page.locator('#panel-qwen').innerText(),/offline|this computer|local/i);
  assert.equal(await page.locator('#qwen-next').isDisabled(),true,'The guide cannot claim Qwen is ready before loading it');
  assert.equal(await page.locator('#rag-model-files').isVisible(),false,'New users do not need the advanced model file picker');
  await capture(page,'02-qwen');
  await page.locator('#guide-back').click();await guide(page,'welcome');
  await page.locator('#guide-start').click();await guide(page,'qwen');
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  assert.match(await page.locator('#active-case').textContent(),/My first case/i,'The guide creates a case without a separate naming task');
  assert.equal(await page.locator('#continue-ask').isDisabled(),true,'An empty case cannot continue to asking');
  await page.locator('#files').setInputFiles({name:'guided-synthetic-plan.txt',mimeType:'text/plain',buffer:Buffer.from('Normal retirement age is 65.\nSynthetic test information only.')});await idle(page);
  assert.match(await page.locator('#sources').innerText(),/guided-synthetic-plan\.txt/);
  await capture(page,'03-documents');
  await page.locator('#continue-ask').click();await guide(page,'ask');
  assert.equal(await page.locator('#rag-answer-mode').inputValue(),'extractive','Skipping Qwen chooses source passages honestly');
  assert.ok(await page.locator('#rag-question').getAttribute('placeholder'),'The guide offers an example for the first question');
  await page.locator('#rag-question').fill('What is the normal retirement age?');
  await page.locator('#guide-back').click();await guide(page,'documents');assert.match(await page.locator('#sources').innerText(),/guided-synthetic-plan\.txt/,'Back keeps the imported document');
  await page.locator('#continue-ask').click();await guide(page,'ask');
  await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();await idle(page);
  assert.match(await page.locator('#rag-citations').innerText(),/Normal retirement age is 65\./);
  assert.doesNotMatch(await page.locator('#rag-citations').innerText(),/\b[a-f0-9]{64}\b|UTF-16|"offset"/);
  await page.locator('#rag-citations').getByRole('button',{name:'View evidence',exact:true}).first().click();
  assert.equal(await page.locator('#source-view').isVisible(),true);assert.match(await page.locator('#source-records').innerText(),/Normal retirement age is 65\./);
  await page.locator('#source-close').click();assert.equal(await page.locator('#finish-guide').isVisible(),true);await capture(page,'04-first-answer');
  await page.locator('#finish-guide').click();assert.equal(await page.locator('#all-tools').getAttribute('aria-pressed'),'false');
  await page.locator('#flow-save').click();
  const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;await idle(page);
  const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(exported.sources.length,1);assert.equal(exported.name,'My first case');
  await page.locator('#import-case').setInputFiles({name:'guided-case-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await idle(page);
  assert.equal(await page.locator('#restore-feedback').isVisible(),true);assert.match(await page.locator('#restore-feedback').innerText(),/guided-case-backup\.json/);
  await page.locator('#flow-case').click();await page.locator('#case-name').fill('Synthetic separate empty case');await page.locator('#create-case').click();await idle(page);
  await page.locator('#flow-ask').click();assert.equal(await page.locator('#rag-question').inputValue(),'','Changing cases clears the prior private question');assert.doesNotMatch(await page.locator('#rag-citations').innerText(),/guided-synthetic-plan|retirement age is 65/);
  for(const viewport of [{width:1280,height:900},{width:375,height:812}]){
   await page.setViewportSize(viewport);
   for(const theme of ['dark','light']){
    const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
    for(const view of views){await page.locator('#flow-'+view).click();assert.equal(await page.locator('#panel-'+view).isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} ${theme} ${viewport.width}px has no horizontal overflow`);}
   }
  }
  await page.locator('#guide-restart').click();await guide(page,'welcome');await capture(page,'05-mobile-guide');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#guide-start').click();await guide(page,'qwen');
  const moving=await page.evaluate(()=>document.getAnimations().filter(animation=>{const timing=animation.effect?.getTiming();return timing&&typeof timing.duration==='number'&&timing.duration>50;}).length);
  assert.equal(moving,0,'Reduced motion removes nonessential long transitions');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({profile,mainFlow:'welcome→Qwen explanation→automatic case→documents→question→source→save/reopen',themes:2,viewportWidths:[1280,375],reducedMotion:true,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});

test(`${profile} sample walkthrough provides a first question without a case name or document picker`,{timeout:180000},async()=>{
 const {browser,context,page,external,errors}=await session();
 try{
  await page.goto(target);await idle(page);await guide(page,'welcome');
  await page.locator('#guide-sample').click();await guide(page,'qwen');
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  assert.ok(await page.locator('#sources li').count()>0,'The walkthrough supplies its clearly synthetic document');
  assert.match(await page.locator('#sources').innerText(),/synthetic|sample/i);
  assert.equal(await page.locator('#continue-ask').isEnabled(),true);
  await page.locator('#continue-ask').click();await guide(page,'ask');
  await page.locator('#suggested-question').click();assert.ok((await page.locator('#rag-question').inputValue()).trim().length);
  await page.locator('#ask-question').click();await idle(page);
  assert.match(await page.locator('#rag-citations').innerText(),/65/);
  assert.equal(await page.locator('#finish-guide').isVisible(),true);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test(`${profile} developer core reports a missing Qwen pack and keeps a working source-passage route`,{timeout:60000,skip:require('node:fs').existsSync(path.join(ROOT,'models/qwen-pack.js'))?'Source tree has the bundled Qwen scripts; missing-pack recovery is not exercised.':false},async()=>{
 const {browser,context,page,external,errors}=await session();
 try{
  await page.goto(target);await idle(page);await page.locator('#guide-start').click();await guide(page,'qwen');
  await page.locator('#start-qwen').click();await page.waitForFunction(()=>!document.querySelector('#qwen-error').hidden,null,{timeout:30000});await idle(page);
  await page.waitForFunction(()=>document.activeElement.id==='start-qwen',null,{timeout:10000});
  assert.match(await page.locator('#qwen-error').innerText(),/complete.*office|office.*package|included.*package/i,'The error points to the complete office delivery instead of asking the user to assemble a model');
  assert.equal(await page.locator('#qwen-next').isDisabled(),true,'Failed model startup never claims readiness');
  assert.equal(await page.locator('#qwen-skip').isEnabled(),true);
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  assert.equal(await page.locator('#files').isEnabled(),true,'The user can continue to source passages after a setup failure');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test('supplementary HTTP only Qwen setup cancels a pending local part, rejects an incomplete retry and preserves source fallback',{timeout:60000,skip:!process.env.PBGC_TEST_URL?'HTTP interception tests loader error handling; actual offline bundled inference is verified by the office-package gate.':false},async()=>{
 const {browser,context,page,external,errors}=await session();
 const manifest=require('../assets/model-profile.js');
 // Synthetic metadata only, never a fake model or fake inference result.
 const totalBytes=manifest.files[0].bytes,chunkBytes=8388608;
 const pack={schemaVersion:1,model:manifest,totalBytes,chunks:Array.from({length:Math.ceil(totalBytes/chunkBytes)},(_,index)=>({path:`models/qwen-part-${String(index).padStart(3,'0')}.js`,bytes:Math.min(chunkBytes,totalBytes-index*chunkBytes),sha256:'0'.repeat(64)}))};
 let parts=0,releasePart,firstPart;
 const pendingPart=new Promise(resolve=>{releasePart=resolve;});
 const reachedPart=new Promise(resolve=>{firstPart=resolve;});
 await page.route('**/models/qwen-pack.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.PBGCQwenPack='+JSON.stringify(pack)+';'}));
 await page.route('**/models/qwen-part-000.js',async route=>{
  parts++;
  if(parts===1){firstPart();await pendingPart;await route.abort().catch(()=>{});}
  else await route.fulfill({contentType:'text/javascript',body:'globalThis.PBGCQwenPart={index:0,data:""};'});
 });
 try{
  await page.goto(target);await idle(page);await page.locator('#guide-start').click();await guide(page,'qwen');
  const requested=page.waitForRequest(request=>request.url().endsWith('/models/qwen-part-000.js'),{timeout:15000});
  await page.locator('#start-qwen').click();await requested;await reachedPart;
  assert.equal(await page.locator('#qwen-cancel').isVisible(),true);await page.locator('#qwen-cancel').click();
  await idle(page);releasePart();
  assert.equal(await page.locator('#qwen-next').isDisabled(),true);assert.doesNotMatch(await page.locator('#assistant-state').innerText(),/Qwen.*Ready/i);
  assert.match(await page.locator('#qwen-error').innerText(),/cancel/i,'Cancellation is acknowledged without a false ready state');
  await page.waitForFunction(()=>document.activeElement.id==='start-qwen',null,{timeout:10000});
  await page.locator('#start-qwen').click();await page.waitForFunction(()=>!document.querySelector('#qwen-error').hidden);await idle(page);
  await page.waitForFunction(()=>document.activeElement.id==='start-qwen',null,{timeout:10000});
  assert.equal(parts,2,'Retry opens the local pack again instead of remaining stuck in loading');
  assert.match(await page.locator('#qwen-error').innerText(),/incomplete|integrity|extract/i);
  assert.doesNotMatch(await page.locator('#qwen-error').innerText(),/already running/i);
  assert.equal(await page.locator('#qwen-next').isDisabled(),true);
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  assert.equal(await page.locator('#files').isEnabled(),true);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{releasePart();await context.close();await browser.close();}
});

test(`${profile} guided documents read a scanned PDF automatically and Back keeps the same case and original source`,{timeout:180000},async()=>{
 const {browser,context,page,external,errors}=await session();
 try{
  await page.goto(target);await idle(page);await page.locator('#guide-start').click();await guide(page,'qwen');
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  const caseId=await page.locator('#workspace-select').inputValue(),caseOptions=await page.locator('#workspace-select option').count();
  assert.equal(await page.locator('#pdf-ocr').isChecked(),true,'The guided import prepares scanned-page reading automatically');
  assert.equal(await page.locator('#pdf-ocr').isVisible(),false,'New users do not have to discover an OCR setting');
  const {syntheticImagePdf}=require('./helpers/ocr-fixture.js');
  const original=await syntheticImagePdf(page);
  await page.locator('#files').setInputFiles({name:'guided-image-only-plan.pdf',mimeType:'application/pdf',buffer:original});await idle(page);
  assert.match(await page.locator('#sources').innerText(),/guided-image-only-plan\.pdf/);
  assert.match(await page.locator('#sources').innerText(),/machine-read text/i);
  const downloaded=page.waitForEvent('download');
  await page.locator('#sources').getByRole('button',{name:'Save original',exact:true}).click();
  const source=await downloaded;
  assert.deepEqual(await fs.readFile(await source.path()),original,'Automatic OCR keeps every original PDF byte unchanged');
  await page.locator('#guide-back').click();await guide(page,'qwen');
  await page.locator('#qwen-skip').click();await idle(page);await guide(page,'documents');
  assert.equal(await page.locator('#workspace-select').inputValue(),caseId,'Back and Continue keep the active case');
  assert.equal(await page.locator('#workspace-select option').count(),caseOptions,'Returning through the guide does not create another case');
  assert.equal(await page.locator('#sources li').count(),1,'The guide does not duplicate the imported document');
  await page.locator('#continue-ask').click();await guide(page,'ask');
  await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();await idle(page);
  assert.match(await page.locator('#rag-citations').innerText(),/65/);
  assert.match(await page.locator('#rag-citations').innerText(),/machine-read|OCR/i);
  await page.locator('#rag-citations').getByRole('button',{name:'View evidence',exact:true}).first().click();
  assert.match(await page.locator('#source-meta').innerText(),/OCR|machine-read/i);
  assert.match(await page.locator('#source-records').innerText(),/65/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});
