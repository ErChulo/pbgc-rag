# Acceptance evidence — development increment 0.4.0

As of October 28, 2026. **Overall acceptance: NOT COMPLETE.** Passing a supported subset does not pass the full requirements in KICKOFF.md. All fixtures are synthetic. Current-instance verification and saved startup configuration do not establish publication or restoration in a new task.

## Executed checks

| Check | Outcome | Evidence and limits |
|---|---|---|
| Module and integration suite | PASS | `npm test`: 215 actual tests, 215 passed, zero failures/skips; Node test isolation disabled to expose all tests in this sandbox |
| Original text/structured file parsing | PASS for supported subset | Exact line/cell/JSON pointer/XML paths, encoding, hash/original bytes, malformed input, inert HTML and limits |
| DOCX/XLSX/XLSM | PASS for supported subset | ZIP CRC/expansion/path/encryption checks; main body, supported headers/footers/footnotes/endnotes, cells/shared strings/formulas; original/package round trips; does not establish arbitrary Office fidelity |
| PDF | PASS for supported subset | Pinned audited PDF.js 6.4.299, embedded synthetic TrueType, explicit ToUnicode, xref streams, page/text-item geometry, original/package round trips; conservative decoded-stream/literal/item bounds; no fetch, Worker, font-face or CSP violations in browser; no OCR, object streams, unsupported filters or exact glyph-box claim |
| SQLite | PASS for supported subset | Real Python-generated DB fixtures: interior/overflow pages, UTF-8/UTF-16 boundary splits, split serial headers/int64 values, blobs, quoted INTEGER rowid aliases, page ownership and malformed chain rejection; exact payload segment locators; unsupported storage rejects |
| Search and SQL | PASS for restricted languages | Keyword/exact, 2,048 regex reference comparisons, mutation/injection rejection, aggregate budgets; real 100 KiB line/50,001/100,000-record inputs retrieve final unique citations; 100,000/2 MiB/32 MiB query caps align with the working profile |
| Natural-language question retrieval | PASS for lexical method | Full/partial/insufficient coverage, original citations, negation/numerics retained, unrelated questions abstain; no model, semantic or generated-answer acceptance |
| Temporal graph and claims | PASS for defined contracts | Source and case membership, bounded/cyclic traversal, overlapping typed values, date/group separation, unresolved provenance-linked differences |
| Portable cases | PASS | Envelope and original-byte hashes, malformed schema/unsafe objects, foreign references, altered calculations and invalid claims reject |
| Rule gates and arithmetic | PASS for synthetic behavior only | Explicit simulated human approval; independent 60000 × 10 × 0.015 = 9000 annual / 750 monthly; exact rational rounding; official release always blocked |
| Reviewed reindex lifecycle | PASS for supported parser changes | Retained originals reparse; exact and unique text/locator/field mappings update graph identities/endpoints, rule and claim citations together; explicit review, case/plan hash binding, stale/unmatched/ambiguous refusal and unchanged approved state; actual Chromium reindex suite PASS |
| Case persistence | PASS for tested paths | Atomic IndexedDB probe/write/reopen; healthy cases survive another damaged current case; older verified checkpoint restores as new revision; explicit history prune, ambiguous metadata rejection and memory fallback; actual Chromium recovery suite PASS |
| Reference libraries | PASS for implemented lifecycle | Separate schema/database/packages, authorized original import, source-only copies into two cases, pinned provenance, updates leave cases unchanged, no rule/graph/approval transfer; actual Chromium library suite PASS |
| Incremental indexing | PASS at complete-source boundaries | Hash dedupe, atomic case/import-manifest checkpoint, cancellation discards in-flight output, reload/resume skips unchanged parsing, stale-manifest rejection and relative directory paths; actual Chromium import suite PASS. No mid-parser interruption claim |
| Accessible SVG graph | PASS for tested behavior | Deterministic bounded display, explicit omissions, source provenance, click/Enter/Space selection, focus/themes, inert hostile labels; actual Chromium graph suite PASS |
| Optional OPFS backup | PASS for tested browser origin | Native OPFS/Web Locks, two rotating generations, readback validation, independent IDB deletion/recovery, visible corruption/fallback, explicit removal preserving case, no-API/denied/no-lock fallbacks; portable exports remain available. Actual file-origin OPFS remains unverified |
| Internal reviewer ZIP | PASS | Stored-only bounded ZIP; CRC/SHA/case/source checks; exact originals with passive suffix, escaped report/valid anchors, safe inventory CSV; regeneration rejects forged/tampered content. Python ZIP interoperability and browser export/delete/reload/restore pass. No official-format claim |
| Reports | PASS for internal layouts | Escaped standalone HTML, source hashes/locators/anchors, timelines, unresolved conflicts, blocked official status; JSON/HTML artifacts do not emulate official templates |
| Targeted accessibility regressions | PASS for 30 checks | Real Chromium keyboard/skip/focus, named controls, narrow-screen reflow and unobscured controls; five original failures fixed. Windows, screen readers, exhaustive zoom/contrast and full508 remain unrun; see docs/ACCESSIBILITY_AUDIT.md |
| Contrast and branding tokens | PASS for tested CSS pairs | Actual dark/light text >=4.5:1 and tested control boundaries >=3:1; palette/local assets/placeholder assertions. This is not a complete accessibility audit |
| Secondary Chromium UI | PASS | `PBGC_HTTP_CHECK=1 npm run test:browser`: source import/search, binary inputs, graph links/traversal, proposal/claims, package/HTML downloads and recovery, IndexedDB reload, memory fallback, inert hostile markup, theme toggle, cancel/navigation/demo race regressions; zero external HTTP/HTTPS/WebSocket attempts |
| Real file-origin app execution | BLOCKED | `npm run test:browser`: `net::ERR_BLOCKED_BY_ADMINISTRATOR`; managed Chromium URLBlocklist excludes file scheme. HTTP is not a substitute. No policy bypass |
| Real file-origin standalone reports | BLOCKED | Same managed file navigation denial; Node artifact tests and secondary HTTP rendering do not pass file acceptance |
| Upstream study | PASS for inspection | HTTPS clone through existing proxy, exact RAG-Anything 2cd2b3329c470ccb53923f8a6d320596b34e56c5, MIT, dependency/architecture inventory; no upstream runtime/transitive security acceptance |
| Environment configuration | SAVED, unpublished | `start_skill` persisted through configuration draft; no install script needed for the committed local runtime. User publication and fresh-task restoration not performed |

