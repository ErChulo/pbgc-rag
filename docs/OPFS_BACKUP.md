# Optional OPFS recovery backups

`js/opfs-backup.js` provides explicit origin-private file system (OPFS) snapshots. This is a recovery copy in browser-local storage, separate from IndexedDB case checkpoints. It is not an autosave service, a portable export, a durability guarantee or official-output validation. Browser clearing, eviction, origin changes and enterprise policy can make every local copy unavailable. Keep verified portable exports outside browser storage.

The classic-script and CommonJS API is `PBGC.createOPFSBackupStore({rootDirectory?, locks?})`. Load the existing artifact codec first. The default root comes from `navigator.storage.getDirectory()`; the default lock manager is `navigator.locks`. An injected `rootDirectory` is an OPFS root, not the backup subdirectory. The module uses only its `pbgc-rag-backups-v1` child. No network, worker, external file path or installed package is used.

## Availability and explicit operations

The returned handle exposes `available`, `writable`, `reason`, `durability`, `list`, `save`, `restore` and `remove`.

- Missing or denied OPFS returns `available:false`, `writable:false` and a reason. Operations reject with that reason.
- A readable root without Web Locks is explicitly read-only. Existing backups can be listed and restored. No directory is created in this mode, and save/remove reject. There is no unsafe write fallback.
- With Web Locks, a named origin-wide exclusive lock serializes every save and remove, including across tabs and distinct store handles. Reads use the same lock in shared mode. Quota, permissions and actual file operations can still fail; API availability does not guarantee a successful write.
- Saving is an explicit caller action. The UI must disclose that a save rotates two retained generations. No timer, case-change listener or automatic save exists in this module.
- Removal is an explicit destructive caller action. The UI must obtain its own confirmation. It deletes only the two hashed slot names for that case, including damaged slots. Other files and cases remain untouched. Filesystem deletion is not transactional; an error reports `removedSlots` if removal stops partway.

```js
const backups = await PBGC.createOPFSBackupStore();
if (backups.writable) {
  const saved = await backups.save(caseData); // Requires complete readback verification.
  console.log(saved.generation);
}
const listing = await backups.list();
const recovered = await backups.restore(caseId); // Latest verified generation, or null.
const older = await backups.restore(caseId, { generation: 2 });
// Review before persisting recovered.caseData into the normal case store.
```

`save(caseData)` captures a detached snapshot before asynchronous operations, validates the case and every original source hash, and returns `{caseId,caseKey,generation,savedAt,slot,caseHash,replacedGeneration,damagedSlots}` only after complete readback succeeds. The original input is not modified.

`restore(caseId,{generation?})` returns `{caseData,generation,savedAt,slot,caseHash,recoveredFromDamage,damagedSlots}`. It verifies the slot checksum, all metadata, the case package checksum, case schema and every retained source hash. A missing case returns `null`. An unavailable requested generation, all-damaged case or generation conflict throws. Restore never automatically replaces an active case.

`list()` returns:

```js
{
  cases: [{
    caseId, caseKey, name, latestGeneration,
    generations: [{ generation, savedAt, slot, caseHash }],
    damagedSlots: [{ caseKey, slot, reason }],
    status: 'verified' // or 'recoverable-damage' or 'conflict'
  }],
  damaged: [{ caseKey, slot, reason }],
  conflicts: [{ caseKey, reason }],
  ignoredEntries: ['unrelated-file-name']
}
```

Every reported generation is fully verified through the case codec. Entirely damaged cases appear in `damaged`, without an invented case ID recovered from untrusted bytes. Conflicted cases have `latestGeneration:null`; the module does not select or overwrite either slot. Unknown files are named in `ignoredEntries` and are never opened or deleted. Enumeration limits fail rather than presenting a truncated healthy listing.

## Two-slot format and interruption behavior

A case key is SHA-256 of the UTF-8 JSON string representation of its case ID. JSON encoding preserves distinct lone-surrogate IDs that plain UTF-8 replacement would conflate. Raw IDs never enter a path. Each case has at most these two recognized files:

```
<64-hex-case-key>.slot0.json
<64-hex-case-key>.slot1.json
```

Generation one uses slot one, generation two uses slot zero, and later explicit saves alternate. Each successful save may replace the older retained generation; no third file or unbounded history is created. Valid paired generations must be consecutive and share the same case identity. Slot parity, timestamp and generation bounds are checked. Conflicting valid generations fail closed. If the latest slot is damaged, restore can return the other verified slot and explicitly reports the damage. Saving may repair the damaged slot while preserving the valid one. When neither existing slot verifies, saving refuses; damaged files require deliberate removal after the user preserves any available recovery evidence.

The outer JSON envelope has format `pbgc-rag-opfs-slot`, version one, algorithm `SHA-256`, a checksum and a string payload. The checksum covers the complete payload containing `{schemaVersion:1,caseKey,caseId,generation,savedAt,caseEnvelope}`. The existing case codec remains embedded unchanged. Slot checksums establish integrity, not authenticity or factual correctness.

The target is always the slot opposite the latest verified generation. Write, close or readback failure never targets that latest slot, so the previously verified generation remains. A failed write can leave a damaged target, which subsequent listing advertises. A readback interruption can also leave an unconfirmed but complete target; a later independent read may verify that target afresh. Failure is never reported as confirmed save success.

Each slot is limited to 64 MiB of UTF-8 file bytes, checked before reading content and before writing. At most 1,000 case keys and 2,100 total directory entries are accepted. Plain JSON case snapshots are bounded to depth 40 and 1.5 million nodes; accessors, hidden properties, sparse arrays, cycles and unsafe keys fail before serialization. Existing source and package limits also apply. No automatic schema migration occurs.

## Verification

Run `node --test --test-isolation=none tests/opfs-backup.test.js`. Twelve synthetic tests use the actual package/source-integrity codec and injected filesystem/lock adapters. They cover two-slot rotation and older-generation restore, write/close/readback interruption, visible damage and fallback, two-case isolation, raw-path/lone-surrogate IDs, outer and original-source tampering, unavailable APIs, read-only no-lock behavior, concurrent handles, generation conflicts, unsafe data, size/case-count bounds and ignored files.

These module tests do not establish actual `file://` OPFS availability, enterprise permission behavior, quota reliability or Windows acceptance. Browser integration must test its current origin and display the real availability/failure reason.
