# Acceptance evidence

Development build 0.2, October 30, 2026. **Final workplace/official acceptance is NOT COMPLETE.**

The coordinator independently ran `PBGC_TEST_URL=http://127.0.0.1:8765/ node tools/check.js --browser`: **121 tests PASS, zero FAIL across 19 test files**. This includes source/parser/numerical checks and explicitly supplementary Linux Chromium HTTP evidence. Exact log, per-file counts, workload metrics and advisory snapshot are in docs/evidence/.

The coordinator separately ran actual `file://` entry verification. It exits 1 with `net::ERR_BLOCKED_BY_ADMINISTRATOR` before application load. This is an **external BLOCKED gate**, not a passing test and not an application-success claim. Browser policy was not changed or bypassed.

| Requirement | Status | Evidence and practical limits |
| --- | --- | --- |
| TXT/MD/CSV/TSV/JSON locators and bounds | PASS (documented subset) | Core tests: CRLF/UTF-16 offsets, multiline quoting, JSON pointers/prototype names, malformed/deep/oversize inputs. Original bytes retained |
| HTML/XML inert extraction | PASS (documented subset) | DTD/entities reject; scripts/assets inert; text/CDATAs/BOM source offsets verified; not DOM/layout fidelity |
| DOCX/XLSX/XLSM | PASS (documented subset) | Word paragraphs/cells/nested tables, compressed packages/CRC/path/expansion guards, sheet/cell/cached values/formula metadata; macros never execute. Broader layout/date/revision semantics unimplemented |
| Legacy DOC/XLS | PASS (documented subset) | CFB v3/v4 FAT/MiniFAT and malformed/cycle/overlap tests; DOC piece-table spans; BIFF8 cells/SST/formulas. Genuine generated-worker browser dispatch/search/export verified. Other/encrypted variants reject |
| SQLite native extraction | PASS (documented subset) | Typed scalars/int64/UTF-16/overflow/interior pages/quoted schema names/rowids; genuine browser import; WAL/virtual/generated/WITHOUT ROWID/default-record mismatches reject. No uploaded SQL execution |
| PDF text extraction | PASS (documented subset) | Pinned local PDF.js worker; page/item raw geometry and explicitly approximate regions. Embedded actions/XFA/attachments inert. No OCR/table layout/exact glyph-bound claim; no hard decoded-memory quota |
| Isolation, cancellation and deadlines | PASS (HTTP development evidence) | Dedicated workers, hard timeout of synthetic infinite loops, active/queued AbortSignal cancellation, URL cleanup and bounded queue; binary fails when workers unavailable; small text fallback bounded |
| Incremental hashing/checkpoints | PASS (HTTP development evidence) | Duplicate bytes skip; failed batches leave active sources unchanged; completed-source checkpoints survive reload; reselect resumes/dedupes; keep/discard actions tested |
| Source viewer and original download | PASS (HTTP development evidence) | Byte-exact originals; source hashes/locators; dialog/Escape and far-record pagination; parsed text only |
| Keyword/exact/BM25 lexical search | PASS | Deterministic ranking/provenance and independent BM25 numerical regression; natural-language lexical fallback is not semantic inference |
| Safe regex/read-only SQL | PASS (documented subsets) | State simulation/reference comparisons/work budget; mutation/multistatement rejection. SQL queries internal evidence records, not arbitrary database joins/engine extensions |
| Typed documentary/proposed temporal graph | PASS (documented subset) | Source binding, dangling/forged edge rejection, cycles/hop/result caps, date filters; proposed-link export/restore and UI provenance verified. No legal relationship/authority/conflict adjudication |
| Case/library isolation and recovery | PASS (HTTP development evidence) | IndexedDB/localStorage/memory selection, previous revisions, stale-tab conflict/write failure tests; case/library searches isolated; backups, cancellation/retry, previous-source integrity and complete clearing verified |
| Provisional review/report/layout/timeline | PASS (nonofficial scope) | Source-linked R1 drafting aid/internal nonexecutable BSRS, escaped standalone HTML, formula-safe CSV, reusable layouts; explicit unverified dates must resolve to actual records |
| Reviewer package validation | PASS (nonofficial scope) | Source/manifest/artifact hashes; graph/layout binding; R1/BSRS/HTML regenerate. Rehashed forged draft rejected without current-workspace mutation |
| Generic synthetic arithmetic | PASS (module-only scope) | Exact rational BigInt inputs/rounding/traces, independently expected values, approval/date/input/source gates. No actuarial rule/UI activation or official numerical validity |
| Automated accessible controls | PASS (tested controls only) | Both-theme text >=4.5:1, visible control boundaries >=3:1, labels, skip link, dialog keyboard/Escape, mobile no-overflow. Full Section 508/manual assistive-technology acceptance remains unverified |
| Synthetic workload/resource checks | PASS (Linux development scope) | 18,000 records/1.89 MB; coordinator workflow 3.65 seconds, import 1.19 seconds; responsive 11 ms parser abort. Renderer JS heap ~127.7 MB excludes workers/process/native/peak memory. Not enterprise 16 GB proof |
| Portable build | PASS (HTTP development evidence) | ZIP CRC/local asset/hash validation; independent extraction checks every manifest entry, runs actual worker import/search only from extracted files and clears recovery across reload |
| Upstream source/license/architecture | PASS (source inspection) | RAG-Anything pinned 2cd2b3329c470ccb53923f8a6d320596b34e56c5 MIT; no upstream runtime imported. Optional future integration's resolved transitive/runtime audits remain pending |
| Workplace runtime dependency/network source checks | PASS (source/HTTP controls only) | Static local assets, strict CSP, no first-party network/eval/HTML insertion, no observed external requests in covered workflows. This does not establish actual file-profile runtime acceptance |
| Actual double-click file:// execution | BLOCKED | Managed Chromium administrator URL policy denies local entry before load. Approved policy-permitted browser/environment needed |
| Official dictionary/templates/BSRS syntax/reference validation | BLOCKED | Authorized authoritative fixtures/specifications absent; no fabricated substitute |
| Official actuarial rules, computations and artifacts | BLOCKED / NOT IMPLEMENTED | No approved interpretations/reference factors supplied; only synthetic arithmetic exists. Dictionary mapping/approval UX, complete engine and template-preserving official generation remain engineering work. Official release disabled |
| Full ontology/authority/contradiction workflow, semantic/OCR, broader formats/SQL | NOT IMPLEMENTED | Documentary/proposed graph and explicit query/parser subsets only. Approved ontology/model/reference contracts plus engineering needed |
| Windows enterprise/full 508/whole-process resource acceptance | BLOCKED / UNVERIFIED | Current Linux tests cannot establish actual workplace policy, assistive-technology or RAM/CPU acceptance |

## Reproduction

Development prerequisites: Node, Playwright, Chromium and Python standard library for synthetic SQLite/package fixtures. None are workplace runtime dependencies.

```sh
python tools/build-ingest-worker.py --check
node tools/check.js
node tools/check.js --browser
python tools/package.py
```

`--browser` defaults to actual `file://` for application-entry tests. This environment currently blocks that gate. The suite also contains dedicated HTTP-intercepted parser isolation tests, explicitly labeled as narrower evidence. Node/Python subprocesses and Chromium require reviewed process-sandbox escalation here.

Supplementary application HTTP reproduction:

```sh
python -m http.server 8765 --bind 127.0.0.1
PBGC_TEST_URL=http://127.0.0.1:8765/ node tools/check.js --browser
```

The final command exited zero with 121 PASS. Detailed evidence: docs/evidence/verification-0.2.json and .log. The separate blocked actual entry result is docs/evidence/file-profile-0.2.log. The bounded registry advisory snapshot reported zero known advisories for its checked nonoptional installation; that is not a comprehensive security audit.
