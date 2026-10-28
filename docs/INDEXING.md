# Incremental import and checkpoint contract

`js/indexer.js` supplies `PBGC.importFiles(caseSnapshot, files, options)` and `PBGC.importLimits`. Load the parser and case-integrity modules before calling it. It uses local browser APIs only: no server, network, model, worker, or runtime installation.

```js
const controller = new AbortController();
const result = await PBGC.importFiles(capturedCase, Array.from(fileInput.files), {
  signal: controller.signal,
  previousManifest: savedManifest, // omit for a new session
  onProgress(event) { /* update status with textContent */ },
  async onCheckpoint({ caseData, manifest }) {
    // Store complete validated snapshots. Keep the manifest SEPARATE from the case.
    // Save both through the application's approved local persistence mechanism.
  }
});
```

The return shape is `{caseData, manifest, imported, skipped, errors, cancelled}`. The supplied case is captured before the first asynchronous operation, verified through package export/import, and never mutated. The selected array is captured as an array of local File references. Each file's actual bytes are captured once, hashed with SHA-256, and passed unchanged to the parser. Files are processed sequentially. Existing hashes deduplicate content even if filenames differ. New content using an old filename is imported as a distinct source; it never silently replaces earlier evidence.

## Checkpoint and resume

The separate manifest is versioned:

```js
{
  schemaVersion: 1,
  kind: 'pbgc-import-checkpoint',
  caseId: 'case-a',
  caseHash: '<SHA-256 of JSON.stringify(caseData)>',
  checkpoint: 3,
  entries: [{
    name: 'plan.txt', relativePath: 'reference/plan.txt', size: 123,
    hash: '<SHA-256 of actual original bytes>',
    sourceId: 'src-<hash>', status: 'imported' // or duplicate/error
  }]
}
```

An error entry may have `hash:null` if the file could not be read and fingerprinted. An error may add a bounded `message`. Invalid selection metadata is reported in `errors` without exposing its original path and is not entered into the checkpoint.

A resume must receive the exact checkpoint case snapshot and its manifest. Different case IDs, edits since checkpoint, missing prior source hashes, malformed manifests, unsafe paths, unsupported schemas, and counters/budgets that cannot accommodate the batch fail before any selected file is read. Source bytes are still hashed on replay; names and timestamps are never trusted as content identity. Replayed successful files are deduplicated and original imported status is retained in the manifest. Unsupported or failed files may be retried. A caller may safely start a new session without an old manifest when the case has deliberately changed.

**Do not put this manifest into the case it hashes.** That creates a changing/circular hash contract. Store or export the case package and the separate manifest together in the application persistence layer. The manifest hash binds state for consistency, not authentication; an attacker can recompute hashes. Source-byte hashes and case schema are additionally verified by package operations.

Checkpoints represent only complete validated files and case state. Every source addition passes case schema, source-byte verification, record limits, and the working-case size cap before promotion. `onCheckpoint` receives detached copies after each completed readable attempt, including duplicate or rejected-format attempts. No partial parse output enters a case. Existing parser versions are retained with their original source; automatic parser-version migration/reindex is not implied by content deduplication.

## Cancellation and errors

Call `controller.abort()`. Cancellation is checked before a read, after hashing, before/after parsing, and after candidate integrity validation. In-flight uncommitted output is discarded. Completed source checkpoints remain in the result. The browser gets an event-loop yield before each read so progress and cancellation controls can run. Individual parsers remain synchronous where implemented; this does not claim mid-parser CPU interruption or streaming large-file parsing.

Progress stages are `hashing`, `parsing`, `complete`, `rejected`, `finished`, and `cancelled`. Events include processed/total counts, imported/skipped/rejected counts, current safe relative file metadata, and the case ID. Final cancellation reports the actual processed count. The UI should capture the target case and prevent conflicting mutations while applying checkpoints.

A malformed/unsupported file adds an error and preserves prior imports; later files continue. Input case corruption, stale checkpoints, and invalid options fail the overall operation. A progress or checkpoint callback failure stops the operation with `ImportCallbackError`. Its `.result` contains the latest detached, verified memory state, and `.cause` identifies the callback error. **Checkpoint persistence is unconfirmed** after a callback error; the caller must retain/export the recovery result or retry persistence, rather than imply the disk write succeeded. Sources parsed later are not attempted after a callback failure.

## Resource and privacy limits

- At most 1,000 selected files; at most 16 MiB per source before reading.
- At most 32 MiB of serialized working-case text. Case schema also enforces 1,000 total sources and 100,000 records.
- At most 2,000 manifest entries and 3 MiB of serialized manifest text. Capacity for the selected batch is checked conservatively before work.
- Relative directory paths only, at most 1,000 characters and 32 path components. Absolute paths, drive prefixes, traversal components, backslashes and control characters are rejected. Parent paths are never inferred from local files.
- Imported macros/scripts/formulas are not executed; the parser registry's supported-subset restrictions remain in force.

Run `node --test --test-isolation=none tests/indexer.test.js`. Synthetic tests cover actual hashes, immutable snapshots, resume with changed bytes, renamed duplicates, cancellation, path privacy, unsupported formats, callback recovery, byte/selection/case bounds, stale/foreign manifests, and malicious accessors. Actual browser integration and file-origin acceptance remain separate coordinator checks.
