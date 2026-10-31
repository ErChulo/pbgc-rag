# PBGC-RAG

An independent offline-first pension casework application in development. This is not an official PBGC product or a completed actuarial system. Use synthetic documents in this build.

## Open the workplace build

Double-click `index.html` with its adjacent `assets` and `vendor` folders intact. The application requires no installation, build, server, Python, Node or network. Modern browser Blob workers, local cryptography and native decompression support are needed for binary imports. This environment's managed Chromium forbids `file://`: workplace acceptance remains blocked, even though supplementary HTTP tests pass. Do not bypass enterprise policy.

Create a case or load the synthetic example. The workspace selector keeps up to eight cases and a separate reference library. Search uses only the selected workspace. Original files remain unchanged. Save original downloads the exact bytes. Reading views show clear source locations; Source details holds optional verification metadata. View evidence opens nearby parsed records with precise locators; it does not reproduce original page layout.

## Supported extraction

| Format | Evidence locations and limits |
| --- | --- |
| TXT, Markdown, CSV, TSV, JSON | Lines/UTF-16 offsets, row/column or JSON pointers; UTF-8 input. JSON duplicate keys use the last value with an explicit warning; retain originals |
| HTML, XML | Inert source text offsets and XML paths; no document scripts/resources or DTD/custom entities |
| DOCX | Main/selected related document parts, paragraphs and table cells; no layout or tracked-change interpretation |
| XLSX, XLSM | Sheet/cell, raw cached values and formulas; macros never run; no date formatting or formula calculation |
| DOC | Supported Word 97–2007 main text piece tables; paragraphs, character positions and original stream byte spans; no fake page/table positions |
| XLS | Supported BIFF8 worksheet cells and stored formula token bytes/cached values; no formula execution or inferred expression |
| SQLite | Coherent supported rollback-journal rowid tables, typed values and table/rowid/column; no SQL from the document executes; WAL, virtual/generated/WITHOUT ROWID tables and some altered schemas reject |
| PDF | PDF.js text items, page and raw geometry; approximate advance regions are labeled; no OCR, exact glyph bounds, table structure or active actions |

These are bounded extraction subsets, not arbitrary format fidelity. Unsupported variants reject explicitly. Parser details and limitations: [dependencies](docs/DEPENDENCIES.md), [legacy](docs/LEGACY.md), [SQLite](docs/SQLITE.md), [PDF](docs/PDF.md), [isolation](docs/INGEST.md).

Imports use dedicated local workers with cancellation and 15-second hard deadlines. Binary imports fail if workers are blocked. Small text up to 128 KiB has a bounded synchronous fallback. Verified import checkpoints survive reload; reselect files to resume, or keep/discard the checked subset. Failed batches do not change active sources.

Limits: 5 MB per source; 20 MB, 200 sources and 50,000 records per workspace; eight cases and 80 MB per recovery catalog. Text extraction is bounded at 2,000,000 UTF-16 code units per source. Archives and each parser have additional limits. Browser workers have no hard OS memory quota; elapsed-time and output limits do not certify hostile-document safety.

## Search and review

- Keywords require all terms in the same record. Exact phrases preserve word order.
- Ranked lexical search uses BM25 with a visible score explanation. It is a natural-language lexical fallback, not a semantic model or an answer generator.
- Safe regex supports a documented bounded subset, not unrestricted JavaScript regex.
- Read-only SQL supports `SELECT * FROM records` with filtering, ordering and limits. It is an internal evidence-record query subset, not a full SQLite engine.
- Graph tools traverse documentary links and explicit source-bound proposed links, with bounded hops/cycles and optional date filters. User-supplied dates remain unverified. No legal or actuarial relationship is inferred or approved.
- Provisional R1 text, internal nonexecutable BSRS JSON, source-linked HTML/CSV, reusable layouts and explicit timeline annotations are available. They are drafting/review aids, not official artifacts.

