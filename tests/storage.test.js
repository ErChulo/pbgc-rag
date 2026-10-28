'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
require('../js/artifacts.js');
const { createCaseStore, inspectCapabilities } = require('../js/storage.js');
function caseData(id = 'synthetic-a', name = 'Synthetic case') { return { schemaVersion: 1, id, name, createdAt: '2026-10-28T00:00:00.000Z', sources: [], graph: { nodes: [], edges: [] }, rules: [], calculations: [] }; }
function fakeIDB() {
  const factory = { data: new Map(), failNextPut: false, closed: 0, failProbe: false };
  const db = { objectStoreNames: { contains: () => true }, close() { factory.closed++; }, transaction(name, mode) {
    const working = new Map(factory.data); let pending = 0, ended = false, scheduled = false;
    const tx = { error: null, abort() { if (ended) throw Error('ended'); ended = true; setImmediate(() => tx.onabort?.()); }, objectStore() { return store; } };
    function completion() { if (scheduled) return; scheduled = true; setImmediate(() => { scheduled = false; if (!pending && !ended) { ended = true; if (mode === 'readwrite') factory.data = working; tx.oncomplete?.(); } }); }
    function request(fn) { const request = {}; pending++; setImmediate(() => { if (ended) return; try { request.result = fn(); request.onsuccess?.(); } catch (error) { request.error = tx.error = error; request.onerror?.(); tx.onerror?.(); if (!ended) tx.abort(); } finally { pending--; completion(); } }); return request; }
    const store = {
      get: id => request(() => structuredClone(working.get(id))),
      getAll: () => request(() => structuredClone([...working.values()])),
      add: value => request(() => { if (factory.failProbe) throw Error('probe write denied'); if (working.has(value.id)) throw Error('duplicate'); working.set(value.id, structuredClone(value)); return value.id; }),
      put: value => request(() => { if (factory.failNextPut) { factory.failNextPut = false; throw Error('quota exceeded'); } working.set(value.id, structuredClone(value)); return value.id; }),
      delete: id => request(() => working.delete(id))
    };
    completion(); return tx;
  } };
  factory.open = () => { const request = {}; setImmediate(() => { request.result = db; request.onsuccess?.(); }); return request; };
  return factory;
}
test('memory fallback isolates cases and snapshots, retains prior versions and removes only the selected case', async () => {
  const store = await createCaseStore({ memoryOnly: true }); assert.equal(store.mode, 'memory'); assert.match(store.fallbackReason, /requested/);
  const original = caseData(); assert.equal((await store.put(original)).revision, 1);
  original.name = 'Caller mutation'; assert.equal((await store.get(original.id)).name, 'Synthetic case');
  const received = await store.get(original.id); received.name = 'Retrieved mutation'; assert.equal((await store.get(original.id)).name, 'Synthetic case');
  const changed = caseData(original.id, 'Revised synthetic case'); assert.equal((await store.put(changed)).revision, 2); assert.equal((await store.put(changed)).revision, 2);
  assert.equal((await store.get(original.id, 1)).name, 'Synthetic case'); assert.equal((await store.listVersions(original.id)).length, 2);
  await store.put(caseData('synthetic-b')); assert.equal((await store.list()).length, 2);
  assert.equal(await store.remove(original.id), true); assert.equal(await store.get(original.id), null); assert.equal((await store.get('synthetic-b')).id, 'synthetic-b'); assert.equal(await store.remove(original.id), false);
  store.close(); await assert.rejects(store.list(), /closed/);
});
test('put snapshots before async hashing and rejects unsupported schema without changing previous data', async () => {
  const store = await createCaseStore({ memoryOnly: true }), c = caseData();
  const pending = store.put(c); c.id = 'changed-by-caller'; await pending;
  assert.ok(await store.get('synthetic-a')); assert.equal(await store.get('changed-by-caller'), null);
  await assert.rejects(store.put({ ...caseData(), schemaVersion: 99 }), /schema/);
  assert.equal((await store.get('synthetic-a')).schemaVersion, 1);
  await assert.rejects(store.get('', 1), /case id/); await assert.rejects(store.get('synthetic-a', 0), /revision/);
  store.close();
});
test('IndexedDB must pass actual write/read/delete probe and persists envelope revisions across reopen', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  assert.equal(store.mode, 'indexeddb'); assert.equal(factory.data.size, 0);
  await store.put(caseData()); await store.put(caseData('synthetic-a', 'Changed'));
  assert.equal((await store.list())[0].revision, 2); store.close();
  const reopened = await createCaseStore({ indexedDB: factory }); assert.equal((await reopened.get('synthetic-a')).name, 'Changed'); assert.equal((await reopened.get('synthetic-a', 1)).name, 'Synthetic case');
  await reopened.remove('synthetic-a'); assert.equal(factory.data.size, 0); reopened.close();
});
test('IndexedDB write failure is atomic and never silently switches storage or discards prior revision', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  await store.put(caseData()); factory.failNextPut = true;
  await assert.rejects(store.put(caseData('synthetic-a', 'Must not persist')), /quota/);
  assert.equal(store.mode, 'indexeddb'); assert.equal((await store.get('synthetic-a')).name, 'Synthetic case'); assert.equal((await store.listVersions('synthetic-a')).length, 1); store.close();
});
test('persistent retrieval rejects tampered envelope and mismatched case identity', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory }); await store.put(caseData());
  const saved = factory.data.get('synthetic-a'); saved.envelope = saved.envelope.replace('Synthetic case', 'Tampered case');
  await assert.rejects(store.get('synthetic-a'), /integrity/); await assert.rejects(store.list(), /integrity/); store.close();
});
test('missing, denied and timed-out browser storage fall back explicitly to memory', async () => {
  for (const factory of [null, { open() { throw Error('denied'); } }, { open() { return {}; } }]) {
    const store = await createCaseStore({ indexedDB: factory, openTimeoutMs: 5 }); assert.equal(store.mode, 'memory'); assert.ok(store.fallbackReason); store.close();
  }
  const factory = fakeIDB(); factory.failProbe = true;
  const store = await createCaseStore({ indexedDB: factory }); assert.equal(store.mode, 'memory'); assert.match(store.fallbackReason, /denied/); assert.ok(factory.closed); store.close();
});
test('capability inspection measures local crypto and WASM without claiming persistent storage or a semantic model', async () => {
  const capabilities = await inspectCapabilities(); assert.equal(capabilities.sha256, true); assert.equal(capabilities.wasm, true); assert.equal(capabilities.semanticModel, false); assert.match(capabilities.storageDurability, /not guaranteed/); assert.equal(capabilities.worker, false);
});
