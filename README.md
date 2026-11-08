# PBGC-RAG

> **Guided-question development branch.** This work builds on the separate Qwen2.5 1.5B experiment. It does not change `main`, the [stable 0.8 release](https://github.com/ErChulo/pbgc-rag/releases/tag/office-v0.8.0), or the delivered [larger-model 0.8 package](https://github.com/ErChulo/pbgc-rag/releases/tag/larger-model-v0.8.0). New branch features are not a new published office release. See [this increment](docs/ux/RAG-0.9.md).


Find information in your documents. Ask the included Qwen assistant a question. Open each answer’s source to check it. Save the case to reopen your work.

PBGC-RAG runs on your computer without sending documents or questions to a service. It is an independent project, not an official Pension Benefit Guaranty Corporation (PBGC) product. Its current purpose is document search and supported answers. Official templates, actuarial rules and field dictionaries are not required for that workflow.

## Start here

1. Download a complete office ZIP from the [stable release](https://github.com/ErChulo/pbgc-rag/releases/tag/office-v0.8.0) or the separate [larger-model test release](https://github.com/ErChulo/pbgc-rag/releases/tag/larger-model-v0.8.0).
2. Extract the ZIP. Keep `index.html` and its `assets`, `vendor` and `models` folders together.
3. Double-click `index.html`.
4. Choose **Get started**, then **Start Qwen**. Follow the guide to add documents and ask your first question.
5. Open the cited source. Check the words and numbers. Use **Save & reopen** to save a case file before closing the app.

Qwen is included. You do not need to choose a model file, install software or run a server. The GitHub source-code ZIP and small core developer ZIP are not complete office packages. See the [plain-language office guide](docs/OFFICE-START.md).

The delivered 0.8 packages passed actual offline file-URL tests on Windows and Ubuntu. Those results apply to their tested versions. This development branch requires its own tests before a new release. Modern browser Blob workers, local cryptography and native decompression support are needed for binary imports.

Create a case or load the synthetic example. The workspace selector keeps up to eight cases and a separate reference library. Search uses only the selected workspace. Original files remain unchanged. Save original downloads the exact bytes. Reading views show clear source locations; Source details holds optional verification metadata. View evidence opens nearby parsed records with precise locators; PDF sources also offer Original PDF page, with page navigation and zoom.

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
| PDF | PDF.js text items, page and raw geometry; approximate advance regions are labeled; optional local English OCR on image-only pages with estimated line boxes; no exact glyph bounds, reconstructed table structure or active actions |

These are bounded extraction subsets, not arbitrary format fidelity. Unsupported variants reject explicitly. Parser details and limitations: [dependencies](docs/DEPENDENCIES.md), [legacy](docs/LEGACY.md), [SQLite](docs/SQLITE.md), [PDF](docs/PDF.md), [isolation](docs/INGEST.md).

Imports use dedicated local workers with cancellation and 15-second hard deadlines. Binary imports fail if workers are blocked. Small text up to 128 KiB has a bounded synchronous fallback. Verified import checkpoints survive reload; reselect files to resume, or keep/discard the checked subset. Failed batches do not change active sources.

Limits: 5 MB per source; 20 MB, 200 sources and 50,000 records per workspace; eight cases and 80 MB per recovery catalog. Text extraction is bounded at 2,000,000 UTF-16 code units per source. Archives and each parser have additional limits. Browser workers have no hard OS memory quota; elapsed-time and output limits do not certify hostile-document safety.

## Ask your documents

Choose the task you need:

| Task | What happens | Needs Qwen? |
| --- | --- | --- |
| Read source passages | Finds and shows the document text | No |
| Ask one question | Writes one short answer and links its supporting source | Yes |
| Ask separate questions — development branch | Checks up to three questions one at a time and shows a result for each | Yes |

Ask for one fact in each question. For example: **What is the normal retirement age?** To check another fact, add a separate question such as **How long are case files retained?** Each answer must have its own support. A supported answer to one question does not make the other answers valid.

The local Qwen profile returns one supported statement per question. It does not write an unrestricted report that combines facts across documents. Separate questions can find facts in different documents, with separate source checks. A result can say that no supported answer was found or that sources need review. Keep those results visible when you compare answers.

Open each citation before using an answer. For a PDF, choose **Original PDF page** to check the source page. Scan recognition can misread words and numbers. Source details holds optional technical verification data; you do not need hashes to read a citation.

The complete office package contains the local model files. The app does not download models or send prompts or documents to a service. Source passages remain available without starting Qwen. Manual model selection and custom manifests are advanced developer options; do not import model files as case documents.

Read the [office guide](docs/OFFICE-START.md) for the user flow. Developer details: [model preparation](docs/LOCAL-MODELS.md), [chunking](docs/CHUNKING.md), [semantic retrieval](docs/SEMANTIC.md) and [answer grounding](docs/RAG.md). Guards reduce unsupported output; they do not prove every answer correct. Mock-provider checks and actual-model evaluation are recorded separately.

## Other search tools

- Keywords require all terms in the same record. Exact phrases preserve word order.
- Ranked lexical search uses BM25 with a visible score explanation. It is a natural-language lexical fallback, not a semantic model or an answer generator.
- Safe regex supports a documented bounded subset, not unrestricted JavaScript regex.
- Read-only SQL supports `SELECT * FROM records` with filtering, ordering and limits. It is an internal evidence-record query subset, not a full SQLite engine.
- Graph tools traverse documentary links and explicit source-bound proposed links, with bounded hops/cycles and optional date filters. User-supplied dates remain unverified. No legal or actuarial relationship is inferred or approved.
- Optional review and export tools include source-linked HTML/CSV, report layouts and timeline notes. Legacy R1 and internal BSRS drafts remain nonofficial. You do not need these tools to search or ask questions.

Report layouts and proposed graph links now save with a version 2 case across reloads. Separate layout/graph exports and reviewer packages remain available. Reviewer packages include original sources, five hashed artifacts, a manifest and release blockers. Restore verifies bytes and hashes, source-binds graph/layout annotations and regenerates R1/BSRS/report contents; rehashed forged drafts reject.

## Optional case review tools

These advanced tools are separate from the document-question workflow. No field dictionary, template or actuarial approval is required to search documents. Open **Notes and tables** for the selected workspace only when you need its supported review features:

- Save fact, provision or event candidates with exact source references, authority labels, explicit date/group scope and local reviewer claims. Edits invalidate review; unknown scope or conflicting values cause abstention. No legal precedence or actuarial rule is inferred.
- Map exact field names from an explicitly selected Excel sheet/column/header/version. The official-candidate path requires the actual `data_dictionary_complete.xlsm` name and format. Synthetic mode is labeled. Mapping review never activates official validation, infers field types or substitutes `DD.csv`.
- Run bounded read-only queries on typed SQLite tables or explicit CSV/Excel header views. Large SQLite integers remain exact; each result retains source-cell provenance. No formula or uploaded SQL executes.
- Apply explicit mappings to generic DOCX/XLSX test templates in an isolated worker. Original hash, permitted parts, expected anchors/cells, protection/formula guards and numeric expectations must pass. Untouched ZIP parts remain byte-preserved. All outputs are nonofficial; failed outputs never download.

Review state is revalidated against reparsed original bytes during recovery/import. Unsaved changes cannot be reviewed as if they were the saved version. Switching cases clears private form drafts. See docs/DICTIONARY.md, docs/EVIDENCE.md, docs/TABLE-QUERY.md and docs/TEMPLATES.md for supported subsets and approval limits.

## Recovery, exports and privacy

IndexedDB, then localStorage, then memory are capability-selected. Recovery retains one prior snapshot and checks stale-tab write conflicts. Legacy source-only case packages remain readable. Version 2 case packages persist source-bound review annotations, dictionary maps, report layouts, graph links and explicit table headers. Version 3 adds pinned OCR processing profiles and rebuilds machine-read records from the original scan; unsupported engines are rejected. All-workspace backups and reviewer packages are also available. Restore verifies SHA-256 and reparses originals before replacing/adding work. A visible summary beside the picker shows the restored filename, active case and document count. Same-named cases have distinct display labels. Keep portable backups: browser storage can be cleared, denied or tied to this file location. Clear all local recovery removes current/prior snapshots and closes workspaces; exported files remain on disk.

Exports and recovery are plaintext. SHA-256 detects inconsistent content; it does not authenticate authorship. Original bytes may be sensitive. Only synthetic fixtures belong in this public repository or remote development environment.

## Development checks and portable build

```sh
node tools/check.js
node tools/verify-browser.js
node tools/verify-browser.js --file
python tools/build-ingest-worker.py --check
python tools/package.py
python tools/package.py --office
```

Development tests need Node, Playwright, Chromium and Python's standard library for generated SQLite/package fixtures. They are not workplace runtime dependencies. `node tools/verify-browser.js` owns the test server, full Playwright run and cleanup; no manual browser walkthrough or separately managed server is needed. It labels HTTP evidence as supplementary. `--file` uses actual local file URLs without modifying browser policy; the managed Chromium here still blocks that entry. GitHub CI runs both profiles on its test browser. See docs/AUTOMATION.md. Reviewed process-sandbox escalation is needed in this coding environment.

`tools/package.py` creates `dist/PBGC-RAG-0.8-larger-model.zip`, validates local assets/ZIP CRC/SHA-256, and includes a build manifest. Rebuild the generated ingest worker after changing parsers. Pinned PDF.js is Apache-2.0; license, hashes and build instructions are included. No Python RAG-Anything code or runtime dependencies were imported. The default core ZIP includes the sentence encoder and generation runtime but excludes GGUF weights. Developers prepare the model outside the office, then run `python tools/package.py --office` to produce the complete `dist/PBGC-RAG-0.8-larger-model-office.zip`. That profile fails unless the exact pinned model size and SHA-256 pass, includes model/manifest/license assets, and verifies ZIP CRC plus every packaged file hash. Transfer that complete ZIP to the office. No preparation command is a workplace runtime step.

## Current limits and next development

The current model is conservative and can decline a valid question. The larger model has not been shown to be more accurate on real plan documents. The fixed synthetic evaluation is small; broader question coverage remains to be measured. This branch adds separate questions while keeping the existing source checks. Its actual-model and browser results must be recorded before delivery.

Mixed image/text-page OCR, other OCR languages, full PDF table reconstruction, broader format/query support and complete assistive-technology/performance evaluation remain unfinished. See PROGRESS.md, ACCEPTANCE.md and BLOCKERS.md for test scope.

Official actuarial calculations and template outputs are outside the current RAG milestone. Their missing source contracts do not block document search or question answering. No official output approval is enabled.

## Optional scanned-PDF reading

The first-run guide enables scanned-page reading. In the document workspace, enable **Read text from scanned PDF pages** before importing a scan if it is off. All English recognition assets are included in the office ZIP. Only pages with no native text are recognized; mixed pages with a native text layer retain that layer without OCR. Limits: 20 image-only pages per PDF, 8 million pixels per rendered page and 180 seconds total. Machine-read text, numbers and line regions can be wrong: check the original page before using them. OCR confidence is not factual confidence. Source bytes are preserved; version 3 exports re-run the pinned processing profile on restore. See docs/OCR.md and docs/PDF-OCR.md.

## Original PDF pages

In View evidence or View source, choose **Original PDF page** to inspect the saved PDF inside the reader. Page navigation, zoom and original downloads stay local. Image pages can be viewed even without a parsed text record; page navigation does not change the citation. Interactive content and annotations are excluded. See [preview limits and verification](docs/PDF-PREVIEW.md).
