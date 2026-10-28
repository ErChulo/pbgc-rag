'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseFile } = require('../js/parsers.js');
const { search, querySQL, queryGraph } = require('../js/search.js');
const A = require('../js/artifacts.js');

function file(name, text) {
  const bytes = Buffer.from(text);
  return { name, size: bytes.length, async arrayBuffer() { return Uint8Array.from(bytes).buffer; } };
}
async function workspace(id = 'synthetic-integration') {
  const source = await parseFile(file('synthetic-plan.txt', 'SYNTHETIC ONLY\nAnnual salary cents: 4800000\nService months: 180\nAccrual basis points: 125\n'));
  return { schemaVersion: 1, id, name: 'Synthetic integration case', createdAt: '2026-10-28', sources: [source], graph: { caseId: id, nodes: [], edges: [] }, rules: [], calculations: [] };
}
function propose(c, sourceRecordIds) {
  return A.proposeRule(c, { id: 'synthetic-accrual', title: 'Synthetic arithmetic fixture only', effectiveDate: '2026-01-01', sourceRecordIds, synthetic: true, formula: 'synthetic-accrual-v1' });
}

test('actual parser to search, evidence, synthetic review, exact calculation and portable recovery', async () => {
  const c = await workspace();
  const records = c.sources.flatMap(s => s.records);
  const hits = search(records, 'Annual salary');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].record.locator.line, 2);
  assert.equal(hits[0].record.sourceId, c.sources[0].id);
  assert.equal(querySQL(records, "SELECT text, locator.line FROM records WHERE text LIKE 'Service%'")[0]['locator.line'], 3);
  const evidence = records.slice(1).map(r => r.id);
  const rule = propose(c, evidence);
  assert.throws(() => A.calculateSynthetic(c, rule.id, {}), /approved/);
  A.approveRule(c, rule.id, { reviewer: 'Synthetic test fixture reviewer', statement: 'Simulated review for this automated synthetic fixture only.', confirmedByHuman: true });
  const result = A.calculateSynthetic(c, rule.id, { annualSalaryCents: 4800000, serviceMonths: 180, accrualBasisPoints: 125 });
  // Independent dollars calculation: 48000 × 15 × 0.0125 = 9000 annually, 750 monthly.
  assert.equal(result.annualBenefitCents, 900000);
  assert.equal(result.monthlyBenefitCents, 75000);
  c.graph.nodes = [{ id: 'source-fact', sourceId: c.sources[0].id, recordId: evidence[0] }, { id: 'synthetic-rule' }];
  c.graph.edges = [{ id: 'support', from: 'source-fact', to: 'synthetic-rule', type: 'supports', sourceId: c.sources[0].id, recordId: evidence[0] }];
  assert.equal(queryGraph(c.graph, { startId: 'source-fact', caseId: c.id }).nodes.length, 2);
  const report = A.buildReport(c);
  assert.equal(report.release.allowed, false);
  assert.equal(report.official, false);
  assert.equal(report.sections[0].evidence[1].sourceHash, c.sources[0].hash);
  assert.equal(report.sections[0].evidence[1].locator.line, 2);
  assert.equal(report.sections.find(section => section.calculations).calculations[0].monthlyBenefitCents, 75000);
  const restored = await A.importCase(await A.exportCase(c));
  assert.deepEqual(restored, c);
  assert.deepEqual(Buffer.from(restored.sources[0].originalBase64, 'base64'), Buffer.from(c.sources[0].originalBase64, 'base64'));
  assert.equal(search(restored.sources[0].records, 'Service months', 'exact')[0].record.id, evidence[1]);
  assert.equal(A.buildReport(restored).release.status, 'BLOCKED');
});