## Required gates not passed

| Gate | State |
|---|---|
| Windows 11 enterprise browser actual file operation and storage policies | BLOCKED: policy/evidence unavailable; current cloud file navigation denied |
| Approved versioned data_dictionary_complete.xlsm and official fields | BLOCKED: not supplied/validated |
| Official BSRS syntax, validator and scenario coverage | BLOCKED: not supplied |
| Original official R1/R5/DEL/PF/V1/436/review templates, authorized mappings and structural/numeric comparisons | BLOCKED: not supplied |
| ATPBGC functions, mortality/interest/limits/BCV equivalence and independent actuarial acceptance | BLOCKED: authoritative specs/results and approval not supplied |
| Full native parser coverage across all required formats and variants | INCOMPLETE engineering; legacy DOC/XLS, OCR and many binary variants unsupported |
| Local semantic inference/natural-language answer synthesis | INCOMPLETE; source-only lexical question retrieval works, no model assets or inference engine bundled |
| OPFS/schema migrations, worker-level interruption and broad large-file/performance acceptance | INCOMPLETE engineering; separate reference lifecycle, relative folder input, atomic complete-source checkpoints/resume and checkpoint recovery are now tested |
| Full domain ontology/authority/amendment/applicability reasoning | INCOMPLETE; provisional internal labels and overlap screening only; no legal priority adjudication |
| All requested chart/graph/report layout and official artifact functions | INCOMPLETE; internal evidence reports/timelines/layouts and bounded graph query exist |
| Comprehensive 508/WCAG, enterprise security, 16 GB CPU-only resource acceptance and final package E2E | NOT RUN / INCOMPLETE; targeted contrast, hostile-input and browser checks are narrower |

No official benefit determination, PBGC endorsement, complete parser coverage, complete application delivery, or workplace readiness is claimed.

Current PDF runtime audit: exact npm SHA-512, original source hashes, self-contained bundle hash and complete license notices are recorded in vendor/pdfjs/PROVENANCE.json. The portable ZIP verifies these vendor hashes plus every shipped file and refuses missing/nonlocal static assets. Original audited upstream whitespace is retained.

Increment 0.3 integration: all seven secondary HTTP browser scripts pass (main, recovery, imports, libraries, graph, accessibility and reindex). Reindex browser coverage includes SQLite overflow import and retained citation/proposal integrity. PDF extraction adapter1.1.0 fixes per-load font-handle drift using deterministic document-local resource IDs; repeated/concurrent/full-source parsing and reindex no-op tests pass. Source glyph geometry remains unchanged and exact glyph bounds remain unclaimed.


Increment 0.4 integration: 215 module/integration tests and all ten secondary HTTP browser scripts pass. The two reproduced query-count and restored-graph provenance defects in docs/REMAINING_GAPS.md are closed by actual browser regressions. Large-record previews are bounded and preserve exact full citations; scalar SQL retains a complete downloadable result. Aggregate text validation, linear/canonical Base64 decoding and expanded envelope accounting pass a real approximately 10 MB source round-trip whose encoded envelope exceeds the old 49 MiB limit. Export captures data before async hashing; hidden/sparse/altered-array-prototype data reject without executing hooks.

A shared-string workbook amplification fixture rejects at the extracted-text budget before case serialization. Native OPFS tests cover fully damaged backup removal for the active verified case, partial damage recovery and no-lock/denied fallback. A test initially raced asynchronous backup-list rendering; the corrected check waits for both verified generations, and the UI now exposes aria-busy while loading. Current-only checkpoint pruning is explicit even below four revisions, so larger cases can free retained-history capacity without deleting current data.

The required cloud file-origin check still returns ERR_BLOCKED_BY_ADMINISTRATOR. A user-side approved Windows synthetic deployment check has been requested; the user said they can test, but no observed browser/version/result has been supplied yet. This is pending, not a pass. The SheetJS three-domain settings draft is saved; current maintained-source access remains blocked until applied and rechecked.

Development fix 0.4.1 adds adjacent search-to-graph action feedback and explicit duplicate/refusal behavior. Brave user observation confirms demonstration search/citations; no Brave version or successful graph action was reported, so full local-file acceptance remains pending. See PROGRESS.md for regression scope.

Development fix 0.4.2: measured node text fits within node bounds. Playwright checks cover long/wide/Unicode labels, full accessible labels, dark/light themes and small screens. Graph, main workflow and 30 accessibility checks pass over HTTP. This does not replace Brave/local-file acceptance.
