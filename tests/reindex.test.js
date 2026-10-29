'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
require('../js/ontology.js'); const artifacts = require('../js/artifacts.js');
const parsers = require('../js/parsers.js'); const { reindexSources } = require('../js/reindex.js');
const clone = value => JSON.parse(JSON.stringify(value));
async function source(text = 'Alpha provision\nBeta provision\n', name = 'synthetic.txt') { const bytes = new TextEncoder().encode(text); return parsers.parseFile({ name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer }); }
function base(sources) { return { schemaVersion: 1, id: 'synthetic-reindex-case', name: 'Synthetic parser review', createdAt: '2026-10-29T00:00:00.000Z', sources, graph: { nodes: [], edges: [] }, rules: [], calculations: [] }; }
function cited(c) {
  const [a, b] = c.sources[0].records;
  c.graph = { caseId: c.id, nodes: [{ id: a.id, sourceId: a.sourceId, recordId: a.id, caseId: c.id }, { id: b.id, sourceId: b.sourceId, recordId: b.id }], edges: [{ id: 'synthetic-edge', from: a.id, to: b.id, type: 'internal:related', sourceId: a.sourceId, recordId: a.id }] };
  artifacts.proposeRule(c, { id: 'synthetic-rule', title: 'Synthetic proposal', effectiveDate: '2026-01-01', sourceRecordIds: [a.id] });
  artifacts.approveRule(c, 'synthetic-rule', { reviewer: 'Synthetic reviewer', statement: 'Synthetic test confirmation only', confirmedByHuman: true });
  c.claims = [{ id: 'synthetic-claim', caseId: c.id, kind: 'provision', subjectId: 'synthetic-plan', predicate: 'internal:test', group: 'synthetic-group', value: 'alpha', sourceRecordIds: [a.id] }];
  return c;
}
function applyOptions(preview) { return { apply: true, reviewed: true, expectedCaseHash: preview.caseHash, expectedPlanHash: preview.planHash }; }
test('current parser no-op explicitly preserves original case and approvals without adding provenance', async () => {
  const c = cited(base([await source()])), before = clone(c), preview = await reindexSources(c, [c.sources[0].id], { apply: false });
  assert.equal(preview.status, 'unchanged'); assert.equal(preview.applied, false); assert.deepEqual(preview.candidateCase, c); assert.deepEqual(c, before); assert.equal(preview.changes[0].changed, false);
  const applied = await reindexSources(c, [c.sources[0].id], applyOptions(preview)); assert.equal(applied.status, 'unchanged'); assert.equal(applied.applied, false); assert.deepEqual(applied.candidateCase.rules, c.rules);
});
test('actual parser reparses retained bytes and uniquely remaps reordered records, graph identities/endpoints, rule and claim citations', async () => {
  const s = await source(); s.parserVersion = 'synthetic-old-0';
  s.records.reverse(); s.records.forEach((record, index) => { record.id = `${s.id}:${index + 1}`; record.caseId = 'synthetic-reindex-case'; });
  s.caseId = 'synthetic-reindex-case'; s.referenceOrigin = { libraryId: 'synthetic-library', revision: 3, versionLabel: 'Synthetic edition' }; s.importHistory = { note: 'Preserve pre-existing source metadata' };
  const c = cited(base([s])), before = clone(c), preview = await reindexSources(c, [s.id]);
  assert.equal(preview.status, 'review-required'); assert.equal(preview.unresolved.length, 0); assert.equal(preview.recordMappings[0].newRecordId, `${s.id}:2`);
  assert.equal(preview.changes[0].fromParserVersion, 'synthetic-old-0'); assert.equal(preview.changes[0].toParserVersion, s.parserVersion === parsers.parserRegistry.version ? s.parserVersion : parsers.parserRegistry.version);
  const result = await reindexSources(c, [s.id], applyOptions(preview)), next = result.candidateCase;
  assert.equal(result.status, 'applied'); assert.equal(result.applied, true); assert.deepEqual(c, before);
  assert.equal(next.graph.nodes[0].id, `${s.id}:2`); assert.equal(next.graph.nodes[0].recordId, `${s.id}:2`); assert.equal(next.graph.edges[0].from, `${s.id}:2`); assert.equal(next.graph.edges[0].to, `${s.id}:1`); assert.equal(next.graph.edges[0].recordId, `${s.id}:2`);
  assert.deepEqual(next.rules[0].sourceRecordIds, [`${s.id}:2`]); assert.deepEqual(next.claims[0].sourceRecordIds, [`${s.id}:2`]); assert.equal(next.rules[0].status, 'approved'); assert.deepEqual(next.rules[0].approval, c.rules[0].approval);
  assert.deepEqual(next.sources[0].referenceOrigin, s.referenceOrigin); assert.deepEqual(next.sources[0].importHistory, s.importHistory); assert.equal(next.sources[0].caseId, c.id); assert.ok(next.sources[0].records.every(r => r.caseId === c.id));
  assert.equal(next.sources[0].originalBase64, s.originalBase64); assert.equal(next.sources[0].hash, s.hash); assert.equal(next.sources[0].reindexProvenance.history.length, 1);
  assert.deepEqual(await artifacts.importCase(await artifacts.exportCase(next)), next);
});
test('stale case previews, absent review and caller-submitted mappings never apply', async () => {
  const c = base([await source()]); c.sources[0].parserVersion = 'old'; const preview = await reindexSources(c, [c.sources[0].id]);
  await assert.rejects(reindexSources(c, [c.sources[0].id], { apply: true }), /review/);
  await assert.rejects(reindexSources(c, [c.sources[0].id], { ...applyOptions(preview), recordMappings: [] }), /cannot be submitted/);
  c.name = 'Edited since preview'; await assert.rejects(reindexSources(c, [c.sources[0].id], applyOptions(preview)), /case changed/);
});
test('parser output changes after preview require a new plan review even when the original case is unchanged', async () => {
  const c = base([await source()]); c.sources[0].parserVersion = 'old'; const preview = await reindexSources(c, [c.sources[0].id]);
  const originalParser = globalThis.PBGC.parseFile;
  try { globalThis.PBGC.parseFile = async file => ({ ...await originalParser(file), parserVersion: 'synthetic-new-output' }); await assert.rejects(reindexSources(c, [c.sources[0].id], applyOptions(preview)), /plan changed/); }
  finally { globalThis.PBGC.parseFile = originalParser; }
});
test('unmatched text, locator or structured fields block cited evidence and preserve approved state unchanged', async () => {
  for (const change of [record => { record.text += ' material change'; }, record => { record.locator.line = 999; }, record => { record.fields = { syntheticMeaning: 'not in current parser' }; }]) {
    const c = cited(base([await source()])); change(c.sources[0].records[0]); const before = clone(c), preview = await reindexSources(c, [c.sources[0].id]);
    assert.equal(preview.status, 'blocked'); assert.ok(preview.unresolved.some(x => x.status === 'unmatched')); assert.equal(preview.candidateCase, undefined);
    await assert.rejects(reindexSources(c, [c.sources[0].id], applyOptions(preview)), /unresolved evidence/); assert.deepEqual(c, before);
  }
});
test('ambiguous duplicate evidence fails even if one record retains its old ID', async () => {
  const s = await source(); const duplicate = clone(s.records[0]); duplicate.id = `${s.id}:synthetic-duplicate`; s.records.push(duplicate);
  const c = cited(base([s])), preview = await reindexSources(c, [s.id]); assert.equal(preview.status, 'blocked'); assert.ok(preview.unresolved.some(x => x.status === 'ambiguous'));
});
test('unreferenced changed parser records can be replaced after review; locator keys are compared canonically', async () => {
  const s = await source('name,value\nSynthetic,42\n', 'synthetic.csv'); s.parserVersion = 'old';
  s.records[0].text = 'Old extraction without citations'; s.records[1].fields = { cells: ['Synthetic', '42'] };
  s.records[1].locator = Object.fromEntries(Object.entries(s.records[1].locator).reverse());
  const c = base([s]); c.rules.push({ id: 'proposal', version: 1, title: 'Synthetic', effectiveDate: '2026-01-01', status: 'proposed', sourceRecordIds: [s.records[1].id] });
  const preview = await reindexSources(c, [s.id]); assert.equal(preview.status, 'review-required'); assert.equal(preview.recordMappings[0].status, 'unmatched'); assert.equal(preview.recordMappings[1].status, 'exact');
  const next = (await reindexSources(c, [s.id], applyOptions(preview))).candidateCase; assert.equal(next.sources[0].records[0].text, 'name | value'); assert.equal(next.rules[0].status, 'proposed');
});
test('node identity collisions and inconsistent record-shaped node identities fail closed', async () => {
  const s = await source(); s.records[0].id = `${s.id}:old`; s.records[1].id = `${s.id}:old2`; const c = base([s]);
  c.graph.nodes = [{ id: s.records[0].id, recordId: s.records[0].id, sourceId: s.id }, { id: `${s.id}:1` }];
  const preview = await reindexSources(c, [s.id]); assert.equal(preview.status, 'blocked'); assert.ok(preview.unresolved.some(x => /collide/.test(x.reason)));
  c.graph.nodes = [{ id: s.records[0].id, recordId: s.records[1].id }]; assert.equal((await reindexSources(c, [s.id])).status, 'blocked');
});
test('cross-case metadata, corrupt source bytes and foreign selections are rejected before parser invocation', async () => {
  const c = base([await source()]), id = c.sources[0].id;
  const cross = clone(c); cross.sources[0].caseId = 'foreign'; await assert.rejects(reindexSources(cross, [id]), /different case/);
  const corrupt = clone(c); const bytes = Buffer.from(corrupt.sources[0].originalBase64, 'base64'); bytes[0] ^= 1; corrupt.sources[0].originalBase64 = bytes.toString('base64'); await assert.rejects(reindexSources(corrupt, [id]), /hash mismatch/);
  await assert.rejects(reindexSources(c, ['foreign-source']), /outside this case/); await assert.rejects(reindexSources(c, [id, id]), /distinct/);
});
test('accessors, unsafe objects, sparse arrays and oversized cases are refused without executing getters', async () => {
  const c = base([await source()]); let called = false;
  Object.defineProperty(c, 'danger', { enumerable: true, get() { called = true; return 'bad'; } });
  await assert.rejects(reindexSources(c, [c.sources[0].id]), /accessors/); assert.equal(called, false);
  await assert.rejects(reindexSources(new Date(), ['x']), /plain JSON/);
  const sparse = base([await source()]); sparse.custom = Array(2); await assert.rejects(reindexSources(sparse, [sparse.sources[0].id]), /sparse/);
  const huge = base([await source()]); huge.notes = 'x'.repeat(32 * 1024 * 1024); await assert.rejects(reindexSources(huge, [huge.sources[0].id]), /32 MiB/);
});

test('case edits during asynchronous apply are detected before returning a replacement', async () => {
  const c = base([await source()]); c.sources[0].parserVersion = 'old'; const id = c.sources[0].id, preview = await reindexSources(c, [id]);
  const originalParser = globalThis.PBGC.parseFile; let release, started;
  const entered = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  try {
    globalThis.PBGC.parseFile = async file => { started(); await gate; return originalParser(file); };
    const pending = reindexSources(c, [id], applyOptions(preview)); await entered; c.name = 'Concurrent edit'; release();
    await assert.rejects(pending, /changed while reparsing/); assert.equal(c.name, 'Concurrent edit');
  } finally { release(); globalThis.PBGC.parseFile = originalParser; }
});
