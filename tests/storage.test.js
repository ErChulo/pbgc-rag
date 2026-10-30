'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createRecoveryStore,RecoveryError} = require('../assets/storage.js');
const KEY = 'pbgc-rag.recovery.v1', LEGACY = 'pbgc-rag.workspace.v1';
const example = name => ({schemaVersion:1,id:name,name,sources:[]});
function localFake() {
  const data = new Map();
  return {data,fail:false,getItem:key=>data.get(key)??null,setItem(key,value){if(this.fail && key===KEY)throw Error('Quota exceeded');data.set(key,value);},removeItem(key){data.delete(key);}};
}
// Small event-driven IndexedDB test double. Staged writes commit on completion,
// and abort/error never copy the staged map to the durable state.
function indexedFake() {
  const control = {data:new Map(),fail:false,transactions:[]};
  const db = {objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
    const tx = {error:null,aborted:false};
    const staged = new Map(control.data); let pending=0, scheduled=false;
    function complete() { if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;if(pending||tx.aborted)return;if(mode==='readwrite')control.data=new Map(staged);tx.oncomplete?.();},0); }
    function request(fn) {const req={};pending++;queueMicrotask(()=>{if(tx.aborted)return;try{req.result=fn();req.onsuccess?.();}catch(error){tx.error=error;tx.aborted=true;tx.onerror?.();tx.onabort?.();}finally{pending--;complete();}});return req;}
    tx.abort=()=>{if(tx.aborted)return;tx.aborted=true;queueMicrotask(()=>tx.onabort?.());};
    tx.objectStore=()=>({get:key=>request(()=>staged.get(key)),put:(value,key)=>request(()=>{if(control.fail)throw Error('Disk full');staged.set(key,value);return key;}),delete:key=>request(()=>staged.delete(key))});
    control.transactions.push(mode); complete(); return tx;
  }};
  return Object.assign(control,{open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.();});return request;}});
}
test('memory fallback is explicit and copies inputs and outputs', async()=>{
  const store=await createRecoveryStore({indexedDB:null,localStorage:null});
  assert.equal(store.kind,'memory');assert.equal(store.info().persistent,false);
  assert.match(store.info().warnings.join(' '),/Memory only/);
  const value=example('A');const saved=await store.save(value);value.name='changed';
  assert.equal(saved.revision,1);assert.equal(saved.persistent,false);
  const loaded=await store.load();assert.equal(loaded.name,'A');loaded.name='mutated';assert.equal((await store.load()).name,'A');
});
test('local snapshots survive reinitialization and retain one previous version',async()=>{
  const local=localFake();let store=await createRecoveryStore({indexedDB:null,localStorage:local});
  assert.equal(store.kind,'localStorage');await store.save(example('A'));await store.save(example('B'));await store.save(example('C'));
  store=await createRecoveryStore({indexedDB:null,localStorage:local});
  assert.equal((await store.load()).name,'C');assert.equal((await store.load({previous:true})).name,'B');assert.equal(store.info().revision,3);
  assert.equal(JSON.parse(local.data.get(KEY)).previous.revision,2);
});
test('failed durable write rejects and preserves both last-good snapshots',async()=>{
  const local=localFake();const store=await createRecoveryStore({indexedDB:null,localStorage:local});
  await store.save(example('A'));await store.save(example('B'));const before=local.data.get(KEY);local.fail=true;
  await assert.rejects(store.save(example('C')),error=>error.code==='WRITE_FAILED');
  assert.equal(local.data.get(KEY),before);assert.equal((await store.load()).name,'B');assert.equal((await store.load({previous:true})).name,'A');assert.equal(store.info().revision,2);
  local.fail=false;assert.equal((await store.save(example('D'))).revision,3);
});
test('legacy workspace migration retains original and clear removes all recovery',async()=>{
  const local=localFake();const raw=JSON.stringify(example('Legacy'));local.data.set(LEGACY,raw);
  const store=await createRecoveryStore({indexedDB:null,localStorage:local});
  assert.equal(store.info().migrated,true);assert.equal((await store.load()).name,'Legacy');assert.equal(local.data.get(LEGACY),raw);
  await store.clear();assert.equal(await store.load(),null);assert.equal(local.data.has(KEY),false);assert.equal(local.data.has(LEGACY),false);
});
test('catalog payload and bounded serialized bytes support coordinator schema',async()=>{
  const store=await createRecoveryStore({indexedDB:null,localStorage:null,maxCaseBytes:1024});
  const catalog={schemaVersion:2,activeId:'A',cases:[example('A')],library:example('Reference')};
  await store.save(catalog);assert.deepEqual(await store.load(),catalog);
  await assert.rejects(store.save({text:'😀'.repeat(300)}),error=>error.code==='SIZE_LIMIT');
  assert.deepEqual(await store.load(),catalog);
  const cyclic={};cyclic.self=cyclic;await assert.rejects(store.save(cyclic),error=>error.code==='INVALID_CASE');
  await assert.rejects(store.save([]),error=>error.code==='INVALID_CASE');
});
test('corrupt recovery is reported and never overwritten until explicit clear',async()=>{
  const local=localFake();local.data.set(KEY,'{bad');
  const store=await createRecoveryStore({indexedDB:null,localStorage:local});
  await assert.rejects(store.load(),error=>error.code==='CORRUPT_RECOVERY');
  await assert.rejects(store.save(example('A')),error=>error.code==='CORRUPT_RECOVERY');assert.equal(local.data.get(KEY),'{bad');
  await store.clear();await store.save(example('A'));assert.equal((await store.load()).name,'A');
});
test('revision corruption is rejected and metadata cannot impersonate a snapshot',async()=>{
  const local=localFake();const snapshot={revision:1,savedAt:'2026-10-30T00:00:00.000Z',value:example('A')};
  local.data.set(KEY,JSON.stringify({version:1,current:snapshot,previous:snapshot}));
  const store=await createRecoveryStore({indexedDB:null,localStorage:local});
  await assert.rejects(store.load(),error=>error.code==='CORRUPT_RECOVERY');
});
test('concurrent saves serialize revisions and stale tabs detect conflicts',async()=>{
  const local=localFake();const first=await createRecoveryStore({indexedDB:null,localStorage:local});
  await Promise.all([first.save(example('A')),first.save(example('B')),first.save(example('C'))]);
  assert.equal(first.info().revision,3);assert.equal((await first.load()).name,'C');assert.equal((await first.load({previous:true})).name,'B');
  const stale=await createRecoveryStore({indexedDB:null,localStorage:local});await first.save(example('D'));
  await assert.rejects(stale.save(example('stale')),error=>error.code==='CONFLICT');assert.equal((await first.load()).name,'D');
});
test('IndexedDB is preferred, commits snapshots atomically and rejects failed writes',async()=>{
  const indexed=indexedFake(),local=localFake();const store=await createRecoveryStore({indexedDB:indexed,localStorage:local});
  assert.equal(store.kind,'IndexedDB');await store.save(example('A'));await store.save(example('B'));const before=indexed.data.get(KEY);
  indexed.fail=true;await assert.rejects(store.save(example('C')),error=>error.code==='WRITE_FAILED');assert.equal(indexed.data.get(KEY),before);assert.equal((await store.load()).name,'B');
  indexed.fail=false;const reopened=await createRecoveryStore({indexedDB:indexed,localStorage:local});assert.equal((await reopened.load({previous:true})).name,'A');
  await reopened.clear();assert.equal(indexed.data.has(KEY),false);assert.ok(indexed.transactions.includes('readwrite'));
});
test('IndexedDB failure falls back; inaccessible legacy storage does not break healthy IndexedDB',async()=>{
  const local=localFake();const unavailable={open(){throw Error('Blocked');}};
  assert.equal((await createRecoveryStore({indexedDB:unavailable,localStorage:local})).kind,'localStorage');
  const blocked={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');},removeItem(){throw Error('Blocked');}};
  const store=await createRecoveryStore({indexedDB:indexedFake(),localStorage:blocked});
  assert.equal(store.kind,'IndexedDB');assert.equal(await store.load(),null);await store.save(example('A'));assert.equal((await store.load()).name,'A');
});
test('bad options and dates reject explicitly',async()=>{
  await assert.rejects(createRecoveryStore({maxCaseBytes:0}),error=>error.code==='INVALID_OPTIONS');
  await assert.rejects(createRecoveryStore({timeoutMs:0}),error=>error.code==='INVALID_OPTIONS');
  const store=await createRecoveryStore({indexedDB:null,localStorage:null,now:()=> 'bad date'});
  await assert.rejects(store.save(example('A')),error=>error.code==='INVALID_DATE');assert.equal(await store.load(),null);
  assert.ok(new RecoveryError('X','message') instanceof Error);
});
