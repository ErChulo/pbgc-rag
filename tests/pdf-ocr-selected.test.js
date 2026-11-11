'use strict';

// Protocol tests only: native parsing, raster workers and OCR recognition are
// mocked. These fixtures do not establish real PDF rendering/OCR accuracy.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto}=require('node:crypto');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../assets/pdf-ocr.js'), 'utf8');
const ENGINE = 'synthetic-mocked-ocr-v1';
const json = value => JSON.parse(JSON.stringify(value));
const bytes = () => new TextEncoder().encode('%PDF-1.4\n% synthetic protocol fixture');
const line = (text, bbox = {x:10, y:10, width:40, height:10}, confidence = 95) => ({text, bbox, confidence});
function native(text, page, advanceBox = [10,10,50,20]) {
  const locator = {type:'pdf-text-item', page, item:1, transform:[1,0,0,1,10,20], width:40, height:10,
    pageView:[0,0,100,100], pageRotation:0, coordinateSystem:'PDF user space',
    regionPrecision:'approximate text advance box; not glyph bounds'};
  if (advanceBox !== null) locator.advanceBox = advanceBox;
  return {text, locator};
}
function profile(overrides = {}) {
  // A null prototype makes this input valid across the VM realm boundary.
  return Object.assign(Object.create(null), {schemaVersion:2, pdfOcr:'selected-pages', engineId:ENGINE,
    base:'native', pages:[1]}, overrides);
}
function harness(options = {}) {
  const records = options.records || [],engineId=options.engineId||ENGINE;
  const requests = [], workers = [], recognitions = [], revoked = [];
  let lastPage, clock = 0, parserCalls = 0;
  const raster = page => ({width:100, height:100, data:new Uint8ClampedArray(100*100*4),
    pageView:[0,0,100,100], rotation:0, transform:[1,0,0,1,0,0], ...(options.raster?.(page) || {})});
  class MockRasterWorker {
    constructor() { this.terminated = false; workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(request) {
      requests.push({action:request.action, page:request.pageNumber});
      if (options.hang === request.action) return;
      queueMicrotask(() => {
        if (this.terminated) return;
        if (request.action === 'render') lastPage = request.pageNumber;
        const result = request.action === 'inspect' ? {pages:options.pages || 1} : raster(request.pageNumber);
        this.onmessage({data:{ok:true, result}});
      });
    }
  }
  const sandbox = {
    module:{exports:{}}, crypto:options.crypto||webcrypto, Uint8Array, Uint8ClampedArray, TextDecoder, TextEncoder, AbortController, Blob,
    Worker:MockRasterWorker, URL:{createObjectURL:()=>'blob:synthetic-mocked-raster', revokeObjectURL:url=>revoked.push(url)},
    setTimeout, clearTimeout,
    Date:class extends Date { static now() { return options.virtualClock ? clock : Date.now(); } },
    PBGCRag:{
      OCR_ENGINE:{id:engineId}, pdfOcrRenderWorkerSource:'/* mock: no parser or renderer is executed */',
      async parsePdfBytes() {
        parserCalls++;
        return {format:'pdf', parserVersion:options.nativeVersion||'synthetic-mocked-native-v1', records:json(records),
          warnings:['PDF text extraction only. Synthetic fixture.']};
      },
      async recognizeImage(image, config) {
        recognitions.push({page:lastPage, width:image.width, height:image.height, timeoutMs:config.timeoutMs});
        if (options.advanceClock) clock += options.advanceClock;
        return {engine:{id:options.returnEngine || engineId}, lines:json(options.lines?.[lastPage] || [])};
      }
    }
  };
  vm.runInNewContext(SCRIPT, sandbox, {filename:'assets/pdf-ocr.js'});
  return {api:sandbox.module.exports, requests, workers, recognitions, revoked,
    get parserCalls() { return parserCalls; }};
}

test('MOCK protocol: selected-page profiles are strict, versioned and ordered', () => {
  const {api} = harness();
  const valid = api.validatePdfOcrProfile(profile({pages:[2,1]}));
  assert.deepEqual(json(valid), {schemaVersion:2, pdfOcr:'selected-pages', engineId:ENGINE, base:'native', pages:[2,1]});
  assert.ok(Object.isFrozen(valid) && Object.isFrozen(valid.pages));
  assert.deepEqual(json(api.validatePdfOcrProfile(Object.assign(Object.create(null),
    {schemaVersion:1, pdfOcr:'missing-text', engineId:ENGINE}))),
  {schemaVersion:1, pdfOcr:'missing-text', engineId:ENGINE});
  const sparse = new Array(2); sparse[1] = 2;
  const invalid = [
    profile({extra:true}), profile({pages:[1,1]}), profile({pages:sparse}),
    profile({pages:Array.from({length:21}, (_,i)=>i+1)}), profile({pages:[]}),
    profile({pages:[0]}), profile({pages:[201]}), profile({pages:[1.5]}), profile({pages:['1']}),
    profile({base:'all-pages'}), profile({engineId:'different-engine'}), profile({schemaVersion:3}),
    Object.assign(Object.create(null), {schemaVersion:1, pdfOcr:'missing-text', engineId:ENGINE, pages:[1]})
  ];
  for (const candidate of invalid) assert.throws(() => api.validatePdfOcrProfile(candidate), /profile|page numbers/);
});

test('MOCK protocol: native prefix stays exact; selected pages append in acquisition order, including on rebuild', async () => {
  const original = [native('Native header one',1), native('Native header two',2)];
  const before = json(original), data = bytes(), originalBytes = data.slice();
  const {api, requests, recognitions} = harness({pages:3, records:original,
    lines:{1:[line('Image body one')], 2:[line('Normal retirement age is 65.')]}});
  const parsed = await api.parsePdfWithOcr(data, {mode:'selected-pages', pages:[2,1], base:'native'});
  assert.deepEqual(json(parsed.records.slice(0,original.length)), before);
  assert.deepEqual(json(original), before, 'native input objects and locators are unchanged');
  assert.deepEqual(data, originalBytes, 'original PDF bytes are unchanged');
  assert.deepEqual(parsed.records.slice(original.length).map(record=>record.locator.page), [2,1]);
  assert.deepEqual(requests.filter(request=>request.action==='render').map(request=>request.page), [2,1]);
  assert.deepEqual(recognitions.map(event=>event.page), [2,1], 'unselected image-only page three is not read');
  assert.ok(parsed.records.slice(original.length).every(record=>record.ocr.verification==='unverified-machine-text'));
  assert.deepEqual(json(parsed.sourceProcessing), json(profile({pages:[2,1]})));
  const rebuilt = await api.parsePdfWithOcr(data, {mode:'selected-pages', ...json(parsed.sourceProcessing)});
  assert.deepEqual(json(rebuilt.records), json(parsed.records));
  assert.equal(rebuilt.parserVersion, parsed.parserVersion);
  const earlier = await api.parsePdfWithOcr(data, {mode:'selected-pages', pages:[2]});
  assert.deepEqual(json(parsed.records.slice(0,earlier.records.length)), json(earlier.records),
    'adding the next acquired page preserves all previously acquired record indices');
  const otherOrder = await api.parsePdfWithOcr(data, {mode:'selected-pages', pages:[1,2]});
  assert.notEqual(otherOrder.parserVersion, parsed.parserVersion, 'ordered processing selection changes parser identity');
});

test('MOCK protocol: only exact normalized text at overlapping projected native positions is suppressed', async () => {
  const records = [native(' Cafe\u0301   plan ',1,[5,5,25,10])];
  const lines = [line('Caf\u00e9 plan'), line('Caf\u00e9 plan',{x:10,y:60,width:40,height:10}),
    line('caf\u00e9 plan'), line('Caf\u00e9 plan',{x:45,y:10,width:40,height:10})];
  const {api} = harness({records, lines:{1:lines}, raster:()=>({transform:[2,0,0,2,0,0]})});
  const result = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]});
  assert.deepEqual(json(result.records[0]), records[0]);
  const ocr = result.records.slice(1);
  assert.equal(ocr.length, 3);
  assert.deepEqual(ocr.map(record=>record.locator.line), [2,3,4], 'line locators retain original machine line positions');
  assert.equal(ocr[0].locator.bbox.y, 60, 'same phrase elsewhere remains evidence');
  assert.equal(ocr[1].text, 'caf\u00e9 plan', 'case differences are not normalized away');
  assert.ok(result.warnings.some(warning=>/1 duplicate OCR lines/.test(warning)));
});

