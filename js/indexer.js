/* Incremental, checkpointed offline import. No file or supplied case is mutated. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ sourceBytes: 16 * 1024 * 1024, caseChars: 32 * 1024 * 1024, files: 1000, manifestEntries: 2000, manifestChars: 3 * 1024 * 1024 });
  function api() {
    const value = root.PBGC;
    if (!value || !['parseFile', 'validateCase', 'exportCase', 'importCase'].every(key => typeof value[key] === 'function')) throw new Error('Local parser and case integrity modules are required for incremental imports.');
    return value;
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const hex = /^[a-f0-9]{64}$/;
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  function jsonData(value, depth = 0, budget = { nodes: 0, chars: 0 }) {
    if (++budget.nodes > 1500000 || depth > 40) throw new Error('Import structure exceeds limits.');
    if (typeof value === 'string') { budget.chars += value.length; if (budget.chars > LIMITS.caseChars) throw new Error('Case exceeds the 32 MiB working limit.'); return; }
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
    if (!Array.isArray(value) && !plain(value)) throw new Error('Import state must contain plain JSON data.');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe import state key.');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(d, 'value')) throw new Error('Import state accessors are not accepted.');
      if (Array.isArray(value) && key === 'length') continue;
      budget.chars += key.length;
      jsonData(d.value, depth + 1, budget);
    }
  }
  function caseJSON(value) {
    const validation = api().validateCase(value);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    jsonData(value);
    const json = JSON.stringify(value);
    if (json.length > LIMITS.caseChars) throw new Error('Case exceeds the 32 MiB working limit.');
    return json;
  }
  async function digest(bytes) {
    const crypto = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!crypto || !crypto.subtle) throw new Error('SHA-256 is unavailable. Incremental imports are blocked.');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  }
  const caseHash = value => digest(new TextEncoder().encode(caseJSON(value)));
  function safeRelativePath(path) {
    if (!text(path, 1000) || /[\x00-\x1f\x7f\\]/.test(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new Error('Only bounded relative file paths are accepted.');
    const parts = path.split('/');
    if (parts.length > 32 || parts.some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe relative file path.');
    return path;
  }
  function fileMetadata(file) {
    if (!file || !text(file.name, 500) || /[/\\\x00-\x1f\x7f]/.test(file.name) || /^[A-Za-z]:/.test(file.name) || typeof file.arrayBuffer !== 'function') throw new Error('Select a named local file without an absolute path.');
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > LIMITS.sourceBytes) throw new Error('File exceeds the 16 MiB import limit.');
    const relativePath = safeRelativePath(file.webkitRelativePath || file.name);
    if (relativePath.split('/').at(-1) !== file.name) throw new Error('Directory path does not identify the selected filename.');
    return { name: file.name, relativePath, size: file.size };
  }
  function validateManifest(manifest, caseId, hash) {
    jsonData(manifest);
    const allowed = ['schemaVersion', 'kind', 'caseId', 'caseHash', 'checkpoint', 'entries'];
    if (!plain(manifest) || Object.keys(manifest).some(k => !allowed.includes(k)) || manifest.schemaVersion !== 1 || manifest.kind !== 'pbgc-import-checkpoint' || manifest.caseId !== caseId || !hex.test(manifest.caseHash) || manifest.caseHash !== hash || !Number.isSafeInteger(manifest.checkpoint) || manifest.checkpoint < 0 || !Array.isArray(manifest.entries) || manifest.entries.length > LIMITS.manifestEntries) throw new Error('Import checkpoint belongs to another case, is stale, or is malformed.');
    for (const entry of manifest.entries) {
      if (!plain(entry) || Object.keys(entry).some(k => !['name', 'relativePath', 'size', 'hash', 'status', 'sourceId', 'message'].includes(k)) || !text(entry.name, 500) || /[/\\\x00-\x1f\x7f]/.test(entry.name) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > LIMITS.sourceBytes || !['imported', 'duplicate', 'error'].includes(entry.status) || !(entry.hash === null || typeof entry.hash === 'string' && hex.test(entry.hash))) throw new Error('Import checkpoint file entry is malformed.');
      safeRelativePath(entry.relativePath);
      if (entry.relativePath.split('/').at(-1) !== entry.name) throw new Error('Import checkpoint filename does not match its path.');
      if (entry.status !== 'error' && (entry.hash === null || entry.sourceId !== 'src-' + entry.hash)) throw new Error('Import checkpoint lacks a verified source hash.');
      if (entry.message !== undefined && !text(entry.message, 1000)) throw new Error('Import checkpoint message is invalid.');
    }
    if (JSON.stringify(manifest).length > LIMITS.manifestChars) throw new Error('Import checkpoint exceeds limits.');
  }
  async function importFiles(caseSnapshot, files, options = {}) {
    const dependencies = api();
    if (!plain(options) || Object.keys(options).some(k => !['signal', 'onProgress', 'onCheckpoint', 'previousManifest'].includes(k))) throw new Error('Unsupported incremental import options.');
    for (const name of ['onProgress', 'onCheckpoint']) if (options[name] !== undefined && typeof options[name] !== 'function') throw new Error(name + ' must be a function.');
    if (options.signal !== undefined && (!options.signal || typeof options.signal.aborted !== 'boolean')) throw new Error('An AbortSignal is required.');
    if (!Array.isArray(files) || files.length > LIMITS.files) throw new Error('Select at most 1000 files for one import.');
    // Capture case and selection before the first asynchronous operation.
    const captured = JSON.parse(caseJSON(caseSnapshot)), selected = files.slice();
    let working = await dependencies.importCase(await dependencies.exportCase(captured));
    const initialHash = await caseHash(working);
    let manifest;
    if (options.previousManifest !== undefined) {
      validateManifest(options.previousManifest, working.id, initialHash);
      manifest = copy(options.previousManifest);
      const sourceHashes = new Set(working.sources.map(source => source.hash));
      if (manifest.entries.some(e => e.status !== 'error' && !sourceHashes.has(e.hash))) throw new Error('Checkpoint source is missing from this case.');
    } else manifest = { schemaVersion: 1, kind: 'pbgc-import-checkpoint', caseId: working.id, caseHash: initialHash, checkpoint: 0, entries: [] };
    if (manifest.checkpoint > Number.MAX_SAFE_INTEGER - selected.length) throw new Error('Import checkpoint counter limit exceeded. Use a new import session.');
    if (manifest.entries.length + selected.length > LIMITS.manifestEntries) throw new Error('Import checkpoint entry budget exceeded. Use a new import session.');
    let imported = 0, skipped = 0, cancelled = false, processed = 0;
    const errors = [];
    const stopped = () => !!options.signal && options.signal.aborted;
    function result() { return { caseData: copy(working), manifest: copy(manifest), imported, skipped, errors: copy(errors), cancelled }; }
    async function callback(name, value) {
      if (!options[name]) return;
      try { await options[name](copy(value)); }
      catch (cause) {
        const error = new Error(name + ' failed. Completed import state is available in error.result; checkpoint persistence is unconfirmed.');
        error.name = 'ImportCallbackError'; error.cause = cause; error.result = result(); throw error;
      }
    }
    async function progress(stage, index, metadata) { await callback('onProgress', { stage, processed: index, total: selected.length, imported, skipped, rejected: errors.length, file: metadata || null, caseId: working.id }); }
    async function checkpoint(entry) {
      const existing = entry.hash !== null ? manifest.entries.findIndex(e => e.hash === entry.hash && e.relativePath === entry.relativePath) : -1;
      const entries = manifest.entries.slice();
      // Retain original imported status when a completed selection is replayed.
      if (existing >= 0) entries[existing] = entries[existing].status === 'imported' && entry.status === 'duplicate' ? entries[existing] : entry;
      else entries.push(entry);
      if (entries.length > LIMITS.manifestEntries) throw new Error('Import checkpoint entry limit exceeded. Use a new import session.');
      const next = { ...manifest, checkpoint: manifest.checkpoint + 1, entries, caseHash: await caseHash(working) };
      validateManifest(next, working.id, next.caseHash);
      manifest = next;
      await callback('onCheckpoint', { caseData: working, manifest, imported, skipped, errors });
    }
    for (let index = 0; index < selected.length; index++) {
      if (stopped()) { cancelled = true; break; }
      const file = selected[index]; let metadata, hash = null, source, entry;
      try { metadata = fileMetadata(file); }
      catch (error) { errors.push({ index, name: 'Rejected file selection', message: error.message }); processed = index + 1; await progress('rejected', processed); continue; }
      await progress('hashing', index, metadata);
      if (stopped()) { cancelled = true; break; }
      // Yield to the browser event loop so cancel/progress controls can update.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (stopped()) { cancelled = true; break; }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength !== metadata.size || bytes.byteLength > LIMITS.sourceBytes) throw new Error('File changed or exceeds its declared size.');
        hash = await digest(bytes);
        if (stopped()) { cancelled = true; break; }
        if (working.sources.some(s => s.hash === hash)) {
          skipped++;
          entry = { ...metadata, hash, status: 'duplicate', sourceId: 'src-' + hash };
        } else {
          await progress('parsing', index, metadata);
          if (stopped()) { cancelled = true; break; }
          // One captured byte snapshot feeds both the fingerprint and parser.
          source = await dependencies.parseFile({ name: metadata.name, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer });
          if (source.hash !== hash || source.id !== 'src-' + hash) throw new Error('Parser source identity does not match the imported bytes.');
          if (stopped()) { cancelled = true; break; }
          const candidate = { ...working, sources: [...working.sources, source] };
          caseJSON(candidate);
          await dependencies.exportCase(candidate);
          if (stopped()) { cancelled = true; break; }
          working = candidate; imported++;
          entry = { ...metadata, hash, status: 'imported', sourceId: source.id };
        }
      } catch (error) {
        if (error.name === 'ImportCallbackError') throw error;
        const message = String(error.message || 'File could not be imported.').slice(0, 1000);
        errors.push({ index, name: metadata.name, relativePath: metadata.relativePath, message });
        entry = { ...metadata, hash, status: 'error', message };
      }
      await checkpoint(entry);
      processed = index + 1;
      await progress(entry.status === 'error' ? 'rejected' : 'complete', index + 1, metadata);
      if (stopped()) { cancelled = true; break; }
    }
    if (stopped()) cancelled = true;
    await progress(cancelled ? 'cancelled' : 'finished', processed, null);
    return result();
  }
  const exports = { importFiles, importLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, exports);
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
})(globalThis);
