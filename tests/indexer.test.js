'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../js/parsers.js');
const A = require('../js/artifacts.js');
const { importFiles, importLimits } = require('../js/indexer.js');
const clone = x => JSON.parse(JSON.stringify(x));
function workspace(id = 'synthetic-index-case') { return { schemaVersion: 1, id, name: 'Synthetic incremental import case', createdAt: '2026-10-28', sources: [], graph: { nodes: [], edges: [] }, rules: [], calculations: [] }; }
function file(name, contents, relativePath) {
  const bytes = Buffer.from(contents);
  return { name, size: bytes.length, ...(relativePath ? { webkitRelativePath: relativePath } : {}), async arrayBuffer() { return Uint8Array.from(bytes).buffer; } };
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('incremental import checkpoints actual hashes and leaves caller snapshots unchanged', async () => {
  const c = workspace(), before = clone(c), progress = [], checkpoints = [];
  const files = [file('synthetic-a.txt', 'Synthetic A\nBenefit 12'), file('synthetic-b.csv', 'field,value\nSynthetic B,25', 'synthetic-reference/synthetic-b.csv')];
  const result = await importFiles(c, files, { onProgress: e => progress.push(e), onCheckpoint: e => { checkpoints.push(clone(e)); e.caseData.sources.length = 0; e.manifest.caseHash = 'tampered callback snapshot'; } });
  assert.equal(result.imported, 2); assert.equal(result.skipped, 0); assert.equal(result.cancelled, false); assert.deepEqual(result.errors, []);
  assert.deepEqual(c, before); assert.equal(checkpoints[0].caseData.sources.length, 1); assert.equal(checkpoints[1].caseData.sources.length, 2);
  assert.equal(result.caseData.sources.length, 2); assert.equal(result.manifest.caseHash, hash(result.caseData));
  assert.equal(result.manifest.entries[1].relativePath, 'synthetic-reference/synthetic-b.csv');
  assert.deepEqual(result.manifest.entries.map(e => e.hash), result.caseData.sources.map(s => s.hash));
  assert.deepEqual(progress.map(p => p.stage), ['hashing', 'parsing', 'complete', 'hashing', 'parsing', 'complete', 'finished']);
  assert.equal(progress.at(-1).processed, 2);
  assert.deepEqual(await A.importCase(await A.exportCase(result.caseData)), result.caseData);
});
test('cancellation keeps completed checkpoint and resumes using exact bytes rather than names', async () => {
  const abort = new AbortController(), selection = [file('one.txt', 'Synthetic first'), file('two.txt', 'Synthetic second')];
  const first = await importFiles(workspace(), selection, { signal: abort.signal, onCheckpoint: () => abort.abort() });
  assert.equal(first.cancelled, true); assert.equal(first.imported, 1); assert.equal(first.caseData.sources.length, 1); assert.equal(first.manifest.checkpoint, 1);
  const next = await importFiles(first.caseData, selection, { previousManifest: first.manifest });
  assert.equal(next.imported, 1); assert.equal(next.skipped, 1); assert.equal(next.caseData.sources.length, 2); assert.equal(next.manifest.entries.length, 2);
  assert.equal(next.manifest.entries[0].status, 'imported');
  const changed = await importFiles(next.caseData, [file('one.txt', 'Synthetic changed contents')], { previousManifest: next.manifest });
  assert.equal(changed.imported, 1); assert.equal(changed.caseData.sources.length, 3); assert.notEqual(changed.manifest.entries[0].hash, changed.manifest.entries.at(-1).hash);
});
test('renamed duplicate bytes skip parsing and directory metadata never changes source identity', async t => {
  const first = await importFiles(workspace(), [file('first.txt', 'Synthetic shared bytes')]);
  const original = globalThis.PBGC.parseFile;
  t.after(() => { globalThis.PBGC.parseFile = original; });
  globalThis.PBGC.parseFile = () => { throw Error('duplicate must not parse'); };
  const next = await importFiles(first.caseData, [file('renamed.txt', 'Synthetic shared bytes', 'reference/renamed.txt')]);
  assert.equal(next.imported, 0); assert.equal(next.skipped, 1); assert.equal(next.caseData.sources.length, 1); assert.equal(next.manifest.entries[0].sourceId, first.caseData.sources[0].id);
});
test('abort during parsing discards only in-flight source and returns resumable checkpoint', async t => {
  const original = globalThis.PBGC.parseFile, abort = new AbortController();
  t.after(() => { globalThis.PBGC.parseFile = original; });
  globalThis.PBGC.parseFile = async f => { const source = await original(f); abort.abort(); return source; };
  const progress = [];
  const result = await importFiles(workspace(), [file('cancelled.txt', 'Synthetic discard')], { signal: abort.signal, onProgress: e => progress.push(e) });
  assert.equal(result.caseData.sources.length, 0); assert.equal(result.imported, 0); assert.equal(result.cancelled, true); assert.equal(result.manifest.checkpoint, 0); assert.equal(progress.at(-1).processed, 0);
});
test('already aborted selections read no file bytes', async () => {
  const abort = new AbortController(); abort.abort();
  const result = await importFiles(workspace(), [{ name: 'never.txt', size: 1, arrayBuffer() { throw Error('must not read'); } }], { signal: abort.signal });
  assert.equal(result.cancelled, true); assert.equal(result.imported, 0);
});
test('cross-case and stale checkpoint snapshots fail before reading selected files', async () => {
  const first = await importFiles(workspace(), [file('first.txt', 'Synthetic first')]);
  const never = { name: 'never.txt', size: 1, arrayBuffer() { throw Error('must not read'); } };
  const foreign = clone(first.caseData); foreign.id = 'another-case';
  await assert.rejects(importFiles(foreign, [never], { previousManifest: first.manifest }), /another case|stale/);
  const changed = clone(first.caseData); changed.name = 'Changed since checkpoint';
  await assert.rejects(importFiles(changed, [never], { previousManifest: first.manifest }), /another case|stale/);
  const missing = workspace(); const forged = clone(first.manifest); forged.caseHash = hash(missing);
  await assert.rejects(importFiles(missing, [never], { previousManifest: forged }), /Checkpoint source is missing/);
});
test('unsupported and malformed files preserve prior successful sources and carry explicit errors', async () => {
  const result = await importFiles(workspace(), [file('valid.txt', 'Synthetic valid'), file('legacy.doc', 'Unsupported legacy bytes'), file('bad.csv', 'x,"unclosed'), file('later.txt', 'Synthetic later')]);
  assert.equal(result.imported, 2); assert.equal(result.errors.length, 2); assert.equal(result.caseData.sources.length, 2); assert.equal(result.manifest.checkpoint, 4);
  assert.deepEqual(result.manifest.entries.map(e => e.status), ['imported', 'error', 'error', 'imported']);
  assert.equal(result.manifest.entries[1].hash, createHash('sha256').update('Unsupported legacy bytes').digest('hex'));
  assert.equal(A.validateCase(result.caseData).valid, true);
});
test('absolute/traversing paths, mismatched sizes and oversized selections reject without exposing paths', async () => {
  const result = await importFiles(workspace(), [file('/private/secret.txt', 'Synthetic'), file('a.txt', 'Synthetic', '../a.txt'), file('a.txt', 'Synthetic', 'C:/private/a.txt'), { name: 'oversized.txt', size: importLimits.sourceBytes + 1, arrayBuffer() { throw Error('must not read'); } }, { name: 'changed.txt', size: 1, async arrayBuffer() { return new Uint8Array(2).buffer; } }]);
  assert.equal(result.imported, 0); assert.equal(result.errors.length, 5); assert.doesNotMatch(JSON.stringify(result.errors), /private\/secret|C:\/private/);
  await assert.rejects(importFiles(workspace(), Array(importLimits.files + 1).fill(file('a.txt', 'Synthetic'))), /at most 1000/);
});
test('callback failures expose a detached verified recovery result and stop further files', async () => {
  let caught;
  try { await importFiles(workspace(), [file('one.txt', 'Synthetic one'), file('two.txt', 'Synthetic two')], { onCheckpoint: () => { throw Error('disk unavailable'); } }); } catch (e) { caught = e; }
  assert.equal(caught.name, 'ImportCallbackError'); assert.match(caught.message, /persistence is unconfirmed/); assert.equal(caught.result.imported, 1); assert.equal(caught.result.caseData.sources.length, 1); assert.equal(caught.result.manifest.caseHash, hash(caught.result.caseData));
  assert.deepEqual(await A.importCase(await A.exportCase(caught.result.caseData)), caught.result.caseData);
  const resumed = await importFiles(caught.result.caseData, [file('two.txt', 'Synthetic two')], { previousManifest: caught.result.manifest });
  assert.equal(resumed.imported, 1);
  await assert.rejects(importFiles(workspace(), [file('one.txt', 'Synthetic')], { onProgress: () => { throw Error('view failed'); } }), e => e.name === 'ImportCallbackError' && e.result.caseData.sources.length === 0);
});
test('case and manifest budgets, source identity mismatch and malicious manifest accessors fail closed', async t => {
  const c = workspace(); c.notes = 'x'.repeat(importLimits.caseChars + 1);
  await assert.rejects(importFiles(c, []), /32 MiB/);
  const original = globalThis.PBGC.parseFile;
  t.after(() => { globalThis.PBGC.parseFile = original; });
  globalThis.PBGC.parseFile = async f => ({ ...await original(f), hash: '0'.repeat(64) });
  const result = await importFiles(workspace(), [file('bad.txt', 'Synthetic')]);
  assert.equal(result.imported, 0); assert.match(result.errors[0].message, /identity/);
  let executed = false; const manifest = {};
  Object.defineProperty(manifest, 'caseHash', { get() { executed = true; return '0'.repeat(64); } });
  await assert.rejects(importFiles(workspace(), [], { previousManifest: manifest }), /accessors/); assert.equal(executed, false);
});
test('input case is captured before hashing and caller edits cannot redirect imported sources', async () => {
  const c = workspace(); const originalId = c.id;
  const promise = importFiles(c, [file('captured.txt', 'Synthetic captured')]);
  c.id = 'another-live-case'; c.sources.push({ invalid: 'caller mutation after async boundary' });
  const result = await promise;
  assert.equal(result.caseData.id, originalId); assert.equal(result.caseData.sources.length, 1); assert.equal(c.id, 'another-live-case');
});
