/* Explicit, review-bound reparsing of retained original bytes. No schema migration. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ caseBytes: 32 * 1024 * 1024, sourceBytes: 16 * 1024 * 1024, history: 128, nodes: 1500000, depth: 40 });
  function fail(message) { throw new Error('Reindex: ' + message); }
  function api() { const p = root.PBGC; if (!p || !['parseFile', 'validateCase', 'exportCase', 'importCase'].every(k => typeof p[k] === 'function')) fail('local parser and case integrity modules are required.'); return p; }
  function snapshot(value) {
    const seen = new Set(); let nodes = 0, chars = 0;
    function inspect(item, depth) {
      if (++nodes > LIMITS.nodes || depth > LIMITS.depth) fail('data structure exceeds bounds.');
      if (typeof item === 'string') { chars += item.length; if (chars > LIMITS.caseBytes) fail('case exceeds 32 MiB.'); return; }
      if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return;
      if (!item || typeof item !== 'object' || seen.has(item)) fail('only acyclic JSON data is accepted.');
      const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('only plain JSON objects and arrays are accepted.');
      seen.add(item);
      const keys = Reflect.ownKeys(item); let indices = 0;
      for (const key of keys) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe object key.');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('accessors and hidden properties are prohibited.');
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) fail('non-JSON array properties are prohibited.');
        if (array) indices++;
        chars += key.length; inspect(descriptor.value, depth + 1);
      }
      if (array && indices !== item.length) fail('sparse arrays are prohibited.');
      seen.delete(item);
    }
    inspect(value, 0);
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).byteLength > LIMITS.caseBytes) fail('case exceeds 32 MiB.');
    return JSON.parse(json);
  }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  async function hashText(text) { const bytes = new TextEncoder().encode(text); return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''); }
  function signature(record) { const value = { text: record.text, locator: record.locator }; if (Object.hasOwn(record, 'fields')) value.fields = record.fields; return canonical(value); }
  function buckets(records) { const map = new Map(); for (const record of records) { const key = signature(record); if (!map.has(key)) map.set(key, []); map.get(key).push(record); } return map; }
  function originalBytes(source) {
    if (source.size > LIMITS.sourceBytes) fail('source exceeds 16 MiB.');
    const raw = atob(source.originalBase64); if (raw.length !== source.size) fail('source byte length mismatch.');
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function reindexSources(caseData, sourceIds, options = { apply: false }) {
    const p = api(), config = snapshot(options), selected = snapshot(sourceIds);
    if (Object.keys(config).some(k => !['apply', 'reviewed', 'expectedCaseHash', 'expectedPlanHash'].includes(k)) || (config.apply !== undefined && typeof config.apply !== 'boolean')) fail('unsupported reindex options. Candidates and mappings cannot be submitted.');
    if (!Array.isArray(selected) || !selected.length || selected.length > 1000 || new Set(selected).size !== selected.length || selected.some(id => typeof id !== 'string' || !id.length)) fail('select distinct source ids.');
    const original = snapshot(caseData), validation = p.validateCase(original);
    if (!validation.valid) fail(validation.errors.join(' '));
    const exported = await p.exportCase(original); // Checks every retained source hash before any parser runs.
    const verified = await p.importCase(exported), caseHash = JSON.parse(exported).hash;
    if (config.apply && (config.reviewed !== true || !/^[a-f0-9]{64}$/.test(config.expectedCaseHash || '') || !/^[a-f0-9]{64}$/.test(config.expectedPlanHash || ''))) fail('applying requires explicit review and both preview hashes.');
    if (config.apply && config.expectedCaseHash !== caseHash) fail('case changed since preview; create and review a new preview.');
    const sourceMap = new Map(verified.sources.map(source => [source.id, source]));
    if (selected.some(id => !sourceMap.has(id))) fail('selected source is outside this case.');
    selected.sort(); const selectedSet = new Set(selected), refs = new Map(), oldRecords = new Map();
    for (const source of verified.sources) if (selectedSet.has(source.id)) for (const record of source.records) oldRecords.set(record.id, record);
    function reference(id, path) { if (oldRecords.has(id)) { if (!refs.has(id)) refs.set(id, []); refs.get(id).push(path); } }
    verified.graph.nodes.forEach((node, i) => { if (node.recordId !== undefined) reference(node.recordId, `graph.nodes[${i}].recordId`); reference(node.id, `graph.nodes[${i}].id`); });
    verified.graph.edges.forEach((edge, i) => reference(edge.recordId, `graph.edges[${i}].recordId`));
    verified.rules.forEach((rule, i) => rule.sourceRecordIds.forEach((id, j) => reference(id, `rules[${i}].sourceRecordIds[${j}]`)));
    (verified.claims || []).forEach((claim, i) => claim.sourceRecordIds.forEach((id, j) => reference(id, `claims[${i}].sourceRecordIds[${j}]`)));
    const candidate = snapshot(verified), changes = [], recordMappings = [], unresolved = [], remap = new Map();
    for (const id of selected) {
      const before = sourceMap.get(id), bytes = originalBytes(before);
      const parsed = snapshot(await p.parseFile({ name: before.name, size: before.size, arrayBuffer: async () => Uint8Array.from(bytes).buffer }));
      if (parsed.id !== before.id || parsed.hash !== before.hash || parsed.originalBase64 !== before.originalBase64 || parsed.size !== before.size || parsed.format !== before.format) fail('parser changed immutable source identity, bytes, size or format.');
      if (!Array.isArray(parsed.records) || typeof parsed.parserVersion !== 'string' || !parsed.parserVersion.length) fail('parser result lacks records or a version.');
      const oldBuckets = buckets(before.records), newBuckets = buckets(parsed.records), oldByNew = new Map();
      for (const record of before.records) {
        const key = signature(record), oldMatches = oldBuckets.get(key), matches = newBuckets.get(key) || [];
        const status = !matches.length ? 'unmatched' : oldMatches.length !== 1 || matches.length !== 1 ? 'ambiguous' : 'exact';
        const mapping = { sourceId: id, oldRecordId: record.id, newRecordId: status === 'exact' ? matches[0].id : null, status, referencedBy: refs.get(record.id) || [] };
        recordMappings.push(mapping);
        if (status === 'exact') { remap.set(record.id, matches[0].id); oldByNew.set(matches[0].id, record); }
        else if (mapping.referencedBy.length) unresolved.push({ ...mapping, reason: 'Referenced evidence must map uniquely by exact text, complete locator and structured fields.' });
      }
      const records = parsed.records.map(record => {
        const previous = oldByNew.get(record.id), next = previous ? { ...previous, ...record } : { ...record };
        if (before.caseId !== undefined || previous?.caseId !== undefined) next.caseId = verified.id;
        return next;
      });
      const fromRecordsHash = await hashText(canonical(before.records)), toRecordsHash = await hashText(canonical(records));
      const fromParserVersion = before.parserVersion || 'unrecorded', toParserVersion = parsed.parserVersion;
      const changed = fromRecordsHash !== toRecordsHash || fromParserVersion !== toParserVersion || before.encoding !== parsed.encoding;
      const change = { sourceId: id, sourceName: before.name, changed, fromParserVersion, toParserVersion, fromRecordsHash, toRecordsHash, fromRecordCount: before.records.length, toRecordCount: records.length };
      changes.push(change);
      if (changed) {
        const next = { ...before, records, parserVersion: parsed.parserVersion };
        if (parsed.encoding !== undefined) next.encoding = parsed.encoding;
        const provenance = before.reindexProvenance;
        if (provenance !== undefined && (!provenance || provenance.schemaVersion !== 1 || !Array.isArray(provenance.history) || Object.keys(provenance).some(key => !['schemaVersion', 'history'].includes(key)))) fail('unsupported source reindex provenance.');
        const history = provenance ? provenance.history : [];
        if (history.length >= LIMITS.history) fail('source reindex history limit reached; existing history is preserved.');
        next.reindexProvenance = { schemaVersion: 1, history: [...history, { operation: 'reindex', caseHashBefore: caseHash, fromParserVersion, toParserVersion, fromRecordsHash, toRecordsHash }] };
        candidate.sources[candidate.sources.findIndex(source => source.id === id)] = next;
      }
    }
    const nodeIds = new Map(), finalIds = new Set();
    for (const [index, node] of candidate.graph.nodes.entries()) {
      const nextId = remap.get(node.id) || node.id;
      if (oldRecords.has(node.id) && node.sourceId !== undefined && node.sourceId !== oldRecords.get(node.id).sourceId) unresolved.push({ path: `graph.nodes[${index}]`, reason: 'A record-shaped node identity disagrees with its explicit source identity.' });
      if (oldRecords.has(node.id) && node.recordId !== undefined && node.recordId !== node.id) unresolved.push({ path: `graph.nodes[${index}]`, reason: 'A record-shaped node identity disagrees with its explicit record citation.' });
      if (finalIds.has(nextId)) unresolved.push({ path: `graph.nodes[${index}].id`, reason: 'Reindexing would collide with another graph node identity.' });
      finalIds.add(nextId); nodeIds.set(node.id, nextId);
    }
    function recordId(id) { return remap.get(id) || id; }
    candidate.graph.nodes.forEach(node => { node.id = nodeIds.get(node.id); if (node.recordId !== undefined) node.recordId = recordId(node.recordId); });
    candidate.graph.edges.forEach(edge => { edge.from = nodeIds.get(edge.from); edge.to = nodeIds.get(edge.to); edge.recordId = recordId(edge.recordId); });
    candidate.rules.forEach(rule => { rule.sourceRecordIds = rule.sourceRecordIds.map(recordId); });
    (candidate.claims || []).forEach(claim => { claim.sourceRecordIds = claim.sourceRecordIds.map(recordId); });
    const status = unresolved.length ? 'blocked' : changes.some(change => change.changed) ? 'review-required' : 'unchanged';
    let candidateHash = null;
    if (!unresolved.length && status !== 'unchanged') {
      const checked = snapshot(candidate), candidateValidation = p.validateCase(checked);
      if (!candidateValidation.valid) fail('candidate validation failed: ' + candidateValidation.errors.join(' '));
      candidateHash = JSON.parse(await p.exportCase(checked)).hash;
    }
    const plan = { schemaVersion: 1, caseId: verified.id, caseHash, sourceIds: selected, status, changes, recordMappings, unresolved, candidateHash };
    const planHash = await hashText(canonical(plan));
    if (config.apply && config.expectedPlanHash !== planHash) fail('parser output or reindex plan changed since preview; review a new preview.');
    const result = { ...plan, planHash, applied: false };
    if (!unresolved.length) result.candidateCase = status === 'unchanged' ? snapshot(verified) : snapshot(candidate);
    if (config.apply) {
      if (await hashText(JSON.stringify(snapshot(caseData))) !== caseHash) fail('case changed while reparsing; discard this result and create a new preview.');
      if (unresolved.length) fail('unresolved evidence or graph identities block the entire apply. Original case is unchanged.');
      result.applied = status !== 'unchanged'; result.status = status === 'unchanged' ? 'unchanged' : 'applied';
    }
    return result;
  }
  const exports = { reindexSources, reindexLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, exports);
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
})(globalThis);