Report layouts and proposed graph links now save with a version 2 case across reloads. Separate layout/graph exports and reviewer packages remain available. Reviewer packages include original sources, five hashed artifacts, a manifest and release blockers. Restore verifies bytes and hashes, source-binds graph/layout annotations and regenerates R1/BSRS/report contents; rehashed forged drafts reject.

## Case review workbench

Open **Case review** for the selected workspace:

- Save fact, provision or event candidates with exact source references, authority labels, explicit date/group scope and local reviewer claims. Edits invalidate review; unknown scope or conflicting values cause abstention. No legal precedence or actuarial rule is inferred.
- Map exact field names from an explicitly selected Excel sheet/column/header/version. The official-candidate path requires the actual `data_dictionary_complete.xlsm` name and format. Synthetic mode is labeled. Mapping review never activates official validation, infers field types or substitutes `DD.csv`.
- Run bounded read-only queries on typed SQLite tables or explicit CSV/Excel header views. Large SQLite integers remain exact; each result retains source-cell provenance. No formula or uploaded SQL executes.
- Apply explicit mappings to generic DOCX/XLSX test templates in an isolated worker. Original hash, permitted parts, expected anchors/cells, protection/formula guards and numeric expectations must pass. Untouched ZIP parts remain byte-preserved. All outputs are nonofficial; failed outputs never download.

Review state is revalidated against reparsed original bytes during recovery/import. Unsaved changes cannot be reviewed as if they were the saved version. Switching cases clears private form drafts. See docs/DICTIONARY.md, docs/EVIDENCE.md, docs/TABLE-QUERY.md and docs/TEMPLATES.md for supported subsets and approval limits.

## Recovery, exports and privacy

IndexedDB, then localStorage, then memory are capability-selected. Recovery retains one prior snapshot and checks stale-tab write conflicts. Legacy source-only case packages remain readable. Version 2 case packages persist source-bound review annotations, dictionary maps, report layouts, graph links and explicit table headers. All-workspace backups and reviewer packages are also available. Restore verifies SHA-256 and reparses originals before replacing/adding work. A visible summary beside the picker shows the restored filename, active case and document count. Same-named cases have distinct display labels. Keep portable backups: browser storage can be cleared, denied or tied to this file location. Clear all local recovery removes current/prior snapshots and closes workspaces; exported files remain on disk.

Exports and recovery are plaintext. SHA-256 detects inconsistent content; it does not authenticate authorship. Original bytes may be sensitive. Only synthetic fixtures belong in this public repository or remote development environment.

## Development checks and portable build

```sh
node tools/check.js
node tools/verify-browser.js
node tools/verify-browser.js --file
python tools/build-ingest-worker.py --check
python tools/package.py
```

Development tests need Node, Playwright, Chromium and Python's standard library for generated SQLite/package fixtures. They are not workplace runtime dependencies. `node tools/verify-browser.js` owns the test server, full Playwright run and cleanup; no manual browser walkthrough or separately managed server is needed. It labels HTTP evidence as supplementary. `--file` uses actual local file URLs without modifying browser policy; the managed Chromium here still blocks that entry. GitHub CI runs both profiles on its test browser. See docs/AUTOMATION.md. Reviewed process-sandbox escalation is needed in this coding environment.

`tools/package.py` creates `dist/PBGC-RAG-0.3.zip`, validates local assets/ZIP CRC/SHA-256, and includes a build manifest. Rebuild the generated ingest worker after changing parsers. Pinned PDF.js is Apache-2.0; license, hashes and build instructions are included. No Python RAG-Anything code or runtime dependencies were imported.

## Remaining gates

Official dictionary authorization/type definitions, legal/actuarial definitions and approvals, reference factors, original templates, BSRS syntax and official artifacts require authorized authoritative inputs. Local semantic models/OCR, comprehensive PDF tables/layout, broader format/query support and complete enterprise accessibility/performance acceptance remain pending. No official output is enabled. See PROGRESS.md, ACCEPTANCE.md and BLOCKERS.md for exact evidence and unfinished work.
