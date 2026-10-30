/* Evidence graph v1: documentary containment and explicit proposed user links.
 * No legal relationship, applicability date or interpretation is inferred.
 * validateGraph checks internal consistency; pass verified sources to bind records
 * to that source set. Hash labels alone do not authenticate original documents.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const GRAPH_LIMITS = Object.freeze({sources: 200, records: 50000, assertions: 2000, characters: 20 * 1024 * 1024, depth: 8, results: 1000, locator: 4096});
  const fail = message => { throw new Error(message); };
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  function string(value, name, max) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Invalid graph ' + name + '.'); return value; }
  function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Invalid graph source hash.'); return value; }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Use an ISO calendar date (YYYY-MM-DD).');
    const parsed = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Invalid graph calendar date.');
    return value;
  }
  function period(value) {
    if (!plain(value)) fail('Invalid graph validity period.');
    for (const key of Object.keys(value)) if (!['from','to'].includes(key)) fail('Invalid graph validity field.');
    if (value.from !== null) date(value.from);
    if (value.to !== null) date(value.to);
    if (value.from !== null && value.to !== null && value.from > value.to) fail('Graph validity end precedes start.');
    return {from:value.from, to:value.to};
  }
  function locator(value) {
    let remaining = 512;
    function copy(item, depth) {
      if (--remaining < 0 || depth > 12) fail('Graph locator exceeds its complexity limit.');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (Array.isArray(item)) return item.map(part => copy(part, depth + 1));
      if (!plain(item)) fail('Graph locator must contain JSON values.');
      const result = Object.create(null);
      for (const key of Object.keys(item).sort()) result[key] = copy(item[key], depth + 1);
      return result;
    }
    if (!plain(value) || typeof value.type !== 'string' || !value.type) fail('Graph locator must identify its type.');
    const result = copy(value, 0);
    if (JSON.stringify(result).length > GRAPH_LIMITS.locator) fail('Graph locator exceeds its size limit.');
    return result;
  }
  const same = (a,b) => JSON.stringify(locator(a)) === JSON.stringify(locator(b));
  const documentId = sourceId => 'document:' + encodeURIComponent(sourceId);
  const recordId = (sourceId, index) => 'record:' + encodeURIComponent(sourceId) + ':' + index;
  const containsId = (sourceId, index) => 'contains:' + encodeURIComponent(sourceId) + ':' + index;
  function buildGraph(sources) {
    if (!Array.isArray(sources) || sources.length > GRAPH_LIMITS.sources) fail('Graph exceeds the 200-source limit.');
    const nodes = [], edges = [], ids = new Set(); let count = 0, characters = 0;
    for (const source of sources) {
      if (!plain(source)) fail('Invalid graph source.');
      const sourceId = string(source.id, 'source ID', 200), sourceName = string(source.name, 'source name', 255), sourceHash = hash(source.hash);
      if (ids.has(sourceId)) fail('Duplicate graph source ID.'); ids.add(sourceId);
      if (!Array.isArray(source.records) || (count += source.records.length) > GRAPH_LIMITS.records) fail('Graph exceeds the 50,000-record limit.');
      const parent = {id:documentId(sourceId),type:'document',sourceId,sourceName,sourceHash}; nodes.push(parent);
      source.records.forEach((record,index) => {
        if (!plain(record) || typeof record.text !== 'string' || record.text.length > 2000000) fail('Invalid graph source record.');
        if ((characters += record.text.length) > GRAPH_LIMITS.characters) fail('Graph exceeds the 20 MB text budget.');
        const evidence = {sourceId,sourceHash,locator:locator(record.locator)};
        const child = {id:recordId(sourceId,index),type:'record',sourceId,sourceName,sourceHash,index,text:record.text,locator:locator(record.locator)};
        nodes.push(child); edges.push({id:containsId(sourceId,index),type:'contains',from:parent.id,to:child.id,evidence,validity:{from:null,to:null},status:'documentary'});
      });
    }
    return {schemaVersion:1,nodes,edges};
  }
  function validateGraph(graph, verifiedSources) {
    if (!plain(graph) || graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('Invalid graph schema.');
    if (graph.nodes.length > GRAPH_LIMITS.records + GRAPH_LIMITS.sources || graph.edges.length > GRAPH_LIMITS.records + GRAPH_LIMITS.assertions) fail('Graph exceeds its size limit.');
    const nodes = new Map(), documents = new Map(), records = new Map(), edgeIds = new Set(), contained = new Set(); let assertions = 0, characters = 0;
    for (const node of graph.nodes) {
      if (!plain(node)) fail('Invalid graph node.');
      string(node.id,'node ID',700); string(node.sourceId,'source ID',200); string(node.sourceName,'source name',255); hash(node.sourceHash);
      if (nodes.has(node.id)) fail('Duplicate graph node ID.'); nodes.set(node.id,node);
      if (node.type === 'document') {
        if (node.id !== documentId(node.sourceId) || documents.has(node.sourceId)) fail('Invalid graph document identity.');
        documents.set(node.sourceId,node);
      } else if (node.type === 'record') {
        if (!Number.isInteger(node.index) || node.index < 0 || node.index >= GRAPH_LIMITS.records || node.id !== recordId(node.sourceId,node.index) || typeof node.text !== 'string' || node.text.length > 2000000) fail('Invalid graph record identity.');
        if ((characters += node.text.length) > GRAPH_LIMITS.characters) fail('Graph exceeds the 20 MB text budget.');
        locator(node.locator); records.set(node.id,node);
      } else fail('Unknown graph node type.');
    }
    if (documents.size > GRAPH_LIMITS.sources || records.size > GRAPH_LIMITS.records) fail('Graph exceeds its source or record limit.');
    for (const node of records.values()) {
      const parent = documents.get(node.sourceId);
      if (!parent || parent.sourceHash !== node.sourceHash || parent.sourceName !== node.sourceName) fail('Graph record does not match its source document.');
    }
    for (const edge of graph.edges) {
      if (!plain(edge)) fail('Invalid graph edge.');
      string(edge.id,'edge ID',700); if (edgeIds.has(edge.id)) fail('Duplicate graph edge ID.'); edgeIds.add(edge.id);
      const from = nodes.get(edge.from), to = nodes.get(edge.to);
      if (!from || !to) fail('Graph contains a dangling edge.');
      const validity = period(edge.validity);
      if (!plain(edge.evidence)) fail('Graph edge lacks documentary evidence.');
      const evidence = edge.evidence; hash(evidence.sourceHash); locator(evidence.locator);
      const evidenceNode = records.get(evidence.recordId || edge.to);
      if (!evidenceNode || evidenceNode.sourceId !== evidence.sourceId || evidenceNode.sourceHash !== evidence.sourceHash || !same(evidenceNode.locator,evidence.locator)) fail('Graph edge evidence does not match a source record.');
      if (edge.type === 'contains') {
        if (from.type !== 'document' || to.type !== 'record' || from.sourceId !== to.sourceId || edge.id !== containsId(to.sourceId,to.index) || edge.status !== 'documentary' || validity.from !== null || validity.to !== null || contained.has(to.id) || (evidence.recordId && evidence.recordId !== to.id)) fail('Invalid graph containment edge.');
        contained.add(to.id);
      } else if (edge.type === 'user-link') {
        if (++assertions > GRAPH_LIMITS.assertions || edge.status !== 'proposed' || edge.id.indexOf('assertion:') !== 0 || edge.id.length <= 10 || !evidence.recordId) fail('Invalid proposed graph assertion.');
        string(edge.label,'assertion label',200); string(edge.author,'assertion author',200); date(edge.recordedOn);
      } else fail('Unknown graph edge type.');
    }
    if (contained.size !== records.size) fail('A graph record lacks a documentary containment edge.');
    if (verifiedSources !== undefined) {
      const expected = buildGraph(verifiedSources);
      if (expected.nodes.length !== graph.nodes.length) fail('Graph does not match the verified source set.');
      for (const expectedNode of expected.nodes) {
        const actual = nodes.get(expectedNode.id);
        if (!actual || actual.type !== expectedNode.type || actual.sourceHash !== expectedNode.sourceHash || actual.sourceName !== expectedNode.sourceName || (actual.type === 'record' && (actual.text !== expectedNode.text || !same(actual.locator,expectedNode.locator)))) fail('Graph record differs from the verified source set.');
      }
    }
    return true;
  }
  /* A user assertion remains proposed. This helper does not approve or infer it.
   * Evidence must point to an existing documentary record. Validity is supplied
   * by the user, not extracted from its text; both endpoints may be null.
   */
  function createGraphAssertion(graph, input) {
    validateGraph(graph);
    if (!plain(input)) fail('Provide a proposed graph assertion.');
    string(input.id,'assertion ID',200);
    const evidenceRecord = graph.nodes.find(node => node.id === input.evidenceRecordId && node.type === 'record');
    if (!evidenceRecord) fail('Assertion requires an existing evidence record.');
    const edge = {id:'assertion:' + encodeURIComponent(input.id),type:'user-link',from:input.from,to:input.to,label:input.label,author:input.author,recordedOn:input.recordedOn,status:'proposed',validity:period(input.validity || {from:null,to:null}),evidence:{recordId:evidenceRecord.id,sourceId:evidenceRecord.sourceId,sourceHash:evidenceRecord.sourceHash,locator:locator(evidenceRecord.locator)}};
    validateGraph({...graph,edges:graph.edges.concat(edge)});
    return edge;
  }
  /* Traversal returns a deterministic BFS view. asOf only filters explicitly
   * dated user links; documentary edges have unknown applicability and remain
   * visible. It does not resolve legal authority or contradiction.
   */
  function queryGraph(graph, options) {
    validateGraph(graph);
    if (!plain(options)) fail('Provide graph query options.');
    const maxDepth = options.maxDepth === undefined ? 2 : options.maxDepth;
    const maxNodes = options.maxNodes === undefined ? GRAPH_LIMITS.results : options.maxNodes;
    if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > GRAPH_LIMITS.depth) fail('Graph depth must be between zero and eight.');
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > GRAPH_LIMITS.results) fail('Graph result limit must be between one and 1000.');
    const direction = options.direction || 'outbound'; if (!['outbound','both'].includes(direction)) fail('Unsupported graph direction.');
    const types = options.types === undefined ? ['contains','user-link'] : options.types;
    if (!Array.isArray(types) || !types.length || types.some(type => !['contains','user-link'].includes(type))) fail('Unsupported graph edge filter.');
    const asOf = options.asOf === undefined || options.asOf === '' ? null : date(options.asOf);
    const byId = new Map(graph.nodes.map(node => [node.id,node]));
    if (!byId.has(options.startId)) fail('Graph start node does not exist.');
    const adjacency = new Map();
    function add(id, edge, target) { if (!adjacency.has(id)) adjacency.set(id,[]); adjacency.get(id).push({edge,target}); }
    for (const edge of graph.edges) {
      if (!types.includes(edge.type) || (asOf && ((edge.validity.from && edge.validity.from > asOf) || (edge.validity.to && edge.validity.to < asOf)))) continue;
      add(edge.from,edge,edge.to); if (direction === 'both' && edge.from !== edge.to) add(edge.to,edge,edge.from);
    }
    for (const list of adjacency.values()) list.sort((a,b) => a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0);
    const queue = [{id:options.startId,depth:0}], visited = new Set([options.startId]), edges = [], edgeIds = new Set(); let truncated = false;
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      for (const item of adjacency.get(current.id) || []) {
        if (current.depth >= maxDepth) { if (!visited.has(item.target)) truncated = true; continue; }
        if (!visited.has(item.target)) {
          if (queue.length >= maxNodes) { truncated = true; continue; }
          visited.add(item.target); queue.push({id:item.target,depth:current.depth+1});
        }
        if (!edgeIds.has(item.edge.id)) { edges.push(item.edge); edgeIds.add(item.edge.id); }
      }
    }
    return {nodes:queue.map(item => ({...byId.get(item.id),depth:item.depth})),edges,truncated};
  }
  return {GRAPH_LIMITS,buildGraph,validateGraph,createGraphAssertion,queryGraph};
});
