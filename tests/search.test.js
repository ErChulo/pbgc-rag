'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { search, querySQL, queryGraph } = require('../js/search.js');
const records = [
  { id: 'r1', sourceId: 's1', text: 'Normal retirement age is 65. Retirement provisions.', locator: { label: 'Line 1' }, fields: { age: 65, group: 'A' } },
  { id: 'r2', sourceId: 's2', text: 'Early retirement age is 55.', locator: { label: 'Line 2' }, fields: { age: 55, group: 'B' } },
  { id: 'r3', sourceId: 's2', text: 'Survivor provision: spouse benefit.', locator: { label: 'Line 3' }, fields: { age: 50, group: 'A' } }
];
test('keyword requires every term and ranks with explicit source evidence', () => {
  const hits = search(records, 'retirement age');
  assert.deepEqual(hits.map(h => h.record.id), ['r1', 'r2']);
  assert.equal(hits[0].score, 3); assert.ok(hits[0].reason); assert.equal(hits[0].record.sourceId, 's1');
  assert.deepEqual(search(records, 'unknown'), []); assert.deepEqual(search(records, ' '), []);
});
test('exact phrase is literal, case insensitive and Unicode normalized', () => {
  assert.deepEqual(search(records, 'EARLY RETIREMENT', 'exact').map(h => h.record.id), ['r2']);
  assert.equal(search([{ id: 'x', sourceId: 'x', text: 'ＡＢＣ' }], 'abc', 'exact').length, 1);
  assert.equal(search(records, 'retirement.*', 'exact').length, 0);
});
test('safe regex supports classes, anchors, escapes and bounded linear repetition', () => {
  assert.deepEqual(search(records, '^Early.*55\\.$', 'regex').map(h => h.record.id), ['r2']);
  assert.equal(search(records, '[56][05]', 'regex').length, 2);
  assert.equal(search(records, '\\d+', 'regex').length, 2);
  assert.equal(search(records, 'spouses?', 'regex').length, 1);
  assert.equal(search(records, '^Survivor', 'regex').length, 1);
  assert.equal(search(records, '^retirement', 'regex').length, 0);
  assert.equal(search(records, 'benefit\\.$', 'regex').length, 1);
  assert.equal(search(records, 'a*b', 'regex').length, 1);
  assert.equal(search(records, '^[^N].*', 'regex').length, 2);
});
test('regex rejects unsafe/unsupported patterns instead of executing them', () => {
  for (const pattern of ['(a+)+$', '(a|aa)+$', 'a{1000000}', 'a|b', '\\1', '(?=a)', '[a', 'a**', 'x\\']) assert.throws(() => search(records, pattern, 'regex'));
  const long = [{ id: 'x', sourceId: 'x', text: 'a'.repeat(60000) + '!' }];
  assert.deepEqual(search(long, 'a*a*a*a*a*b$', 'regex'), []);
});
test('search validates resource limits and unsupported semantic mode', () => {
  assert.throws(() => search(records, 'a'.repeat(257)));
  assert.throws(() => search([{ id: 'x', sourceId: 'x', text: 'x'.repeat(65537) }], 'x'));
  assert.throws(() => search(records, 'benefit', 'semantic'), /unavailable/);
  assert.throws(() => search(Array.from({ length: 8 }, (_, i) => ({ id: String(i), sourceId: 's', text: 'x'.repeat(65536) })), 'a'.repeat(100), 'regex'), /work limit/);
  assert.throws(() => search([{}], 'x'));
});
test('SQL filters, projects, sorts, limits and returns detached rows', () => {
  const result = querySQL(records, "SELECT id, fields.age, locator.label FROM records WHERE fields.age >= 55 AND text LIKE '%retirement%' ORDER BY fields.age DESC LIMIT 1;");
  assert.deepEqual(result, [{ id: 'r1', 'fields.age': 65, 'locator.label': 'Line 1' }]);
  result[0].id = 'changed'; assert.equal(records[0].id, 'r1');
  assert.equal(querySQL(records, 'SELECT * FROM records').length, 3);
  assert.equal(querySQL(records, "SELECT id FROM records WHERE fields.group = 'A'").length, 2);
  assert.equal(querySQL(records, "SELECT id FROM records WHERE text LIKE 'Early_retirement%'").length, 1);
  assert.equal(querySQL(records, "SELECT id FROM records WHERE text LIKE 'Early%age%55.'").length, 1);
});
test('SQL fails closed for mutation, joins, expressions, comments and unsafe field traversal', () => {
  for (const sql of ['DELETE FROM records', 'UPDATE records SET text = 1', 'SELECT * FROM records; DROP TABLE records', 'SELECT * FROM records JOIN other', 'SELECT count(*) FROM records', 'SELECT * FROM records WHERE text = text', 'SELECT * FROM records -- comment', 'SELECT fields.__proto__ FROM records', 'SELECT constructor FROM records', 'SELECT * FROM records LIMIT 1001', 'SELECT * FROM records WHERE 1=1', 'SELECT * FROM records WHERE text LIKE 5']) assert.throws(() => querySQL(records, sql), sql);
  assert.equal(querySQL(records, "SELECT id FROM records WHERE text = 'DROP TABLE records'").length, 0);
});
test('search and SQL operate only on supplied case records', () => {
  const before = JSON.stringify(records);
  assert.equal(search([records[0]], 'Survivor').length, 0);
  assert.equal(querySQL([records[0]], "SELECT id FROM records WHERE sourceId = 's2'").length, 0);
  assert.equal(JSON.stringify(records), before);
});
const edge = (id, from, to, type = 'appliesTo', extra = {}) => ({ id, from, to, type, sourceId: 's1', recordId: 'r1', ...extra });
const graph = { caseId: 'case-a', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c', 'amends', { validFrom: '2025-01-01', validTo: '2025-12-31' }), edge('ca', 'c', 'a'), edge('ad', 'a', 'd', 'excludes')] };
test('typed graph traversal has cycle bounds, shortest paths and source provenance', () => {
  const out = queryGraph(graph, { startId: 'a', edgeTypes: ['appliesTo', 'amends'], maxDepth: 3 });
  assert.deepEqual(out.nodes.map(n => n.id), ['a', 'b', 'c']);
  assert.deepEqual(out.paths[2], { nodeId: 'c', depth: 2, edgeIds: ['ab', 'bc'] });
  assert.equal(out.edges[1].recordId, 'r1'); assert.equal(out.truncated, false);
  assert.equal(queryGraph(graph, { startId: 'a', maxDepth: 0 }).nodes.length, 1);
  const limited = queryGraph(graph, { startId: 'a', limit: 2 }); assert.equal(limited.nodes.length, 2); assert.equal(limited.truncated, true);
});
test('graph time filters are inclusive; directions are explicit', () => {
  assert.equal(queryGraph(graph, { startId: 'b', asOf: '2024-12-31' }).nodes.length, 1);
  assert.equal(queryGraph(graph, { startId: 'b', maxDepth: 1, asOf: '2025-01-01' }).nodes.length, 2);
  assert.equal(queryGraph(graph, { startId: 'b', maxDepth: 1, asOf: '2025-12-31' }).nodes.length, 2);
  assert.equal(queryGraph(graph, { startId: 'b', asOf: '2026-01-01' }).nodes.length, 1);
  assert.deepEqual(queryGraph(graph, { startId: 'b', direction: 'in', maxDepth: 1 }).nodes.map(n => n.id), ['b', 'a']);
});
test('graph rejects cross-case, missing evidence, dangling links and invalid dates', () => {
  assert.throws(() => queryGraph(graph, { startId: 'a', caseId: 'case-b' }), /different case/);
  assert.throws(() => queryGraph({ ...graph, nodes: [...graph.nodes, { id: 'z', caseId: 'case-b' }] }, { startId: 'a' }), /Cross-case/);
  assert.throws(() => queryGraph({ ...graph, edges: [edge('bad', 'a', 'b', 'x', { recordId: '' })] }, { startId: 'a' }), /provenance/);
  assert.throws(() => queryGraph({ ...graph, edges: [edge('bad', 'a', 'missing')] }, { startId: 'a' }), /edge/);
  assert.throws(() => queryGraph(graph, { startId: 'a', asOf: '2025-02-30' }), /dates/);
  assert.throws(() => queryGraph(graph, { startId: 'a', maxDepth: 100 }), /depth/);
  assert.throws(() => queryGraph({ nodes: [{ id: 'a', caseId: 'one' }, { id: 'b', caseId: 'two' }], edges: [] }, { startId: 'a' }), /Cross-case/);
});
test('safe regex agrees with native reference for 2048 short supported examples', () => {
  const patterns = ['a', 'ab', 'a*b', 'a+b', 'a?b', '^a*b$', 'a*b*c*', 'a?a?b', 'a+ab', 'a?ab', '^a?$', 'b$', '^b', '.*a', '[ab]+b$', '[^a]*'];
  for (const pattern of patterns) for (let n = 0; n < 128; n++) {
    const text = n.toString(2).slice(1).replaceAll('0', 'a').replaceAll('1', 'b');
    assert.equal(search([{ id: 'r', sourceId: 's', text }], pattern, 'regex').length > 0, new RegExp(pattern).test(text), JSON.stringify({ pattern, text }));
  }
});
test('regex shares an actual state-operation budget across records and returns no partial result', () => {
  const long = i => ({ id: String(i), sourceId: 's', text: 'a'.repeat(30000) });
  const pattern = 'a*'.repeat(20) + 'b$';
  // Each individual search fits; combined execution exhausts shared state work.
  assert.deepEqual(search([long(1)], pattern, 'regex'), []);
  assert.throws(() => search([long(1), long(2)], pattern, 'regex'), /operation budget exceeded/);
});
test('SQL LIKE budgets actual field characters and DP transitions, including non-text fields', () => {
  const large = { id: 'r', sourceId: 's', text: 'small', fields: { value: 'a'.repeat(60000) } };
  const pattern = '%'.repeat(100) + 'b';
  assert.throws(() => querySQL([large], "SELECT id FROM records WHERE fields.value LIKE '" + pattern + "'"), /operation budget exceeded/);
  const record = i => ({ id: String(i), sourceId: 's', text: 'small', fields: { value: 'a'.repeat(30000) } });
  const query = "SELECT id FROM records WHERE fields.value LIKE '" + '%'.repeat(100) + "b'";
  assert.deepEqual(querySQL([record(1)], query), []);
  assert.throws(() => querySQL([record(1), record(2)], query), /operation budget exceeded/);
});
