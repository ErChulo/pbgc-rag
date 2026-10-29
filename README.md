# PBGC-RAG

An offline browser casework research application in active development. **This is not a finished or PBGC-approved product.** Read [ACCEPTANCE.md](ACCEPTANCE.md) for verified outcomes and [PROGRESS.md](PROGRESS.md) for remaining implementation.

## Open the application

Keep `index.html`, `js/`, and `assets/` together. Open `index.html` directly in an approved desktop browser. No server, installation, Node, Python, network, CDN, remote fonts, or cloud model is required at runtime. Browser policy must permit local files and scripts. The cloud environment's managed Chromium currently blocks `file://`; this is an outstanding acceptance gate, not evidence of workplace compatibility.

Use only synthetic data in this public repository and cloud environment. Do not upload participant records, restricted cases, proprietary templates, or internal PBGC material.

1. Create a case or load the synthetic demonstration.
2. Import supported files or a folder where supported. Completed sources and a separate hash-bound resume manifest commit atomically. Re-select files after interruption; unchanged content is skipped. Inspect the source inventory and retained original bytes.
   Use Review parser update beside a source to compare current parsing with retained output. Application requires explicit review, exact citation mappings and unchanged case/plan hashes; ambiguous or changed cited evidence blocks the update. Original bytes stay intact.
3. Search by keywords, exact text, bounded regex, or read-only SQL. Use source scope to narrow large searches.
4. Add evidence nodes and proposed dated graph links. Inspect the keyboard-selectable SVG and trace bounded paths; do not treat links as legal conclusions.
5. Record interpretation proposals with source evidence and applicability dates. Proposals remain inactive.
6. Inspect the provisional review and export a verified portable case package or internal reviewer ZIP (readable report, case, hashes and passive original-byte attachments). Reviewer ZIPs can also be verified and restored from the Case step. Restore checks payload and source-byte hashes.

The app probes IndexedDB with actual reads/writes before using it, keeps bounded verified revisions, and falls back to memory when unavailable. Local backups optionally use a separate two-generation OPFS recovery copy, verified by readback and serialized with Web Locks; unavailable/read-only browsers keep their existing case and portable-export workflow. The Case step exposes verified checkpoints; damaged current cases are isolated, and an older checkpoint restores as a new revision. Pruning older history requires an explicit action. Reference libraries have separate versioned packages and browser storage. Add only authorized shared originals; explicitly copy selected sources into a case. Each copy pins its library edition, and later updates never alter cases or copy interpretations. Browser storage is best effort and plaintext. Export a backup before closing. Package integrity detects corruption, not authorship or factual validity.

## Supported formats and limitations

| Format | Current supported scope |
|---|---|
| TXT, Markdown | Nonempty lines, original offsets; UTF-8/BOM UTF-16 |
| CSV, TSV | Cells, quoted CSV fields, exact row/column source spans; no formula evaluation |
| JSON | Scalar evidence with JSON pointers; bounded nesting |
| XML | Text nodes and exact paths; DTD/external entities rejected; no attribute record inventory |
| HTML | Inert text only; scripts/styles excluded, no imported DOM execution |
| DOCX | Main body plus supported related headers, footers, footnotes and endnotes; precise parts/paragraphs/cells/note IDs; no rendered pagination, images, comments or complete visual/layout fidelity |
| XLSX, XLSM | Sheets/cells, rich/shared strings, raw numbers, formula text and cached values; no macro/formula execution or date inference |
| PDF | Audited local PDF.js 6.4.299 with bounded raw/Flate preflight: tested native text, embedded TrueType, ToUnicode and xref streams; precise page/text-item geometry, no inferred glyph boxes. No OCR, encrypted files, object streams, indirect lengths or unsupported compression filters. Mixed pages without native text are identified. See docs/PDF_ENGINE.md |
| SQLite | Standalone unencrypted rowid tables, including bounded overflow text/blob payloads; exact values/rowids and physical payload segments. No WITHOUT ROWID, WAL snapshots, virtual tables or schema-expression execution |
| Legacy DOC, XLS | Unsupported; explicit rejection |

Sources are limited to 16 MiB each; ZIP expansion, parser depth, record counts, graph traversal and query sizes are bounded. Unsupported variants fail explicitly. Parser completeness across arbitrary documents is not claimed. Exact limits appear in module exports and tests.

SQL starts with `SELECT * FROM records LIMIT 20`. It supports scalar fields, comparisons joined with `AND`, `LIKE`, sorting and limits. It rejects joins, mutation, expressions, comments, multiple statements and unsafe field access. Regex supports literals, classes, anchors, dot, `*`, `+`, `?` using nonbacktracking simulation; groups, alternatives, backreferences and counted repetition are rejected. Structured claim screening flags overlapping different values with current-case citations; it never decides legal authority. Semantic inference is unavailable.

