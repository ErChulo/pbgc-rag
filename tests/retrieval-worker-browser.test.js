'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';

test(`${profile} actual bounded chunk workers preserve source text, cancel promptly and enforce deadlines`,{timeout:60000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),external=[];
 try{
  if(target.startsWith('file:'))await context.setOffline(true);
  context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(!process.env.PBGC_TEST_URL||!url.startsWith(new URL('.',target).href)))external.push(url);});
  await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(new URL('.',target).href)?route.continue():route.abort());
  const page=await context.newPage();await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.chunkSourcesInWorker==='function');
  const result=await page.evaluate(async()=>{
   const source={id:'synthetic-worker',name:'synthetic-worker.txt',hash:'a'.repeat(64),parserVersion:'synthetic-worker-v1',records:[{text:'A complete sentence retains all qualifications. '.repeat(100),locator:{type:'text-line',line:1,offset:0}},{text:'The scanned value is 65.',locator:{type:'pdf-ocr-line',page:1,line:1},ocr:{engineId:'synthetic-test-ocr',confidence:24,verification:'unverified-machine-text',lowConfidence:true}}]};
   const options={maxChars:300,maxTokens:100,overlapChars:0},sync=PBGCRag.chunkSources([source],options),worker=await PBGCRag.chunkSourcesInWorker([source],options);
   const large={...source,records:[{text:'Synthetic cancellable sentence. '.repeat(40000),locator:{type:'text-line',line:1,offset:0}}]};
   const controller=new AbortController(),pending=PBGCRag.chunkSourcesInWorker([large],{signal:controller.signal});setTimeout(()=>controller.abort(),0);let cancelled;
   try{await pending;cancelled='unexpected-success';}catch(error){cancelled=error.name;}
   let deadline;try{await PBGCRag.chunkSourcesInWorker([large],{timeoutMs:1});deadline='unexpected-success';}catch(error){deadline=error.message;}
   let invalidSignal;try{await PBGCRag.chunkSourcesInWorker([source],{signal:{}});invalidSignal='unexpected-success';}catch(error){invalidSignal=error.message;}
   return{identical:JSON.stringify(sync)===JSON.stringify(worker),chunks:worker.chunks.length,machine:worker.chunks.find(chunk=>chunk.hasMachineText)?.minimumOcrConfidence,cancelled,deadline,invalidSignal};
  });
  assert.equal(result.identical,true);assert.ok(result.chunks>1);assert.equal(result.machine,24);assert.equal(result.cancelled,'AbortError');assert.match(result.deadline,/hard time limit/);assert.match(result.invalidSignal,/cancellation signal/);assert.deepEqual(external,[]);t.diagnostic(JSON.stringify({profile,...result,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});

test(`${profile} actual local encoder worker measures tokenizer coverage and preserves pinned embeddings`,{timeout:120000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),external=[];
 try{
  if(target.startsWith('file:'))await context.setOffline(true);
  context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(!process.env.PBGC_TEST_URL||!url.startsWith(new URL('.',target).href)))external.push(url);});
  await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(new URL('.',target).href)?route.continue():route.abort());
  const page=await context.newPage();await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.createEmbeddingProvider==='function');
  const result=await page.evaluate(async()=>{
   const provider=await PBGCRag.createEmbeddingProvider();try{
    const coverage=await provider.inspectTextCoverage(['The retirement age is 65.','\u0378\u0378\u0378']);
    const vectors=await provider.embedTexts(['The retirement age is 65.','The retirement age is 65.']);
    let unknown;try{await provider.embedTexts(['\u0378\u0378\u0378']);unknown='unexpected-success';}catch(error){unknown=error.message;}
    return {providerId:provider.id,coverage,vectorsIdentical:Array.from(vectors[0]).every((value,index)=>value===vectors[1][index]),dimension:vectors[0].length,norm:Math.hypot(...vectors[0]),unknown};
   }finally{provider.dispose();}
  });
  assert.equal(result.coverage[0].measured,true);assert.equal(result.coverage[0].ratio,1);assert.equal(result.coverage[1].embeddable,false);assert.equal(result.coverage[1].ratio,0);assert.equal(result.dimension,384);assert.equal(result.vectorsIdentical,true);assert.ok(Math.abs(result.norm-1)<1e-5);assert.match(result.unknown,/no known model tokens/);assert.deepEqual(external,[]);t.diagnostic(JSON.stringify({profile,providerId:result.providerId,coverageMeasuredInWorker:true,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});
