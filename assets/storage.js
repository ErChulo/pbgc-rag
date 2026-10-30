/* Recovery is not a trusted case package. Verify original-byte hashes after load.
 * createRecoveryStore({indexedDB?,localStorage?,now?,timeoutMs?,maxCaseBytes?}) resolves a store.
 * load({previous:false}) -> case object|null; save(case|null) -> metadata;
 * clear() removes both snapshots and the legacy recovery key.
 * info() -> {kind,persistent,revision,hasPrevious,migrated,warnings}.
 * Selection falls back only during initialization. A later write failure throws
 * RecoveryError(code='WRITE_FAILED') and never claims a dropped save succeeded.
 * save keeps one prior revision atomically. load({previous:true}) is explicit;
 * this module never silently replaces a corrupt current case with an older case.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'pbgc-rag.recovery.v1', LEGACY_KEY = 'pbgc-rag.workspace.v1';
  const DEFAULT_MAX_CASE = 40 * 1024 * 1024;
  class RecoveryError extends Error {
    constructor(code, message, cause) { super(message); this.name = 'RecoveryError'; this.code = code; if (cause) this.cause = cause; }
  }
  function bytes(text) { return new TextEncoder().encode(text).byteLength; }
  function copyCase(value, maxCase = DEFAULT_MAX_CASE) {
    if (value !== null && (!value || typeof value !== 'object' || Array.isArray(value))) throw new RecoveryError('INVALID_CASE', 'Recovery requires a JSON object or null; the caller must verify its schema.');
    let text;
    try { text = JSON.stringify(value); } catch (cause) { throw new RecoveryError('INVALID_CASE', 'Case cannot be serialized for recovery.', cause); }
    if (typeof text !== 'string' || bytes(text) > maxCase) throw new RecoveryError('SIZE_LIMIT', 'Recovery data exceeds the configured byte limit.');
    return JSON.parse(text);
  }
  function validSnapshot(snapshot, maxCase) {
    if (!snapshot || typeof snapshot !== 'object' || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 || typeof snapshot.savedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.savedAt))) throw new RecoveryError('CORRUPT_RECOVERY', 'Invalid recovery snapshot metadata.');
    return { revision: snapshot.revision, savedAt: snapshot.savedAt, value: copyCase(snapshot.value, maxCase) };
  }
  function decode(raw, maxCase) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string' || bytes(raw) > maxCase * 2 + 8192) throw new RecoveryError('CORRUPT_RECOVERY', 'Recovery envelope exceeds its size limit or has an invalid type.');
    let data;
    try { data = JSON.parse(raw); } catch (cause) { throw new RecoveryError('CORRUPT_RECOVERY', 'Recovery envelope is invalid JSON.', cause); }
    if (!data || data.version !== 1) throw new RecoveryError('CORRUPT_RECOVERY', 'Unsupported recovery envelope version.');
    const current = validSnapshot(data.current, maxCase), previous = data.previous === null ? null : validSnapshot(data.previous, maxCase);
    if (previous && previous.revision >= current.revision) throw new RecoveryError('CORRUPT_RECOVERY', 'Recovery revisions are out of order.');
    return { version: 1, current, previous };
  }
  function localAdapter(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw Error('Local storage unavailable.');
    const probe = KEY + '.probe.' + Math.random().toString(36).slice(2);
    try { storage.setItem(probe, 'ok'); if (storage.getItem(probe) !== 'ok') throw Error('Local storage probe failed.'); }
    finally { storage.removeItem(probe); }
    return { kind: 'localStorage', read: async () => storage.getItem(KEY), write: async (text, expected) => { if (storage.getItem(KEY) !== expected) throw new RecoveryError('CONFLICT', 'Recovery changed in another tab. Export your case before reloading.'); storage.setItem(KEY, text); }, remove: async () => storage.removeItem(KEY) };
  }
  async function indexedAdapter(indexedDB, timeoutMs) {
    if (!indexedDB || typeof indexedDB.open !== 'function') throw Error('IndexedDB unavailable.');
    const db = await new Promise((resolve, reject) => {
      let settled = false, request;
      const timer = setTimeout(() => { settled = true; reject(Error('IndexedDB initialization timed out.')); }, timeoutMs);
      const fail = error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
      try { request = indexedDB.open('pbgc-rag-recovery', 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('recovery')) request.result.createObjectStore('recovery'); };
      request.onerror = () => fail(request.error || Error('IndexedDB open failed.'));
      request.onblocked = () => fail(Error('IndexedDB upgrade is blocked.'));
      request.onsuccess = () => { if (settled) { request.result.close(); return; } settled = true; clearTimeout(timer); resolve(request.result); };
    });
    db.onversionchange = () => db.close();
    function transaction(mode, action) {
      return new Promise((resolve, reject) => {
        let tx, result, request;
        const timer = setTimeout(() => { try { tx?.abort(); } catch (_) {} reject(Error('IndexedDB transaction timed out.')); }, timeoutMs);
        const fail = error => { clearTimeout(timer); reject(error || Error('IndexedDB transaction failed.')); };
        try {
          tx = db.transaction('recovery', mode);
          request = action(tx.objectStore('recovery'));
          if (request) request.onsuccess = () => { result = request.result; };
          tx.oncomplete = () => { clearTimeout(timer); resolve(result ?? null); };
          tx.onerror = () => fail(tx.error || request?.error);
          tx.onabort = () => fail(tx.error || Error('IndexedDB transaction was aborted.'));
        } catch (error) { fail(error); }
      });
    }
    function compareWrite(text, expected) {
      return new Promise((resolve, reject) => {
        let tx, conflict = false;
        const timer = setTimeout(() => { try { tx?.abort(); } catch (_) {} reject(Error('IndexedDB write timed out.')); }, timeoutMs);
        try {
          tx = db.transaction('recovery', 'readwrite');
          const store = tx.objectStore('recovery'), request = store.get(KEY);
          request.onsuccess = () => {
            if ((request.result ?? null) !== expected) { conflict = true; tx.abort(); return; }
            store.put(text, KEY);
          };
          tx.oncomplete = () => { clearTimeout(timer); resolve(); };
          tx.onerror = () => { clearTimeout(timer); reject(tx.error || Error('IndexedDB write failed.')); };
          tx.onabort = () => { clearTimeout(timer); reject(conflict ? new RecoveryError('CONFLICT', 'Recovery changed in another tab. Export your case before reloading.') : tx.error || Error('IndexedDB write aborted.')); };
        } catch (error) { clearTimeout(timer); reject(error); }
      });
    }
    const adapter = {kind:'IndexedDB', read: () => transaction('readonly', store => store.get(KEY)), write: compareWrite, remove: () => transaction('readwrite', store => store.delete(KEY))};
    // Test a distinct key, without touching an existing recovery envelope.
    try { await transaction('readwrite', store => { store.put('ok', KEY + '.probe'); return store.delete(KEY + '.probe'); }); }
    catch (error) { db.close(); throw error; }
    return adapter;
  }
  function getCapability(options, key) { if (Object.prototype.hasOwnProperty.call(options, key)) return options[key]; try { return root[key]; } catch (_) { return null; } }
  async function createRecoveryStore(options) {
    options = options || {};
    const maxCase = options.maxCaseBytes === undefined ? DEFAULT_MAX_CASE : options.maxCaseBytes;
    if (!Number.isSafeInteger(maxCase) || maxCase < 1024 || maxCase > 80 * 1024 * 1024) throw new RecoveryError('INVALID_OPTIONS', 'Recovery byte limit must be between 1 KB and 80 MB.');
    const timeoutMs = options.timeoutMs === undefined ? 3000 : options.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new RecoveryError('INVALID_OPTIONS', 'Recovery timeout must be between 1 and 30,000 ms.');
    const now = options.now || (() => new Date().toISOString());
    if (typeof now !== 'function') throw new RecoveryError('INVALID_OPTIONS', 'Recovery clock must be a function.');
    const warnings = [], local = getCapability(options, 'localStorage');
    let adapter;
    try { adapter = await indexedAdapter(getCapability(options, 'indexedDB'), timeoutMs); }
    catch (_) { warnings.push('IndexedDB unavailable.'); }
    if (!adapter) { try { adapter = localAdapter(local); } catch (_) { warnings.push('Local storage unavailable.'); } }
    if (!adapter) { let data = null; adapter = {kind:'memory',read:async()=>data,write:async (value,expected)=>{if(data !== expected) throw new RecoveryError('CONFLICT', 'Memory recovery changed.'); data=value;},remove:async()=>{data=null;}}; warnings.push('Memory only. Export a portable case before closing this tab.'); }
    let state = null, stateRaw = null, migrated = false, initializationError = null;
    try {
      stateRaw = await adapter.read(); state = decode(stateRaw, maxCase);
      if (!state && local) {
        let legacyRaw = null;
        try { legacyRaw = local.getItem(LEGACY_KEY); } catch (_) { warnings.push('Legacy local recovery storage is inaccessible.'); }
        if (legacyRaw !== null && legacyRaw !== 'null') {
          if (bytes(legacyRaw) > maxCase) throw new RecoveryError('SIZE_LIMIT', 'Legacy recovery case exceeds the configured byte limit.');
          let legacy;
          try { legacy = copyCase(JSON.parse(legacyRaw), maxCase); } catch (cause) { throw new RecoveryError('CORRUPT_RECOVERY', 'Legacy recovery case is invalid.', cause); }
          const savedAt = now(); if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) throw new RecoveryError('INVALID_DATE', 'Recovery timestamp is invalid.');
          state = {version:1,current:{revision:1,savedAt,value:legacy},previous:null};
          const migratedRaw = JSON.stringify(state); await adapter.write(migratedRaw, stateRaw); stateRaw = migratedRaw;
          migrated = true; // Leave original legacy bytes intact until explicit clear.
        }
      }
    } catch (cause) { initializationError = cause instanceof RecoveryError ? cause : new RecoveryError('READ_FAILED', 'Recovery data could not be read or migrated.', cause); }
    // Serialize calls so two concurrent save operations cannot lose a revision.
    let queue = Promise.resolve();
    function serialized(fn) { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next; }
    const info = () => ({kind:adapter.kind,persistent:adapter.kind !== 'memory',revision:state?.current.revision || 0,hasPrevious:!!state?.previous,migrated,warnings:warnings.slice()});
    return {
      kind:adapter.kind,
      info,
      load: (loadOptions) => serialized(async () => { if (initializationError) throw initializationError; const snapshot = loadOptions?.previous ? state?.previous : state?.current; return snapshot ? copyCase(snapshot.value, maxCase) : null; }),
      save: value => serialized(async () => {
        if (initializationError) throw initializationError;
        const copied = copyCase(value, maxCase), revision = (state?.current.revision || 0) + 1;
        if (!Number.isSafeInteger(revision)) throw new RecoveryError('REVISION_LIMIT', 'Recovery revision limit reached. Export a portable case.');
        const savedAt = now();
        if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) throw new RecoveryError('INVALID_DATE', 'Recovery timestamp is invalid.');
        const next = {version:1,current:{revision,savedAt,value:copied},previous:state?.current || null};
        const encoded = JSON.stringify(next);
        if (bytes(encoded) > maxCase * 2 + 8192) throw new RecoveryError('SIZE_LIMIT', 'Recovery snapshots exceed the size limit.');
        try { await adapter.write(encoded, stateRaw); }
        catch (cause) { if (cause instanceof RecoveryError && cause.code === 'CONFLICT') throw cause; throw new RecoveryError('WRITE_FAILED', 'Recovery write failed. The previous recovery copy remains. Export your current case.', cause); }
        state = next; stateRaw = encoded;
        return {...info(),savedAt};
      }),
      clear: () => serialized(async () => {
        // Legacy first: if removal fails, do not claim that a close erased recovery.
        try { if (local) local.removeItem(LEGACY_KEY); await adapter.remove(); }
        catch (cause) { throw new RecoveryError('CLEAR_FAILED', 'Recovery could not be cleared. A local copy may remain.', cause); }
        state = null; stateRaw = null; initializationError = null; migrated = false;
        return info();
      })
    };
  }
  return {createRecoveryStore,RecoveryError};
});
