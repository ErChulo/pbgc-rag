# Progress

## Case-review increment — build 0.3

Continued autonomously with source-bound field dictionary mapping, evidence observations and exact-content human review claims, conservative conflict/abstention checks, typed read-only source-table queries, isolated mapped DOCX/XLSX test generation, and version 2 case persistence. Source-only v1 imports remain compatible. Reports/graph links, dictionary bindings, explicit headers and annotations revalidate against original source bytes on reload/import. Unknown schemas or forged review/source fields reject before case mutation. Official release remains disabled.

Added a lifecycle-owned Playwright supervisor and GitHub Actions verification. The supervisor scans source, owns its loopback server, runs all tests, propagates failure and cleans up without manual checks. CI also tests real file URLs on its own browser. The managed local Chromium restriction remains; no browser policy was bypassed. Test/CI evidence is browser-specific, not Windows enterprise approval.

Coordinator final full verification: 181 PASS, zero FAIL, zero skipped across 29 files. Durable evidence: docs/evidence/review-0.3.json and .log.

Independent review found and fixed empty-startup recovery blocking, unsaved scope/mapping review mismatches, private cross-case drafts and selected-evidence loss on autosave. Bulk annotation validation now builds the source index once, avoiding repeated indexing for each fact. Generic template rendering has hard worker timeout/cancellation and never falls back to the UI thread.

GitHub: the audited passing 0.2.2 commits were pushed to codex/offline-casework-0.2.2 and fast-forwarded main to 64d18a8 under the user's explicit push/merge authorization. The passing 0.3 source increment uses codex/source-review-0.3 for integration. The initial automatic push review was cleared after source/destination audit; no confidential files or actual official templates/dictionaries are committed. GitHub API calls are restricted here; Git transport works. No environment publication is authorized or performed.

Remaining official acceptance still requires authorized dictionaries/definitions, original official templates/maps, BSRS grammar/validator, actuarial reference data and reviewed legal interpretations. Generic mappings, unauthenticated reviewer claims and synthetic arithmetic do not establish those official inputs or results. Continue independent engineering/automation; do not ask the user to perform checks available to Playwright.

## Automated restore verification — build 0.2.2

The user asked to stop the manual walkthrough and use Playwright. Playwright reproduced the UX problem: a successful same-file restore left an empty picker and two identical case labels, with feedback only in the distant global status. Restoration itself preserved the source data.

Fixed adjacent restore feedback with the chosen filename, active copy, document/excerpt counts and a Search restored case action. Pending, error and cancellation feedback is local to the picker. Duplicate case names receive distinct display labels while stored names and source bytes remain unchanged. Workspace changes clear stale restore summaries.

Independent Playwright verified the extracted 0.2.2 package through repeated same-file restores, search, original-data/export integrity, tamper rejection and cancellation with no mutation on failed restore. Coordinator ran the full automated suite: 124 PASS, zero FAIL across 21 files. Two older PDF/legacy assertions were updated to verify readable default locations and exact locators inside Source details. Evidence: docs/evidence/automated-restore-0.2.2.json and .log. Tests use supplementary Chromium HTTP; the user's live Firefox session is not connected, and local Firefox automation is unavailable here. No manual walkthrough is required for the tested flows. No publication or push performed.

## Reading view correction — build 0.2.1

User feedback during the guided manual check identified hashes and raw JSON locators dominating source reading. The default source list, search results, graph excerpts and evidence dialog now use readable locations (for example, Line 2, Paragraph 7 or Sheet · Cell B2). File fingerprints, parser versions, exact locators and extraction warnings remain in collapsed Source details. Original sources, hashes, parser output, package schemas and export validation are unchanged. Evidence dialog scrolling and selected-excerpt spacing were simplified.

Targeted independent and coordinator checks cover hidden-by-default/revealable metadata, readable locations, byte-preserving source/package export, Office/SQLite citations, graph/report recovery and both-theme accessibility. A separate extracted-package check verifies the added local presentation asset. No publication or push performed. Guided walkthrough remains paused at the user's request.

User-reported manual evidence now confirms a basic file:// workflow in Firefox on the user's Linux computer: entry, synthetic example, keyword result and selected evidence dialog. This narrows the earlier file-profile uncertainty for those specific checks; it does not establish Windows enterprise, binary import, recovery or network-isolation acceptance. Managed Chromium here remains blocked by its administrator policy.

## Latest integrated milestone — build 0.2, October 30, 2026

Continued from tested foundation commit 37226b7 without resetting prior work. Added bounded worker-isolated extraction for PDF, DOC/DOCX, XLS/XLSX/XLSM, SQLite, HTML/XML and existing text; transparent BM25, safe regex and strict record SQL; exact supported evidence locators/source viewing; bounded source-bound graph traversal/proposed temporal links; case/reference-library isolation; IndexedDB/localStorage/memory recovery with prior snapshots, verified backups and resumable checked-source checkpoints; provisional R1/internal BSRS, report layouts/timelines/HTML/formula-safe CSV, verified reviewer packages and portable ZIP tooling.

Original bytes/hash integrity remain central. Failed imports/cancellation do not activate partial data. Restored reviewer artifacts are regenerated from verified sources, not accepted from matching hashes alone. No document scripts/macros/formulas or uploaded SQL execute. Proposed links/dates are unverified; no material legal/actuarial rule is approved automatically. Generic exact arithmetic stays module-only and explicitly synthetic.

Parallel agents implemented independently owned modules; a separate verifier extended browser/security/accessibility/workload/packaging evidence. Cross-review found/fixed nested Word table, CDATA/BOM and graph locator-identity bugs. Coordinator independently reran the final full suite: 121 tests PASS, zero FAIL across 19 files. Separate actual file:// entry remains administrator-BLOCKED. Evidence is durable in docs/evidence/; HTTP results never substitute for workplace acceptance.

A synthetic 18,000-record 1.89 MB case completed coordinator import/search/graph/export in 3.65 seconds; renderer-heap scope excludes workers/native/whole-process peaks. ZIP extraction independently verifies all packaged hashes/assets and actual worker execution. See ACCEPTANCE.md and docs/PERFORMANCE.md for limits. Portable build: run `python tools/package.py` to generate dist/PBGC-RAG-0.2.zip and manifest.

Pinned RAG-Anything source/license/architecture and PDF.js package/license/build hashes/advisory snapshot reviewed. No Python RAG-Anything runtime imported. No publication or remote push performed.

## Gates for the next official-validation phase

1. Obtain a policy-approved browser/environment allowing actual file:// and actual Windows enterprise/508/resource evidence. Do not bypass managed policy.
2. Obtain authorized authoritative dictionary/templates/maps/BSRS grammar+validator/reference factors and approved interpretations. Do not invent official field names or rule validity.
3. With those contracts, implement/validate dictionary mapping, full approval/ontology/authority/conflict workflows, actuarial calculations and template-preserving official artifacts. These remain unfinished engineering; missing inputs block their authoritative validation.
4. Extend optional semantic/OCR, binary-format/query coverage and malformed-document/resource corpus only with explicit licenses/assets/contracts and honest acceptance limits.

Current build is substantial but not final application acceptance or an official actuarial system. No official release path is enabled. Use only synthetic/public fixtures in this repository and remote development environment.
