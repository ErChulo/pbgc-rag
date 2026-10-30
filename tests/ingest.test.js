'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const moduleSource=fs.readFileSync(path.join(root,'assets/ingest.js'),'utf8');
const result=text=>({parserVersion:'test-1',records:[{text,locator:{type:'test'}}],warnings:[]});
function environment(options={}){
  const workers=[],revoked=[];
  class MockWorker{
    constructor(url){if(options.block)throw Error('Policy blocked');this.url=url;this.terminated=false;workers.push(this);}
    postMessage(message,transfer){this.message=message;this.transfer=transfer;}
    terminate(){this.terminated=true;}
    reply(payload){this.onmessage({data:{type:'result',requestId:this.message.requestId,result:payload}});}
  }
  const sandbox={module:{exports:{}},Uint8Array,ArrayBuffer,Blob,setTimeout,clearTimeout,Worker:options.noWorker?undefined:MockWorker,URL:{createObjectURL:()=> 'blob:test-'+workers.length,revokeObjectURL:url=>revoked.push(url)},PBGCRagIngestWorkerSource:'trusted generated code',PBGCRag:{parseBytes:async(name,bytes)=>result(new TextDecoder().decode(bytes))}};
  vm.runInNewContext(moduleSource,sandbox);
  return {api:sandbox.module.exports,workers,revoked,sandbox};
}
test('isolated parser serializes workers, copies inputs and releases each worker URL',async()=>{
  const env=environment(),bytes=new Uint8Array([65]),first=env.api.parseIsolatedBytes('first.docx',bytes),second=env.api.parseIsolatedBytes('second.docx',bytes);
  assert.equal(env.workers.length,1);assert.notEqual(env.workers[0].message.bytes,bytes.buffer);assert.equal(bytes[0],65);
  env.workers[0].reply(result('one'));assert.equal((await first).records[0].text,'one');
  assert.equal(env.workers[0].terminated,true);assert.equal(env.workers.length,2);
  env.workers[1].reply(result('two'));assert.equal((await second).records[0].text,'two');
  assert.equal(env.workers[1].terminated,true);assert.equal(env.revoked.length,2);
});
test('active and queued cancellation reject without running cancelled queue entries',async()=>{
  const env=environment(),active=new AbortController(),queued=new AbortController();
  const first=env.api.parseIsolatedBytes('a.docx',new Uint8Array([1]),{signal:active.signal});
  const second=env.api.parseIsolatedBytes('b.docx',new Uint8Array([1]),{signal:queued.signal});
  const firstRejected=assert.rejects(first,error=>error.name==='AbortError'),secondRejected=assert.rejects(second,error=>error.name==='AbortError');
  queued.abort();active.abort();await Promise.all([firstRejected,secondRejected]);
  assert.equal(env.workers.length,1);assert.equal(env.workers[0].terminated,true);assert.equal(env.revoked.length,1);
});
test('hard timeout terminates stalled workers and later requests can run',async()=>{
  const env=environment();await assert.rejects(env.api.parseIsolatedBytes('stalled.docx',new Uint8Array([1]),{timeoutMs:5}),/time limit/);
  assert.equal(env.workers[0].terminated,true);const next=env.api.parseIsolatedBytes('next.docx',new Uint8Array([1]));env.workers[1].reply(result('ok'));assert.equal((await next).records[0].text,'ok');
});
test('worker startup/runtime/message errors reject and release resources',async()=>{
  const blocked=environment({block:true});await assert.rejects(blocked.api.parseIsolatedBytes('x.docx',new Uint8Array([1])),/unavailable/);assert.equal(blocked.revoked.length,1);
  const env=environment(),first=env.api.parseIsolatedBytes('x.docx',new Uint8Array([1]));env.workers[0].onerror({preventDefault(){}});await assert.rejects(first,/worker failed/);
  const second=env.api.parseIsolatedBytes('x.docx',new Uint8Array([1]));env.workers[1].onmessageerror();await assert.rejects(second,/transferred/);
  const third=env.api.parseIsolatedBytes('x.docx',new Uint8Array([1]));env.workers[2].reply({parserVersion:'bad',records:[],warnings:null});await assert.rejects(third,/invalid records/);
  assert.equal(env.revoked.length,3);assert.ok(env.workers.every(worker=>worker.terminated));
});
test('bounded text fallback is explicit and binary formats never fall back',async()=>{
  const env=environment({noWorker:true});assert.equal((await env.api.parseIsolatedBytes('x.txt',new Uint8Array([65]))).records[0].text,'A');
  await assert.rejects(env.api.parseIsolatedBytes('x.docx',new Uint8Array([65])),/requires local Blob workers/);
  await assert.rejects(env.api.parseIsolatedBytes('large.txt',new Uint8Array(128*1024+1)),/unavailable/);
  const controller=new AbortController();controller.abort();await assert.rejects(env.api.parseIsolatedBytes('x.txt',new Uint8Array([65]),{signal:controller.signal}),error=>error.name==='AbortError');
});
test('queue, byte and timeout limits reject malformed requests before extra allocation',async()=>{
  const env=environment(),controller=new AbortController(),pending=[];
  for(let i=0;i<9;i++)pending.push(env.api.parseIsolatedBytes('x.docx',new Uint8Array([1]),{signal:controller.signal}).catch(error=>error));
  await assert.rejects(env.api.parseIsolatedBytes('extra.docx',new Uint8Array([1])),/queue is full/);
  controller.abort();await Promise.all(pending);assert.equal(env.workers.length,1);
  for(const timeoutMs of [0,-1,15001,NaN,1.5])await assert.rejects(env.api.parseIsolatedBytes('x.docx',new Uint8Array([1]),{timeoutMs}),/timeout/);
  await assert.rejects(env.api.parseIsolatedBytes('x.docx',new Uint8Array(5*1024*1024+1)),/5 MB/);
});
test('generated source is self-contained and current for available parser modules',()=>{
  const source=fs.readFileSync(path.join(root,'vendor/ingest-worker-source.js'),'utf8');
  assert.doesNotMatch(source,/\bimportScripts\s*\(/);assert.doesNotMatch(source,/\b(?:eval|fetch)\s*\(/);assert.doesNotMatch(source,/new\s+Function\s*\(/);
  const sandbox={};vm.runInNewContext(source,sandbox);assert.equal(typeof sandbox.PBGCRagIngestWorkerSource,'string');new vm.Script(sandbox.PBGCRagIngestWorkerSource);
  const check=require('node:child_process').spawnSync('python',['tools/build-ingest-worker.py','--check'],{cwd:root,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});


function syntheticOfficeBytes(){
  const {deflateRawSync}=require('node:zlib'),parts=[['[Content_Types].xml','<Types/>'],['word/document.xml','<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>Synthetic isolated Office evidence</w:t></w:r></w:p></w:body></w:document>']];
  const locals=[],directory=[];let offset=0;
  for(const[name,text]of parts){const n=Buffer.from(name),b=Buffer.from(text),data=deflateRawSync(b);let crc=0xffffffff;for(const byte of b){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);locals.push(l,n,data);
    const d=Buffer.alloc(46);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt16LE(8,10);d.writeUInt32LE(crc,16);d.writeUInt32LE(data.length,20);d.writeUInt32LE(b.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);directory.push(d,n);offset+=l.length+n.length+data.length;
  }const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Array.from(Buffer.concat([...locals,dir,end]));
}

test('real Chromium Blob worker supports strict-CSP parsing, failure, timeout and cancellation without external requests',async()=>{
  const {chromium}=require('playwright');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();const origin='http://127.0.0.1:9876',requests=[];
  const scripts=['assets/core.js','assets/formats.js','vendor/ingest-worker-source.js','assets/ingest.js'];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!==origin){await route.abort();return;}
    if(url.pathname==='/')await route.fulfill({contentType:'text/html',body:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; worker-src blob:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'"><title>Ingest worker verification</title>'+scripts.map(script=>'<script src="/'+script+'"></script>').join('')});
    else if(scripts.includes(url.pathname.slice(1)))await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8')});
    else await route.fulfill({status:404,body:''});
  });
  try{
    const page=await context.newPage();await page.goto(origin+'/');await page.waitForFunction(()=>typeof PBGCRag?.parseIsolatedBytes==='function');
    const actual=await page.evaluate(async officeBytes=>{
      const input=new TextEncoder().encode('Synthetic worker evidence\nSecond line');
      const parsed=await PBGCRag.parseIsolatedBytes('case.txt',input);
      const office=await PBGCRag.parseIsolatedBytes('case.docx',new Uint8Array(officeBytes));
      let invalid='';try{await PBGCRag.parseIsolatedBytes('bad.docx',input);}catch(error){invalid=error.message;}
      const original=PBGCRagIngestWorkerSource;PBGCRagIngestWorkerSource='self.onmessage = function () { while (true) {} };';
      let timedOut='';try{await PBGCRag.parseIsolatedBytes('stalled.docx',input,{timeoutMs:30});}catch(error){timedOut=error.message;}
      const controller=new AbortController();const promise=PBGCRag.parseIsolatedBytes('cancel.docx',input,{signal:controller.signal});controller.abort();let cancelled='';try{await promise;}catch(error){cancelled=error.name;}
      PBGCRagIngestWorkerSource=original;const recovered=await PBGCRag.parseIsolatedBytes('after.txt',input);
      return {parsed,office,inputLength:input.length,invalid,timedOut,cancelled,recovered};
    },syntheticOfficeBytes());
    assert.equal(actual.office.records[0].text,'Synthetic isolated Office evidence');assert.equal(actual.office.records[0].locator.paragraph,1);
    assert.equal(actual.parsed.records[0].text,'Synthetic worker evidence');assert.equal(actual.parsed.records[1].locator.line,2);assert.ok(actual.inputLength>0);assert.match(actual.invalid,/ZIP/);assert.match(actual.timedOut,/time limit/);assert.equal(actual.cancelled,'AbortError');assert.equal(actual.recovered.records.length,2);
    assert.ok(requests.every(url=>new URL(url).origin===origin),'No requests leave intercepted local origin');
  }finally{await context.close();await browser.close();}
});
