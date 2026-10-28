/* Versioned reference libraries. Never infer permission to share case material. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ sources: 1000, revisions: 1000, chars: 48 * 1024 * 1024 });
  const FORMAT = 'pbgc-rag-reference-library';
  const plain = x => x && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
  const str = (x, max = 200) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  const iso = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString() === x;
  function dependencies() {
    const api = root.PBGC;
    if (api && api.validateCase && api.exportCase && api.importCase) return api;
    if (typeof require === 'function') return require('./artifacts.js');
    throw Error('Local case validation and source integrity modules are required.');
  }
  function safeData(value, depth = 0, budget = { n: 0 }, seen = new Set()) {
    if (++budget.n > 1500000 || depth > 40) throw Error('Reference library structure exceeds limits.');
    if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return;
    if ((!Array.isArray(value) && !plain(value)) || seen.has(value)) throw Error('Reference library requires acyclic plain JSON data.');
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Unsafe reference library key.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) throw Error('Reference library accessors are prohibited.');
      if (Array.isArray(value) && key === 'length') continue;
      safeData(descriptor.value, depth + 1, budget, seen);
    }
    seen.delete(value);
  }
  function referenceSource(source) {
    const allowedSource = ['id', 'name', 'hash', 'format', 'size', 'parserVersion', 'encoding', 'records', 'originalBase64'];
    const allowedRecord = ['id', 'sourceId', 'text', 'locator', 'fields'];
    if (!plain(source) || Object.keys(source).some(key => !allowedSource.includes(key)) || !Array.isArray(source.records) || source.records.some(record => !plain(record) || Object.keys(record).some(key => !allowedRecord.includes(key)))) throw Error('Case-scoped or unsupported metadata cannot be added to a reference library. Import authorized original reference documents explicitly.');
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function caseAdapter(library, sources = library.sources) {
    return { schemaVersion: 1, id: library.id, name: library.name, createdAt: library.createdAt, sources, graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
  }
  function createReferenceLibrary(options) {
    safeData(options);
    if (!plain(options) || Object.keys(options).some(k => !['id', 'name'].includes(k)) || !str(options.id) || !str(options.name)) throw Error('Reference library needs an id and name only.');
    const now = new Date().toISOString();
    return { schemaVersion: 1, kind: 'reference-library', id: options.id, name: options.name, createdAt: now, revision: 1, sources: [], revisions: [{ revision: 1, createdAt: now, versionLabel: 'Initial empty library', sourceIds: [] }] };
  }
  function validateReferenceLibrary(library) {
    const errors = [], warnings = ['Only add reference documents you are authorized to share. Case copying is explicit, not an authorization decision. Hashes do not authenticate sources.'];
    try {
      safeData(library);
      if (!plain(library) || Object.keys(library).some(k => !['schemaVersion', 'kind', 'id', 'name', 'createdAt', 'revision', 'sources', 'revisions'].includes(k))) throw Error('Reference library has unsupported properties.');
      if (library.schemaVersion !== 1 || library.kind !== 'reference-library' || !str(library.id) || !str(library.name) || !iso(library.createdAt)) throw Error('Reference library identity, version or date is invalid.');
      if (!Number.isSafeInteger(library.revision) || library.revision < 1 || !Array.isArray(library.revisions) || !library.revisions.length || library.revisions.length > LIMITS.revisions || library.revision !== library.revisions.length) throw Error('Reference library revision sequence is invalid.');
      if (!Array.isArray(library.sources) || library.sources.length > LIMITS.sources) throw Error('Reference source inventory exceeds limits.');
      const sources = new Set();
      for (const source of library.sources) {
        referenceSource(source);
        if (source.caseId !== undefined || source.referenceOrigin !== undefined || source.records.some(r => r.caseId !== undefined || r.referenceOrigin !== undefined)) throw Error('Case-scoped material cannot be added to a reference library. Import authorized original reference documents explicitly.');
        sources.add(source.id);
      }
      const caseValidation = dependencies().validateCase(caseAdapter(library));
      if (!caseValidation.valid) throw Error(caseValidation.errors.join(' '));
      let previous = new Set(), previousDate = library.createdAt;
      for (let index = 0; index < library.revisions.length; index++) {
        const revision = library.revisions[index];
        if (!plain(revision) || Object.keys(revision).some(k => !['revision', 'createdAt', 'versionLabel', 'sourceIds'].includes(k)) || revision.revision !== index + 1 || !str(revision.versionLabel, 300) || !iso(revision.createdAt) || revision.createdAt < previousDate || !Array.isArray(revision.sourceIds) || revision.sourceIds.length > LIMITS.sources || new Set(revision.sourceIds).size !== revision.sourceIds.length || revision.sourceIds.some(id => !sources.has(id))) throw Error('Reference revision metadata or source membership is invalid.');
        const current = new Set(revision.sourceIds);
        if ([...previous].some(id => !current.has(id))) throw Error('Reference revisions cannot silently remove original sources.');
        if (index === 0 && (revision.sourceIds.length || revision.createdAt !== library.createdAt)) throw Error('Reference library starts with a recorded empty revision.');
        if (index > 0 && current.size === previous.size) throw Error('Reference revision does not add new original sources.');
        previous = current; previousDate = revision.createdAt;
      }
      if (previous.size !== sources.size || [...sources].some(id => !previous.has(id))) throw Error('Latest reference revision does not match its inventory.');
      if (JSON.stringify(library).length > LIMITS.chars) throw Error('Reference library exceeds the portable size limit.');
    } catch (error) { errors.push(error.message); }
    return { valid: errors.length === 0, errors, warnings };
  }
  function assertLibrary(library) { const result = validateReferenceLibrary(library); if (!result.valid) throw Error(result.errors.join(' ')); }
  async function verify(library) { assertLibrary(library); await dependencies().exportCase(caseAdapter(library)); }
  async function addLibrarySources(library, sources, options) {
    // Snapshot before hashing, so caller mutations cannot change a pending revision.
    safeData(library); safeData(sources); safeData(options);
    const next = clone(library), incoming = clone(sources), opts = clone(options);
    await verify(next);
    if (!Array.isArray(incoming) || !incoming.length || incoming.length > LIMITS.sources || !plain(opts) || Object.keys(opts).some(k => k !== 'versionLabel') || !str(opts.versionLabel, 300)) throw Error('Choose authorized reference sources and a version label.');
    for (const source of incoming) {
      referenceSource(source);
      if (!plain(source) || source.caseId !== undefined || source.referenceOrigin !== undefined || !Array.isArray(source.records) || source.records.some(r => !plain(r) || r.caseId !== undefined || r.referenceOrigin !== undefined)) throw Error('Case-scoped material cannot be added to a reference library.');
      await dependencies().exportCase(caseAdapter(next, [source]));
    }
    const ids = new Set(next.sources.map(s => s.id)); let added = 0;
    for (const source of incoming) if (!ids.has(source.id)) { next.sources.push(source); ids.add(source.id); added++; }
    if (!added) return next;
    if (next.revisions.length >= LIMITS.revisions) throw Error('Reference revision limit exceeded.');
    next.revision++;
    const createdAt = new Date(Math.max(Date.now(), Date.parse(next.revisions.at(-1).createdAt))).toISOString();
    next.revisions.push({ revision: next.revision, createdAt, versionLabel: opts.versionLabel, sourceIds: next.sources.map(s => s.id) });
    await verify(next); return next;
  }
  async function digest(text) {
    const crypto = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!crypto || !crypto.subtle) throw Error('Local SHA-256 is unavailable.');
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  async function exportReferenceLibrary(library) {
    safeData(library); const snapshot = clone(library); await verify(snapshot);
    const payload = JSON.stringify(snapshot);
    const envelope = JSON.stringify({ format: FORMAT, version: 1, algorithm: 'SHA-256', hash: await digest(payload), payload });
    if (envelope.length > LIMITS.chars + 1024 * 1024) throw Error('Encoded reference library exceeds the portable size limit.');
    return envelope;
  }
  async function importReferenceLibrary(json) {
    if (typeof json !== 'string' || json.length > LIMITS.chars + 1024 * 1024) throw Error('Reference library package exceeds limits.');
    let envelope;
    try { envelope = JSON.parse(json); } catch { throw Error('Reference library package is not valid JSON.'); }
    safeData(envelope);
    if (!plain(envelope) || Object.keys(envelope).some(k => !['format', 'version', 'algorithm', 'hash', 'payload'].includes(k)) || envelope.format !== FORMAT || envelope.version !== 1 || envelope.algorithm !== 'SHA-256' || typeof envelope.payload !== 'string' || envelope.payload.length > LIMITS.chars || !/^[a-f0-9]{64}$/.test(envelope.hash)) throw Error('Unsupported reference library package.');
    if (await digest(envelope.payload) !== envelope.hash) throw Error('Reference library package integrity check failed.');
    let library; try { library = JSON.parse(envelope.payload); } catch { throw Error('Reference library payload is not valid JSON.'); }
    await verify(library); return library;
  }
  async function copyReferenceSources(caseData, library, sourceIds) {
    safeData(caseData); safeData(library); safeData(sourceIds);
    const target = clone(caseData), snapshot = clone(library), ids = clone(sourceIds);
    await dependencies().exportCase(target); await verify(snapshot);
    if (!Array.isArray(ids) || !ids.length || ids.length > LIMITS.sources || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !snapshot.sources.some(s => s.id === id))) throw Error('Select distinct source IDs from this reference library.');
    const existing = new Map(target.sources.map(s => [s.id, s]));
    const versionLabel = snapshot.revisions.at(-1).versionLabel;
    for (const sourceId of ids) {
      const source = snapshot.sources.find(s => s.id === sourceId);
      if (existing.has(sourceId)) continue;
      const copy = clone(source);
      copy.referenceOrigin = { libraryId: snapshot.id, revision: snapshot.revision, versionLabel };
      target.sources.push(copy); existing.set(sourceId, copy);
    }
    await dependencies().exportCase(target); return target;
  }
  const api = { createReferenceLibrary, validateReferenceLibrary, addLibrarySources, exportReferenceLibrary, importReferenceLibrary, copyReferenceSources, referenceLibraryLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
