/* Provisional internal labels and evidence-bound contradiction screening. */
(function (root) {
  'use strict';
  const limits = Object.freeze({ sources: 1000, records: 100000, claims: 1000, citationsPerClaim: 100, conflicts: 10000, treeNodes: 2000000, treeDepth: 40, totalStringChars: 64 * 1024 * 1024, outputChars: 16 * 1024 * 1024 });
  const labels = ['NRD', 'ERD', 'EURD', 'RBD', 'QPSA', 'DOR', 'DORNSF', 'XRD', 'PC', 'TitleIV', '4022c', '436', 'survivor', 'benefitForm', 'service', 'freeze', 'amendment', 'DOPT'];
  const ontology = Object.freeze({
    schemaVersion: 1, version: '1.0.0', namespace: 'internal:', status: 'PROVISIONAL', official: false,
    notice: 'Internal labels only. No official field definitions, actuarial interpretations, or legal priority are supplied.',
    terms: Object.freeze(labels.map(label => Object.freeze({ id: 'internal:' + label, label, definition: null, approvalStatus: 'not supplied' })))
  });
  const fail = message => { throw new Error('Conflict screening: ' + message); };
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
  function safeData(value) {
    const visiting = new WeakSet(); let nodes = 0, chars = 0;
    function visit(v, depth) {
      if (++nodes > limits.treeNodes || depth > limits.treeDepth) fail('Input structure exceeds resource limits.');
      if (typeof v === 'string') { chars += v.length; if (chars > limits.totalStringChars) fail('Input strings exceed the memory limit.'); return; }
      if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
      if (!Array.isArray(v) && !plain(v)) fail('Only plain JSON data is accepted.');
      if (visiting.has(v)) fail('Cyclic input is not accepted.'); visiting.add(v);
      if (Array.isArray(v) && (v.length > limits.records || (nodes += v.length) > limits.treeNodes)) fail('Array allocation exceeds resource limits.');
      const descriptors = Object.getOwnPropertyDescriptors(v);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsafe input key.');
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, 'value')) fail('Accessors are not accepted.');
        if (Array.isArray(v) && key === 'length') continue;
        visit(descriptor.value, depth + 1);
      }
      visiting.delete(v);
    }
    visit(value, 0);
  }
  function text(value, name, max = 300) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(name + ' must be nonempty bounded text without control characters.'); return value; }
  function iso(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Validity dates must be real ISO calendar dates.');
    return value;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function detectConflicts(caseData, claims) {
    // Validate before reading values so hostile getters and cycles cannot execute.
    safeData(caseData); safeData(claims);
    if (!plain(caseData) || caseData.schemaVersion !== 1) fail('Unsupported case schema.');
    const caseId = text(caseData.id, 'Case ID', 200);
    if (!Array.isArray(caseData.sources) || caseData.sources.length > limits.sources) fail('Case sources are invalid or exceed limits.');
    if (!Array.isArray(claims) || claims.length > limits.claims) fail('Claims must be an array of at most 1000 items.');
    const records = new Map(), recordCosts = new Map(), sourceIds = new Set(); let recordCount = 0;
    for (const source of caseData.sources) {
      if (!plain(source)) fail('Each source must be a plain object.');
      text(source.id, 'Source ID');
      if (sourceIds.has(source.id)) fail('Duplicate source ID.'); sourceIds.add(source.id);
      if (source.caseId !== undefined && source.caseId !== caseId) fail('Cross-case source rejected.');
      if (!Array.isArray(source.records) || (recordCount += source.records.length) > limits.records) fail('Source record limit exceeded.');
      for (const record of source.records) {
        if (!plain(record)) fail('Each source record must be a plain object.');
        text(record.id, 'Source record ID');
        if (records.has(record.id) || record.sourceId !== source.id) fail('Record IDs must be unique and belong to their case source.');
        if (record.caseId !== undefined && record.caseId !== caseId) fail('Cross-case source record rejected.');
        if (!plain(record.locator) || typeof record.locator.kind !== 'string' || typeof record.locator.label !== 'string' || typeof record.text !== 'string') fail('Source evidence needs text and an explicit locator.');
        const evidence = { sourceId: source.id, sourceName: source.name ?? null, sourceHash: source.hash ?? null, recordId: record.id, locator: record.locator, excerpt: record.text };
        records.set(record.id, evidence); recordCosts.set(record.id, JSON.stringify(evidence).length);
      }
    }
    const ids = new Set(), buckets = new Map();
    for (const claim of claims) {
      if (!plain(claim)) fail('Claims must be plain objects.');
      const allowed = ['id', 'caseId', 'kind', 'subjectId', 'predicate', 'value', 'group', 'validFrom', 'validTo', 'sourceRecordIds'];
      if (Object.keys(claim).some(key => !allowed.includes(key))) fail('Unknown claim field. Official dictionary fields cannot be inferred.');
      text(claim.id, 'Claim ID'); if (ids.has(claim.id)) fail('Claim IDs must be unique.'); ids.add(claim.id);
      if (claim.caseId !== caseId) fail('Claim must explicitly identify this case. Cross-case claim rejected.');
      if (!['fact', 'provision'].includes(claim.kind)) fail('Claim kind must be fact or provision.');
      text(claim.subjectId, 'Claim subject'); text(claim.group, 'Applicability group', 200);
      if (typeof claim.predicate !== 'string' || !/^internal:[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(claim.predicate)) fail('Claim predicates must use the provisional internal: namespace.');
      if (!['string', 'number', 'boolean'].includes(typeof claim.value) || (typeof claim.value === 'number' && !Number.isFinite(claim.value)) || (typeof claim.value === 'string' && (!claim.value.trim() || claim.value.length > 4000))) fail('Claim values must be a nonempty bounded string, finite number, or boolean.');
      if (claim.validFrom !== undefined) iso(claim.validFrom); if (claim.validTo !== undefined) iso(claim.validTo);
      if (claim.validFrom && claim.validTo && claim.validFrom > claim.validTo) fail('Claim validity period is reversed.');
      if (!Array.isArray(claim.sourceRecordIds) || !claim.sourceRecordIds.length || claim.sourceRecordIds.length > limits.citationsPerClaim || new Set(claim.sourceRecordIds).size !== claim.sourceRecordIds.length || claim.sourceRecordIds.some(id => typeof id !== 'string' || !records.has(id))) fail('Every claim needs distinct sourceRecordIds that resolve within this case.');
      const key = JSON.stringify([claim.subjectId, claim.predicate, claim.group]); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(claim);
    }
    const conflicts = []; let outputChars = 0;
    function side(claim) { return { claimId: claim.id, kind: claim.kind, value: claim.value, valueType: typeof claim.value, sourceRecordIds: [...claim.sourceRecordIds], citations: claim.sourceRecordIds.map(id => clone(records.get(id))) }; }
    for (const bucket of buckets.values()) for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
      const left = bucket[i], right = bucket[j];
      if (typeof left.value === typeof right.value && left.value === right.value) continue;
      const from = [left.validFrom, right.validFrom].filter(Boolean).sort().at(-1) ?? null;
      const to = [left.validTo, right.validTo].filter(Boolean).sort()[0] ?? null;
      if (from && to && from > to) continue;
      if (conflicts.length >= limits.conflicts) fail('Conflict result limit exceeded. Screen a smaller claim set. No partial result is accepted.');
      outputChars += [...left.sourceRecordIds, ...right.sourceRecordIds].reduce((n, id) => n + recordCosts.get(id), 0) + 16000;
      if (outputChars > limits.outputChars) fail('Conflict output memory limit exceeded. Screen a smaller claim set. No partial result is accepted.');
      conflicts.push({ status: 'unresolved', subjectId: left.subjectId, predicate: left.predicate, group: left.group, overlap: { validFrom: from, validTo: to }, left: side(left), right: side(right), resolution: null, reason: 'Different typed scalar values apply to the same subject, predicate, group, and overlapping date interval.' });
    }
    return { schemaVersion: 1, ontologyVersion: ontology.version, caseId, assessedClaims: claims.length, conflicts, interpretation: 'No legal interpretation or priority is determined. Human review must resolve applicability, source authority, amendments, and approved interpretations. A zero-conflict result does not establish correctness or official acceptance.' };
  }
  const api = { ontology, detectConflicts, ontologyLimits: limits };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