## Development and tests

Node 22+ is development-only. No package installation is needed at runtime. PDF parsing uses a pinned, locally bundled PDF.js engine and embedded parsing resources; licenses and provenance are retained under vendor/pdfjs. It creates no worker and downloads no runtime assets.

```sh
npm test
npm run test:browser
npm run test:recovery
npm run test:imports
npm run test:libraries
npm run test:graph
npm run test:accessibility
npm run test:reindex
npm run test:opfs
npm run test:queries
npm run test:review
```

The browser test uses installed Playwright and `/usr/bin/chromium` (`CHROMIUM_PATH` can select another approved installation). It requires browser process/socket permissions. The default test opens the real `file://` app and must pass before file-origin acceptance. The current cloud managed URL policy blocks it. Do not bypass managed policy.

For secondary UI diagnosis in this environment:

```sh
PBGC_HTTP_CHECK=1 npm run test:browser
PBGC_HTTP_CHECK=1 npm run test:recovery
PBGC_HTTP_CHECK=1 npm run test:imports
PBGC_HTTP_CHECK=1 npm run test:libraries
PBGC_HTTP_CHECK=1 npm run test:graph
PBGC_HTTP_CHECK=1 npm run test:accessibility
PBGC_HTTP_CHECK=1 npm run test:reindex
PBGC_HTTP_CHECK=1 npm run test:opfs
PBGC_HTTP_CHECK=1 npm run test:queries
PBGC_HTTP_CHECK=1 npm run test:review
```

The test starts/stops its own loopback server, blocks external HTTP/HTTPS/WebSockets, and exercises the synthetic workflow, original binary parsers, hostile markup, portable recovery and storage fallback. An HTTP pass does not satisfy `file://` acceptance. No browser processes or servers need to persist between tasks.

## Official outputs

The internal report and provisional BSRS representation are **not** official R1 or BSRS formats. Official R1/R5/DEL/PF/V1/436, determination letters and template-preserving exports remain blocked. Missing approved `data_dictionary_complete.xlsm`, official templates/mappings, authoritative BSRS syntax/validator, ATPBGC reference specifications/results, and authorized actuarial interpretation approval cannot be replaced with invented fields or formulas. Synthetic arithmetic tests demonstrate software behavior only.

See [KICKOFF.md](KICKOFF.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [docs/UPSTREAM_AUDIT.md](docs/UPSTREAM_AUDIT.md). No RAG-Anything code was imported. Its exact revision, MIT license and direct dependency architecture were audited; the optional Python stack is not required by the workplace build.

Build a development portable ZIP with `python3 scripts/package.py`. The bundle includes a SHA-256 manifest and synthetic fixtures; it is explicitly incomplete and is not an accepted workplace release.

Natural-language questions use exact-token lexical retrieval, not a language model. They return full/partial/insufficient token coverage and original source excerpts; no synthesized answer or legal priority is inferred. See docs/QUESTIONS.md, docs/INDEXING.md, docs/REFERENCE_LIBRARY.md and docs/GRAPH_VIEW.md for precise contracts.

The targeted accessibility audit fixes skip-link routing, logical focus after step changes, and 320/375-pixel reflow. It is not a full Section 508 or screen-reader certification. See docs/ACCESSIBILITY_AUDIT.md. Reviewed source reparsing is documented in docs/REINDEX.md; it is separate from case-schema migration and actuarial approval. PDF font-resource IDs are deterministic extraction metadata, not original font names.


Increment 0.4 supports 100,000 records, 2 MiB per record and 32 MiB total query text, with actual execution budgets and explicit failure rather than partial results. Long excerpts render a bounded preview and load full text on request; complete SQL results can be downloaded. Sources exceeding extracted-record/text budgets reject before case promotion. Compressed/shared-string expansion cannot silently exceed those output budgets. Case validation also accounts for cumulative text before serialization, and package envelopes allow JSON escaping overhead without rejecting an otherwise valid working-case export.

Internal reviewer ZIPs use stored regular files, CRCs and a SHA-256 manifest, then regenerate expected reports/inventory from the verified case. Original sources retain a passive `.original` suffix and are never executed. Official release remains blocked. See docs/REVIEW_BUNDLE.md. OPFS snapshots are optional browser-local recovery copies, not durable portable backups; each slot has a separate 64 MiB UTF-8 bound, so an unusually escaped/large case may require the portable export instead. See docs/OPFS_BACKUP.md.

Maintained legacy XLS support is not implemented yet. The official SheetJS source/CDN/docs require the three domains listed in docs/LEGACY_XLS_AUDIT.md; their narrow environment-settings draft is saved but has not been applied. Old vulnerable npm/frozen-source builds were not imported. Enabling development download access does not add runtime network access to the app.
