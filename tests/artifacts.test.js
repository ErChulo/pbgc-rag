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
test('graph package contract requires unique edge ids and exact case/record provenance', () => {
  const make = () => {
    const c = fixture(); const s = c.sources[0], recordId = s.records[0].id;
    c.graph = { caseId: c.id, nodes: [{ id: 'a', caseId: c.id, sourceId: s.id, recordId }, { id: 'b', caseId: c.id }], edges: [{ id: 'ab', caseId: c.id, from: 'a', to: 'b', type: 'supports', sourceId: s.id, recordId }] };
    return c;
  };
  assert.equal(A.validateCase(make()).valid, true);
  for (const mutate of [c => delete c.graph.edges[0].id, c => c.graph.edges.push({ ...c.graph.edges[0] }), c => delete c.graph.edges[0].recordId, c => c.graph.caseId = 'foreign', c => c.graph.nodes[0].caseId = 'foreign', c => c.graph.edges[0].caseId = 'foreign']) {
    const c = make(); mutate(c); assert.equal(A.validateCase(c).valid, false);
  }
});
test('imported rules cannot omit evidence or duplicate evidence references', () => {
  const c = fixture(); const r = proposal(c);
  r.sourceRecordIds = []; assert.equal(A.validateCase(c).valid, false);
  r.sourceRecordIds = [c.sources[0].records[0].id, c.sources[0].records[0].id];
  assert.equal(A.validateCase(c).valid, false);
});
test('duplicate proposal evidence fails without mutating the case', () => {
  const c = fixture(); const id = c.sources[0].records[0].id;
  assert.throws(() => A.proposeRule(c, { id: 'duplicate', title: 'Duplicate', effectiveDate: '2026-01-01', sourceRecordIds: [id, id] }), /Proposal/);
  assert.equal(c.rules.length, 0); assert.equal(A.validateCase(c).valid, true);
});
function claimsFor(c) {
  const base = { caseId: c.id, kind: 'provision', subjectId: 'synthetic-plan', predicate: 'internal:NRD', group: 'synthetic-group', sourceRecordIds: [c.sources[0].records[0].id] };
  return [{ ...base, id: 'claim-a', value: 65 }, { ...base, id: 'claim-b', value: 62 }];
}
test('valid optional claims survive package round trips and remain unresolved in reports', async () => {
  const c = fixture(); c.claims = claimsFor(c);
  assert.equal(A.validateCase(c).valid, true);
  assert.deepEqual((await A.importCase(await A.exportCase(c))).claims, c.claims);
  const report = A.buildReport(c);
  assert.equal(report.conflictScreening.status, 'unresolved');
  assert.equal(report.conflictScreening.conflicts.length, 1);
  assert.equal(report.conflictScreening.conflicts[0].resolution, null);
  assert.ok(report.sections.some(section => section.heading === 'Unresolved claim screening'));
  assert.equal(report.release.allowed, false);
});
test('malformed and cross-case claims fail export and rehashed package import', async () => {
  const c = fixture(); c.claims = claimsFor(c);
  const valid = await A.exportCase(c);
  for (const mutate of [x => x.claims[0].caseId = 'foreign', x => x.claims[0].sourceRecordIds = ['foreign-record'], x => x.claims[0].priority = 'highest', x => x.claims = null]) {
    const envelope = JSON.parse(valid), payload = JSON.parse(envelope.payload); mutate(payload);
    assert.equal(A.validateCase(payload).valid, false);
    await assert.rejects(A.exportCase(payload));
    envelope.payload = JSON.stringify(payload); envelope.hash = createHash('sha256').update(envelope.payload).digest('hex');
    await assert.rejects(A.importCase(JSON.stringify(envelope)), /claim|Claim|Cross-case|Unknown/);
  }
});
test('claim accessors are rejected before they can execute during case validation', () => {
  const c = fixture(); c.claims = claimsFor(c); let executed = false;
  Object.defineProperty(c.claims[0], 'value', { enumerable: true, get() { executed = true; throw Error('must not execute'); } });
  assert.equal(A.validateCase(c).valid, false); assert.equal(executed, false);
});

