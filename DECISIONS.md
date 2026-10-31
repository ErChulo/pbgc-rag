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

## Source review and GitHub integration

- The user explicitly authorized commit, push and merge to the repository. Verify origin and source-only payload, use non-force fast-forward integration, and preserve remote changes. GitHub main was advanced to the passing 0.2.2 commit 64d18a8. Environment publication remains out of scope.
- Retain source-only case v1 compatibility and use case v2 for persisted source-bound review state. Reparse originals before trusting maps/annotations; reviewed metadata is a local human claim, never authenticated official approval.
- Exact source/mapping/content/version must match the visible saved review target. Unsaved edits cannot receive review of an older hidden scope. Edits reset review; unknown authority/dates/group or conflicts cause abstention.
- Preserve original field names/int64 values; no schema/type/legal inference. Generic template outputs remain nonofficial and require authorized-part/anchor/hash/numeric checks in an isolated worker.
- Own development server/child lifecycles in one Playwright supervisor; run actual-file checks separately and never change managed browser policy. CI artifacts are limited to synthetic evidence and source builds.

## Offline local RAG model boundary — 0.4

Authoritative PBGC content remains deferred by user direction. Implement local learned retrieval and real CPU generation using synthetic fixtures. The browser never downloads models: the core ZIP embeds the verified MIT Ternlight sentence encoder and single-thread wllama runtime; the Apache-2.0 Qwen GGUF is a separately prepared, exact-hash local file. No model input is imported as a case source. CSP grants only narrow WebAssembly compilation in addition to existing local scripts and Blob workers, retaining connect-src none. Citation quotes, numbers and conservative synthesis checks gate release; those checks do not prove legal applicability or semantic entailment. Missing models, unsupported evidence, conflicts, cancellation and deadlines abstain explicitly. Generation quality and latency must be measured with real weights independently of mock orchestration tests.


## Complete office delivery boundary — 0.4.1

A core source ZIP plus an outside download/preparation command is not an office deliverable. The public release must contain one complete ZIP with the exact verified GGUF and all local assets. Native model-file selection inside the app is permitted; a browser cannot silently open adjacent arbitrary files under the file profile. Do not require users to assemble model parts or run developer tools. Publish the ordinary downloadable release only after extracted-package real offline-file inference passes on Ubuntu and Windows. Test the actual delivered bytes before reporting completion.
