'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const A = require('../js/artifacts.js');
function fixture() {
  const bytes = Buffer.from('SYNTHETIC ONLY: Annual pay 60000. Service 10 years. Accrual 1.5%.');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const id = 'src-' + hash;
  return { schemaVersion: 1, id: 'synthetic-case', name: 'Synthetic case', createdAt: '2026-10-28T00:00:00.000Z', sources: [{ id, hash, name: 'synthetic.txt', format: 'txt', size: bytes.length, originalBase64: bytes.toString('base64'), records: [{ id: id + ':1', sourceId: id, text: bytes.toString(), locator: { kind: 'text', label: 'Line 1', line: 1 } }] }], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
}
function proposal(c) { return A.proposeRule(c, { id: 'synthetic-rule', title: 'Synthetic arithmetic fixture', effectiveDate: '2026-01-01', sourceRecordIds: [c.sources[0].records[0].id], synthetic: true, formula: 'synthetic-accrual-v1' }); }
function approve(c) { return A.approveRule(c, 'synthetic-rule', { reviewer: 'Synthetic test reviewer', statement: 'Approve this synthetic test only.', confirmedByHuman: true }); }
test('portable case round-trip preserves source bytes, evidence and schema', async () => {
  const c = fixture(); const encoded = await A.exportCase(c);
  assert.deepEqual(await A.importCase(encoded), c);
  assert.equal(A.validateCase(c).valid, true);
});
test('tampering with envelope, original bytes or source references fails closed', async () => {
  const c = fixture(); const envelope = JSON.parse(await A.exportCase(c));
  envelope.payload = envelope.payload.replace('Synthetic case', 'Altered case');
  await assert.rejects(A.importCase(JSON.stringify(envelope)), /integrity/);
  c.sources[0].originalBase64 = Buffer.alloc(c.sources[0].size, 65).toString('base64');
  await assert.rejects(A.exportCase(c), /hash mismatch/);
  c.sources[0].records[0].sourceId = 'other-case';
  assert.equal(A.validateCase(c).valid, false);
});
test('reject malformed source bytes and versions without migration guesses', async () => {
  const c = fixture(); c.schemaVersion = 2;
  await assert.rejects(A.exportCase(c), /schema version/);
  c.schemaVersion = 1; c.sources[0].originalBase64 = '!bad';
  assert.equal(A.validateCase(c).valid, false);
  await assert.rejects(A.importCase('{broken'), /valid JSON/);
});
test('reject prototype injection, invalid dates, duplicate records and cross-case graph evidence', () => {
  const c = fixture(); c.extra = JSON.parse('{"__proto__":{"x":1}}');
  assert.equal(A.validateCase(c).valid, false); delete c.extra;
  c.createdAt = '2026-02-31'; assert.equal(A.validateCase(c).valid, false); c.createdAt = '2026-10-28';
  c.sources[0].records.push(c.sources[0].records[0]); assert.equal(A.validateCase(c).valid, false); c.sources[0].records.pop();
  c.graph = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', type: 'supports', sourceId: 'other-case' }] };
  assert.equal(A.validateCase(c).valid, false);
});
test('internal review carries precise evidence and cannot release official R1 or BSRS', () => {
  const c = fixture(); const report = A.buildReport(c);
  assert.equal(report.official, false); assert.equal(report.release.allowed, false);
  assert.equal(report.bsrs.officialSyntax, false); assert.match(report.disclaimer, /not an official R1/);
  assert.equal(report.sections[0].evidence[0].sourceHash, c.sources[0].hash);
  assert.equal(report.sections[0].evidence[0].locator.line, 1);
  c.officialApproval = true; c.dictionaryValidated = true;
  assert.equal(A.buildReport(c).release.allowed, false);
});
test('approval requires explicit human confirmation and proposals cannot calculate', () => {
  const c = fixture(); const r = proposal(c);
  assert.equal(r.status, 'proposed');
  assert.throws(() => A.calculateSynthetic(c, r.id, {}), /approved/);
  assert.throws(() => A.approveRule(c, r.id, { reviewer: 'AI', statement: 'Approved' }), /human/);
  assert.throws(() => A.proposeRule(c, { id: 'new', title: 'Invalid', effectiveDate: '2026-01-01', sourceRecordIds: ['foreign'] }), /outside this case/);
});
test('synthetic accrual is exact and independently matches 60000 x 10 x .015 = 9000 annual, 750 monthly', () => {
  const c = fixture(); proposal(c); approve(c);
  const result = A.calculateSynthetic(c, 'synthetic-rule', { annualSalaryCents: 6000000, serviceMonths: 120, accrualBasisPoints: 150 });
  assert.equal(result.annualBenefitCents, 900000); assert.equal(result.monthlyBenefitCents, 75000);
  assert.equal(result.official, false); assert.equal(result.synthetic, true);
  assert.equal(A.validateCase(c).valid, true);
});
test('synthetic rounding handles exact half-cent and rejects invalid numeric inputs', () => {
  const c = fixture(); proposal(c); approve(c);
  // 1 cent salary x 6/12 year x 100% = one half cent; half-up annual is 1 cent.
  const r = A.calculateSynthetic(c, 'synthetic-rule', { annualSalaryCents: 1, serviceMonths: 6, accrualBasisPoints: 10000 });
  assert.equal(r.annualBenefitCents, 1); assert.equal(r.monthlyBenefitCents, 0);
  for (const v of [-1, 1.1, NaN, Infinity, '100', 1000000001]) assert.throws(() => A.calculateSynthetic(c, 'synthetic-rule', { annualSalaryCents: v, serviceMonths: 1, accrualBasisPoints: 1 }), /Invalid synthetic input/);
});
test('reject altered calculations and stale rule versions during package export', async () => {
  const c = fixture(); proposal(c); approve(c);
  const r = A.calculateSynthetic(c, 'synthetic-rule', { annualSalaryCents: 6000000, serviceMonths: 120, accrualBasisPoints: 150 });
  r.monthlyBenefitCents = 75001;
  await assert.rejects(A.exportCase(c), /replay validation/);
  r.monthlyBenefitCents = 75000; c.rules[0].version = 2;
  assert.equal(A.validateCase(c).valid, false);
});
test('graph nodes, edges and human approvals cannot refer to foreign evidence', () => {
  const c = fixture();
  c.graph.nodes.push({ id: 'a', sourceId: 'foreign' });
  assert.equal(A.validateCase(c).valid, false);
  c.graph.nodes[0].sourceId = c.sources[0].id;
  c.graph.nodes[0].recordId = 'foreign-record';
  assert.equal(A.validateCase(c).valid, false);
  c.graph.nodes = [];
  proposal(c); approve(c); delete c.rules[0].approval.confirmedByHuman;
  assert.equal(A.validateCase(c).valid, false);
});
