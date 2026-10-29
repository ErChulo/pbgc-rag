/* Optional explicit OPFS recovery snapshots. Never replaces portable exports or case storage. */
(function (root) {
  'use strict';
  const DIRECTORY = 'pbgc-rag-backups-v1', LOCK = 'pbgc-rag-opfs-backup-v1';
  const LIMITS = Object.freeze({ slotBytes: 64 * 1024 * 1024, cases: 1000, entries: 2100, nodes: 1500000, depth: 40 });
  const filename = (key, slot) => `${key}.slot${slot}.json`;
  function fail(message) { throw new Error('OPFS backup: ' + message); }
  function codec() { const p = root.PBGC; if (!p || !['validateCase', 'exportCase', 'importCase'].every(key => typeof p[key] === 'function')) fail('case integrity modules are unavailable.'); return p; }
  function caseId(value) { if (typeof value !== 'string' || !value.length || value.length > 200) fail('a case id of one to 200 characters is required.'); return value; }
  function keys(value, expected) { return value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
  function jsonSnapshot(value) {
    const path = new Set(); let count = 0, chars = 0;
    function check(item, depth) {
      if (++count > LIMITS.nodes || depth > LIMITS.depth) fail('snapshot structure exceeds bounds.');
      if (typeof item === 'string') { chars += item.length; if (chars > LIMITS.slotBytes) fail('snapshot exceeds 64 MiB.'); return; }
      if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
      if (!item || typeof item !== 'object' || path.has(item)) fail('only acyclic plain JSON data is accepted.');
      const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('only plain JSON objects are accepted.');
      path.add(item); let indices = 0;
      for (const key of Reflect.ownKeys(item)) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key.');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('accessors and hidden properties are prohibited.');
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) fail('non-JSON array property.');
        if (array) indices++; chars += key.length; check(descriptor.value, depth + 1);
      }
      if (array && indices !== item.length) fail('sparse arrays are prohibited.'); path.delete(item);
    }
    check(value, 0); const text = JSON.stringify(value); const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > LIMITS.slotBytes) fail('snapshot exceeds 64 MiB.'); return JSON.parse(text);
  }
  async function digest(text) { if (!root.crypto?.subtle) fail('local SHA-256 is unavailable.'); return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join(''); }
  async function createOPFSBackupStore(options = {}) {
    codec(); let parent, directory = null, locks, available = true, reason = null;
    try { locks = Object.hasOwn(options, 'locks') ? options.locks : root.navigator?.locks; } catch (error) { reason = error.message; }
    const canLock = !!locks && typeof locks.request === 'function';
    try {
      parent = Object.hasOwn(options, 'rootDirectory') ? options.rootDirectory : await root.navigator?.storage?.getDirectory?.();
      if (!parent || typeof parent.getDirectoryHandle !== 'function') fail('origin-private file storage is unavailable in this browser context.');
      try { directory = await parent.getDirectoryHandle(DIRECTORY, { create: canLock }); }
      catch (error) { if (canLock || error.name !== 'NotFoundError') throw error; }
    } catch (error) { available = false; reason = error.message || 'Origin-private file storage could not open.'; }
    const writable = available && canLock;
    if (available && !canLock) reason = 'Web Locks are unavailable. Backups are read-only; writing without cross-tab serialization is disabled.';
    function readable() { if (!available) fail(reason); }
    function writes() { readable(); if (!writable) fail(reason); }
    async function locked(mode, operation) {
      if (!canLock) return operation();
      return locks.request(LOCK, { mode }, operation);
    }
    async function readSlot(key, slot) {
      if (!directory) return { slot, absent: true };
      let handle;
      try { handle = await directory.getFileHandle(filename(key, slot)); }
      catch (error) { if (error.name === 'NotFoundError') return { slot, absent: true }; return { slot, caseKey: key, reason: error.message || 'Slot could not open.' }; }
      try {
        const file = await handle.getFile();
        if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > LIMITS.slotBytes) fail('slot size is invalid or exceeds 64 MiB.');
        const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.length !== file.size || bytes.length > LIMITS.slotBytes) fail('slot changed size during read.');
        const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!keys(envelope, ['format', 'version', 'algorithm', 'hash', 'payload']) || envelope.format !== 'pbgc-rag-opfs-slot' || envelope.version !== 1 || envelope.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(envelope.hash) || typeof envelope.payload !== 'string') fail('unsupported slot envelope.');
        if (await digest(envelope.payload) !== envelope.hash) fail('slot checksum mismatch.');
        const payload = jsonSnapshot(JSON.parse(envelope.payload));
        if (!keys(payload, ['schemaVersion', 'caseKey', 'caseId', 'generation', 'savedAt', 'caseEnvelope']) || payload.schemaVersion !== 1 || payload.caseKey !== key || await digest(JSON.stringify(caseId(payload.caseId))) !== key || !Number.isSafeInteger(payload.generation) || payload.generation < 1 || payload.generation % 2 !== slot || typeof payload.savedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(payload.savedAt) || Number.isNaN(Date.parse(payload.savedAt)) || new Date(payload.savedAt).toISOString() !== payload.savedAt || typeof payload.caseEnvelope !== 'string') fail('slot identity, generation or timestamp is invalid.');
        const c = await codec().importCase(payload.caseEnvelope);
        if (c.id !== payload.caseId) fail('case identity disagrees with the slot.');
        return { slot, caseKey: key, caseId: c.id, name: c.name, generation: payload.generation, savedAt: payload.savedAt, caseHash: JSON.parse(payload.caseEnvelope).hash, caseData: c, envelopeHash: envelope.hash };
      } catch (error) { return { slot, caseKey: key, reason: error.message || 'Slot failed integrity checks.' }; }
    }
    async function inspect(key) {
      const slots = await Promise.all([readSlot(key, 0), readSlot(key, 1)]), valid = slots.filter(slot => slot.caseData).sort((a, b) => b.generation - a.generation), damaged = slots.filter(slot => slot.reason).map(({ caseKey, slot, reason }) => ({ caseKey, slot, reason }));
      let conflict = null;
      if (valid.length === 2 && (valid[0].generation - valid[1].generation !== 1 || valid[0].caseId !== valid[1].caseId)) conflict = 'Slot generations or case identities conflict. No automatic selection or overwrite is permitted.';
      return { valid, damaged, conflict };
    }
    async function entries() {
      const groups = new Set(), ignored = []; let count = 0;
      if (directory) for await (const [name] of directory.entries()) {
        if (++count > LIMITS.entries) fail('backup directory entry limit exceeded; enumeration is incomplete.');
        const match = /^([a-f0-9]{64})\.slot([01])\.json$/.exec(name);
        if (match) groups.add(match[1]); else ignored.push(name);
        if (groups.size > LIMITS.cases) fail('backup directory exceeds the 1000-case limit.');
      }
      return { groups, ignored };
    }
    function publicSlot(slot) { return { generation: slot.generation, savedAt: slot.savedAt, slot: slot.slot, caseHash: slot.caseHash }; }
    return {
      available, writable, reason, durability: 'Browser-local storage can be evicted or disabled. Keep verified portable exports.',
      async list() {
        readable(); return locked('shared', async () => {
          const discovered = await entries(), cases = [], damaged = [], conflicts = [];
          for (const key of [...discovered.groups].sort()) {
            const state = await inspect(key); damaged.push(...state.damaged);
            if (state.conflict) conflicts.push({ caseKey: key, reason: state.conflict });
            if (state.valid.length) { const latest = state.valid[0]; cases.push({ caseId: latest.caseId, caseKey: key, name: latest.name, latestGeneration: state.conflict ? null : latest.generation, generations: state.valid.map(publicSlot), damagedSlots: state.damaged, status: state.conflict ? 'conflict' : state.damaged.length ? 'recoverable-damage' : 'verified' }); }
          }
          return { cases, damaged, conflicts, ignoredEntries: discovered.ignored };
        });
      },
      async save(caseData) {
        writes(); const snapshot = jsonSnapshot(caseData), validation = codec().validateCase(snapshot); if (!validation.valid) fail(validation.errors.join(' '));
        const caseEnvelope = await codec().exportCase(snapshot), id = caseId(snapshot.id), key = await digest(JSON.stringify(id));
        return locked('exclusive', async () => {
          const discovered = await entries(); if (!discovered.groups.has(key) && discovered.groups.size >= LIMITS.cases) fail('1000-case backup limit reached.');
          const state = await inspect(key); if (state.conflict) fail(state.conflict); if (!state.valid.length && state.damaged.length) fail('all existing slots are damaged. Preserve portable recovery evidence, then explicitly remove damaged slots before restarting backups.');
          if (state.valid.some(item => item.caseId !== id)) fail('hashed case identity collision; no slots were changed.');
          const latest = state.valid[0], generation = latest ? latest.generation + 1 : 1; if (!Number.isSafeInteger(generation)) fail('generation limit reached.');
          const slot = generation % 2, replaced = state.valid.find(item => item.slot === slot), savedAt = new Date().toISOString();
          const payload = JSON.stringify({ schemaVersion: 1, caseKey: key, caseId: id, generation, savedAt, caseEnvelope });
          const checksum = await digest(payload);
          const text = JSON.stringify({ format: 'pbgc-rag-opfs-slot', version: 1, algorithm: 'SHA-256', hash: checksum, payload });
          if (new TextEncoder().encode(text).byteLength > LIMITS.slotBytes) fail('encoded backup slot exceeds 64 MiB.');
          let stream;
          try {
            const handle = await directory.getFileHandle(filename(key, slot), { create: true }); stream = await handle.createWritable(); await stream.write(text); await stream.close(); stream = null;
            const readback = await readSlot(key, slot);
            if (!readback.caseData || readback.generation !== generation || readback.caseId !== id || readback.caseHash !== JSON.parse(caseEnvelope).hash || readback.envelopeHash !== checksum) fail('written slot did not pass complete readback validation. ' + (readback.reason || ''));
            return { caseId: id, caseKey: key, ...publicSlot(readback), replacedGeneration: replaced ? replaced.generation : null, damagedSlots: state.damaged.filter(item => item.slot !== slot) };
          } catch (error) { if (stream) { try { await stream.abort(); } catch {} } fail('snapshot was not confirmed: ' + error.message + (latest ? ' Previous verified generation ' + latest.generation + ' remains in the other slot.' : ' No previous verified snapshot exists.')); }
        });
      },
      async restore(id, options = {}) {
        readable(); caseId(id); const config = jsonSnapshot(options);
        if (Object.keys(config).some(key => key !== 'generation') || config.generation !== undefined && (!Number.isSafeInteger(config.generation) || config.generation < 1)) fail('restore accepts only a positive generation.');
        const key = await digest(JSON.stringify(id));
        return locked('shared', async () => {
          const state = await inspect(key); if (state.conflict) fail(state.conflict);
          const selected = config.generation === undefined ? state.valid[0] : state.valid.find(slot => slot.generation === config.generation);
          if (!selected) { if (state.damaged.length) fail('no requested verified generation is available; damaged slots remain unchanged.'); if (config.generation !== undefined && state.valid.length) fail('requested generation is not retained.'); return null; }
          if (selected.caseId !== id) fail('requested case identity does not match the slot.');
          return { caseData: selected.caseData, ...publicSlot(selected), recoveredFromDamage: state.damaged.length > 0, damagedSlots: state.damaged };
        });
      },
      async remove(id) {
        writes(); caseId(id); const key = await digest(JSON.stringify(id));
        return locked('exclusive', async () => {
          let removedSlots = 0;
          for (const slot of [0, 1]) try { await directory.removeEntry(filename(key, slot)); removedSlots++; } catch (error) { if (error.name !== 'NotFoundError') { const failure = new Error('OPFS backup: removal stopped: ' + error.message); failure.removedSlots = removedSlots; throw failure; } }
          return { caseId: id, removedSlots };
        });
      }
    };
  }
  const exported = { createOPFSBackupStore, opfsBackupLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, exported);
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(globalThis);
