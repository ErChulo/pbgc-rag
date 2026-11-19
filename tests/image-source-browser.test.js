'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),target=process.env.PBGC_TEST_URL||'http://127.0.0.1:8795/',synthetic=!process.env.PBGC_TEST_URL;
test(`${target.startsWith('file:')?'actual offline file://':'supplementary HTTP only'} REAL standalone PNG, JPEG and WebP sources retain originals and OCR line regions`,{timeout:240000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext(),external=[],errors=[],prefix=new URL('.',target).href;
 if(target.startsWith('file:'))await context.setOffline(true);
 context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!target.startsWith('http')||!request.url().startsWith(prefix)))external.push(request.url());});
 if(synthetic)await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:8795')return route.abort();if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'wasm-unsafe-eval\'; connect-src \'none\'; worker-src blob:; object-src \'none\'"><script src="/assets/ocr.js"></script><script src="/assets/image-source.js"></script>'});const file=path.resolve(ROOT,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(ROOT+path.sep)||!/^\/(?:assets|vendor)\//.test(url.pathname)||!fs.existsSync(file))return route.abort();return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)});});
 else await context.route(/^https?:\/\//,route=>target.startsWith('http')&&route.request().url().startsWith(prefix)?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.recognizeImage==='function');
  if(!await page.evaluate(()=>typeof PBGCRag.parseImageBytes==='function'))await page.addScriptTag({url:new URL('assets/image-source.js',target).href});
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='black';ctx.font='52px Arial';ctx.fillText('Normal retirement age is 65.',40,115);ctx.font='40px Arial';ctx.fillText('SYNTHETIC IMAGE TEST ONLY',40,205);
   const outputs=[];
   for(const [mime,ext]of[['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.95));if(!blob||blob.type!==mime)throw Error('Browser image fixture encoder is unavailable.');const bytes=new Uint8Array(await blob.arrayBuffer()),original=bytes.slice(),parsed=await PBGCRag.parseImageBytes('synthetic-plan.'+ext,bytes),restored=await PBGCRag.parseImageBytes('synthetic-plan.'+ext,bytes);
    outputs.push({mime,parsed,unchanged:original.every((value,index)=>value===bytes[index]),reproducible:JSON.stringify(parsed.records)===JSON.stringify(restored.records),profileValid:PBGCRag.validateImageOcrProfile(parsed.sourceProcessing).schemaVersion===1});
   }
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),bytes=new Uint8Array(await blob.arrayBuffer()),controller=new AbortController();let cancellation,timeout;
   try{await PBGCRag.parseImageBytes('synthetic.png',bytes,{signal:controller.signal,onProgress:event=>{if(event.phase==='decode')controller.abort();}});}catch(error){cancellation=error.name;}
   try{await PBGCRag.parseImageBytes('synthetic.png',bytes,{timeoutMs:1});}catch(error){timeout=error.message;}
   return{outputs,cancellation,timeout};
  });
  for(const output of result.outputs){assert.equal(output.unchanged,true);assert.equal(output.reproducible,true);assert.equal(output.profileValid,true);assert.match(output.parsed.records.map(record=>record.text).join('\n'),/normal retirement age is 65/i);assert.equal(output.parsed.format,'image');assert.equal(output.parsed.imageCoverage.width,1200);assert.equal(output.parsed.imageCoverage.height,300);assert.ok(output.parsed.records.every(record=>record.locator.type==='image-ocr-line'&&record.locator.bbox.width>0&&record.locator.imageWidth===1200&&record.ocr.verification==='unverified-machine-text'&&record.ocr.confidence>=0));}
  assert.equal(result.cancellation,'AbortError');assert.match(result.timeout,/time limit/);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({profile:target.startsWith('file:')?'actual offline file://':'supplementary HTTP only',formats:result.outputs.map(output=>output.mime),originalsUnchanged:true,restoredOcrRecordsExact:true,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});