test('MOCK protocol: conflicting native 99 and machine 65 remain separate, unverified evidence', async () => {
  const records = [native('Normal retirement age is 99.',1)];
  const {api} = harness({records, lines:{1:[line('Normal retirement age is 65.')]}});
  const result = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]});
  assert.deepEqual(json(result.records.slice(0,1)), records);
  assert.deepEqual(result.records.map(record=>record.text), ['Normal retirement age is 99.','Normal retirement age is 65.']);
  assert.equal(result.records[1].ocr.verification, 'unverified-machine-text');
});

test('MOCK protocol: uncertain or absent native geometry never suppresses matching OCR', async () => {
  for (const box of [null, [1,1,1,10], [NaN,1,30,10], [200,200,220,220]]) {
    const record = native('Same phrase',1,box);
    const {api} = harness({records:[record], lines:{1:[line('Same phrase')]}});
    const parsed = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]});
    assert.equal(parsed.records.length, 2);
    assert.equal(parsed.records[1].ocr.verification, 'unverified-machine-text');
  }
});

test('MOCK protocol: v1 missing-text ordering is an exact prefix of selected-pages missing-text rebuild', async () => {
  const records = [native('Native page two',2), native('Native page four',4)];
  const {api, requests} = harness({pages:4, records, lines:{1:[line('Scan one')], 2:[line('Selected body two')],
    3:[line('Scan three')], 4:[line('Selected body four')]}});
  const legacy = await api.parsePdfWithOcr(bytes());
  assert.deepEqual(legacy.records.map(record=>record.locator.page), [1,2,3,4]);
  const selected = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', base:'missing-text', pages:[4,2]});
  assert.deepEqual(json(selected.records.slice(0,legacy.records.length)), json(legacy.records));
  assert.deepEqual(selected.records.slice(legacy.records.length).map(record=>record.locator.page), [4,2]);
  assert.deepEqual(requests.filter(request=>request.action==='render').map(request=>request.page), [1,3,1,3,4,2]);
  const restored = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', ...json(selected.sourceProcessing)});
  assert.deepEqual(json(restored.records), json(selected.records));
});

