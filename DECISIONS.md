# Decisions

- 2026-10-30: Start from the actual documentation-only repository; no earlier implementation was present to reapply.
- Use classic local scripts, not ES modules or fetch, for the workplace shell. No runtime dependencies or remote assets.
- Schema v1 stores original source bytes as base64 plus SHA-256 and parsed records. Restore discards supplied derived records and reparses verified bytes. Export is a case package, never an official artifact.
- Bound synchronous parsing/search tightly; expose keyword/exact only. General regex remains unavailable until bounded isolated execution exists.
- Treat file:// recovery storage as best effort. Portable exports remain necessary. Plaintext packages are not authenticated or encrypted.
- Reject binary formats and invalid UTF-8 explicitly. JSON pointers do not pretend to be source line locations; duplicate keys use native last-value behavior with a warning.
- Pinned upstream source/license/architecture inspection is complete. Keep Python-based upstream out of the mandatory workplace runtime; optional reuse still requires resolved dependency, security and runtime offline audits.
- Managed Chromium file:// policy must not be bypassed. Supplementary HTTP browser evidence is recorded separately from mandatory file:// acceptance.

## Increment 0.2 — October 30, 2026

- Isolate binary parsing in local Blob workers rather than synchronous UI work. Parent deadlines hard-terminate workers; missing worker policy fails binary imports explicitly. Small text retains a limited deterministic fallback.
- Implement dependency-free bounded Office ZIP/XML, legacy CFB/BIFF and SQLite table extraction. Reject unsupported variants; never imitate format fidelity or calculate cached spreadsheet formulas.
- Ship PDF.js 6.4.299 only as pinned licensed local bundles, wrapped in a dedicated parser worker. Disable eval, external assets, XFA and active content; no OCR/precise glyph-bound claim. Workers do not enforce an OS memory quota.
- Provide safe regex state simulation and a strict record-SQL subset with deterministic budgets. Provide BM25 lexical fallback with transparent scores; do not label it semantic inference.
- Keep documentary graph links and proposed user annotations distinct. Source-binding validation is required for restored graphs; no user link is approved automatically.
- Use catalog schema v2 for isolated cases/library/checkpoints, but retain source-only case package v1 compatibility. Explicit reviewer packages retain source-bound report/graph annotations.
- Regenerate reviewer artifact text after source verification when importing a reviewer package. Matching attacker-recomputed hashes alone are insufficient evidence of a generated draft.
- Use exact BigInt rational arithmetic only for explicitly synthetic module tests; keep calculations off the UI until a real approval/source workflow exists. No material actuarial rule has been proposed or activated.
- Keep final file://, enterprise performance and official artifact acceptance blocked where evidence/authoritative inputs are absent. Do not treat successful Linux HTTP browser tests as workplace approval.