test('reference provenance remains version-pinned in portable packages and report citations', async () => {
  const c = fixture();
  c.sources[0].referenceOrigin = { libraryId: 'synthetic-library', revision: 2, versionLabel: 'Synthetic edition 2' };
  assert.deepEqual((await A.importCase(await A.exportCase(c))).sources[0].referenceOrigin, c.sources[0].referenceOrigin);
  assert.deepEqual(A.buildReport(c).sections[0].evidence[0].referenceOrigin, c.sources[0].referenceOrigin);
  for (const invalid of [{ libraryId: 'x', revision: 0, versionLabel: 'bad' }, { libraryId: 'x', revision: 2 }, { libraryId: 'x', revision: 2, versionLabel: 'ok', approved: true }]) {
    c.sources[0].referenceOrigin = invalid;
    await assert.rejects(A.exportCase(c), /provenance/);
  }
});

test('aggregate repeated text is refused before package serialization can expand a large payload', async () => {
  const c=fixture(), source=c.sources[0], block='x'.repeat(2*1024*1024);
  source.records=Array.from({length:25},(_,i)=>({id:source.id+':'+(i+1),sourceId:source.id,text:block,locator:{kind:'text',label:'Synthetic bounded record '+(i+1)}}));
  const validation=A.validateCase(c);
  assert.equal(validation.valid,false);
  assert.match(validation.errors.join(' '),/cumulative text/);
  await assert.rejects(A.exportCase(c),/cumulative text/);
});

test('a valid working-case package round-trips when JSON string escaping expands its outer envelope', async () => {
  const {parseFile}=require('../js/parsers.js');
  const text=Array.from({length:5},()=>String.fromCharCode(92).repeat(2000000)).join('\n');
  const source=await parseFile(new File([text],'synthetic-escaped-text.txt'));
  const c={schemaVersion:1,id:'synthetic-escaped-case',name:'Synthetic escaped package case',createdAt:'2026-10-28T00:00:00.000Z',sources:[source],graph:{nodes:[],edges:[]},rules:[],calculations:[]};
  assert.ok(JSON.stringify(c).length<32*1024*1024);
  const encoded=await A.exportCase(c);
  assert.ok(encoded.length>49*1024*1024,'Fixture must exercise the former outer-envelope limit.');
  const restored=await A.importCase(encoded);
  assert.equal(restored.sources[0].hash,source.hash);
  assert.equal(restored.sources[0].records[4].text,source.records[4].text);
  assert.equal(restored.sources[0].originalBase64,source.originalBase64);
});

test('case exports capture validated state before asynchronous hashing and reject non-JSON hidden or sparse state', async () => {
  const c=fixture(), expected=JSON.parse(JSON.stringify(c));
  const pending=A.exportCase(c);
  c.name='Edited after export began';c.sources[0].originalBase64='AAAA';
  assert.deepEqual(await A.importCase(await pending),expected);
  const hidden=fixture();Object.defineProperty(hidden,'name',{value:'Hidden required name',enumerable:false});
  assert.equal(A.validateCase(hidden).valid,false);
  await assert.rejects(A.exportCase(hidden),/hidden properties/);
  const sparse=fixture();sparse.notes=new Array(2);
  await assert.rejects(A.exportCase(sparse),/sparse arrays/);
  const decorated=fixture();decorated.notes=[];decorated.notes.extra='Not serialized';
  await assert.rejects(A.exportCase(decorated),/array properties/);
  let invoked=false;const altered=fixture();altered.notes=Object.setPrototypeOf([],{toJSON(){invoked=true;return [];}});
  await assert.rejects(A.exportCase(altered),/plain JSON/);assert.equal(invoked,false);
});
