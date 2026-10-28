'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const A = require('../js/artifacts.js');
const R = require('../js/reports.js');
function fixture() {
  const bytes = Buffer.from('Synthetic only. Annual pay 60000. Service 10 years. Accrual 1.5%.');
  const hash = createHash('sha256').update(bytes).digest('hex'), id = 'src-' + hash;
  return { schemaVersion: 1, id: 'synthetic', name: 'Synthetic research', createdAt: '2026-10-28T00:00:00.000Z', sources: [{ id, hash, name: 'synthetic.txt', format: 'txt', size: bytes.length, originalBase64: bytes.toString('base64'), records: [{ id: id + ':1', sourceId: id, text: bytes.toString(), locator: { kind: 'text', label: 'Line 1', line: 1, offset: 0, length: bytes.length } }] }], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
}
function addRule(c, id = 'rule', date = '2026-01-01') {
  return A.proposeRule(c, { id, title: 'Synthetic rule ' + id, effectiveDate: date, sourceRecordIds: [c.sources[0].records[0].id], synthetic: true, formula: 'synthetic-accrual-v1', interpretation: 'Synthetic interpretation only.' });
}
test('standalone reports contain source hashes, precise locators and valid internal citation anchors', () => {
  const c = fixture(); addRule(c);
  const html = R.renderResearchReport(c, { layout: 'review' });
  assert.match(html, /^<!doctype html>/); assert.match(html, /Official output BLOCKED/);
  assert.ok(html.includes(c.sources[0].hash)); assert.match(html, /Line 1/); assert.match(html, /&quot;offset&quot;: 0/);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  assert.ok(links.some(link => link.startsWith('evidence-')));
  for (const link of links) assert.ok(ids.has(link), 'Missing anchor ' + link);
});
test('reports escape all hostile source, case, locator, field and interpretation text', () => {
  const c = fixture(), attack = '</pre><script src="https://evil.invalid/x"></script><img src=x onerror=alert(1)>';
  c.name = attack; c.sources[0].name = attack; c.sources[0].records[0].text = attack;
  c.sources[0].records[0].locator.label = attack; c.sources[0].records[0].fields = { malicious: attack };
  addRule(c); c.rules[0].interpretation = attack;
  const html = R.renderResearchReport(c);
  assert.ok(html.includes('&lt;script')); assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<script\b|<img\b/);
  assert.match(html, /script-src &#39;none&#39;|script-src 'none'/);
  assert.match(html, /connect-src 'none'/); assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /href="https?:|src="https?:/);
});
test('unknown layouts and option injection fail before rendering', () => {
  const c = fixture();
  for (const layout of ['__proto__', 'constructor', '<script>', {}, null, 1]) assert.throws(() => R.renderResearchReport(c, { layout }), /layout/);
  assert.throws(() => R.renderResearchReport(c, { layout: 'review', title: '<script>' }), /only/);
  assert.throws(() => R.renderResearchReport(c, Object.create({ layout: 'review' })), /only/);
  assert.equal(R.getReportLayout('review').schemaVersion, 1);
  assert.ok(Object.isFrozen(R.REPORT_LAYOUTS.review.sections));
});
test('layouts order sections independently and preserve stable source evidence anchors', () => {
  const c = fixture(); addRule(c);
  const review = R.renderResearchReport(c, { layout: 'review' }), evidence = R.renderResearchReport(c, { layout: 'evidence' });
  assert.ok(review.indexOf('<section id="rules"') < review.indexOf('<section id="evidence"'));
  assert.ok(evidence.indexOf('<section id="evidence"') < evidence.indexOf('<section id="rules"'));
  const anchors = html => [...html.matchAll(/id="(evidence-[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(anchors(review), anchors(evidence));
});
test('timeline dates are sorted and synthetic calculation status links to source evidence', () => {
  const c = fixture(); addRule(c, 'later', '2027-01-01'); addRule(c, 'earlier', '2025-01-01');
  A.approveRule(c, 'earlier', { reviewer: 'Synthetic reviewer', statement: 'Approve this synthetic test only.', confirmedByHuman: true });
  A.calculateSynthetic(c, 'earlier', { annualSalaryCents: 6000000, serviceMonths: 120, accrualBasisPoints: 150 });
  const html = R.renderResearchReport(c), timeline = html.slice(html.indexOf('<section id="timeline"'), html.indexOf('<section id="rules"'));
  assert.ok(timeline.indexOf('2025-01-01') < timeline.indexOf('2027-01-01'));
  assert.match(html, /900000/); assert.match(html, /75000/); assert.match(html, /does not authenticate reviewer identity/);
  assert.match(html, /synthetic, provisional, official release BLOCKED/);
});
test('broken references, invalid calculations and cross-case evidence block reports', () => {
  const c = fixture(); addRule(c); c.rules[0].sourceRecordIds = ['foreign'];
  assert.throws(() => R.renderResearchReport(c), /Report blocked/);
  c.rules[0].sourceRecordIds = [c.sources[0].records[0].id];
  c.graph.caseId = 'foreign'; assert.throws(() => R.renderResearchReport(c), /Report blocked/);
  delete c.graph.caseId;
  A.approveRule(c, 'rule', { reviewer: 'Synthetic reviewer', statement: 'Synthetic test only.', confirmedByHuman: true });
  const calculation = A.calculateSynthetic(c, 'rule', { annualSalaryCents: 6000000, serviceMonths: 120, accrualBasisPoints: 150 });
  calculation.annualBenefitCents++;
  assert.throws(() => R.renderResearchReport(c), /replay validation/);
});
test('rendered-content bounds reject expansion before creating an oversized HTML artifact', () => {
  const c = fixture(), source = c.sources[0], original = source.records[0];
  source.records = Array.from({ length: 5 }, (_, i) => ({ ...original, id: original.id + ':' + i, text: '<'.repeat(1024 * 1024) }));
  assert.throws(() => R.renderResearchReport(c), /rendered-content limit/);
});
