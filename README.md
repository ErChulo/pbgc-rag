# PBGC-RAG

[![Maturity: 1.1 RC1 verification pending](https://img.shields.io/badge/maturity-1.1%20RC1%20%7C%20verification%20pending-E4002B)](docs/AUDIT-REMEDIATION-1.1.md)

Find information in your documents. Ask the included Qwen assistant a question. Open each answer’s source to check it. Save the case to reopen your work.

PBGC-RAG runs on your computer without sending documents or questions to a service. It is an independent project, not an official Pension Benefit Guaranty Corporation (PBGC) product. Its current purpose is document search and supported answers. Official templates, actuarial rules and field dictionaries are not required for that workflow.

**The proposed 1.1 RC1 is in final verification.** All six source, complete-package and 1 GiB Windows/Ubuntu checks passed for `a987a6e`. Later local checks found a cleanup timeout and unsuitable numeric answer choices; those repairs need their own final checks. See the [audit record](docs/AUDIT-REMEDIATION-1.1.md) and [exact earlier results](docs/evidence/audit-a987-public-ci-status.json). Do not treat earlier results as acceptance of a changed runtime.

The earlier **1.0 RC1** package and `main` are preserved. Its Windows/Ubuntu checks apply to runtime [`d3ce073`](https://github.com/ErChulo/pbgc-rag/commit/d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89), the existing complete office ZIP and its bounded test workloads. Those results do not establish readiness for realistic multi-paragraph documents or the newly specified case size. See [historical RC1 evidence](#verified-rc1-evidence) and the [machine-readable record](docs/evidence/habemus-1.0-rc1-verified.json).

[![8cb8873 source and office checks: four jobs pass](https://img.shields.io/badge/8cb8873%20source%20%2B%20office-4%20jobs%20pass-008065)](docs/evidence/audit-8cb-public-ci-status.json)

The four Windows/Ubuntu source and complete-package checks passed for `8cb8873` and `ac68c7f`. The later `a987a6e` also passed both complete 1 GiB offline scale checks. Each rebuilt all 256 originals from backup, retained exact source locations and produced a real Qwen answer. The new key-only cleanup repair preserves the 30-second storage deadline; final-head results remain pending.

## Get the 1.1 RC1 office candidate

1. Open the [office candidate checks](https://github.com/ErChulo/pbgc-rag/actions/workflows/rag-audit-remediation.yml). Select the latest passed **1.1 RC1** run on `codex/rag-audit-remediation-1.1`.
2. Under **Artifacts**, download **audit-rc1-office-evidence-windows-latest**. Sign in to GitHub if asked.
3. Extract that ZIP. Open **dist**, then extract **PBGC-RAG-1.1-rc1-office.zip** too.
4. Open the app folder and double-click **index.html**. Keep **assets**, **vendor** and **models** beside it.
5. Choose **Get started**, then **Start Qwen**. For hundreds of documents, open **Case → Open a large case workspace**. Follow the [office instructions](docs/OFFICE-START.md).

The complete app includes Qwen. No office installation, terminal, server or separate model download is needed. The ZIP is about 777 MB; extracted app files use about 1.05 GB. Allow 4 GB for download/extraction, plus space for your documents, local indexes and backups. The target is a 16 GB computer. GitHub artifacts expire seven days after their run. `main` and older packages are preserved.

## Large-case development path

Follow the [large-case guide](docs/LARGE-CASE-GUIDE.md) for the current controls, table setup, source checks and backup/reopen steps.

The **Large case workspace** control opens a separate document store. It keeps original files as browser Blobs and records/passages in bounded, authenticated local shards. It does not put a large case into the older JSON recovery catalog.

1. Create a large case and add its original documents. Read any import errors and extraction notes.
2. Select **Find source passages** and enter a specific question. Select one document when needed.
3. For CSV or spreadsheets, select the document and confirm its column-name row before requesting written table answers.
4. For a written answer, start the included Qwen and select **Write an answer with sources**. Check each quoted source. A single cited document is marked for review.
5. Choose **Save large case backup**. Reopen that ZIP with **Open a large case backup**. Restore verifies original bytes and rebuilds passages; imported derived evidence is not trusted.

The configured large-case bounds are **1 GiB of originals, 2,000 documents and 64 MiB per document**, with additional parser, cache and browser-storage limits. The `a987a6e` actual-file tests used 256 synthetic text documents and rebuilt the complete second case from backup on Windows and Ubuntu. They did not measure arbitrary PDF/Office collections or the 2,000-document maximum. Final repair-head acceptance is pending.

Large-case search checks authenticated term indexes for all selected passages, then loads matching passage text. The learned encoder reranks a bounded text-search shortlist; it is not a global dense index of the entire case. A very broad question may require a document, participant name or ID. Browser storage and case backups are **unencrypted**. Keep the original files and a portable backup. Optional passphrase encryption remains work to do.

## Existing 1.0 RC1 checks

These badges describe the preserved earlier runtime and package, not this development branch:

[![Source checks: Windows and Ubuntu passed](https://img.shields.io/badge/RC1%20source-Windows%20%2B%20Ubuntu%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082)
[![Complete office ZIP: Windows and Ubuntu passed](https://img.shields.io/badge/RC1%20office%20ZIP-Windows%20%2B%20Ubuntu%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100)
[![Offline file entry tested](https://img.shields.io/badge/RC1%20offline%20file%20entry-tested-008065)](docs/evidence/habemus-1.0-rc1-verified.json)
[![Qwen2.5 1.5B included and tested](https://img.shields.io/badge/RC1%20Qwen2.5-1.5B%20tested-002D72)](docs/evidence/habemus-1.0-rc1-verified.json)
[![English OCR tested offline](https://img.shields.io/badge/RC1%20English%20OCR-offline%20tested-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100)
[![Accessibility: automated checks passed](https://img.shields.io/badge/RC1%20accessibility-automated%20checks%20passed-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082)

## Download the preserved 1.0 RC1 office package

1. Open the [passed 1.0 candidate download run](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100#artifacts). Sign in to GitHub if asked.
2. Under **Artifacts**, select **habemus-office-evidence-windows-latest** for your office desktop. Choose that one item. The Ubuntu item contains the other tested package copy.
3. Extract the downloaded artifact ZIP. Open its **dist** folder.
4. Find **PBGC-RAG-1.0-rc1-office.zip**. Extract this ZIP into its own folder too.
5. Open the extracted app folder. Double-click **index.html**.

**GitHub adds an outer ZIP around the app ZIP. Extract both.** If you already have `PBGC-RAG-1.0-rc1-office.zip` directly, start at step 4.

The app folder should contain these items:

```text
PBGC-RAG-1.0-rc1-office/
  index.html                 Open this file.
  OFFICE-START.md             Plain-language guide.
  assets/
  vendor/
  models/                    Included Qwen files.
  docs/
```

Keep the folders beside `index.html`. Open the extracted file, rather than the copy shown inside a ZIP viewer. The complete app ZIP is about **777 MB**, and the extracted files use about **1.05 GB**. Allow **4 GB of free disk space** for the two downloads, extraction and saved work.

The target computer has **16 GB of RAM** and a current browser with local WebAssembly and worker support. The automated matrix used Chromium on Windows and Ubuntu. Browser compatibility is verified for those matrix versions. The app uses the CPU; a GPU is not required.

**No software installation is needed at the office.** No terminal, Python, Node.js, server, account or separate model download is needed to run the app. Internet access is needed to download the package from GitHub; the extracted app runs offline.

Use the complete office ZIP. GitHub’s **Code → Download ZIP** and the small core developer ZIP contain developer files without the included Qwen package.

The candidate is available as a workflow artifact, with **seven-day retention after the run**. If it has expired, request a fresh verified candidate package. Developers can use the [build instructions](#development-checks-and-portable-build). The [stable 0.8 release](https://github.com/ErChulo/pbgc-rag/releases/tag/office-v0.8.0) and [larger-model 0.8 release](https://github.com/ErChulo/pbgc-rag/releases/tag/larger-model-v0.8.0) are older permanent downloads; they do not contain the 1.0 controls. The 1.0 candidate has not replaced those releases or `main`.

## Your first case in the preserved package

1. **Start Qwen.** Choose **Get started**, then **Start Qwen**. Wait for the ready message. The model is included; you do not need to choose a model file. Choose **Use source passages instead** if you only want to find and read text.
2. **Add documents for one case.** Follow the guide and choose your files. You can use the supplied synthetic example to learn the controls. The app keeps original files unchanged.
3. **Confirm table column names when needed.** For CSV or Excel, open **Check column names** in **Documents**. Preview the row that contains the column names. Choose **Use this row as column names**. SQLite already has stored column names.
4. **Ask one question.** Choose **Continue to questions**. Enter a short question, such as **What is the normal retirement age?** Use words from the document. For a table, include the person and field, such as **What is Alice’s age?** Include an ID if several rows have that name.
5. **Check the cited source.** Open **Sources for this question** or **View evidence**. Read the nearby text or value cell. For PDFs, choose **Original PDF page**. **Save original** downloads the unchanged source file. You do not need to read file hashes; those stay under **Source details**.
6. **Save your case.** Choose **Save & reopen**, then **Save case to a file**. Keep the saved case file. To return later, open the app, use **Save & reopen** to select that case file, and check its filename and document count in the restore summary. Start Qwen again for written answers.

Local answers can take more than a minute. The app shows progress and offers cancellation. If you cancel a model operation, start Qwen again when prompted. Source passages remain available without Qwen.

Use a different case for a different set of documents. The workspace selector holds up to eight cases and a separate reference library. Each question searches the selected workspace. Save a portable case file before closing; browser recovery can be cleared or unavailable.

## If you get stuck

| What you see | What to do |
| --- | --- |
| `index.html` opens without the full app, or files seem missing | Extract both ZIPs. Open `index.html` from the folder that also contains `assets`, `vendor` and `models` |
| Qwen is not ready | Choose **Start Qwen**. Check that you downloaded the complete office ZIP. Follow any browser capability message, or use source passages |
| A question was cancelled or timed out | Start Qwen again when prompted. Ask for one fact, or use source passages |
| No supported answer | Check the selected case and **Searched:** line. Ask one complete question. Add the missing source or use **Search** to find its words |
| A table answer is unavailable | Confirm the column-name row. Include the person’s name and ID when needed. Formulas and unclear table layouts do not supply answer values |
| A PDF image has missing text | Open **Original PDF page**, go to the page and choose **Read text from this page**. English scan reading is included |
| Saved work is missing after reopening | Use **Save & reopen** to open the case file you saved. Read the restore summary; browser recovery is best effort |

For a longer walkthrough, read the [office guide](docs/OFFICE-START.md) and [first-case tutorial](docs/USER-GUIDE.md).

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

Legacy workspace limits: 5 MB per source; 20 MB, 200 sources and 50,000 records per workspace; eight cases and 80 MB per recovery catalog. The separate large-case development path has the configured bounds listed above and does not use this catalog. Text extraction is bounded at 2,000,000 UTF-16 code units per source. Archives and each parser have additional limits. Browser workers have no hard OS memory quota; elapsed-time and output limits do not certify hostile-document safety.

## Ask your documents

The [step-by-step user guide](docs/USER-GUIDE.md) covers assistant startup, document import, column names, questions, exact sources, scanned pages and saving. This branch can combine up to three independently supported factual questions in one result. It copies complete source statements or literal table fields. It does not infer new relationships or calculate values.

Choose the task you need:

| Task | What happens | Needs Qwen? |
| --- | --- | --- |
| Read source passages | Finds and shows the document text | No |
| Ask one question | Writes one short answer and links its supporting source | Yes |
| Combine independent facts — development branch | Checks up to three full questions and copies their supporting facts into one result | Yes |
| Ask separate questions — development branch | Checks up to three questions one at a time and shows a result for each | Yes |
| Ask about one document — development branch | Searches the document selected for that question | Only for a written answer |

Ask for one fact in each full question. For example: **What is the normal retirement age?** To check another fact in the same result, add a second full question in that box: **How long are case files retained?** Use **Add another question** for separate results. Each fact must have its own support. A supported fact does not make the other facts valid.

To ask about one file, open **Documents: All documents** below the question. Use **Documents for this question** to select the file. Keep **All documents** to search the case. With two question boxes, you can ask the same question about two different files. Select a different file in each box.

Each result states what was searched: **Searched: filename** or **Searched: all N documents**. Read that line before comparing answers. A result from one file says nothing about an excluded file. Selecting one file does not decide which document governs. If a selected file is unavailable or has no readable passages, the app shows a message; it does not switch to all documents.

For one fact, Qwen returns a source-supported statement. For supported combined questions, Qwen selects existing statements or literal table fields. The app checks every requested fact before it shows the combined result. It does not write an unrestricted report or infer relationships between facts. A result can say that no supported answer was found or that sources need review. Keep those results visible when you compare answers.

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

## Verified RC1 evidence

The verified application runtime is commit [`d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89`](https://github.com/ErChulo/pbgc-rag/commit/d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89). All four required platform jobs passed for that commit:

| Gate | Result | Evidence |
| --- | --- | --- |
| Windows source workflow | PASS | [Offline file entry, full regressions, actual-model quality and whole-process resource checks](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663979) |
| Ubuntu source workflow | PASS | [Same source workflow on Ubuntu](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663857) |
| Windows complete office ZIP | PASS | [Included-model startup, sources, scans, PDF pages, document selection, table setup, save/reopen and combined/table answers](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663540) |
| Ubuntu complete office ZIP | PASS | [Same extracted-package workflow on Ubuntu](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663958) |

The package checks opened the extracted `index.html` through actual offline `file://` URLs, including a folder path with spaces. Qwen ran locally without a model picker. Network isolation, source hashes, exact citations, cancellation, English OCR and original-page reading were checked. Automated accessibility checks cover the implemented controls, layouts and theme contrast; they are not a Section 508 or WCAG certification.

**Maturity limits:** This is an integrated release candidate for an office pilot. In the small fixed factual evaluation, three of four questions produced correct cited answers and one declined to answer. This is **75% supported-answer coverage on four synthetic questions**, not a general accuracy or code-coverage score. All four unsafe test cases were blocked or reported as conflicts. Representative real-plan quality, broader browser coverage and manual assistive-technology acceptance remain to be evaluated.

The sampled source workloads peaked at about 2.49 GB on Ubuntu and 2.55 GB on Windows, within the unchanged 12 GB test budget. The local complete-ZIP startup/answer/OCR test peaked at about 4.53 GB. These measurements apply to the tested workloads. Detailed values, model identity and links are in the [verification record](docs/evidence/habemus-1.0-rc1-verified.json).

The badges above are evidence snapshots for the verified runtime and ZIP. A documentation-only follow-up does not create a new tested binary, change the office ZIP or imply that a new application commit passed these old runs. `main` and the published 0.8 packages remain intact. Each GitHub artifact includes `test-results/habemus-candidate.json` with the digest of its own inner office ZIP; an outer artifact digest identifies a different file.

## Development checks and portable build

These commands are for development, outside the office. Tool setup is described in [automation instructions](docs/AUTOMATION.md). To reproduce the verified runtime, first check out commit `d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89`. Prepare its pinned local model with `python tools/prepare-models.py` before building the complete office package.

```sh
node tools/check.js
node tools/verify-browser.js
node tools/verify-browser.js --file
python tools/build-ingest-worker.py --check
python tools/package.py
python tools/package.py --office
```

Development tests need Node, Playwright, Chromium and Python's standard library for generated SQLite/package fixtures. They are not workplace runtime dependencies. `node tools/verify-browser.js` owns the test server, full Playwright run and cleanup; no manual browser walkthrough or separately managed server is needed. It labels HTTP evidence as supplementary. `--file` uses actual local file URLs without modifying browser policy; the managed Chromium here still blocks that entry. GitHub CI runs both profiles on its test browser. See docs/AUTOMATION.md. Reviewed process-sandbox escalation is needed in this coding environment.

`tools/package.py` creates `dist/PBGC-RAG-1.0-rc1-core.zip`, validates local assets/ZIP CRC/SHA-256, and includes a build manifest. Rebuild the generated ingest worker after changing parsers. Pinned PDF.js is Apache-2.0; license, hashes and build instructions are included. No Python RAG-Anything code or runtime dependencies were imported. The default core ZIP includes the sentence encoder and generation runtime but excludes GGUF weights. Developers prepare the model outside the office, then run `python tools/package.py --office` to produce the complete `dist/PBGC-RAG-1.0-rc1-office.zip`. That profile fails unless the exact pinned model size and SHA-256 pass, includes model/manifest/license assets, and verifies ZIP CRC plus every packaged file hash. Transfer that complete ZIP to the office. No preparation command is a workplace runtime step.

## Current limits and next development

The current model is conservative and can decline a valid question. The larger model has not been shown to be more accurate on real plan documents. The fixed synthetic evaluation is small; broader question coverage remains to be measured. This verified 1.0 candidate adds combined facts, confirmed table column names and selected-page PDF reading to the earlier document-selection flow. Its four source/package Windows/Ubuntu gates passed for runtime `d3ce073`. See [candidate verification](docs/HABEMUS-ACCEPTANCE.md).

Other OCR languages, full PDF table reconstruction, broader format/query support and complete assistive-technology/performance evaluation remain unfinished. See PROGRESS.md, ACCEPTANCE.md and BLOCKERS.md for test scope.

Official actuarial calculations and template outputs are outside the current RAG milestone. Their missing source contracts do not block document search or question answering. No official output approval is enabled.

## Optional scanned-PDF reading

The first-run guide enables scanned-page reading. In the document workspace, enable **Read text from scanned PDF pages** before importing a scan if it is off. All English recognition assets are included in the office ZIP. Only pages with no native text are recognized; mixed pages with a native text layer retain that layer without OCR. Limits: 20 image-only pages per PDF, 8 million pixels per rendered page and 180 seconds total. Machine-read text, numbers and line regions can be wrong: check the original page before using them. OCR confidence is not factual confidence. Source bytes are preserved; version 3 exports re-run the pinned processing profile on restore. See docs/OCR.md and docs/PDF-OCR.md.

To read an image area on a page that already has selectable text, open **Original PDF page**, go to that page and choose **Read text from this page**. **Cancel reading** keeps the earlier text. This selected-page tool preserves earlier source links and notes.

## Original PDF pages

In View evidence or View source, choose **Original PDF page** to inspect the saved PDF inside the reader. Page navigation, zoom and original downloads stay local. Image pages can be viewed even without a parsed text record; page navigation does not change the citation. Interactive content and annotations are excluded. See [preview limits and verification](docs/PDF-PREVIEW.md).
