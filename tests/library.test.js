'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseFile } = require('../js/parsers.js');
const A = require('../js/artifacts.js');
const L = require('../js/library.js');
const copy = value => JSON.parse(JSON.stringify(value));
async function source(text = 'Synthetic public reference.\nBenefit evidence.') { return parseFile(new File([text], 'synthetic-public-reference.txt')); }
function workspace(id = 'synthetic-case-a') { return { schemaVersion: 1, id, name: 'Synthetic case', createdAt: '2026-10-28', sources: [], graph: { nodes: [], edges: [] }, rules: [], calculations: [] }; }
async function populated() { return L.addLibrarySources(L.createReferenceLibrary({ id: 'public-library', name: 'Synthetic public reference library' }), [await source()], { versionLabel: 'Synthetic reference v1' }); }
function rehash(envelope) { envelope.hash = createHash('sha256').update(envelope.payload).digest('hex'); return JSON.stringify(envelope); }

test('versioned reference source additions preserve old snapshots, originals and exact locators', async () => {
  const empty = L.createReferenceLibrary({ id: 'public-library', name: 'Synthetic references' });
  assert.equal(L.validateReferenceLibrary(empty).valid, true);
  const original = await source(), before = copy(empty);
  const first = await L.addLibrarySources(empty, [original], { versionLabel: 'Reference first release' });
  assert.deepEqual(empty, before); assert.equal(first.revision, 2); assert.equal(first.sources[0].originalBase64, original.originalBase64);
  assert.equal(first.sources[0].records[1].locator.line, 2); assert.deepEqual(first.revisions[0].sourceIds, []);
  const second = await L.addLibrarySources(first, [await source('Synthetic second source')], { versionLabel: 'Second release' });
  assert.equal(first.sources.length, 1); assert.equal(second.sources.length, 2); assert.equal(second.revision, 3);
  assert.deepEqual(second.revisions[1], first.revisions[1]);
  assert.equal(L.validateReferenceLibrary(second).valid, true);
});

test('library portable roundtrip verifies payload and original bytes independently', async () => {
  const library = await populated();
  assert.deepEqual(await L.importReferenceLibrary(await L.exportReferenceLibrary(library)), library);
  const envelope = JSON.parse(await L.exportReferenceLibrary(library));
  envelope.payload += ' ';
  await assert.rejects(L.importReferenceLibrary(JSON.stringify(envelope)), /integrity/);
  const altered = copy(library); altered.sources[0].originalBase64 = Buffer.from('X'.repeat(altered.sources[0].size)).toString('base64');
  envelope.payload = JSON.stringify(altered);
  await assert.rejects(L.importReferenceLibrary(rehash(envelope)), /Original source hash mismatch/);
});

test('explicit library copying isolates case state and carries revision provenance without graph/rules', async () => {
  const library = await populated(), before = copy(library), a = workspace(), b = workspace('synthetic-case-b');
  const copiedA = await L.copyReferenceSources(a, library, [library.sources[0].id]);
  const copiedB = await L.copyReferenceSources(b, library, [library.sources[0].id]);
  assert.equal(a.sources.length, 0); assert.equal(b.sources.length, 0); assert.deepEqual(library, before);
  assert.deepEqual(copiedA.sources[0].referenceOrigin, { libraryId: library.id, revision: 2, versionLabel: 'Synthetic reference v1' });
  assert.deepEqual(copiedA.graph, a.graph); assert.deepEqual(copiedA.rules, []); assert.deepEqual(copiedA.calculations, []);
  copiedA.sources[0].records[0].text = 'Changed in case A only';
  assert.notEqual(copiedB.sources[0].records[0].text, copiedA.sources[0].records[0].text);
  assert.notEqual(library.sources[0].records[0].text, copiedA.sources[0].records[0].text);
  assert.equal(A.validateCase(copiedB).valid, true);
  assert.deepEqual(await A.importCase(await A.exportCase(copiedB)), copiedB);
});

test('content dedupe does not advance revisions or duplicate case sources', async () => {
  const library = await populated();
  const same = await L.addLibrarySources(library, [copy(library.sources[0])], { versionLabel: 'Duplicate' });
  assert.deepEqual(same, library);
  const target = await L.copyReferenceSources(workspace(), library, [library.sources[0].id]);
  assert.deepEqual(await L.copyReferenceSources(target, library, [library.sources[0].id]), target);
  const corrupted = copy(library.sources[0]); corrupted.originalBase64 = Buffer.from('Y'.repeat(corrupted.size)).toString('base64');
  await assert.rejects(L.addLibrarySources(library, [corrupted], { versionLabel: 'Corrupted duplicate' }), /hash mismatch/);
});

