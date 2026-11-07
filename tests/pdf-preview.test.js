'use strict';
// Synthetic original-page acceptance. Real rendering and simulated lifecycle races are separate.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {showAllTools}=require('./helpers/ui.js');
const {syntheticImagePdf}=require('./helpers/ocr-fixture.js');
const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const idle=page=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
async function ready(page){await page.waitForFunction(()=>{const canvas=document.querySelector('#source-preview-canvas');return canvas?.width>0&&canvas.height>0&&document.querySelector('#source-preview-cancel').hidden;},null,{timeout:30000});}
async function pixels(page){return page.locator('#source-preview-canvas').evaluate(async canvas=>{const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0,light=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i]<100&&bytes[i+1]<100&&bytes[i+2]<100)dark++;if(bytes[i]>240&&bytes[i+1]>240&&bytes[i+2]>240)light++;}return{width:canvas.width,height:canvas.height,dark,light,sha:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')};});}
function luminance(rgb){const channels=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+.05)/(values[1]+.05);}
async function previewContrast(page,theme){const pairs=await page.locator('#source-preview').evaluate(section=>[...section.querySelectorAll('button,label,span,p,input,select')].filter(node=>node.getClientRects().length&&!node.disabled).map(node=>{const style=getComputedStyle(node);let ancestor=node,background='rgba(0, 0, 0, 0)';while(ancestor&&(background==='rgba(0, 0, 0, 0)'||background==='transparent')){background=getComputedStyle(ancestor).backgroundColor;ancestor=ancestor.parentElement;}return{id:node.id||node.tagName,text:node.textContent.slice(0,45),color:style.color,background,border:style.borderTopColor,borderWidth:parseFloat(style.borderTopWidth),control:node.matches('button,input,select')};}));for(const pair of pairs){assert.ok(contrast(pair.color,pair.background)>=4.5,`${theme} preview ${pair.id} text contrast`);if(pair.control){assert.ok(pair.borderWidth>=1,`${theme} preview ${pair.id} boundary`);assert.ok(contrast(pair.border,pair.background)>=3,`${theme} preview ${pair.id} boundary contrast`);}}}
async function capture(page,name){await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results','pdf-preview-'+name+'.png'),fullPage:true,animations:'disabled'});}
async function session(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});if(target.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage(),external=[],errors=[],dialogs=[],popups=[];
 context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.type());await dialog.dismiss();});page.on('popup',popup=>{popups.push(popup.url());popup.close().catch(()=>{});});
 return{browser,context,page,external,errors,dialogs,popups};
}
async function documents(page){
 await page.goto(target);await showAllTools(page);await idle(page);
 const original=await syntheticImagePdf(page,{nativeFirst:true});
 await page.locator('#case-name').fill('Synthetic original-page review');await page.locator('#create-case').click();await idle(page);await page.locator('#pdf-ocr').uncheck();
 await page.locator('#files').setInputFiles([{name:'synthetic-original-pages.pdf',mimeType:'application/pdf',buffer:original},{name:'synthetic-separate.txt',mimeType:'text/plain',buffer:Buffer.from('Separate source marker.')}]);await idle(page);
 assert.doesNotMatch(await page.locator('#sources').innerText(),/Contains machine-read text/,'The scanned image page is not replaced by OCR-derived records in this test');
 return original;
}
const pdfRow=page=>page.locator('#sources li').filter({hasText:'synthetic-original-pages.pdf'});
const textRow=page=>page.locator('#sources li').filter({hasText:'synthetic-separate.txt'});
async function openPdf(page){await pdfRow(page).getByRole('button',{name:'View source',exact:true}).click();assert.equal(await page.locator('#source-view').isVisible(),true);}
async function assertCleared(page){await page.waitForFunction(()=>{const c=document.querySelector('#source-preview-canvas');return c&&c.width*c.height===0;},null,{timeout:5000});assert.equal(await page.locator('#source-preview-canvas').evaluate(canvas=>canvas.width*canvas.height),0,'Closed or abandoned preview releases the previous page raster');}

