/* Verified case-envelope storage. Portable exports remain the durable backup. */
(function (root) {
  'use strict';
  const DATABASE = 'pbgc-rag-local-v1', STORE = 'cases', HISTORY_CHARS = 128 * 1024 * 1024;
  function dependencies() {
    if (!root.PBGC || typeof root.PBGC.exportCase !== 'function' || typeof root.PBGC.importCase !== 'function') throw new Error('Case validation and package integrity modules must load before storage.');
    return root.PBGC;
  }
  function validId(id) { if (typeof id !== 'string' || !id.length || id.length > 200) throw new Error('A valid case id is required.'); return id; }
  function version(value) { if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('A positive case revision is required.'); }
  function metadata(c, saved) { return { id: c.id, name: c.name, schemaVersion: c.schemaVersion, createdAt: c.createdAt, updatedAt: saved.updatedAt, revision: saved.revision, sourceCount: c.sources.length, recordCount: c.sources.reduce((n, s) => n + s.records.length, 0) }; }
  function checkStored(saved, id) {
    if (!saved || saved.id !== id || typeof saved.envelope !== 'string' || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || typeof saved.updatedAt !== 'string' || !Array.isArray(saved.history)) throw new Error('Stored case metadata is invalid. Restore a verified portable export.');
    return saved;
  }
  function nextSaved(id, envelope, previous) {
    if (previous) checkStored(previous, id);
    if (previous && previous.envelope === envelope) return previous;
    const history = previous ? [...previous.history, { revision: previous.revision, envelope: previous.envelope, updatedAt: previous.updatedAt }] : [];
    let size = envelope.length;
    for (const entry of history) { if (!Number.isSafeInteger(entry.revision) || typeof entry.envelope !== 'string' || typeof entry.updatedAt !== 'string') throw new Error('Stored revision history is invalid.'); size += entry.envelope.length; }
    if (size > HISTORY_CHARS) throw new Error('Case revision history exceeds 128 MiB of text. Export a verified backup before creating a new case. Existing versions are unchanged.');
    const revision = previous ? previous.revision + 1 : 1;
    if (!Number.isSafeInteger(revision)) throw new Error('Case revision limit exceeded.');
    return { id, envelope, revision, updatedAt: new Date().toISOString(), history };
  }
  function openDatabase(factory, timeoutMs) {
    return new Promise((resolve, reject) => {
      let request, done = false;
      const finish = (error, db) => { if (done) { if (db) db.close(); return; } done = true; clearTimeout(timer); if (error) reject(error); else resolve(db); };
      const timer = setTimeout(() => finish(new Error('Browser storage did not open in time.')), timeoutMs);
      try { request = factory.open(DATABASE, 1); }
      catch (error) { finish(error); return; }
      request.onupgradeneeded = () => { if (done) { try { request.transaction.abort(); } catch {} return; } const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
      request.onerror = () => finish(request.error || new Error('Browser storage could not open.'));
      request.onblocked = () => finish(new Error('Browser storage upgrade is blocked by another tab.'));
      request.onsuccess = () => finish(null, request.result);
    });
  }
  function transaction(db, mode, action) {
    return new Promise((resolve, reject) => {
      let tx, value, failure;
      try { tx = db.transaction(STORE, mode); }
      catch (error) { reject(error); return; }
      const timer = setTimeout(() => { failure = new Error('Browser storage transaction timed out.'); try { tx.abort(); } catch { reject(failure); } }, 10000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(value); };
      tx.onerror = () => { failure = tx.error || failure; };
      tx.onabort = () => { clearTimeout(timer); reject(failure || tx.error || new Error('Browser storage transaction was aborted.')); };
      try { action(tx.objectStore(STORE), result => { value = result; }, error => { failure = error; try { tx.abort(); } catch { reject(error); } }); }
      catch (error) { failure = error; try { tx.abort(); } catch { clearTimeout(timer); reject(error); } }
    });
  }
  async function probeDatabase(db) {
    // Add, read and remove a nonce in one transaction. Nothing remains after commit.
    const id = '__capability_probe__' + Date.now() + ':' + Math.random().toString(36).slice(2);
    await transaction(db, 'readwrite', (store, result, abort) => {
      const put = store.add({ id, probe: 'pbgc-storage-v1' });
      put.onsuccess = () => {
        const get = store.get(id);
        get.onsuccess = () => { if (!get.result || get.result.probe !== 'pbgc-storage-v1') { abort(new Error('Browser storage readback failed.')); return; } store.delete(id); result(true); };
      };
    });
  }
  async function createCaseStore(options = {}) {
    dependencies();
    let factory, db = null, fallbackReason = null;
    try { factory = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : root.indexedDB; } catch (error) { fallbackReason = error.message; }
    if (!options.memoryOnly && factory) {
      try { db = await openDatabase(factory, Number.isFinite(options.openTimeoutMs) ? Math.max(1, options.openTimeoutMs) : 2000); await probeDatabase(db); }
      catch (error) { if (db) db.close(); db = null; fallbackReason = error.message || 'Browser storage failed its read/write test.'; }
    }
    if (!db && !fallbackReason) fallbackReason = options.memoryOnly ? 'Memory-only storage was requested.' : 'IndexedDB is unavailable in this browser context.';
    const memory = new Map(); let closed = false;
    if (db) db.onversionchange = () => { db.close(); closed = true; };
    function active() { if (closed) throw new Error('Case storage is closed. Reopen it before use.'); }
    async function rawGet(id) {
      active();
      if (!db) return memory.get(id);
      return transaction(db, 'readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result); });
    }
    async function decode(saved, id, revision) {
      checkStored(saved, id); version(revision);
      const selected = revision === undefined || revision === saved.revision ? saved : saved.history.find(x => x.revision === revision);
      if (!selected) return null;
      const c = await dependencies().importCase(selected.envelope);
      if (c.id !== id) throw new Error('Stored case identity does not match its key.');
      return c;
    }
    return {
      mode: db ? 'indexeddb' : 'memory', fallbackReason, durability: 'not guaranteed; keep verified portable exports',
      async list() {
        active(); let all;
        if (!db) all = [...memory.values()];
        else all = await transaction(db, 'readonly', (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result); });
        const list = [];
        for (const saved of all) { const c = await decode(saved, saved.id); list.push(metadata(c, saved)); }
        return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      },
      async get(id, revision) { validId(id); version(revision); const saved = await rawGet(id); return saved ? decode(saved, id, revision) : null; },
      async put(c) {
        active(); const validation = dependencies().validateCase(c); if (!validation.valid) throw new Error(validation.errors.join(' '));
        const snapshot = JSON.parse(JSON.stringify(c));
        const envelope = await dependencies().exportCase(snapshot); active(); const id = validId(snapshot.id); let saved;
        if (!db) { saved = nextSaved(id, envelope, memory.get(id)); memory.set(id, saved); }
        else saved = await transaction(db, 'readwrite', (store, done, abort) => {
          const request = store.get(id);
          request.onsuccess = () => { try { const next = nextSaved(id, envelope, request.result); store.put(next); done(next); } catch (error) { abort(error); } };
        });
        // Decode the exact saved envelope; callers cannot mutate returned internal state.
        return metadata(await decode(saved, id), saved);
      },
      async remove(id) {
        validId(id); active();
        if (!db) return memory.delete(id);
        return transaction(db, 'readwrite', (store, done) => { const request = store.get(id); request.onsuccess = () => { const present = request.result !== undefined; store.delete(id); done(present); }; });
      },
      async listVersions(id) {
        validId(id); const saved = await rawGet(id); if (!saved) return [];
        checkStored(saved, id); const versions = [];
        for (const entry of [...saved.history, saved]) { const c = await decode(saved, id, entry.revision); versions.push(metadata(c, entry)); }
        return versions;
      },
      close() { if (db) db.close(); memory.clear(); closed = true; }
    };
  }
  async function inspectCapabilities() {
    const result = { protocol: root.location ? root.location.protocol : 'non-browser', sha256: false, wasm: false, worker: false, workerReason: null, fileInput: typeof root.File === 'function' && typeof root.FileReader === 'function', fileArrayBuffer: typeof root.File === 'function' && typeof root.File.prototype.arrayBuffer === 'function', directoryPicker: typeof root.showDirectoryPicker === 'function', opfs: false, indexedDB: false, storageDurability: 'not guaranteed; verify portable exports', storageAvailabilityOnly: true, rawDeflate: false, semanticModel: false };
    try { result.sha256 = !!(root.crypto && root.crypto.subtle && (await root.crypto.subtle.digest('SHA-256', new Uint8Array())).byteLength === 32); } catch {}
    try { result.wasm = !!(root.WebAssembly && await root.WebAssembly.compile(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]))); } catch {}
    try { result.indexedDB = !!root.indexedDB; } catch {}
    // Availability is not a claim of durable storage or access permission.
    result.opfs = !!(root.navigator && root.navigator.storage && typeof root.navigator.storage.getDirectory === 'function');
    try { new DecompressionStream('deflate-raw'); result.rawDeflate = true; } catch {}
    if (typeof root.Worker === 'function' && typeof root.Blob === 'function' && root.URL && typeof root.URL.createObjectURL === 'function') {
      let worker, url;
      try {
        url = root.URL.createObjectURL(new Blob(['postMessage("ready")'], { type: 'text/javascript' })); worker = new root.Worker(url);
        result.worker = await new Promise(resolve => { const timer = setTimeout(() => resolve(false), 500); worker.onmessage = event => { clearTimeout(timer); resolve(event.data === 'ready'); }; worker.onerror = () => { clearTimeout(timer); resolve(false); }; });
        if (!result.worker) result.workerReason = 'Local worker did not pass its startup test.';
      } catch (error) { result.workerReason = error.message; }
      finally { if (worker) worker.terminate(); if (url) root.URL.revokeObjectURL(url); }
    } else result.workerReason = 'Local workers are unavailable.';
    return result;
  }
  const api = { createCaseStore, inspectCapabilities };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
