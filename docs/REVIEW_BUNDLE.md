# Internal reviewer bundles

`js/review-bundle.js` creates and verifies a complete local research bundle. It uses the existing case codec and internal report layouts. It makes no network requests and installs no dependencies. Browser load order is `artifacts.js`, `reports.js`, then `review-bundle.js`; load `ontology.js` before calling either API when the case contains claims.

```javascript
const { bytes, manifest } = await PBGC.createReviewBundle(caseData, {
  layout: 'review' // or 'evidence'; default: 'review'
});
const { caseData: verifiedCase, manifest: verifiedManifest, validation } =
  await PBGC.verifyReviewBundle(bytes);
```

`bytes` is a `Uint8Array` containing a stored-only ZIP. Verification accepts a `Uint8Array`, including a Node Buffer or sliced view. Case data and options are captured before creation's first await. Verification copies the archive before its first await, including Buffer inputs. Concurrent caller mutations cannot change the operation's snapshot. Neither API modifies the caller's case or archive.

These are **internal, provisional** review artifacts. Both manifest and validation always state `official: false` and `release: 'BLOCKED'`. No official R1/BSRS/template fidelity, benefit determination, legal priority, or authenticated human approval is implied. Original files, extracted text and self-recorded approvals remain untrusted evidence.

## Archive contents

| Path | Content |
| --- | --- |
| `case.json` | Portable case envelope, verified with the existing case codec, including original-byte hashes |
| `review.html` | Standalone escaped, script-free internal report with no-network CSP, precise locators, hashes and internal evidence links |
| `review.json` | Provisional machine-readable review, unresolved claim differences and official release gates |
| `source-inventory.csv` | Source IDs, names, hashes, formats, byte/record counts and passive original paths |
| `originals/<sha256>.original` | Exact original bytes; original source names are metadata, never archive paths |
| `manifest.json` | Versioned file hashes, case/layout identity and source mapping |
| `README.txt` | Review instructions and integrity/official-status limitations |

Every field in the inventory is CSV-quoted. Formula-leading source metadata, including formulas after whitespace and leading tab/newline characters, gets an apostrophe prefix. The original name is preserved unchanged in the case and manifest. CSV quoting alone is not treated as formula neutralization.

Originals retain a passive `.original` suffix even when their content is macro-bearing Office, active HTML or another executable format. Bundling never executes originals, follows their links, or restores their active extensions. Review original files only through an approved local workflow. Source filenames containing slashes, markup or formula text do not become ZIP paths.

## Manifest contract, version 1

The manifest has exactly these keys, in this order:

- `format`: `pbgc-rag-internal-review-bundle`
- `version`: `1`
- `caseId`: the case ID
- `caseHash`: SHA-256 of the exact UTF-8 `case.json` entry bytes; the envelope's inner payload hash remains independently verified
- `layout`: `review` or `evidence`
- `official`: `false`
- `release`: `BLOCKED`
- `disclaimer`: the module's fixed integrity disclaimer
- `sourceMap`: one `{sourceId, sourceHash, originalName, path, size}` object per case source, in case source order
- `files`: one `{path, size, sha256}` object per other ZIP entry, in creation order

`manifest.json` cannot hash itself. Its ZIP CRC is checked, and its complete canonical bytes are regenerated from the verified case and all expected file hashes. Canonical manifest encoding is UTF-8 JSON with two-space indentation and a final newline, as emitted by this module. Duplicate JSON keys, unknown keys, alternate encodings and reordered descriptors are rejected. There is no implicit format migration.

`files` covers every archive entry except the manifest exactly once. Original paths and source IDs must match their case hashes. Missing entries, extra entries and cross-case substitutions fail. The `caseHash` binds the exact case-envelope bytes; it is not an identity signature.

## Verification

Verification checks the ZIP envelope before processing its JSON:

1. Enforce size/count limits, single-disk EOCD and exact directory bounds. Reject trailing bytes, comments, ZIP64 and unlisted data.
2. Accept only stored regular files with version-needed 20 and flags 0 or UTF-8 (`0x0800`). Reject encryption, compression, data descriptors, extras, symlinks and directories.
3. Accept only the fixed paths above. Reject duplicate, absolute, traversal, backslash, whitespace/control and unexpected paths.
4. Require local/central agreement for names, flags, versions, methods, timestamps, sizes, CRCs and offsets. Entries must occupy contiguous nonoverlapping local ranges.
5. Check every CRC-32, manifest entry size and SHA-256. Import the case through the existing codec, including all original source hashes and case/schema/claim validation.
6. Regenerate HTML, JSON review, safe CSV, README and exact original bytes from that verified case and selected layout. Recompute the expected manifest and compare it and its canonical bytes. Merely recomputing archive CRCs and manifest hashes after forging a report does not pass.

A successful `validation` contains `valid: true`, case validation warnings, `fileCount`, `sourceCount`, `official: false` and `release: 'BLOCKED'`. Failure rejects the promise. No partial bundle or partial verification success is returned.

Hashes detect corruption and internal inconsistency. They do not authenticate authorship, sources, reviewers, extracted text or interpretations. An actor who replaces the entire case and every derived artifact consistently can create a different internally valid bundle. Verify case identity and authority through the approved human workflow.

## Bounds and compatibility

- ZIP size: at most 128 MiB, at most 1000 sources and 1006 entries.
- Manifest and inventory: at most 4 MiB each; README: 8 KiB; each original: 16 MiB; each HTML/JSON report: 64 MiB.
- Existing case limits still apply. Existing report limits are enforced before bundle creation: 5000 records and 4 MiB of rendered-content accounting, plus the final HTML bound. Oversize cases must be split explicitly; records are never silently omitted.
- CRC and SHA verification cover bounded stored bytes; decompression is never attempted. The archive-size limit is not a claim that peak JavaScript memory use is only 128 MiB. Input snapshots, decoded cases and regenerated reports also occupy memory.
- ZIP members use fixed DOS date January 1, 1980 during creation. Verification also accepts ordinary ZIP timestamps when local and central records agree.
- Verification regenerates the current version's internal reports and README. A report-renderer change can cause an older bundle to fail regeneration. Preserve a matching reviewed runtime for archival verification; no backward-compatible renderer migration is claimed.
- Actual `file://` browser operation remains subject to enterprise policy. Passing Node and ZIP interoperability checks does not pass workplace browser acceptance.

## Tests and independent ZIP interoperability

Run `node tests/review-bundle.test.js` or the integrated `npm test`. Tests cover real parser output from hostile HTML and a synthetic macro-bearing XLSM archive, exact original bytes, CSV formula neutralization, snapshots, structural attacks, CRC/SHA tampering, rehashed report forgery, cross-case substitution and canonical manifests. Tests require Node only; Python is not a product or test-suite runtime dependency.

An additional development-only check used Python's standard-library `zipfile`: it read a generated synthetic bundle, passed `testzip()`, confirmed all seven entries were stored, and repacked the exact entry bytes. `verifyReviewBundle` accepted that Python-produced archive. This establishes ordinary ZIP interoperability for the tested fixture, not official artifact acceptance. The check used fixed temporary paths and direct subprocess arguments, with no user metadata interpolated into shell or Python code.