test('hostile markup remains inert across parsing, search, provisional report and package recovery', async () => {
  const c = await workspace();
  const hostile = '<script>globalThis.integrationPwned=true</script><p>&lt;img src=x onerror=alert(1)&gt; Synthetic benefit</p><img src="https://invalid.example/x" onerror="globalThis.integrationPwned=true">';
  c.sources.push(await parseFile(file('hostile.html', hostile)));
  assert.equal(globalThis.integrationPwned, undefined);
  assert.equal(c.sources[1].records.length, 1);
  const hit = search(c.sources[1].records, 'Synthetic benefit', 'exact')[0];
  assert.match(hit.record.text, /<img src=x onerror=alert\(1\)>/);
  assert.equal(A.buildReport(c).sections[0].evidence.at(-1).excerpt, hit.record.text);
  const recovered = await A.importCase(await A.exportCase(c));
  assert.equal(recovered.sources[1].originalBase64, c.sources[1].originalBase64);
  assert.equal(globalThis.integrationPwned, undefined);
  await assert.rejects(parseFile(file('external.xml', '<!DOCTYPE p SYSTEM "https://invalid.example"><p/>')), /DTD/);
  assert.throws(() => querySQL(c.sources[0].records, 'DELETE FROM records'));
  assert.throws(() => search(c.sources[0].records, '(a+)+$', 'regex'));
});

test('cross-case evidence and mismatched source-record pairs fail across module boundaries', async () => {
  const c = await workspace();
  const foreign = await parseFile(file('foreign-case.txt', 'Different synthetic case evidence.'));
  assert.equal(search(c.sources[0].records, 'Different synthetic').length, 0);
  assert.throws(() => propose(c, [foreign.records[0].id]), /outside this case/);
  c.graph.nodes = [{ id: 'a' }, { id: 'b' }];
  c.graph.edges = [{ id: 'bad', from: 'a', to: 'b', type: 'supports', sourceId: foreign.id, recordId: foreign.records[0].id }];
  await assert.rejects(A.exportCase(c), /case source evidence|outside its case source/);
  c.sources.push(foreign);
  c.graph.edges[0].recordId = c.sources[0].records[0].id;
  await assert.rejects(A.exportCase(c), /outside its case source/);
  c.graph.edges[0].recordId = foreign.records[0].id;
  assert.equal(A.validateCase(c).valid, true);
  assert.throws(() => queryGraph(c.graph, { startId: 'a', caseId: 'unrelated-case' }), /different case/);
});

test('source hash tampering fails even with a freshly recomputed package envelope hash', async () => {
  const c = await workspace();
  const encoded = JSON.parse(await A.exportCase(c));
  const payload = JSON.parse(encoded.payload);
  const bytes = Buffer.from(payload.sources[0].originalBase64, 'base64');
  bytes[0] ^= 1;
  payload.sources[0].originalBase64 = bytes.toString('base64');
  encoded.payload = JSON.stringify(payload);
  encoded.hash = createHash('sha256').update(encoded.payload).digest('hex');
  await assert.rejects(A.importCase(JSON.stringify(encoded)), /Original source hash mismatch/);
  c.sources[0].hash = '0'.repeat(64);
  await assert.rejects(A.exportCase(c), /Source identity or hash/);
});

test('portable graph validation rejects graphs that the traversal contract cannot safely query', async () => {
  const c = await workspace();
  const source = c.sources[0], recordId = source.records[0].id;
  c.graph.nodes = [{ id: 'a' }, { id: 'b' }];
  const edge = { id: 'edge-one', from: 'a', to: 'b', type: 'supports', sourceId: source.id, recordId };
  for (const changes of [{ id: undefined }, { recordId: undefined }, { caseId: 'foreign-case' }]) {
    c.graph.edges = [{ ...edge, ...changes }];
    // JSON packages drop undefined fields, so use the actual portable representation.
    c.graph.edges = JSON.parse(JSON.stringify(c.graph.edges));
    assert.equal(A.validateCase(c).valid, false, JSON.stringify(changes));
  }
  c.graph.edges = [edge, { ...edge }];
  assert.equal(A.validateCase(c).valid, false, 'duplicate edge ids');
  c.graph.edges = [edge];
  c.graph.caseId = 'foreign-case';
  assert.equal(A.validateCase(c).valid, false, 'foreign graph case');
  c.graph.caseId = c.id;
  c.graph.nodes[0].caseId = 'foreign-case';
  assert.equal(A.validateCase(c).valid, false, 'foreign node case');
});

test('portable rule validation requires evidence even when an attacker bypasses the proposal API', async () => {
  const c = await workspace();
  const rule = propose(c, [c.sources[0].records[0].id]);
  rule.sourceRecordIds = [];
  assert.equal(A.validateCase(c).valid, false);
  await assert.rejects(A.exportCase(c), /evidence|Rule/);
});
