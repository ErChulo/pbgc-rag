'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const MODEL_MANIFEST=require('../vendor/local-llm/bundled.manifest.json');
const MODEL_SPEC=MODEL_MANIFEST.files[0];
const modelPath=process.env.PBGC_MODEL_PATH||process.env.PBGC_LLM_MODEL||path.join(root,'dist/models',MODEL_SPEC.name);
const required=process.env.PBGC_REQUIRE_MODEL==='1';
const targetURL=process.env.PBGC_TEST_URL||pathToFileURL(path.join(root,'index.html')).href;
test('local model manifest rejects altered, unbounded and unsupported metadata',()=>{
  const api=require('../assets/local-llm.js');
  const manifest=structuredClone(MODEL_MANIFEST);
  assert.deepEqual(api.validateLocalModelManifest(manifest),manifest);
  for(const edit of [m=>m.schemaVersion=2,m=>m.files[0].sha256='wrong',m=>m.files[0].bytes=769*1024*1024,m=>m.files[0].name='../model.gguf',m=>m.chatTemplate='unknown',m=>m.files.push({...m.files[0]}),m=>m.license='']){
    const invalid=structuredClone(manifest);edit(invalid);assert.throws(()=>api.validateLocalModelManifest(invalid),{code:'INVALID_MANIFEST'});
  }
});
// Protocol-only fixtures: no model inference, Blob construction or worker runs here.
function protocolFixture(size=48){
  const buffer=new ArrayBuffer(size),bytes=new Uint8Array(buffer);for(let i=8;i<size;i++)bytes[i]=i%251;
  const header=new DataView(buffer);header.setUint32(0,0x46554747,true);header.setUint32(4,3,true);
  const manifest={schemaVersion:1,id:'MOCK-buffer-protocol',name:'Protocol fixture only',license:'Apache-2.0',source:'https://example.invalid/protocol-only',chatTemplate:'plain',files:[{name:'protocol.gguf',bytes:size,sha256:createHash('sha256').update(bytes).digest('hex')}]};
  return {buffer,manifest};
}
function protocolAdapter(consume,{clone=structuredClone}={}){
  const state={created:0,terminated:0,loaded:false,input:null};
  class Runtime{
    constructor(){state.created++;this.proxy={worker:{terminate(){state.terminated++;}}};}
    async loadModel(inputs,config){state.input=inputs[0];state.config=config;await consume(state);state.loaded=true;}
    isModelLoaded(){return state.loaded;}
    isMultithread(){return false;}
  }
  const sandbox={module:{exports:{}},ArrayBuffer,Uint8Array,DataView,Blob,ReadableStream,structuredClone:clone,Worker:class{},WebAssembly:{validate:()=>true},crypto:webcrypto,TextDecoder,setTimeout,clearTimeout,URL:{revokeObjectURL(){}},PBGCRagWllama:{Wllama:Runtime}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/local-llm.js'),'utf8'),sandbox);
  return {api:sandbox.module.exports,state};
}
async function consumeProtocolStream(state){
  assert.equal(state.input.name,'protocol.gguf');assert.equal(typeof state.input.arrayBuffer,'undefined','Buffer loading does not construct a native Blob/File');
  const digest=createHash('sha256'),reader=state.input.stream().getReader();let bytes=0,chunks=0;
  while(true){const next=await reader.read();if(next.done)break;const chunk=next.value;
    assert.ok(chunk.byteLength<=8*1024*1024);assert.equal(chunk.byteLength,chunk.buffer.byteLength,'Each worker transfer owns only its bounded copied chunk');
    const moved=structuredClone(chunk,{transfer:[chunk.buffer]});assert.equal(chunk.byteLength,0);digest.update(moved);bytes+=moved.byteLength;chunks++;
  }
  state.consumedBytes=bytes;state.digest=digest.digest('hex');state.chunks=chunks;
}
test('MOCK buffer protocol takes exclusive ownership and streams exact bounded copies without native Blob storage',async()=>{
  const fixture=protocolFixture(8*1024*1024+29),expected=fixture.manifest.files[0];
  const {api,state}=protocolAdapter(consumeProtocolStream);
  const pending=api.createLocalLlmProvider({modelBuffer:fixture.buffer,manifest:fixture.manifest});
  assert.equal(fixture.buffer.byteLength,0,'The caller cannot mutate bytes after ownership transfer');
  const provider=await pending;
  assert.equal(state.consumedBytes,expected.bytes);assert.equal(state.digest,expected.sha256);assert.equal(state.chunks,2);assert.equal(state.config.n_threads,1);assert.equal(state.config.n_ctx,2048);
  assert.throws(()=>state.input.stream(),{code:'DISPOSED'},'Loading releases the private input once wllama has consumed it');
  assert.equal(provider.info().sha256,expected.sha256);assert.equal(provider.info().loaded,true);await provider.dispose();assert.equal(state.terminated,1);
});
test('MOCK buffer protocol rejects wrong size, mixed inputs, unsupported ownership and bad integrity before runtime initialization',async()=>{
  for(const kind of ['size','mixed','no-clone','hash','header']){
    const fixture=protocolFixture(),{api,state}=protocolAdapter(consumeProtocolStream,{clone:kind==='no-clone'?null:structuredClone});
    const options={modelBuffer:fixture.buffer,manifest:fixture.manifest};let code='INTEGRITY';
    if(kind==='size')options.manifest.files[0].bytes++;
    if(kind==='mixed'){options.files=[];code='INVALID_INPUT';}
    if(kind==='no-clone')code='UNAVAILABLE';
    if(kind==='hash')options.manifest.files[0].sha256='0'.repeat(64);
    if(kind==='header'){new Uint8Array(fixture.buffer)[0]=0;code='INVALID_MODEL';}
    await assert.rejects(api.createLocalLlmProvider(options),{code},kind);assert.equal(state.created,0,kind);
    assert.equal(fixture.buffer.byteLength,['size','mixed','no-clone'].includes(kind)?48:0,kind+' ownership timing');
  }
});
test('MOCK buffer protocol clears private input on abort and runtime failure while preserving hard cancellation',async()=>{
  {
    const fixture=protocolFixture(),controller=new AbortController(),{api,state}=protocolAdapter(consumeProtocolStream);
    await assert.rejects(api.createLocalLlmProvider({modelBuffer:fixture.buffer,manifest:fixture.manifest,signal:controller.signal,onProgress({phase}){if(phase==='loading')controller.abort();}}),{name:'AbortError',code:'ABORTED'});
    assert.equal(fixture.buffer.byteLength,0);assert.equal(state.created,0,'A synchronous progress abort cannot create a late untracked worker');
  }
  for(const kind of ['abort','runtime-error']){
    const fixture=protocolFixture(),controller=new AbortController();let reached;const reading=new Promise(resolve=>{reached=resolve;});
    const {api,state}=protocolAdapter(async current=>{const reader=current.input.stream().getReader();await reader.read();reached();if(kind==='runtime-error')throw Error('MOCK runtime rejected model');await new Promise(()=>{});});
    const pending=api.createLocalLlmProvider({modelBuffer:fixture.buffer,manifest:fixture.manifest,signal:controller.signal});
    const rejection=assert.rejects(pending,kind==='abort'?{name:'AbortError',code:'ABORTED'}:/MOCK runtime rejected model/);
    await reading;if(kind==='abort')controller.abort();await rejection;
    assert.equal(fixture.buffer.byteLength,0);assert.equal(state.terminated,1);assert.throws(()=>state.input.stream(),{code:'DISPOSED'},kind+' input cleanup');
  }
});
test(`${targetURL.startsWith('file:')?'actual file://':'supplementary HTTP only'} real local GGUF inference, cancellation and network isolation`,{timeout:240000,skip:!required&&!fs.existsSync(modelPath)?'Local model pack absent; set PBGC_MODEL_PATH and PBGC_REQUIRE_MODEL=1 for mandatory inference gate':false},async()=>{
  assert.ok(fs.existsSync(modelPath),'Required GGUF model is absent');
  const manifest=structuredClone(MODEL_MANIFEST);
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
    assert.equal(result.info.cpuOnly,true);assert.equal(result.info.threads,1);assert.equal(result.info.modelBytes,MODEL_SPEC.bytes);assert.equal(result.info.sha256,MODEL_SPEC.sha256);assert.equal(result.info.model,MODEL_MANIFEST.name);
    assert.equal(result.cancellation,'AbortError');assert.equal(result.afterCancel.disposed,true);assert.equal(result.afterCancel.loaded,false);assert.equal(result.reloadRequired,'DISPOSED');
    assert.deepEqual(external,[]);
    console.log(JSON.stringify({model:manifest.id,loadMs:Math.round(result.loadedMs),generationMs:Math.round(result.generatedMs),cpuThreads:1,externalRequests:external.length}));
  }finally{await browser.close();}
});
