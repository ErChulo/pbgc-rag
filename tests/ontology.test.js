'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ontology, detectConflicts } = require('../js/ontology.js');
const caseData = { schemaVersion: 1, id: 'case-a', sources: [{ id: 's-a', name: 'Synthetic text', hash: 'unverified-fixture', records: [{ id: 'r-a', sourceId: 's-a', text: 'Synthetic age 65.', locator: { kind: 'text', label: 'Line 1', line: 1 } }, { id: 'r-b', sourceId: 's-a', text: 'Synthetic age 62.', locator: { kind: 'text', label: 'Line 2', line: 2 } }] }] };
const claim = (id, value, overrides = {}) => ({ id, caseId: 'case-a', kind: 'provision', subjectId: 'synthetic-plan', predicate: 'internal:NRD', group: 'synthetic-group-a', value, sourceRecordIds: [id === 'a' ? 'r-a' : 'r-b'], ...overrides });
test('ontology is frozen, versioned, internal and explicitly has no official definitions', () => {
  assert.equal(ontology.version, '1.0.0'); assert.equal(ontology.official, false); assert.equal(ontology.namespace, 'internal:');
  for (const label of ['NRD', 'ERD', 'EURD', 'RBD', 'QPSA', 'DOR', 'DORNSF', 'XRD', 'PC']) assert.ok(ontology.terms.some(t => t.id === 'internal:' + label));
  assert.ok(ontology.terms.every(t => t.definition === null)); assert.ok(Object.isFrozen(ontology.terms[0]));
});
test('overlapping contradictory claims remain unresolved with exact evidence', () => {
  const claims = [claim('a', 65, { validFrom: '2020-01-01', validTo: '2030-01-01' }), claim('b', 62, { kind: 'fact', validFrom: '2025-01-01' })];
  const before = JSON.stringify({ caseData, claims }); const result = detectConflicts(caseData, claims);
  assert.equal(result.conflicts.length, 1); const conflict = result.conflicts[0];
  assert.equal(conflict.status, 'unresolved'); assert.equal(conflict.resolution, null); assert.deepEqual(conflict.overlap, { validFrom: '2025-01-01', validTo: '2030-01-01' });
  assert.equal(conflict.left.citations[0].locator.line, 1); assert.equal(conflict.right.citations[0].recordId, 'r-b'); assert.match(result.interpretation, /No legal interpretation/);
  conflict.left.citations[0].locator.line = 999; assert.equal(caseData.sources[0].records[0].locator.line, 1); assert.equal(JSON.stringify({ caseData, claims }), before);
});
test('disjoint dates, groups, subjects and predicates do not claim contradictions', () => {
  for (const overrides of [{ validFrom: '2020-01-02' }, { group: 'another-group' }, { subjectId: 'another-plan' }, { predicate: 'internal:ERD' }]) assert.equal(detectConflicts(caseData, [claim('a', 65, { validTo: '2020-01-01' }), claim('b', 62, overrides)]).conflicts.length, 0);
  assert.equal(detectConflicts(caseData, [claim('a', 65), claim('b', 65)]).conflicts.length, 0);
});
test('date boundaries are inclusive, absent dates are unbounded, value types matter', () => {
  assert.equal(detectConflicts(caseData, [claim('a', 65, { validTo: '2020-01-01' }), claim('b', 62, { validFrom: '2020-01-01' })]).conflicts.length, 1);
  const out = detectConflicts(caseData, [claim('a', 65), claim('b', '65')]); assert.equal(out.conflicts.length, 1); assert.deepEqual(out.conflicts[0].overlap, { validFrom: null, validTo: null });
});
test('invalid dates, reversed intervals and unknown claim fields fail closed', () => {
  for (const overrides of [{ validFrom: '2025-02-30' }, { validFrom: '2025-02-29' }, { validFrom: '2025-01-01T00:00:00Z' }, { validFrom: '2030-01-01', validTo: '2020-01-01' }, { priority: 99 }, { predicate: 'official:NRD' }, { value: { age: 65 } }, { value: NaN }]) assert.throws(() => detectConflicts(caseData, [claim('a', 65, overrides)]));
  assert.doesNotThrow(() => detectConflicts(caseData, [claim('a', 65, { validFrom: '2024-02-29' })]));
});
test('citations and claims cannot cross case boundaries or refer to absent records', () => {
  for (const overrides of [{ caseId: 'case-b' }, { sourceRecordIds: ['outside-case-record'] }, { sourceRecordIds: [] }, { sourceRecordIds: ['r-a', 'r-a'] }]) assert.throws(() => detectConflicts(caseData, [claim('a', 65, overrides)]));
  const source = structuredClone(caseData); source.sources[0].caseId = 'case-b'; assert.throws(() => detectConflicts(source, []), /Cross-case/);
  const record = structuredClone(caseData); record.sources[0].records[0].caseId = 'case-b'; assert.throws(() => detectConflicts(record, []), /Cross-case/);
  const mismatched = structuredClone(caseData); mismatched.sources[0].records[0].sourceId = 'other'; assert.throws(() => detectConflicts(mismatched, []), /case source/);
});
test('cycles, prototype keys, accessors and duplicate IDs are rejected without executing code', () => {
  const cyclic = claim('a', 65); cyclic.value = cyclic; assert.throws(() => detectConflicts(caseData, [cyclic]), /Cyclic/);
  const hostile = claim('a', 65); let executed = false; Object.defineProperty(hostile, 'value', { get() { executed = true; throw Error('executed'); }, enumerable: true });
  assert.throws(() => detectConflicts(caseData, [hostile]), /Accessors/); assert.equal(executed, false);
  const unsafe = JSON.parse('{"__proto__":{}}'); assert.throws(() => detectConflicts(unsafe, []), /Unsafe/);
  assert.throws(() => detectConflicts(caseData, [claim('a', 65), claim('a', 62)]), /unique/);
  const duplicated = structuredClone(caseData); duplicated.sources[0].records.push(duplicated.sources[0].records[0]); assert.throws(() => detectConflicts(duplicated, []), /unique/);
});
test('bounded screening rejects oversized claims and excessive result pairs', () => {
  assert.throws(() => detectConflicts(caseData, Array.from({ length: 1001 }, (_, n) => claim(String(n), n))), /1000/);
  assert.throws(() => detectConflicts(caseData, Array.from({ length: 143 }, (_, n) => claim(String(n), n))), /result limit|memory limit/);
  const sparse = claim('a', 65); sparse.value = new Array(100000000); assert.throws(() => detectConflicts(caseData, [sparse]), /Array allocation/);
});