test('libraries reject case-scoped sources and case copies cannot be promoted back implicitly', async () => {
  const library = await populated(), target = await L.copyReferenceSources(workspace(), library, [library.sources[0].id]);
  for (const scoped of [ { ...await source(), caseId: library.id }, target.sources[0] ]) {
    await assert.rejects(L.addLibrarySources(library, [scoped], { versionLabel: 'No case material' }), /Case-scoped/);
  }
  const recordScoped = await source(); recordScoped.records[0].caseId = 'private-case';
  await assert.rejects(L.addLibrarySources(library, [recordScoped], { versionLabel: 'No case record' }), /Case-scoped/);
  await assert.rejects(L.copyReferenceSources(workspace(), library, ['missing-source']), /Select distinct source IDs/);
  await assert.rejects(L.copyReferenceSources(workspace(), library, [library.sources[0].id, library.sources[0].id]), /distinct/);
});

test('invalid, missing, removed and reordered revision histories fail closed', async () => {
  const library = await populated();
  for (const change of [
    x => x.revision++, x => x.schemaVersion = 2, x => x.revisions[0].sourceIds = [x.sources[0].id],
    x => x.revisions[1].sourceIds = [], x => x.revisions[1].sourceIds.push('missing'),
    x => x.revisions[1].createdAt = '2026-02-30T00:00:00.000Z', x => x.revisions[1].versionLabel = '',
    x => x.revisions.push(copy(x.revisions[1])), x => x.caseId = 'private-case'
  ]) { const altered = copy(library); change(altered); assert.equal(L.validateReferenceLibrary(altered).valid, false); await assert.rejects(L.exportReferenceLibrary(altered)); }
});

test('unsafe objects, prototype keys, accessors, cycles and unsupported envelopes reject without execution', async () => {
  let calls = 0;
  const accessor = {}; Object.defineProperty(accessor, 'name', { get() { calls++; return 'Unsafe'; }, enumerable: true });
  assert.throws(() => L.createReferenceLibrary(accessor), /accessors/); assert.equal(calls, 0);
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => L.createReferenceLibrary(cycle), /acyclic/);
  assert.throws(() => L.createReferenceLibrary(JSON.parse('{"id":"x","name":"y","__proto__":{}}')), /Unsafe/);
  const envelope = JSON.parse(await L.exportReferenceLibrary(await populated())); envelope.format = 'pbgc-rag-case';
  await assert.rejects(L.importReferenceLibrary(JSON.stringify(envelope)), /Unsupported/);
  await assert.rejects(L.importReferenceLibrary('{bad'), /valid JSON/);
});

test('async additions snapshot caller inputs before hashing and reject unsupported metadata', async () => {
  const empty = L.createReferenceLibrary({ id: 'public-library', name: 'Synthetic references' }), src = await source();
  const pending = L.addLibrarySources(empty, [src], { versionLabel: 'Snapshot test' });
  src.records[0].text = 'Caller mutation'; empty.name = 'Caller changed name';
  const saved = await pending; assert.equal(saved.name, 'Synthetic references'); assert.notEqual(saved.sources[0].records[0].text, 'Caller mutation');
  await assert.rejects(L.addLibrarySources(saved, [await source('Another synthetic source')], { versionLabel: 'x', approved: true }), /version label/);
});

test('reference sources cannot smuggle arbitrary case metadata through unknown source or record keys', async () => {
  const library = await populated();
  for (const key of ['caseData', 'graph', 'rules', 'privateCase']) {
    const src = await source('Synthetic second reference'); src[key] = { confidential: 'Synthetic only' };
    await assert.rejects(L.addLibrarySources(library, [src], { versionLabel: 'Rejected arbitrary metadata' }), /unsupported metadata/);
  }
  const src = await source('Synthetic record metadata'); src.records[0].privateCase = 'Synthetic private reference';
  await assert.rejects(L.addLibrarySources(library, [src], { versionLabel: 'Rejected record metadata' }), /unsupported metadata/);
});
