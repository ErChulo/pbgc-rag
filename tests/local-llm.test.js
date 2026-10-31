'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const modelPath=process.env.PBGC_MODEL_PATH||path.join(root,'dist/models/qwen2.5-0.5b-instruct-q4_k_m.gguf');
const required=process.env.PBGC_REQUIRE_MODEL==='1';
const targetURL=process.env.PBGC_TEST_URL||pathToFileURL(path.join(root,'index.html')).href;
test('local model manifest rejects altered, unbounded and unsupported metadata',()=>{
  const api=require('../assets/local-llm.js');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/local-llm/qwen2.5-0.5b-instruct.manifest.json'),'utf8'));
  assert.deepEqual(api.validateLocalModelManifest(manifest),manifest);
  for(const edit of [m=>m.schemaVersion=2,m=>m.files[0].sha256='wrong',m=>m.files[0].bytes=769*1024*1024,m=>m.files[0].name='../model.gguf',m=>m.chatTemplate='unknown',m=>m.files.push({...m.files[0]}),m=>m.license='']){
    const invalid=structuredClone(manifest);edit(invalid);assert.throws(()=>api.validateLocalModelManifest(invalid),{code:'INVALID_MANIFEST'});
  }
});
test(`${targetURL.startsWith('file:')?'actual file://':'supplementary HTTP only'} real local GGUF inference, cancellation and network isolation`,{timeout:240000,skip:!required&&!fs.existsSync(modelPath)?'Local model pack absent; set PBGC_MODEL_PATH and PBGC_REQUIRE_MODEL=1 for mandatory inference gate':false},async()=>{
  assert.ok(fs.existsSync(modelPath),'Required GGUF model is absent');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/local-llm/qwen2.5-0.5b-instruct.manifest.json'),'utf8'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext(),page=await context.newPage(),external=[];
    context.on('request',req=>{if(/^https?:|^wss?:/.test(req.url())&&!req.url().startsWith(process.env.PBGC_TEST_URL||'file:'))external.push(req.url());});
    await context.route(/^https?:\/\//,route=>route.request().url().startsWith(process.env.PBGC_TEST_URL||'file:')?route.continue():route.abort());
    await page.goto(targetURL);
    if(!await page.evaluate(()=>!!globalThis.PBGCRagWllama))await page.addScriptTag({url:new URL('vendor/local-llm/wllama-classic.js',targetURL).href});
    if(!await page.evaluate(()=>typeof globalThis.PBGCRag?.createLocalLlmProvider==='function'))await page.addScriptTag({url:new URL('assets/local-llm.js',targetURL).href});
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='llm-test-file';document.body.append(input);});
    await page.locator('#llm-test-file').setInputFiles(modelPath);
    const result=await page.evaluate(async manifest=>{
      const start=performance.now(),provider=await PBGCRag.createLocalLlmProvider({files:document.querySelector('#llm-test-file').files,manifest,timeoutMs:180000,generationTimeoutMs:180000});
      const loadedMs=performance.now()-start,info=provider.info();
      const output=await provider.generate({prompt:'Evidence: The normal retirement age is 65. Question: What is the normal retirement age? Answer in one sentence.',maxTokens:64,temperature:0});
      const generatedMs=performance.now()-start-loadedMs;
      const controller=new AbortController();let cancellation='';
      try{await provider.generate({prompt:'List the integers from 1 through 1000.',maxTokens:512,signal:controller.signal,onToken(){controller.abort();}});}catch(error){cancellation=error.name;}
      const afterCancel=provider.info();
      let reloadRequired='';try{await provider.generate({prompt:'Hello',maxTokens:1});}catch(error){reloadRequired=error.code;}
      await provider.dispose();return{output,loadedMs,generatedMs,info,cancellation,afterCancel,reloadRequired};
    },manifest);
    assert.match(result.output,/\b65\b/);assert.match(result.output,/retirement/i);
    assert.equal(result.info.cpuOnly,true);assert.equal(result.info.threads,1);assert.equal(result.info.modelBytes,491400032);
    assert.equal(result.cancellation,'AbortError');assert.equal(result.afterCancel.disposed,true);assert.equal(result.afterCancel.loaded,false);assert.equal(result.reloadRequired,'DISPOSED');
    assert.deepEqual(external,[]);
    console.log(JSON.stringify({model:manifest.id,loadMs:Math.round(result.loadedMs),generationMs:Math.round(result.generatedMs),cpuThreads:1,externalRequests:external.length}));
  }finally{await browser.close();}
});
