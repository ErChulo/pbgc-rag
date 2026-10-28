/* PBGC-RAG search v1. Dependency-free, read-only, bounded execution. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ records: 50000, text: 65536, totalText: 4000000, query: 256, results: 1000, nodes: 10000, edges: 50000, depth: 8, regexOperations: 5000000, sqlOperations: 5000000 });
  function fail(message) { throw new Error(message); }
  function operationBudget(label, maximum) {
    let remaining = maximum;
    return (amount = 1) => { remaining -= amount; if (remaining < 0) fail(label + ' operation budget exceeded. Narrow the selected sources or simplify the query. No partial result is returned.'); };
  }
  function recordsInput(records) {
    if (!Array.isArray(records) || records.length > LIMITS.records) fail('Record limit exceeded or invalid records.');
    let total = 0;
    for (const r of records) {
      if (!r || typeof r.id !== 'string' || typeof r.sourceId !== 'string' || typeof r.text !== 'string') fail('Each record needs an ID, source ID, and text.');
      total += r.text.length;
      if (r.text.length > LIMITS.text || total > LIMITS.totalText) fail('Search text limit exceeded. Narrow the selected sources.');
    }
    return records;
  }
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase('en-US');
  function queryInput(query) {
    if (typeof query !== 'string' || query.length > LIMITS.query) fail('Query must be text of at most 256 characters.');
    return query;
  }
  // Thompson-style simulation: supported regex tokens cannot cause backtracking.
  // Supported: literals, ., [], [^], ranges, ^, $, \\d/\\w/\\s and inverses, * + ?.
  // Unsupported syntax is rejected; there is no fallback to native RegExp matching.
  function compileSafeRegex(pattern, spend) {
    queryInput(pattern);
    let begin = false, end = false, i = 0;
    if (pattern[0] === '^') { begin = true; i++; }
    const tokens = [];
    const classes = { d: /[0-9]/, D: /[^0-9]/, w: /[A-Za-z0-9_]/, W: /[^A-Za-z0-9_]/, s: /\s/u, S: /\S/u };
    const charClass = code => classes[code];
    function escaped() {
      if (++i >= pattern.length) fail('Regex ends with an incomplete escape.');
      const code = pattern[i++];
      if (charClass(code)) return c => charClass(code).test(c);
      if ('nrt'.includes(code)) { const c = { n: '\n', r: '\r', t: '\t' }[code]; return x => x === c; }
      if (!'\\.^$[]*+?(){}|-'.includes(code)) fail('Unsupported regex escape.');
      return c => c === code;
    }
    while (i < pattern.length) {
      const c = pattern[i];
      if (c === '$' && i === pattern.length - 1) { end = true; i++; break; }
      let match;
      if (c === '\\') match = escaped();
      else if (c === '.') { i++; match = x => x !== '\n' && x !== '\r'; }
      else if (c === '[') {
        const start = i++; let escapedClass = false;
        for (; i < pattern.length; i++) {
          if (!escapedClass && pattern[i] === ']') break;
          if (!escapedClass && pattern[i] === '\\') escapedClass = true; else escapedClass = false;
        }
        if (i >= pattern.length) fail('Unclosed regex character class.');
        const source = pattern.slice(start, ++i);
        // A single native character class contains no repetition or branching.
        if (/\\(?![dDwWsSnrt\\\]\[\-^])/.test(source)) fail('Unsupported character class escape.');
        let atom; try { atom = new RegExp('^' + source + '$', 'u'); } catch { fail('Invalid regex character class.'); }
        match = x => atom.test(x);
      } else {
        if ('^$(){}|*+?]'.includes(c)) fail('Unsupported regex syntax. Use literals, classes, anchors, and * + ?.');
        i++; match = x => x === c;
      }
      let min = 1, repeat = false;
      if ('*+?'.includes(pattern[i] || '\0')) {
        const q = pattern[i++]; min = q === '+' ? 1 : 0; repeat = q !== '?';
      }
      tokens.push({ match, min, repeat });
    }
    function closure(states) {
      spend(states.size);
      const out = new Set(states);
      for (const index of out) { spend(); if (index < tokens.length && tokens[index].min === 0) out.add(index + 1); }
      return out;
    }
    return text => {
      let active = closure(new Set([0]));
      if (active.has(tokens.length) && (!end || !text.length)) return true;
      for (let pos = 0; pos < text.length; pos++) {
        spend(1 + active.size);
        if (!begin) active = closure(new Set([...active, 0]));
        const next = new Set();
        for (const index of active) {
          spend();
          const token = tokens[index];
          if (token && token.match(text[pos])) { next.add(index + 1); if (token.repeat) next.add(index); }
        }
        active = closure(next);
        if (active.has(tokens.length) && (!end || pos === text.length - 1)) return true;
      }
      // Empty matches at the final position are valid for unanchored patterns.
      return !begin && closure(new Set([0])).has(tokens.length);
    };
  }
  function search(records, query, mode = 'keyword') {
    recordsInput(records); queryInput(query);
    if (!['keyword', 'exact', 'regex'].includes(mode)) fail('Unsupported search mode. Semantic inference is unavailable.');
    if (!query.trim()) return [];
    let matcher;
    if (mode === 'regex') {
      if (records.reduce((n, r) => n + r.text.length, 0) * Math.max(query.length, 1) > 20000000) fail('Regex work limit exceeded. Narrow the selected sources or simplify the pattern.');
      const regex = compileSafeRegex(query, operationBudget('Regex', LIMITS.regexOperations)); matcher = text => regex(text) ? 1 : 0; }
    else {
      const terms = mode === 'exact' ? [normalize(query)] : [...new Set(normalize(query).trim().split(/\s+/u))];
      matcher = text => { const value = normalize(text); return terms.every(term => value.includes(term)) ? terms.reduce((n, term) => n + value.split(term).length - 1, 0) : 0; };
    }
    return records.map(record => ({ record, score: matcher(record.text), reason: mode === 'keyword' ? 'All terms occur in the source text.' : mode === 'exact' ? 'The exact phrase occurs in the source text (case insensitive).' : 'The supported regex matches the source text.' }))
      .filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)).slice(0, LIMITS.results);
  }
  function getField(record, name) {
    const path = name.split('.');
    if (!['id', 'sourceId', 'text', 'locator', 'fields'].includes(path[0]) || path.length > 2 || (path.length === 1 && ['locator', 'fields'].includes(path[0]))) fail('Unsupported SQL field: ' + name);
    if (path.length === 2 && !['locator', 'fields'].includes(path[0])) fail('Unsupported SQL field: ' + name);
    if (path.some(p => ['__proto__', 'prototype', 'constructor'].includes(p))) fail('Unsafe SQL field.');
    let value = record;
    for (const key of path) { if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return null; value = value[key]; }
    return value == null || !['string', 'number', 'boolean'].includes(typeof value) ? null : value;
  }
  // SQL v1 grammar: SELECT scalar fields|* FROM records [WHERE field op literal
  // [AND ...]] [ORDER BY field [ASC|DESC]] [LIMIT integer]. No joins or mutation.
  function querySQL(records, query) {
    recordsInput(records);
    if (typeof query !== 'string' || query.length > 4096) fail('SQL must be at most 4096 characters.');
    const tokenPattern = /\s+|(?:'(?:''|[^'])*')|(?:[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)|(?:-?\d+(?:\.\d+)?)|(?:<=|>=|<>|!=|[=<>*,;])/gy;
    const tokens = []; let position = 0;
    while (position < query.length) { tokenPattern.lastIndex = position; const m = tokenPattern.exec(query); if (!m) fail('Unsupported SQL token.'); position = tokenPattern.lastIndex; if (!/^\s/.test(m[0])) tokens.push(m[0]); }
    let i = 0;
    const is = word => tokens[i]?.toUpperCase() === word;
    const take = word => { if (!is(word)) fail('Expected SQL ' + word + '.'); i++; };
    const field = () => { const name = tokens[i++]; if (!name || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/.test(name)) fail('Expected scalar field.'); getField({}, name); return name; };
    take('SELECT'); const fields = [];
    if (is('*')) { fields.push('id', 'sourceId', 'text'); i++; } else { fields.push(field()); while (is(',')) { i++; fields.push(field()); if (fields.length > 32) fail('Too many SQL columns.'); } }
    take('FROM'); take('RECORDS');
    const conditions = [];
    if (is('WHERE')) {
      i++;
      do {
        if (conditions.length) take('AND');
        const name = field(), op = tokens[i++]?.toUpperCase();
        if (!['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE'].includes(op)) fail('Unsupported SQL operator.');
        const literal = tokens[i++]; let value;
        if (literal?.startsWith("'")) value = literal.slice(1, -1).replace(/''/g, "'");
        else if (/^-?\d+(?:\.\d+)?$/.test(literal || '')) { value = Number(literal); if (!Number.isFinite(value)) fail('SQL number out of range.'); }
        else if (['TRUE', 'FALSE'].includes(literal?.toUpperCase())) value = literal.toUpperCase() === 'TRUE';
        else fail('Expected a string, number, or boolean literal.');
        if (op === 'LIKE' && (typeof value !== 'string' || value.length > 256)) fail('LIKE requires a string of at most 256 characters.');
        conditions.push({ name, op, value });
        if (conditions.length > 16) fail('Too many SQL conditions.');
      } while (is('AND'));
    }
    let order = null, descending = false;
    if (is('ORDER')) { i++; take('BY'); order = field(); if (is('ASC') || is('DESC')) { descending = is('DESC'); i++; } }
    let limit = LIMITS.results;
    if (is('LIMIT')) { i++; const value = tokens[i++]; if (!/^\d+$/.test(value || '') || Number(value) < 1 || Number(value) > LIMITS.results) fail('LIMIT must be 1 to 1000.'); limit = Number(value); }
    if (is(';')) i++;
    if (i !== tokens.length) fail('Unsupported SQL clause or multiple statements.');
    const sqlWork = records.reduce((n, r) => n + r.text.length, 0) * conditions.reduce((n, c) => n + (c.op === 'LIKE' ? c.value.length : 1), 0);
    if (sqlWork > 20000000) fail('SQL work limit exceeded. Narrow the selected sources or simplify LIKE conditions.');
    const spendSQL = operationBudget('SQL LIKE', LIMITS.sqlOperations);
    const like = (actual, pattern) => {
      // LIKE is a small dynamic-programming wildcard matcher, without regex backtracking.
      let state = new Uint8Array(pattern.length + 1); state[0] = 1;
      for (let p = 0; p < pattern.length && pattern[p] === '%'; p++) { spendSQL(); state[p + 1] = 1; }
      for (const ch of actual) {
        spendSQL();
        const next = new Uint8Array(pattern.length + 1);
        for (let p = 0; p < pattern.length; p++) {
          spendSQL();
          if (pattern[p] === '%') next[p + 1] = next[p] || state[p + 1];
          else if (state[p] && (pattern[p] === '_' || pattern[p] === ch)) next[p + 1] = 1;
        }
        state = next;
      }
      return !!state[pattern.length];
    };
    let rows = records.filter(record => conditions.every(({ name, op, value }) => {
      const actual = getField(record, name);
      if (actual == null) return false;
      if (op === 'LIKE') return typeof actual === 'string' && like(actual, value);
      if (typeof actual !== typeof value) return false;
      return ({ '=': () => actual === value, '!=': () => actual !== value, '<>': () => actual !== value, '<': () => actual < value, '>': () => actual > value, '<=': () => actual <= value, '>=': () => actual >= value })[op]();
    }));
    if (order) rows = rows.slice().sort((a, b) => { const x = getField(a, order), y = getField(b, order); return (x === y ? 0 : x == null ? -1 : y == null ? 1 : x < y ? -1 : 1) * (descending ? -1 : 1); });
    return rows.slice(0, limit).map(record => Object.fromEntries(fields.map(name => [name, getField(record, name)])));
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Dates must be valid ISO calendar dates.');
    return value;
  }
  function queryGraph(graph, query) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > LIMITS.nodes || graph.edges.length > LIMITS.edges) fail('Invalid graph or graph resource limit exceeded.');
    if (!query || typeof query.startId !== 'string') fail('Graph query requires startId.');
    const depth = query.maxDepth ?? 2, limit = query.limit ?? 100;
    if (!Number.isInteger(depth) || depth < 0 || depth > LIMITS.depth || !Number.isInteger(limit) || limit < 1 || limit > 1000) fail('Graph depth must be 0 to 8; limit must be 1 to 1000.');
    const direction = query.direction ?? 'out';
    if (!['out', 'in', 'both'].includes(direction)) fail('Unsupported graph direction.');
    if (query.edgeTypes !== undefined && (!Array.isArray(query.edgeTypes) || query.edgeTypes.some(t => typeof t !== 'string') || query.edgeTypes.length > 100)) fail('Invalid edge type filter.');
    const asOf = query.asOf === undefined ? null : date(query.asOf);
    const caseIds = new Set([graph.caseId, query.caseId, ...graph.nodes.map(n => n?.caseId), ...graph.edges.map(e => e?.caseId)].filter(id => id !== undefined));
    if ([...caseIds].some(id => typeof id !== 'string' || !id)) fail('Invalid graph case ID.');
    if (caseIds.size > 1) fail('Cross-case graph rejected: graph belongs to a different case.');
    const caseId = query.caseId ?? graph.caseId ?? [...caseIds][0];
    const nodes = new Map();
    for (const n of graph.nodes) {
      if (!n || typeof n.id !== 'string' || !n.id || nodes.has(n.id)) fail('Graph nodes need unique IDs.');
      if (caseId !== undefined && n.caseId !== undefined && n.caseId !== caseId) fail('Cross-case graph node rejected.');
      nodes.set(n.id, n);
    }
    if (!nodes.has(query.startId)) fail('Graph start node does not exist.');
    const adjacent = new Map(); const edgeIds = new Set();
    for (const e of graph.edges) {
      if (!e || typeof e.id !== 'string' || !e.id || edgeIds.has(e.id) || !nodes.has(e.from) || !nodes.has(e.to) || typeof e.type !== 'string' || !e.type) fail('Invalid graph edge.');
      if (caseId !== undefined && e.caseId !== undefined && e.caseId !== caseId) fail('Cross-case graph edge rejected.');
      if (typeof e.sourceId !== 'string' || !e.sourceId || typeof e.recordId !== 'string' || !e.recordId) fail('Graph edges require source and record provenance.');
      if (e.validFrom !== undefined) date(e.validFrom);
      if (e.validTo !== undefined) date(e.validTo);
      if (e.validFrom && e.validTo && e.validFrom > e.validTo) fail('Graph validity interval is reversed.');
      edgeIds.add(e.id);
      if (query.edgeTypes && !query.edgeTypes.includes(e.type)) continue;
      if (asOf && ((e.validFrom && e.validFrom > asOf) || (e.validTo && e.validTo < asOf))) continue;
      const add = (from, to) => { if (!adjacent.has(from)) adjacent.set(from, []); adjacent.get(from).push({ to, edge: e }); };
      if (direction !== 'in') add(e.from, e.to);
      if (direction !== 'out') add(e.to, e.from);
    }
    const visited = new Set([query.startId]), resultEdges = new Map(), paths = [{ nodeId: query.startId, depth: 0, edgeIds: [] }];
    let truncated = false;
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index]; if (path.depth >= depth) continue;
      for (const step of adjacent.get(path.nodeId) || []) {
        if (visited.has(step.to)) continue;
        if (visited.size >= limit) { truncated = true; continue; }
        visited.add(step.to); resultEdges.set(step.edge.id, step.edge);
        paths.push({ nodeId: step.to, depth: path.depth + 1, edgeIds: [...path.edgeIds, step.edge.id] });
      }
    }
    return { nodes: [...visited].map(id => nodes.get(id)), edges: [...resultEdges.values()], paths, truncated };
  }
  const api = { search, querySQL, queryGraph, searchLimits: LIMITS, searchVersion: 1 };
  root.PBGC = Object.assign(root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
