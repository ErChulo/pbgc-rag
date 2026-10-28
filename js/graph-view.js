/* Offline evidence graph display. Layout carries no legal or actuarial meaning. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ nodes: 10000, edges: 50000, shownNodes: 100, shownEdges: 200, depth: 20, values: 1000000, chars: 8 * 1024 * 1024 });
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const fail = text => { throw Error('Evidence graph: ' + text); };
  function safe(value, depth = 0, state = { values: 0, chars: 0, seen: new Set() }) {
    if (++state.values > LIMITS.values || depth > LIMITS.depth) fail('input exceeds structure limits.');
    if (typeof value === 'string') { state.chars += value.length; if (state.chars > LIMITS.chars) fail('input text exceeds limits.'); return; }
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
    if ((!Array.isArray(value) && !plain(value)) || state.seen.has(value)) fail('only acyclic plain JSON data is accepted.');
    state.seen.add(value);
    if (Array.isArray(value) && value.length > LIMITS.edges) fail('input array exceeds limits.');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe object key.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('accessors are not accepted.');
      if (Array.isArray(value) && key === 'length') continue;
      safe(descriptor.value, depth + 1, state);
    }
    state.seen.delete(value);
  }
  function text(value, name, max = 300) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(name + ' must be bounded nonempty text.'); return value; }
  function date(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('validity dates must be real ISO calendar dates.'); }
  const clone = value => JSON.parse(JSON.stringify(value));
  function buildGraphViewModel(graph) {
    safe(graph);
    if (!plain(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > LIMITS.nodes || graph.edges.length > LIMITS.edges) fail('nodes or edges are invalid or exceed limits.');
    const nodes = new Map(), edges = new Set(), caseIds = new Set();
    if (graph.caseId !== undefined) caseIds.add(text(graph.caseId, 'case ID', 200));
    for (const node of graph.nodes) {
      if (!plain(node)) fail('nodes must be plain objects.');
      text(node.id, 'node ID'); if (nodes.has(node.id)) fail('node IDs must be unique.');
      if (node.label !== undefined) text(node.label, 'node label', 1000);
      if (node.type !== undefined) text(node.type, 'node type', 100);
      if (node.status !== undefined) text(node.status, 'node status', 100);
      if (node.sourceId !== undefined) text(node.sourceId, 'node source ID');
      if (node.recordId !== undefined) text(node.recordId, 'node record ID');
      if (node.caseId !== undefined) caseIds.add(text(node.caseId, 'node case ID', 200));
      nodes.set(node.id, node);
    }
    for (const edge of graph.edges) {
      if (!plain(edge)) fail('edges must be plain objects.');
      text(edge.id, 'edge ID'); if (edges.has(edge.id)) fail('edge IDs must be unique.'); edges.add(edge.id);
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) fail('edge endpoints must resolve to graph nodes.');
      text(edge.type, 'edge type', 100); text(edge.sourceId, 'edge source provenance'); text(edge.recordId, 'edge record provenance');
      if (edge.status !== undefined) text(edge.status, 'edge status', 100);
      if (edge.caseId !== undefined) caseIds.add(text(edge.caseId, 'edge case ID', 200));
      if (edge.validFrom !== undefined) date(edge.validFrom);
      if (edge.validTo !== undefined) date(edge.validTo);
      if (edge.validFrom && edge.validTo && edge.validFrom > edge.validTo) fail('validity period is reversed.');
    }
    if (caseIds.size > 1) fail('cross-case graph identities are not accepted.');
    const compare = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const selectedNodes = [...nodes.values()].sort(compare).slice(0, LIMITS.shownNodes);
    const selected = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = graph.edges.filter(e => selected.has(e.from) && selected.has(e.to)).sort(compare).slice(0, LIMITS.shownEdges);
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(selectedNodes.length))));
    const shownNodes = selectedNodes.map((node, index) => ({ ...clone(node), label: node.label || node.id, type: node.type || 'evidence', status: node.status || 'unreviewed', x: 40 + index % columns * 300, y: 70 + Math.floor(index / columns) * 180 }));
    const shownEdges = selectedEdges.map(edge => ({ ...clone(edge), status: edge.status || 'proposed' }));
    const omittedNodes = graph.nodes.length - shownNodes.length, omittedEdges = graph.edges.length - shownEdges.length;
    return { schemaVersion: 1, ...(caseIds.size ? { caseId: [...caseIds][0] } : {}), nodes: shownNodes, edges: shownEdges, totalNodes: graph.nodes.length, totalEdges: graph.edges.length, omittedNodes, omittedEdges, truncated: omittedNodes > 0 || omittedEdges > 0, width: Math.max(420, columns * 300), height: Math.max(220, Math.ceil(shownNodes.length / columns) * 180 + 60), interpretation: 'Layout and link labels express recorded research claims. They do not establish legal priority, approval, or official validity.' };
  }
  let rendering = 0;
  function renderEvidenceGraph(container, graph, options = {}) {
    if (!container || typeof container.replaceChildren !== 'function' || !container.ownerDocument || typeof container.ownerDocument.createElementNS !== 'function') fail('a DOM container is required.');
    if (!plain(options) || Object.keys(options).some(key => key !== 'onSelect')) fail('only an optional trusted onSelect callback is supported.');
    const callbackDescriptor = Object.getOwnPropertyDescriptor(options, 'onSelect');
    if (callbackDescriptor && !Object.hasOwn(callbackDescriptor, 'value')) fail('callback accessors are prohibited.');
    const onSelect = callbackDescriptor && callbackDescriptor.value;
    if (onSelect !== undefined && typeof onSelect !== 'function') fail('onSelect must be a trusted function.');
    const model = buildGraphViewModel(graph), doc = container.ownerDocument, ns = 'http://www.w3.org/2000/svg';
    const element = (tag, attrs = {}, content) => { const node = doc.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); if (content !== undefined) node.textContent = content; return node; };
    const paragraph = content => { const p = doc.createElement('p'); p.textContent = content; return p; };
    const status = paragraph(`Showing ${model.nodes.length} of ${model.totalNodes} nodes and ${model.edges.length} of ${model.totalEdges} links.${model.truncated ? ` Display limit: ${model.omittedNodes} nodes and ${model.omittedEdges} links are omitted. The full graph is retained.` : ''}`);
    status.setAttribute('role', 'status');
    const explanation = paragraph(model.interpretation + ' Select a node with a click, Enter, or Space to inspect its source evidence.');
    if (!model.nodes.length) { container.replaceChildren(status, paragraph('No evidence nodes yet. Add source evidence from search.'), explanation); return model; }
    const svg = element('svg', { xmlns: ns, viewBox: `0 0 ${model.width} ${model.height}`, width: '100%', role: 'group', 'aria-label': 'Evidence graph. Select nodes to inspect source evidence.' });
    const titleId = `pbgc-evidence-graph-${++rendering}`;
    svg.append(element('title', { id: titleId }, 'Evidence graph with recorded link types'));
    svg.setAttribute('aria-labelledby', titleId);
    const arrow = titleId + '-arrow', defs = element('defs'), marker = element('marker', { id: arrow, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(element('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: 'var(--line, #81807f)' })); defs.append(marker); svg.append(defs);
    const byId = new Map(model.nodes.map(node => [node.id, node]));
    for (const edge of model.edges) {
      const from = byId.get(edge.from), to = byId.get(edge.to), cx = from.x + 110, cy = from.y + 40, tx = to.x + 110, ty = to.y + 40;
      const self = edge.from === edge.to, dx = tx - cx, dy = ty - cy;
      const boundary = self ? 0 : 1 / Math.max(Math.abs(dx) / 118, Math.abs(dy) / 48);
      const sx = self ? cx + 118 : cx + dx * boundary, sy = self ? cy - 12 : cy + dy * boundary;
      const ex = self ? cx + 118 : tx - dx * boundary, ey = self ? cy + 12 : ty - dy * boundary;
      const d = self ? `M ${sx} ${sy} C ${sx + 80} ${sy - 90}, ${ex + 80} ${ey + 90}, ${ex} ${ey}` : `M ${sx} ${sy} L ${ex} ${ey}`;
      const group = element('g', { 'data-edge-id': edge.id, role: 'group', 'aria-label': `${edge.from} → ${edge.type} → ${edge.to}; status ${edge.status}; source ${edge.sourceId}; record ${edge.recordId}` });
      group.append(element('title', {}, `${edge.type} (${edge.status}) · ${edge.sourceId} · ${edge.recordId}`));
      group.append(element('path', { d, fill: 'none', stroke: 'var(--line, #81807f)', 'stroke-width': 2, 'marker-end': `url(#${arrow})` }));
      const label = edge.type.length > 28 ? edge.type.slice(0, 27) + '…' : edge.type;
      group.append(element('text', { x: self ? sx + 50 : (sx + ex) / 2, y: self ? sy - 30 : (sy + ey) / 2 - 28, fill: 'var(--muted, #bec6df)', 'font-family': 'Arial, sans-serif', 'font-size': 13, 'text-anchor': 'middle' }, `${label} · ${edge.status}`));
      svg.append(group);
    }
    for (const node of model.nodes) {
      const group = element('g', { 'data-node-id': node.id, role: 'button', tabindex: 0, 'aria-label': `${node.label}; ${node.type}; ${node.status}. Select evidence.`, 'aria-pressed': 'false' });
      const shape = element('rect', { x: node.x, y: node.y, width: 220, height: 80, rx: 8, fill: 'var(--panel, #14191f)', stroke: 'var(--accent, #b3e5e3)', 'stroke-width': 2 });
      group.append(shape, element('title', {}, `${node.label} · ${node.id}`));
      const compact = node.label.replace(/\s+/g, ' ').trim();
      group.append(element('text', { x: node.x + 12, y: node.y + 29, fill: 'var(--text, #f2f2f2)', 'font-family': 'Arial, sans-serif', 'font-size': 14, 'aria-hidden': 'true' }, compact.length > 27 ? compact.slice(0, 26) + '…' : compact));
      group.append(element('text', { x: node.x + 12, y: node.y + 57, fill: 'var(--muted, #bec6df)', 'font-family': 'Arial, sans-serif', 'font-size': 12, 'aria-hidden': 'true' }, `${node.type.slice(0, 15)} · ${node.status.slice(0, 15)}`));
      const select = () => { for (const candidate of svg.querySelectorAll('[data-node-id]')) candidate.setAttribute('aria-pressed', String(candidate === group)); if (onSelect) onSelect(node.id); };
      group.addEventListener('click', select);
      group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); select(); } });
      group.addEventListener('focus', () => shape.setAttribute('stroke-width', '5'));
      group.addEventListener('blur', () => shape.setAttribute('stroke-width', '2'));
      svg.append(group);
    }
    container.replaceChildren(status, explanation, svg); return model;
  }
  const api = { buildGraphViewModel, renderEvidenceGraph, graphViewLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
