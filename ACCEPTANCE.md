# Acceptance evidence — development increment 0.2.0

As of October 28, 2026. **Overall acceptance: NOT COMPLETE.** Passing a supported subset does not pass the full requirements in KICKOFF.md. All fixtures are synthetic. Current-instance verification and saved startup configuration do not establish publication or restoration in a new task.

## Executed checks

| Check | Outcome | Evidence and limits |
|---|---|---|
| Module and integration suite | PASS | `npm test`: 155 actual tests, 155 passed, zero failures/skips; Node test isolation disabled to expose all tests in this sandbox |
| Original text/structured file parsing | PASS for supported subset | Exact line/cell/JSON pointer/XML paths, encoding, hash/original bytes, malformed input, inert HTML and limits |
| DOCX/XLSX/XLSM | PASS for supported subset | ZIP CRC/expansion/path/encryption checks; main body, supported headers/footers/footnotes/endnotes, cells/shared strings/formulas; original/package round trips; does not establish arbitrary Office fidelity |
| PDF | PASS for supported subset | Pinned audited PDF.js 6.4.299, embedded synthetic TrueType, explicit ToUnicode, xref streams, page/text-item geometry, original/package round trips; conservative decoded-stream/literal/item bounds; no fetch, Worker, font-face or CSP violations in browser; no OCR, object streams, unsupported filters or exact glyph-box claim |
| SQLite | PASS for supported subset | Real Python-generated DB fixtures: interior pages, UTF-16, large signed integers, all quoted INTEGER rowid aliases; unsupported storage rejects |
| Search and SQL | PASS for restricted languages | Keyword/exact, 2,048 regex reference comparisons, mutation/injection rejection, actual aggregate operation budgets for regex and LIKE |
| Natural-language question retrieval | PASS for lexical method | Full/partial/insufficient coverage, original citations, negation/numerics retained, unrelated questions abstain; no model, semantic or generated-answer acceptance |
| Temporal graph and claims | PASS for defined contracts | Source and case membership, bounded/cyclic traversal, overlapping typed values, date/group separation, unresolved provenance-linked differences |
| Portable cases | PASS | Envelope and original-byte hashes, malformed schema/unsafe objects, foreign references, altered calculations and invalid claims reject |
| Rule gates and arithmetic | PASS for synthetic behavior only | Explicit simulated human approval; independent 60000 × 10 × 0.015 = 9000 annual / 750 monthly; exact rational rounding; official release always blocked |
| Case persistence | PASS for tested paths | Atomic IndexedDB probe/write/reopen; healthy cases survive another damaged current case; older verified checkpoint restores as new revision; explicit history prune, ambiguous metadata rejection and memory fallback; actual Chromium recovery suite PASS |
| Reference libraries | PASS for implemented lifecycle | Separate schema/database/packages, authorized original import, source-only copies into two cases, pinned provenance, updates leave cases unchanged, no rule/graph/approval transfer; actual Chromium library suite PASS |
| Incremental indexing | PASS at complete-source boundaries | Hash dedupe, atomic case/import-manifest checkpoint, cancellation discards in-flight output, reload/resume skips unchanged parsing, stale-manifest rejection and relative directory paths; actual Chromium import suite PASS. No mid-parser interruption claim |
| Accessible SVG graph | PASS for tested behavior | Deterministic bounded display, explicit omissions, source provenance, click/Enter/Space selection, focus/themes, inert hostile labels; actual Chromium graph suite PASS |
| Reports | PASS for internal layouts | Escaped standalone HTML, source hashes/locators/anchors, timelines, unresolved conflicts, blocked official status; JSON/HTML artifacts do not emulate official templates |
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