test(`${profile} REAL original PDF pages, including an unparsed image page, stay source-bound and readable`,{timeout:180000},async t=>{
 const{browser,context,page,external,errors,dialogs,popups}=await session();
 try{
  const original=await documents(page);await openPdf(page);
  assert.equal(await page.locator('#source-show-original').isVisible(),true);assert.equal(await page.locator('#source-preview').isVisible(),false);assert.equal(await page.locator('#source-records').isVisible(),true);
  assert.match(await page.locator('#source-records').innerText(),/Synthetic native text page\./);assert.doesNotMatch(await page.locator('#source-records').innerText(),/Normal retirement age is 65/,'The image-only page has no extracted text to recreate its appearance from');
  await page.locator('#source-show-original').click();await ready(page);
  assert.equal(await page.locator('#source-show-original').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#source-records').isVisible(),false);
  assert.equal(await page.locator('#source-preview-page').inputValue(),'1');assert.match(await page.locator('#source-preview-page-count').innerText(),/2/);
  assert.equal(await page.locator('#source-preview-prev').isDisabled(),true);assert.equal(await page.locator('#source-preview-next').isEnabled(),true);
  const first=await pixels(page);assert.ok(first.dark>20,'Native PDF text is actually rendered, not a blank white canvas');assert.ok(first.light>20);await capture(page,'01-native-page');
  await page.locator('#source-preview-next').click();await ready(page);
  assert.equal(await page.locator('#source-preview-page').inputValue(),'2');assert.equal(await page.locator('#source-preview-next').isDisabled(),true);
  await previewContrast(page,'dark');const second=await pixels(page);assert.ok(second.dark>100,'The original scanned page image renders without OCR');assert.ok(second.light>100);assert.notEqual(second.sha,first.sha,'Different original pages produce different raster bytes');await capture(page,'02-original-scan');
  await page.locator('#source-preview-zoom').selectOption('200');await ready(page);const zoomed=await pixels(page);assert.ok(zoomed.width>second.width,'Zoom rerenders the page with more pixels for reading');assert.ok(zoomed.width*zoomed.height<=8000000,'Preview stays inside the renderer pixel budget');
  const pending=page.waitForEvent('download');await page.locator('#source-save-original').click();const download=await pending;assert.equal(hash(await fs.readFile(await download.path())),hash(original),'Save original preserves every PDF byte');
  await page.locator('#source-preview-page').fill('1');await page.locator('#source-preview-go').click();await ready(page);assert.equal(await page.locator('#source-preview-page').inputValue(),'1');
  await page.evaluate(()=>{const render=PBGCRag.renderPdfPage;globalThis.__previewInvalidCalls=0;PBGCRag.renderPdfPage=(...args)=>{globalThis.__previewInvalidCalls++;return render(...args);};});
  for(const invalid of ['0','999']){await page.locator('#source-preview-page').fill(invalid);await page.locator('#source-preview-go').click();await page.locator('#source-preview-error').waitFor({state:'visible'});assert.match(await page.locator('#source-preview-error').innerText(),/1.*2|between|range|page/i);assert.match(await page.locator('#source-preview-page-count').innerText(),/Page 1 of 2/);}
  assert.equal(await page.evaluate(()=>globalThis.__previewInvalidCalls),0,'An invalid page number never reaches the PDF renderer');
  await page.locator('#source-preview-page').fill('2');await page.locator('#source-preview-go').click();await ready(page);assert.equal(await page.locator('#source-preview-error').isVisible(),false,'A valid page recovers from invalid input');
  await page.locator('#source-show-text').click();assert.equal(await page.locator('#source-records').isVisible(),true);assert.equal(await page.locator('#source-show-text').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#source-records').innerText(),/Synthetic native text page\./);
  await page.locator('#source-show-original').click();await ready(page);await page.locator('#source-preview-zoom').selectOption('fit');await ready(page);await page.setViewportSize({width:375,height:812});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The mobile document page does not widen the application viewport');const dialog=await page.locator('#source-view').boundingBox();assert.ok(dialog.width<=375);await capture(page,'03-mobile');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#source-view').isVisible(),false);await assertCleared(page);
  await page.locator('#theme-toggle').click();await openPdf(page);await page.locator('#source-show-original').click();await ready(page);await previewContrast(page,'light');await capture(page,'04-mobile-light');await page.locator('#source-close').click();await assertCleared(page);
  await textRow(page).getByRole('button',{name:'View source',exact:true}).click();assert.equal(await page.locator('#source-show-original').isVisible(),false,'A text file is not mislabeled as a PDF original page');assert.equal(await page.locator('#source-preview').isVisible(),false);assert.match(await page.locator('#source-records').innerText(),/Separate source marker/);await assertCleared(page);
  const txtPending=page.waitForEvent('download');await page.locator('#source-save-original').click();const txt=await txtPending;assert.equal(await fs.readFile(await txt.path(),'utf8'),'Separate source marker.','Save original follows the selected source instead of a prior PDF');await page.locator('#source-close').click();
  await page.setViewportSize({width:1280,height:900});await page.locator('#case-name').fill('Synthetic isolated empty case');await page.locator('#create-case').click();await idle(page);await assertCleared(page);assert.equal(await page.locator('#source-preview').isVisible(),false);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);assert.deepEqual(popups,[]);assert.equal(await page.locator('#source-view iframe,#source-view object,#source-view embed').count(),0,'Original pages use an inert raster, not an active document embed');
  t.diagnostic(JSON.stringify({profile,pages:2,unparsedImagePageRendered:true,originalSha256:hash(original),nativeDarkPixels:first.dark,imageDarkPixels:second.dark,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});

test(`${profile} SIMULATED renderer races: cancel, close, source change and retry never expose a stale page`,{timeout:180000},async t=>{
 const{browser,context,page,external,errors}=await session();
 try{
  await documents(page);await openPdf(page);await page.locator('#source-show-original').click();await ready(page);await page.locator('#source-show-text').click();
  await page.evaluate(()=>{globalThis.__previewRealRender=PBGCRag.renderPdfPage;globalThis.__previewPending=[];PBGCRag.renderPdfPage=(bytes,pageNumber,options={})=>new Promise(resolve=>globalThis.__previewPending.push({resolve,pageNumber,signal:options.signal}));globalThis.__releasePreview=index=>{const data=new Uint8ClampedArray(8*8*4).fill(255);globalThis.__previewPending[index].resolve({width:8,height:8,data,pageView:[0,0,600,200],transform:[1,0,0,-1,0,200],rotation:0});};});
  await page.locator('#source-show-original').click();await page.waitForFunction(()=>globalThis.__previewPending.length===1);assert.equal(await page.locator('#source-preview-cancel').isVisible(),true);
  await page.locator('#source-preview-cancel').click();assert.equal(await page.evaluate(()=>globalThis.__previewPending[0].signal.aborted),true,'Cancel propagates to the isolated renderer');assert.match(await page.locator('#source-preview-status').innerText(),/cancel/i);assert.equal(await page.locator('#source-preview-retry').isVisible(),true);await assertCleared(page);
  await page.evaluate(()=>globalThis.__releasePreview(0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await assertCleared(page);
  await page.locator('#source-preview-retry').click();await page.waitForFunction(()=>globalThis.__previewPending.length===2);await page.keyboard.press('Escape');await page.waitForFunction(()=>globalThis.__previewPending[1].signal.aborted,null,{timeout:5000});assert.equal(await page.evaluate(()=>globalThis.__previewPending[1].signal.aborted),true,'Closing the reader cancels the pending render');await assertCleared(page);
  await textRow(page).getByRole('button',{name:'View source',exact:true}).click();await page.evaluate(()=>globalThis.__releasePreview(1));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#source-preview').isVisible(),false);await assertCleared(page);assert.match(await page.locator('#source-records').innerText(),/Separate source marker/);await page.locator('#source-close').click();
  await page.evaluate(()=>{PBGCRag.renderPdfPage=globalThis.__previewRealRender;});await openPdf(page);await page.locator('#source-show-original').click();await ready(page);assert.ok((await pixels(page)).dark>20,'The real renderer recovers after cancellation and source changes');
  await page.evaluate(()=>{PBGCRag.renderPdfPage=async()=>{throw Error('Synthetic preview failure for lifecycle verification');};});await page.locator('#source-preview-zoom').selectOption('200');await page.locator('#source-preview-error').waitFor({state:'visible'});assert.match(await page.locator('#source-preview-error').innerText(),/could not be displayed|preview unavailable/i);assert.match(await page.locator('#source-verification').textContent(),/Synthetic preview failure/);await assertCleared(page);assert.equal(await page.locator('#source-preview-retry').isVisible(),true);
  await page.evaluate(()=>{PBGCRag.renderPdfPage=globalThis.__previewRealRender;});await page.locator('#source-preview-retry').click();await ready(page);assert.ok((await pixels(page)).dark>20,'Retry renders the actual original after a recoverable failure');
  await page.locator('#source-close').click();await assertCleared(page);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  t.diagnostic('Explicitly simulated late renderer results exercise lifecycle guards only. Real PDF pixel fidelity is verified separately.');
 }finally{await context.close();await browser.close();}
});
