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

test('recovery scan quarantines one damaged current case while preserving healthy cases and verified history', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  await store.put(caseData('broken', 'Before damage'));
  await store.put(caseData('broken', 'After edit'));
  await store.put(caseData('healthy', 'Healthy case'));
  factory.data.get('broken').envelope = factory.data.get('broken').envelope.replace('After edit', 'Corrupted!');
  await assert.rejects(store.list(), /integrity/);
  const scan = await store.scan();
  assert.deepEqual(scan.cases.map(c => c.id), ['healthy']);
  assert.equal(scan.damaged[0].id, 'broken');
  assert.equal(scan.damaged[0].recoverableVersions[0].revision, 1);
  const inspected = await store.inspectVersions('broken');
  assert.deepEqual(inspected.versions.map(v => v.revision), [1]);
  assert.equal(inspected.damaged[0].revision, 2);
  const recovered = await store.get('broken', 1);
  assert.equal(recovered.name, 'Before damage');
  assert.equal((await store.put(recovered)).revision, 3);
  assert.equal((await store.get('broken')).name, 'Before damage');
  assert.equal((await store.scan()).cases.length, 2);
  assert.equal((await store.inspectVersions('broken')).damaged.length, 1);
  store.close();
});

test('explicit checkpoint pruning keeps current data, requires a valid latest revision and is atomic', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  for (let i = 1; i <= 6; i++) await store.put(caseData('history', 'Revision ' + i));
  await assert.rejects(store.pruneHistory('history', { keepLast: 0 }), /between/);
  await assert.rejects(store.pruneHistory('history', { keepLast: 3, expectedRevision: 5 }), /changed/);
  factory.failNextPut = true;
  await assert.rejects(store.pruneHistory('history', { keepLast: 3, expectedRevision: 6 }), /quota/);
  assert.equal((await store.listVersions('history')).length, 6);
  assert.deepEqual(await store.pruneHistory('history', { keepLast: 3, expectedRevision: 6 }), { id: 'history', revision: 6, retained: 3, removed: 3 });
  assert.deepEqual((await store.inspectVersions('history')).versions.map(v => v.revision), [6, 5, 4]);
  assert.equal(await store.get('history', 1), null);
  assert.equal((await store.get('history')).name, 'Revision 6');
  await store.pruneHistory('history', { keepLast: 1 });
  assert.equal((await store.listVersions('history')).length, 1);
  const raw = factory.data.get('history'); raw.envelope = '{}';
  await assert.rejects(store.pruneHistory('history', { keepLast: 1 }), /package/);
  store.close();
});

test('ambiguous duplicate checkpoint numbers are never advertised or restored as verified history', async () => {
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  await store.put(caseData('ambiguous', 'Earlier'));
  await store.put(caseData('ambiguous', 'Current'));
  factory.data.get('ambiguous').revision = 1;
  await assert.rejects(store.get('ambiguous', 1), /ambiguous|metadata/);
  await assert.rejects(store.inspectVersions('ambiguous'), /ambiguous|metadata/);
  const scan = await store.scan();
  assert.equal(scan.cases.length, 0);
  assert.equal(scan.damaged.length, 1);
  assert.deepEqual(scan.damaged[0].recoverableVersions, []);
  store.close();
});

test('reference libraries use a distinct verified storage codec and never become case workspaces', async () => {
  const L = require('../js/library.js');
  const { createReferenceStore } = require('../js/storage.js');
  const reference = await createReferenceStore({ memoryOnly: true });
  const cases = await createCaseStore({ memoryOnly: true });
  const library = L.createReferenceLibrary({ id: 'shared-id', name: 'Synthetic references' });
  await reference.put(library); await cases.put(caseData('shared-id', 'Separate synthetic case'));
  assert.equal((await reference.get('shared-id')).kind, 'reference-library');
  assert.equal((await cases.get('shared-id')).name, 'Separate synthetic case');
  await assert.rejects(reference.put(caseData()), /reference library|unsupported|identity/i);
  reference.close(); cases.close();
});

test('case and import manifest checkpoints commit atomically and stale manifests never resume', async () => {
  require('../js/parsers.js'); const { importFiles } = require('../js/indexer.js');
  const factory = fakeIDB(), store = await createCaseStore({ indexedDB: factory });
  const result = await importFiles(caseData(), [new File(['Synthetic resume source'], 'reference.txt')]);
  await store.put(result.caseData, { importManifest: result.manifest });
  assert.deepEqual(await store.getImportCheckpoint(result.caseData.id), result.manifest);
  const revised = structuredClone(result.caseData); revised.name = 'Changed since import';
  await assert.rejects(store.put(revised, { importManifest: result.manifest }), /stale/);
  assert.equal((await store.get(result.caseData.id)).name, result.caseData.name);
  await store.put(revised);
  assert.equal(await store.getImportCheckpoint(revised.id), null);
  factory.failNextPut = true;
  await assert.rejects(store.put(result.caseData, { importManifest: result.manifest }), /quota/);
  assert.equal((await store.get(revised.id)).name, revised.name);
  assert.equal(await store.getImportCheckpoint(revised.id), null);
  store.close();
});