test('MOCK protocol: missing-text base overlap, outside pages and combined >20 pages reject before raster acquisition', async () => {
  const overlap = harness({pages:2, records:[native('Native header',1)]});
  await assert.rejects(overlap.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', base:'missing-text', pages:[2]}), /already belongs/);
  assert.equal(overlap.recognitions.length, 0);
  const outside = harness({pages:2, records:[native('Native header',1)]});
  await assert.rejects(outside.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[3]}), /outside this PDF/);
  assert.equal(outside.recognitions.length, 0);
  const total = harness({pages:21, records:[native('Native header',1)]});
  await assert.rejects(total.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', base:'missing-text', pages:[1]}), /20 pages/);
  assert.equal(total.recognitions.length, 0);
  assert.ok([overlap,outside,total].every(item=>item.requests.every(request=>request.action==='inspect')));
});

test('MOCK protocol: base and selected OCR accept exactly 20 pages', async () => {
  const {api, recognitions} = harness({pages:20, records:[native('Native header',1)], lines:{1:[line('New body')]}});
  const result = await api.parsePdfWithOcr(bytes(), {mode:'selected-pages', base:'missing-text', pages:[1]});
  assert.equal(recognitions.length, 20);
  assert.deepEqual(recognitions.map(event=>event.page), [...Array.from({length:19},(_,i)=>i+2),1]);
  assert.equal(result.records[0].text, 'Native header');
  assert.equal(result.records.at(-1).text, 'New body');
});

test('MOCK protocol: cancellation terminates the active isolated raster worker', async () => {
  const before = new AbortController(); before.abort();
  const pre = harness();
  await assert.rejects(pre.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1], signal:before.signal}),
    error=>error.name==='AbortError');
  assert.equal(pre.requests.length, 0);
  const active = harness({hang:'render'}), controller = new AbortController();
  const work = active.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1], signal:controller.signal});
  const timer = setTimeout(()=>controller.abort(),10);
  try { await assert.rejects(work,error=>error.name==='AbortError'); } finally { clearTimeout(timer); }
  assert.ok(active.requests.some(request=>request.action==='render'));
  assert.ok(active.workers.every(worker=>worker.terminated));
  assert.equal(active.revoked.length, active.workers.length);
});

