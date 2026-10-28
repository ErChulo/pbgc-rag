'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { buildGraphViewModel, renderEvidenceGraph, graphViewLimits } = require('../js/graph-view.js');
const clone = value => JSON.parse(JSON.stringify(value));
function sample() { return { caseId: 'synthetic-case', nodes: [{ id: 'b', label: 'Second evidence', sourceId: 'synthetic-source', recordId: 'synthetic-record-b' }, { id: 'a', label: 'First evidence', type: 'evidence', status: 'proposed', sourceId: 'synthetic-source', recordId: 'synthetic-record-a', locator: { kind: 'text', label: 'Line 1', line: 1 } }], edges: [{ id: 'link', from: 'a', to: 'b', type: 'supports', sourceId: 'synthetic-source', recordId: 'synthetic-record-a', status: 'proposed' }] }; }

test('graph view preserves identity, provenance and labels with deterministic detached layout', () => {
  const graph = sample(), before = clone(graph), model = buildGraphViewModel(graph);
  assert.deepEqual(graph, before); assert.equal(model.schemaVersion, 1); assert.deepEqual(model.nodes.map(n => n.id), ['a', 'b']);
  assert.equal(model.nodes[0].sourceId, graph.nodes[1].sourceId); assert.equal(model.nodes[0].recordId, graph.nodes[1].recordId);
  assert.deepEqual(model.nodes[0].locator, graph.nodes[1].locator); assert.equal(model.edges[0].id, 'link'); assert.equal(model.edges[0].recordId, 'synthetic-record-a');
  const reordered = { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
  assert.deepEqual(buildGraphViewModel(reordered), model);
  model.nodes[0].locator.line = 99; assert.equal(graph.nodes[1].locator.line, 1); assert.equal(model.truncated, false);
});

test('display caps are explicit and input graph remains complete', () => {
  const nodes = Array.from({ length: 110 }, (_, i) => ({ id: `n-${String(i).padStart(3, '0')}`, label: `Synthetic node ${i}` }));
  const edges = Array.from({ length: 250 }, (_, i) => ({ id: `e-${String(i).padStart(3, '0')}`, from: nodes[i % 100].id, to: nodes[(i + 1) % 100].id, type: 'proposed-link', sourceId: 'synthetic-source', recordId: 'synthetic-record' }));
  edges.push({ id: 'outside-display', from: nodes[109].id, to: nodes[0].id, type: 'supports', sourceId: 'synthetic-source', recordId: 'synthetic-record' });
  const graph = { nodes, edges }, model = buildGraphViewModel(graph);
  assert.equal(model.nodes.length, 100); assert.equal(model.edges.length, 200); assert.equal(model.totalNodes, 110); assert.equal(model.totalEdges, 251);
  assert.equal(model.omittedNodes, 10); assert.equal(model.omittedEdges, 51); assert.equal(model.truncated, true);
  assert.equal(graph.nodes.length, 110); assert.equal(graph.edges.length, 251); assert.ok(model.edges.every(e => model.nodes.some(n => n.id === e.from) && model.nodes.some(n => n.id === e.to)));
});

test('empty graphs are valid and unknown node labels fall back to IDs without inventing approval', () => {
  const empty = buildGraphViewModel({ nodes: [], edges: [] }); assert.deepEqual(empty.nodes, []); assert.equal(empty.truncated, false);
  const unlabeled = buildGraphViewModel({ nodes: [{ id: 'synthetic-unlabeled' }], edges: [] });
  assert.equal(unlabeled.nodes[0].label, 'synthetic-unlabeled'); assert.equal(unlabeled.nodes[0].status, 'unreviewed');
  assert.match(unlabeled.interpretation, /do not establish legal priority/);
});

test('duplicate identities, dangling links, absent provenance and cross-case metadata reject', () => {
  for (const change of [
    graph => graph.nodes.push(clone(graph.nodes[0])), graph => graph.edges.push(clone(graph.edges[0])),
    graph => graph.edges[0].from = 'absent', graph => delete graph.edges[0].recordId,
    graph => delete graph.edges[0].sourceId, graph => graph.nodes[0].caseId = 'different-case',
    graph => graph.edges[0].caseId = 'different-case', graph => graph.edges[0].validFrom = '2026-02-30', graph => { graph.edges[0].validFrom = '2030-01-01'; graph.edges[0].validTo = '2020-01-01'; }, graph => graph.nodes[0].label = '', graph => graph.edges[0].type = ''
  ]) { const graph = sample(); change(graph); assert.throws(() => buildGraphViewModel(graph), /Evidence graph/); }
});

test('hostile labels remain uninterpreted data and unsafe trees reject before getters execute', () => {
  const graph = sample(); graph.nodes[0].label = '<script>globalThis.graphPwned=true</script><img src="https://invalid">';
  assert.equal(buildGraphViewModel(graph).nodes.find(n => n.id === 'b').label, graph.nodes[0].label); assert.equal(globalThis.graphPwned, undefined);
  let calls = 0; const accessor = {}; Object.defineProperty(accessor, 'nodes', { get() { calls++; return []; }, enumerable: true });
  assert.throws(() => buildGraphViewModel(accessor), /accessors/); assert.equal(calls, 0);
  const cycle = sample(); cycle.extra = cycle; assert.throws(() => buildGraphViewModel(cycle), /acyclic/);
  assert.throws(() => buildGraphViewModel(JSON.parse('{"nodes":[],"edges":[],"__proto__":{}}')), /unsafe/);
});

test('resource bounds and renderer misuse fail before DOM mutation', () => {
  assert.throws(() => buildGraphViewModel({ nodes: Array.from({ length: graphViewLimits.nodes + 1 }, (_, i) => ({ id: 'n' + i })), edges: [] }), /limits/);
  assert.throws(() => renderEvidenceGraph(null, sample()), /DOM container/);
  const fake = { replaceChildren() { throw Error('must not mutate'); }, ownerDocument: { createElementNS() {} } };
  assert.throws(() => renderEvidenceGraph(fake, sample(), { onSelect: 'eval-code' }), /trusted function/);
  let calls = 0; const options = {}; Object.defineProperty(options, 'onSelect', { get() { calls++; return () => {}; }, enumerable: true });
  assert.throws(() => renderEvidenceGraph(fake, sample(), options), /accessors/); assert.equal(calls, 0);
});
