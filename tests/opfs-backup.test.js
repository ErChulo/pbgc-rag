'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const { createHash } = require('node:crypto');
require('../js/ontology.js'); const { exportCase } = require('../js/artifacts.js'); const { parseFile } = require('../js/parsers.js');
const { createOPFSBackupStore } = require('../js/opfs-backup.js');
const hash = text => createHash('sha256').update(text).digest('hex');
function missing() { const error = new Error('not found'); error.name = 'NotFoundError'; return error; }
function fakeFS() {
  const control = { failWrite: false, failClose: false, failReadback: false, corruptWrite: false, directoryCreates: 0, fileNames: [] }, files = new Map(), directories = new Map();
  const directory = {
    async getFileHandle(name, options = {}) {
      assert.ok(!name.includes('/') && !name.includes('\\'), 'all lookup paths must be single hashed filenames'); control.fileNames.push(name);
      if (!files.has(name)) { if (!options.create) throw missing(); files.set(name, ''); }
      return {
        async getFile() {
          if (control.readbackErrorName === name) { control.readbackErrorName = null; throw Error('readback interrupted'); }
          const text = files.get(name), bytes = new TextEncoder().encode(text);
          return { size: control.oversizedName === name ? 64 * 1024 * 1024 + 1 : bytes.length, async arrayBuffer() { return bytes.buffer; } };
        },
        async createWritable() {
          let draft = '';
          return {
            async write(text) { if (control.failWrite) { control.failWrite = false; files.set(name, 'partial write'); throw Error('write interrupted'); } draft = text; },
            async close() { if (control.failClose) { control.failClose = false; files.set(name, 'partial close'); throw Error('close interrupted'); } files.set(name, control.corruptWrite ? 'damaged readback' : draft); control.corruptWrite = false; if (control.failReadback) { control.failReadback = false; control.readbackErrorName = name; } },
            async abort() {}
          };
        }
      };
    },
    async *entries() { for (const name of [...files.keys()]) yield [name, { kind: 'file' }]; },
    async removeEntry(name) { if (!files.delete(name)) throw missing(); }
  };
  const rootDirectory = { async getDirectoryHandle(name, options = {}) { assert.equal(name, 'pbgc-rag-backups-v1'); if (!directories.has(name)) { if (!options.create) throw missing(); control.directoryCreates++; directories.set(name, directory); } return directory; } };
  return { rootDirectory, files, control };
}
function fakeLocks() {
  let tail = Promise.resolve(), active = 0, maximum = 0;
  return { get maximum() { return maximum; }, request(name, options, operation) { assert.equal(name, 'pbgc-rag-opfs-backup-v1'); assert.ok(['shared', 'exclusive'].includes(options.mode)); const run = tail.then(async () => { active++; maximum = Math.max(maximum, active); try { return await operation(); } finally { active--; } }); tail = run.catch(() => {}); return run; } };
}
async function caseData(id = 'synthetic-case', name = 'Synthetic case') {
  const bytes = new TextEncoder().encode('Synthetic evidence\n'); const source = await parseFile({ name: 'synthetic.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer });
  return { schemaVersion: 1, id, name, createdAt: '2026-10-29T00:00:00.000Z', sources: [source], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
}
function unpack(text) { const outer = JSON.parse(text); return { outer, inner: JSON.parse(outer.payload) }; }
function repack(inner) { const payload = JSON.stringify(inner); return JSON.stringify({ format: 'pbgc-rag-opfs-slot', version: 1, algorithm: 'SHA-256', hash: hash(payload), payload }); }
test('two alternating OPFS slots retain only two verified generations and restore exact original source bytes', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData();
  assert.equal(store.available, true); assert.equal(store.writable, true);
  const first = await store.save(c); assert.equal(first.generation, 1); assert.equal(first.slot, 1);
  c.name = 'Synthetic second'; await store.save(c); c.name = 'Synthetic third'; const third = await store.save(c); assert.equal(third.generation, 3); assert.equal(third.replacedGeneration, 1); assert.equal(fs.files.size, 2);
  const listing = await store.list(); assert.equal(listing.cases[0].latestGeneration, 3); assert.deepEqual(listing.cases[0].generations.map(x => x.generation), [3, 2]);
  assert.deepEqual((await store.restore(c.id)).caseData, c); assert.equal((await store.restore(c.id, { generation: 2 })).caseData.name, 'Synthetic second');
  await assert.rejects(store.restore(c.id, { generation: 1 }), /not retained/);
});
test('write, close and readback failures preserve the previous verified slot and refuse success', async () => {
  for (const failure of ['failWrite', 'failClose', 'failReadback', 'corruptWrite']) {
    const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c);
    const oldName = [...fs.files.keys()][0], oldBytes = fs.files.get(oldName); fs.control[failure] = true; c.name = 'Must not confirm';
    await assert.rejects(store.save(c), /not confirmed/); assert.equal(fs.files.get(oldName), oldBytes);
    const previous = await store.restore(c.id, { generation: 1 }); assert.equal(previous.caseData.name, 'Synthetic case');
  }
});
test('latest damaged slot advertises damage and falls back to previous valid generation without hiding corruption', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c); await store.save(c);
  const latestName = [...fs.files.keys()].find(name => name.includes('slot0')); fs.files.set(latestName, 'broken');
  const restored = await store.restore(c.id); assert.equal(restored.generation, 1); assert.equal(restored.recoveredFromDamage, true); assert.equal(restored.damagedSlots.length, 1);
  const list = await store.list(); assert.equal(list.damaged.length, 1); assert.equal(list.cases[0].status, 'recoverable-damage');
  const repaired = await store.save(c); assert.equal(repaired.generation, 2); assert.equal((await store.list()).damaged.length, 0);
});
test('arbitrary case ids never enter paths and two cases remain isolated through restore and explicit removal', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), a = await caseData('../../synthetic/\\case'), b = await caseData('synthetic-case-b');
  await store.save(a); await store.save(b); assert.equal((await store.list()).cases.length, 2); assert.equal((await store.restore(a.id)).caseData.id, a.id);
  assert.ok(fs.control.fileNames.every(name => /^[a-f0-9]{64}\.slot[01]\.json$/.test(name)));
  assert.equal((await store.remove(a.id)).removedSlots, 1); assert.equal(await store.restore(a.id), null); assert.equal((await store.restore(b.id)).caseData.id, b.id);
});
test('checksum tampering and source hash tampering are rejected even with reconstructed outer hashes', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c);
  const name = [...fs.files.keys()][0], original = fs.files.get(name), { inner } = unpack(original);
  const changed = JSON.parse(original); changed.payload = changed.payload.replace('Synthetic case', 'Tampered case'); fs.files.set(name, JSON.stringify(changed));
  await assert.rejects(store.restore(c.id), /damaged/); assert.match((await store.list()).damaged[0].reason, /checksum/);
  const caseEnvelope = JSON.parse(inner.caseEnvelope), payload = JSON.parse(caseEnvelope.payload); payload.sources[0].originalBase64 = Buffer.from('Corrupted evidence\n').toString('base64'); payload.sources[0].size = Buffer.from(payload.sources[0].originalBase64, 'base64').length;
  caseEnvelope.payload = JSON.stringify(payload); caseEnvelope.hash = hash(caseEnvelope.payload); inner.caseEnvelope = JSON.stringify(caseEnvelope); fs.files.set(name, repack(inner));
  await assert.rejects(store.restore(c.id), /damaged/); assert.match((await store.list()).damaged[0].reason, /source hash mismatch/);
  await assert.rejects(store.save(c), /all existing slots are damaged/);
});
test('missing OPFS is unavailable and missing Web Locks is explicitly read-only without creating directories', async () => {
  const unavailable = await createOPFSBackupStore({ rootDirectory: null, locks: null }); assert.equal(unavailable.available, false); assert.equal(unavailable.writable, false); await assert.rejects(unavailable.list(), /unavailable/);
  const fs = fakeFS(), empty = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: null }); assert.equal(empty.available, true); assert.equal(empty.writable, false); assert.equal(fs.control.directoryCreates, 0); assert.deepEqual((await empty.list()).cases, []); await assert.rejects(empty.save(await caseData()), /Web Locks/);
  const writer = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }); await writer.save(await caseData());
  const reader = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: null }); assert.equal((await reader.restore('synthetic-case')).generation, 1); await assert.rejects(reader.remove('synthetic-case'), /read-only/);
});
test('Web Locks serialize simultaneous saves across separate store handles without duplicate generations', async () => {
  const fs = fakeFS(), locks = fakeLocks(), options = { rootDirectory: fs.rootDirectory, locks }, a = await createOPFSBackupStore(options), b = await createOPFSBackupStore(options), c = await caseData();
  const results = await Promise.all([a.save(c), b.save({ ...c, name: 'Concurrent synthetic case' })]); assert.deepEqual(results.map(x => x.generation).sort(), [1, 2]); assert.equal(locks.maximum, 1); assert.equal((await a.restore(c.id)).generation, 2);
});
test('conflicting slot generations fail closed instead of guessing which case version is current', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c); await store.save(c);
  const name = [...fs.files.keys()].find(name => name.includes('slot0')), { inner } = unpack(fs.files.get(name)); inner.generation = 6; fs.files.set(name, repack(inner));
  const list = await store.list(); assert.equal(list.conflicts.length, 1); assert.equal(list.cases[0].latestGeneration, null); assert.equal(list.cases[0].status, 'conflict'); await assert.rejects(store.restore(c.id), /conflict/); await assert.rejects(store.save(c), /conflict/);
});
test('invalid schema, source corruption, unsafe accessors, options and slot sizes fail without replacing verified files', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c); const before = [...fs.files];
  await assert.rejects(store.save({ ...c, schemaVersion: 99 }), /schema/);
  const invalid = JSON.parse(JSON.stringify(c)); invalid.sources[0].hash = 'a'.repeat(64); await assert.rejects(store.save(invalid), /identity|hash/);
  let executed = false; const unsafe = { ...c }; Object.defineProperty(unsafe, 'bad', { enumerable: true, get() { executed = true; return ''; } }); await assert.rejects(store.save(unsafe), /accessors/); assert.equal(executed, false);
  await assert.rejects(store.restore(c.id, { generation: 0 }), /positive generation/); await assert.rejects(store.restore(c.id, { alternatePath: '../../x' }), /only/); assert.deepEqual([...fs.files], before);
});
test('unknown directory entries are reported without reading or deleting their contents', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }); fs.files.set('unrelated-user-file', 'must remain');
  const list = await store.list(); assert.deepEqual(list.ignoredEntries, ['unrelated-user-file']); assert.equal(fs.control.fileNames.length, 0); assert.equal(fs.files.get('unrelated-user-file'), 'must remain');
});

test('case-key hashing preserves distinct lone-surrogate IDs instead of conflating UTF-8 replacement characters', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() });
  const a = await caseData('synthetic-' + String.fromCharCode(0xd800)), b = await caseData('synthetic-' + String.fromCharCode(0xd801));
  const first = await store.save(a), second = await store.save(b); assert.notEqual(first.caseKey, second.caseKey);
  assert.equal((await store.restore(a.id)).caseData.id, a.id); assert.equal((await store.restore(b.id)).caseData.id, b.id);
});
test('slot size and 1000-case limits are enforced before reading large content or creating an extra case', async () => {
  const fs = fakeFS(), store = await createOPFSBackupStore({ rootDirectory: fs.rootDirectory, locks: fakeLocks() }), c = await caseData(); await store.save(c);
  fs.control.oversizedName = [...fs.files.keys()][0]; await assert.rejects(store.restore(c.id), /damaged/); assert.match((await store.list()).damaged[0].reason, /64 MiB/);
  fs.files.clear(); for (let i = 0; i < 1000; i++) fs.files.set(i.toString(16).padStart(64, '0') + '.slot1.json', 'damaged fixture');
  await assert.rejects(store.save(c), /1000-case/); assert.equal(fs.files.size, 1000);
});