test('MOCK protocol: total timeout bounds a hanging renderer and later OCR processing', async () => {
  const stalled = harness({hang:'render'});
  await assert.rejects(stalled.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1], timeoutMs:25}), /time limit|time budget/);
  assert.ok(stalled.workers.every(worker=>worker.terminated));
  const elapsed = harness({virtualClock:true, advanceClock:11, lines:{1:[line('Too late')]}});
  await assert.rejects(elapsed.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1], timeoutMs:10}), /time budget|time limit/);
  assert.equal(elapsed.recognitions.length, 1);
});

test('MOCK protocol: invalid raster bounds, OCR engine, confidence and line regions fail closed', async () => {
  const invalidRasters = [()=>({width:4097}), ()=>({width:3000,height:3000}), ()=>({data:new Uint8ClampedArray(1)}),
    ()=>({transform:[1,0,0,1,0]}), ()=>({pageView:[0,0,NaN,100]})];
  for (const raster of invalidRasters) {
    const {api, recognitions} = harness({raster});
    await assert.rejects(api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]}), /invalid raster or geometry/);
    assert.equal(recognitions.length, 0);
  }
  const badEngine = harness({returnEngine:'different-engine'});
  await assert.rejects(badEngine.api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]}), /engine identity/);
  for (const badLine of [line('Bad confidence',undefined,101), line('Outside',{x:120,y:0,width:10,height:10}),
    line('Invalid box',{x:0,y:0,width:NaN,height:10})]) {
    const {api} = harness({lines:{1:[badLine]}});
    await assert.rejects(api.parsePdfWithOcr(bytes(), {mode:'selected-pages', pages:[1]}), /confidence|geometry|outside/);
  }
});

test('MOCK protocol: selected-page request rejects invalid controls before parsing', async () => {
  const {api} = harness();
  for (const options of [{mode:'selected-pages',pages:[1,1]}, {mode:'selected-pages',pages:[1],base:'all-pages'},
    {mode:'selected-pages',pages:[1],timeoutMs:180001}, {mode:'selected-pages',pages:[1],onProgress:1}]) {
    await assert.rejects(api.parsePdfWithOcr(bytes(), options), /page numbers|profile|timeout|progress/);
  }
});


test('MOCK protocol: selected parser identity is bounded and binds ordered pages, base, engine and native parser version',async()=>{
  const pages=Array.from({length:20},(_,index)=>200-index),records=[native('Header',1)];
  const {api}=harness({pages:200,records});
  const parsed=await api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages});
  assert.match(parsed.parserVersion,/^pdf-ocr-selected-v2:[a-f0-9]{64}$/);
  assert.ok(parsed.parserVersion.length<=100,'20 three-digit pages fit all downstream parser identity limits');
  const same=await api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages});assert.equal(same.parserVersion,parsed.parserVersion);
  const reverse=await api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages:pages.slice().reverse()});assert.notEqual(reverse.parserVersion,parsed.parserVersion);
  const changedEngine=await harness({pages:200,records,engineId:'synthetic-other-pinned-engine'}).api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages});assert.notEqual(changedEngine.parserVersion,parsed.parserVersion);
  const changedNative=await harness({pages:200,records,nativeVersion:'synthetic-mocked-native-v2'}).api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages});assert.notEqual(changedNative.parserVersion,parsed.parserVersion);
  const nativeRecords=[native('Header one',1),native('Header two',2)],small=harness({pages:2,records:nativeRecords}).api;
  const nativeBase=await small.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages:[1],base:'native'}),missingBase=await small.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages:[1],base:'missing-text'});assert.notEqual(nativeBase.parserVersion,missingBase.parserVersion);
  const legacy=await small.parsePdfWithOcr(bytes());assert.equal(legacy.parserVersion,'synthetic-mocked-native-v1+ocr-'+ENGINE,'legacy missing-text v1 identity remains byte compatible');
});

test('MOCK protocol: cancellation during selected parser identity hashing rejects the whole result',async()=>{
  const controller=new AbortController();let hashes=0;
  const crypto={subtle:{async digest(...args){hashes++;const value=await webcrypto.subtle.digest(...args);controller.abort();return value;}}};
  const {api}=harness({records:[native('Header',1)],crypto});
  await assert.rejects(api.parsePdfWithOcr(bytes(),{mode:'selected-pages',pages:[1],signal:controller.signal}),error=>error.name==='AbortError');assert.equal(hashes,1);
});
