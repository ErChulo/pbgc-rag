# PBGC-RAG

[![Maturity: 1.1 RC1 office pilot](https://img.shields.io/badge/maturity-1.1%20RC1%20%7C%20office%20pilot-002D72)](docs/AUDIT-REMEDIATION-1.1.md)
[![Source checks: Windows and Ubuntu pass](https://img.shields.io/badge/RC1%20source-Windows%20%2B%20Ubuntu%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222537)
[![Office package: Windows and Ubuntu pass](https://img.shields.io/badge/RC1%20office%20ZIP-Windows%20%2B%20Ubuntu%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570)
[![Offline file entry verified](https://img.shields.io/badge/RC1%20offline%20file%20entry-verified-008065)](docs/evidence/audit-5236-public-ci-status.json)
[![1 GiB full restore: Windows and Ubuntu pass](https://img.shields.io/badge/RC1%201%20GiB%20restore-Windows%20%2B%20Ubuntu%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222476)
[![Included Qwen tested offline](https://img.shields.io/badge/RC1%20Qwen-offline%20tested-002D72)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222537)
[![English OCR tested offline](https://img.shields.io/badge/RC1%20English%20OCR-offline%20tested-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570)
[![Accessibility: automated checks pass](https://img.shields.io/badge/RC1%20accessibility-automated%20checks%20PASS-008065)](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222537)

Find information in your documents. Ask the included Qwen assistant a question. Open its source to check the answer. Save a case backup to keep your work.

**1.1 RC1 is a candidate for controlled office testing.** The badges refer to runtime [`5236770`](https://github.com/ErChulo/pbgc-rag/commit/5236770cbf10f13ea00b9dada3a7fc89ee8f381b) and its checked complete app package. Windows and Ubuntu CI passed the source, extracted-package and 1 GiB backup/restore checks. These tests use synthetic documents. They do not certify general answer accuracy, every document format or the actual office desktop. See the [audit and test record](docs/AUDIT-REMEDIATION-1.1.md) and [exact 1.1 RC1 CI evidence](docs/evidence/audit-5236-public-ci-status.json).

PBGC-RAG runs on your computer. It does not send your documents or questions to a service. It is an independent project, not an official Pension Benefit Guaranty Corporation (PBGC) product. You do not need an official template, field dictionary or actuarial rule to search documents and read supported answers.

## Download and open

[Download the tested Windows office package](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570/artifacts/14678863914). GitHub can ask you to sign in. Follow the extraction steps below.

1. Open the [passed 1.1 RC1 office run](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570#artifacts). Sign in to GitHub if asked.
2. Under **Artifacts**, choose **audit-rc1-office-evidence-windows-latest**.
3. Extract that download. Open **dist**. Extract **PBGC-RAG-1.1-rc1-office.zip** too.
4. Open the extracted app folder. Keep **index.html**, **assets**, **vendor** and **models** together. Double-click **index.html**.
5. Choose **Get started**, then **Start Qwen**. Wait for the ready message.

**Extract both ZIPs.** GitHub puts the app ZIP inside an outer artifact ZIP. Open `index.html` from the extracted folder. Use the complete office package; **Code → Download ZIP** omits the included model files.

Qwen2.5 1.5B Instruct Q3_K_S is included. No office installation, terminal, server or separate model download is needed. You need internet access to download the app from GitHub. The extracted app runs offline.

The app ZIP is about **777 MB**. Its extracted files use about **1.05 GB**. Allow **4 GB of disk space** for download and extraction, plus space for documents, indexes and backups. The target is a **16 GB RAM**, CPU-only computer with a current browser. GitHub artifacts expire **seven days after the run**. Keep your downloaded app ZIP.

Model startup and written answers can take more than a minute. The app shows progress and lets you cancel. Read source passages without Qwen when you want to find and inspect text first.

## Your first case

1. **Add documents.** Follow the guide for a small case, or open **Case → Open a large case workspace** for hundreds of documents. Use the supplied example to learn the controls. Read any import errors and missing-text notes.
2. **Ask one short question.** Include a plan name or participant ID when needed. For example: **What is the normal retirement age?** For CSV or Excel, confirm the column-name row before asking for a written table answer.
3. **Read the result.** Check which documents were searched. If there is no supported answer or the sources appear to disagree, read the passages before deciding what to use. You can search passages without Qwen.
4. **Check the source.** Open **View evidence** or **View source**. For a PDF, choose **Original PDF page**. **Save original** keeps the unchanged source file. File hashes stay under **Source details**.
5. **Save a backup.** In the standard workspace, choose **Save & reopen**. In a large case, choose **Save large case backup**. Keep the saved file and your originals. Use the matching reopen control to restore it.

A cited statement can still be wrong or apply to a different person or date. **Only one source is cited** means that the answer has no independent cited support. Check each citation. The app can abstain when it cannot support an answer.

Read the [office start guide](docs/OFFICE-START.md) for the full download path and first run. The [user guide](docs/USER-GUIDE.md) explains the standard workspace, tables and separate questions. The [large-case guide](docs/LARGE-CASE-GUIDE.md) explains larger imports, source checks and backup restore.

## Choose a workspace

| Your task | Use | Save and reopen |
| --- | --- | --- |
| Learn the app or work with a small document set | The guided standard workspace | **Save & reopen** with its saved case file |
| Search hundreds of documents | **Case → Open a large case workspace** | **Save large case backup**, then **Open a large case backup** |

The standard workspace has a 20 MB case limit and a 5 MB per-file limit. The separate large-case workspace is configured for **1 GiB of originals, 2,000 documents and 64 MiB per file**. Parser and browser-storage limits can be lower. The scale test used **256 synthetic text documents totaling 1 GiB**, including a full browser restart, one real Qwen answer, complete backup restore and original-file checks. It did not measure arbitrary PDF/Office collections or the 2,000-document maximum.

Large-case search checks stored term indexes, then reads matching passages. The local encoder ranks a bounded text-search shortlist; it is not a dense semantic index of the full case. Select one document or use a more specific question when a search is too broad. PDF text layers can be incomplete or machine-read. Read the import notes and check the original page.

Browser storage and case backups are **unencrypted**. Browser data can be cleared. Keep your original documents and portable backups. Optional passphrase encryption remains future work.

## If you get stuck

| What you see | What to do |
| --- | --- |
| Missing controls or app files | Extract both ZIPs. Open `index.html` beside `assets`, `vendor` and `models` |
| Qwen is not ready | Choose **Start Qwen**. Wait for the ready message, or read source passages |
| A question timed out or was cancelled | Start Qwen again when prompted. Ask for one fact or select one document |
| No supported answer | Check the selected case and searched documents. Use words from the source and read the retrieved passages |
| A written table answer is unavailable | Confirm the column-name row. Include the person's name or ID. Unclear layouts and formulas do not supply answer values |
| A PDF page has missing text | Check **Original PDF page** and the extraction notes. The standard workspace offers selected-page scan reading; the large-case workspace searches text layers |
| Work is missing after reopening | Open the case file or large-case backup you saved. Check the restored case name and document count |

## Earlier versions

`main` now contains **1.1 RC1**. Earlier releases and downloaded packages remain preserved. [1.0 RC1 evidence](docs/evidence/habemus-1.0-rc1-verified.json), [8cb source/package evidence](docs/evidence/audit-8cb-public-ci-status.json), [the ac68 intermediate benchmark](docs/evidence/audit-large-case-ac68-1gib.json) and [the six a987 CI checks](docs/evidence/audit-a987-public-ci-status.json) apply only to their named runtimes and workloads. Use the **1.1 RC1** download above for this candidate. Keep different app versions in separate folders. This integration does not create a new permanent release or publish the cloud environment.

## Verified 1.1 RC1 checks

All six jobs passed for runtime `5236770`. The complete package contains the tested application bytes; this later documentation update does not rebuild that ZIP.

| Gate | Windows | Ubuntu |
| --- | --- | --- |
| Source, actual model quality, offline file entry and resources | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222537/job/136633282483) | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222537/job/136633282017) |
| Complete office ZIP, included Qwen, OCR and source workflows | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570/job/136633273068) | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222570/job/136633272718) |
| Full 1 GiB import, browser restart, Qwen, backup and restore | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222476/job/136633290320) | [PASS](https://github.com/ErChulo/pbgc-rag/actions/runs/44836222476/job/136633290026) |

Both source jobs passed the qualified multi-paragraph Qwen regression. The separate local rerun retained complete conditions in both supported answers, blocked conflicting evidence and abstained on an unrelated question. These fixed synthetic checks are not a general accuracy estimate. See [platform evidence](docs/evidence/audit-5236-public-ci-status.json), [multi-paragraph model evidence](docs/evidence/audit-5236-multiparagraph-http.json) and [the independent local ZIP check](docs/evidence/audit-5236-office-http.json).

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
| PDF | PDF.js text items, page and raw geometry; approximate advance regions are labeled. Standard workspace offers bounded English OCR and selected-page reading. Large-case import reads existing text layers in page windows. No exact glyph bounds, reconstructed table structure or active actions |
| Static PNG, JPEG, WebP | Local English OCR with estimated image-line boxes, confidence and unverified machine-text labels; up to 8 million pixels and 4,096 pixels per edge; no animation, table reconstruction or handwriting accuracy claim |

These are bounded extraction subsets, not arbitrary format fidelity. Unsupported variants reject explicitly. Parser details and limitations: [dependencies](docs/DEPENDENCIES.md), [legacy](docs/LEGACY.md), [SQLite](docs/SQLITE.md), [PDF](docs/PDF.md), [isolation](docs/INGEST.md).

The standard workspace uses isolated parsers with cancellation and 15-second parser-operation deadlines. OCR has separate, longer limits. Binary parsing fails if workers are blocked; text up to 128 KiB has a bounded synchronous fallback. Standard import checkpoints can resume after reload. A failed standard batch does not replace the active source set.

The large-case workspace streams text and CSV, reads PDFs in bounded page windows and commits sources separately to IndexedDB. It keeps completed sources when a later file is cancelled; an incomplete new source is removed. Its total import can take minutes. Format-specific record, text, archive, pixel and worker-operation limits still apply. Read partial-extraction and missing-page notes.

Standard workspace limits: 5 MB per source; 20 MB, 200 sources and 50,000 records per workspace; eight cases and 80 MB per JSON recovery catalog. Its ordinary parser extraction is bounded at 2,000,000 UTF-16 code units per source. The separate large-case workspace uses the configured bounds above, streaming/page-window paths and an IndexedDB-only store. It does not use the standard JSON recovery catalog. The large source-byte allowance does not remove every format-specific cap. Browser workers have no hard OS memory quota; time and output limits do not certify hostile-document safety.

## Ask your documents

The [step-by-step user guide](docs/USER-GUIDE.md) covers assistant startup, document import, column names, questions, exact sources, scanned pages and saving. This branch can combine up to three independently supported factual questions in one result. It copies complete source statements or literal table fields. It does not infer new relationships or calculate values.

Choose the task you need:

| Task | What happens | Needs Qwen? |
| --- | --- | --- |
| Read source passages | Finds and shows the document text | No |
| Ask one question | Writes one short answer and links its supporting source | Yes |
| Combine independent facts | Checks up to three full questions and copies their supporting facts into one result | Yes |
| Ask separate questions | Checks up to three questions one at a time and shows a result for each | Yes |
| Ask about one document | Searches the document selected for that question | Only for a written answer |

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

The standard workspace selects IndexedDB, localStorage or memory according to browser support. Its recovery keeps one prior snapshot and checks stale-tab writes. Corrupt snapshots are checked independently. Standard version 2/3 case files retain their supported source-linked notes, table choices, layouts and OCR profiles. Restore checks original hashes and reparses sources; machine-text profiles are rebuilt with the pinned engine. Read the filename, case name and document count in the restore summary.

The large-case workspace requires IndexedDB. It has no localStorage or in-memory fallback for a large case. Original files stay separate from authenticated derived shards. **Save large case backup** writes a ZIP of originals and supported column choices. Restore creates a separate case, verifies original bytes and rebuilds its passages. Use the matching standard or large-case restore control for your saved file.

Browser storage and all case exports are **unencrypted**. Local integrity checks detect inconsistent original or cached content; they do not authenticate an author's claims or encrypt a case. Keep originals and portable backups because browser storage can be cleared, denied or tied to the app's file location. Removing a browser copy does not remove a backup you saved on disk. Optional passphrase encryption remains future work. Only synthetic fixtures belong in this public repository and remote development environment.

## Historical 1.0 RC1 evidence

These are **historical 1.0 RC1** results for runtime [`d3ce073`](https://github.com/ErChulo/pbgc-rag/commit/d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89). They do not accept the current 1.1 runtime or its larger-case requirement. Use the 1.1 download and evidence at the top of this README.

| Historical 1.0 gate | Result | Evidence |
| --- | --- | --- |
| Windows source workflow | PASS | [1.0 offline-file, regression, model and resource checks](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663979) |
| Ubuntu source workflow | PASS | [1.0 source checks on Ubuntu](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663857) |
| Windows complete office ZIP | PASS | [1.0 extracted-package checks](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663540) |
| Ubuntu complete office ZIP | PASS | [1.0 extracted-package checks on Ubuntu](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663958) |

Those tests checked actual offline-file entry, included Qwen startup, citations, cancellation, English OCR, PDF pages and the implemented accessibility controls. Automated accessibility checks were not Section 508 or WCAG certification. The historical fixed evaluation answered three of four synthetic questions and abstained on one. That was supported-answer coverage in a four-question set, not a general accuracy score.

Historical sampled source peaks were about 2.49 GB on Ubuntu and 2.55 GB on Windows; the local complete-package check peaked at about 4.53 GB. Their workloads and exact limits are in the [1.0 verification record](docs/evidence/habemus-1.0-rc1-verified.json). Old `habemus` artifacts and their inner ZIP digests identify the older 1.0 packages. The current badges at the top refer only to the separately named 1.1 runtime. A documentation change does not create a new tested binary or change an earlier ZIP.

## Development checks and portable build

Run these commands only for development, outside the office. They are not app installation steps. To reproduce this candidate, check out **`5236770cbf10f13ea00b9dada3a7fc89ee8f381b`**. Install Node.js, pinned Playwright/Chromium and Python 3 as described in [automation instructions](docs/AUTOMATION.md). The examples use a development terminal with Bash.

```sh
git checkout 5236770cbf10f13ea00b9dada3a7fc89ee8f381b
python3 tools/build-model-profile.py --check
python3 tests/prepare-models.test.py
python3 tools/prepare-models.py
python3 tools/build-ingest-worker.py --check
python3 vendor/pdfjs/build-worker-source.py --check
python3 vendor/pdfjs/build-ocr-worker.py --check
node tools/check.js
PBGC_REQUIRE_MODEL=1 node tools/verify-browser.js
PBGC_REQUIRE_MODEL=1 node tools/verify-browser.js --file
PBGC_CHALLENGE_QWEN=1 node tests/rag-challenges.test.js
node tools/measure-rag-multiparagraph.js --file --expected-commit 5236770cbf10f13ea00b9dada3a7fc89ee8f381b --output test-results/verification-multiparagraph-file.json
node tools/measure-resources.js --file --out test-results/resources-file.json
node tools/measure-large-case.js --file --mib 1024 --with-model --full-restore --timeout-ms 7000000 --out test-results/large-case-file.json
python3 tools/package.py
python3 tools/package.py --office
```

`node tools/check.js` runs module checks; it does not run the browser suite. The two `verify-browser.js` commands own their supplementary HTTP and actual-file tests and cleanup. The multi-paragraph probe makes two real Qwen calls with complete conditions and checks two unsafe/unrelated cases before generation. The mandatory 1 GiB command uses a normal persistent profile, a full browser restart, real Qwen, exact-source checks and a complete second-case backup restore. Run model and scale workloads sequentially. Allow enough disk space and time for both original and restored indexes.

Actual `--file` checks do not change browser policy. If local-file navigation is administrator-blocked, record BLOCKED; supplementary HTTP does not replace it. CI checks Windows and Ubuntu separately. Source, complete extracted-package and 1 GiB scale workflows all must pass for the candidate commit.

`tools/package.py` builds **`dist/PBGC-RAG-1.1-rc1-core.zip`** with the local encoder and generation runtime, excluding GGUF weights. `--office` builds **`dist/PBGC-RAG-1.1-rc1-office.zip`** with the exact pinned Qwen model. Packaging checks local assets, CRC, model size/SHA-256 and the packaged file hashes. Rebuild generated workers after changing their source modules; freshness checks must pass. PDF.js is Apache-2.0, with vendored licenses and provenance. No Python RAG-Anything runtime is required by the office app.

The office workflow tests its exact extracted complete ZIP before uploading it. Its Windows artifact is **audit-rc1-office-evidence-windows-latest**. Preparing models and building ZIPs are development tasks; the office user only extracts and opens the checked package.

## Current limits and next development

1.1 RC1 is a bounded offline document RAG candidate. It retrieves passages and returns checked source statements or literal table fields. It can decline a valid question. It does not prove that a source is true, decide which conflicting provision governs or infer how separate rules apply to a participant.

The fixed synthetic evaluations are small. The qualified multi-paragraph test checks a normal retirement age with its service/vesting conditions and an early-retirement factor with its election condition. These are integration and regression examples, not broad real-plan accuracy estimates. The 1 GiB scale test uses synthetic text and one distinctive model question. Neither test proves performance for arbitrary PDF/Office collections or the configured 2,000-document maximum. See the [exact current CI record](docs/evidence/audit-5236-public-ci-status.json) and [qualified local model evidence](docs/evidence/audit-5236-multiparagraph-http.json).

Large-case retrieval checks exact normalized term candidates across the selected documents, with bounded learned reranking. It does not build a global dense index of the entire case. Broad or heavily paraphrased questions may need a document name, participant ID or more specific wording. Native PDF reading order and text-layer completeness are not guaranteed; external OCR text can contain errors. Read coverage notes and originals.

Optional passphrase encryption, more OCR languages, full PDF table reconstruction, broader format/query support and wider real-plan question evaluation remain future work. Manual assistive-technology checks and measurement on the actual office desktop remain separate from CI. Browser storage and backups are currently unencrypted, with visible notices. See [progress](PROGRESS.md), [acceptance](ACCEPTANCE.md) and [remaining scope](BLOCKERS.md).

Official actuarial calculations and template outputs are outside this RAG milestone. Their missing source contracts do not block document search or question answering. No official output approval is enabled.

## Optional scanned-PDF reading

The complete office ZIP includes local English OCR. In the **standard workspace**, the guide enables scanned-page reading. Enable **Read text from scanned PDF pages** before importing a scan when needed. Automatic reading targets bounded pages with no native text. Page coverage notes identify image content that was not read; a header, stamp or Adobe text layer does not prove a whole page was extracted.

For a mixed page in the standard workspace, open **Original PDF page**, go to that page and choose **Read text from this page**. **Cancel reading** keeps earlier text. The selected-page tool preserves earlier source links and notes. The standard profile limits OCR to 20 pages per source, 8 million rendered pixels per page, 4,096 pixels per edge and a bounded 180-second overall operation. Other parser limits still apply.

The **large-case workspace** currently reads native or externally OCR-created PDF text layers in page windows. Its PDF import does not integrate automatic or selected-page PDF OCR. Read missing-page and image-coverage notes; add an external text layer when needed. Static **PNG, JPEG and WebP** images can be imported separately for local OCR in either workspace, within the image budgets.

Machine-read words, numbers and line regions are unverified. Low-confidence lines are marked and retained with warnings. Confidence is a recognition score, not factual confidence. Check numbers, dates, negation and conditions against the original. Original bytes remain unchanged. Supported OCR profiles are rebuilt from originals during their corresponding restore paths. See [OCR details](docs/OCR.md) and [PDF processing details](docs/PDF-OCR.md).

## Original PDF pages

In View evidence or View source, choose **Original PDF page** to inspect the saved PDF inside the reader. Page navigation, zoom and original downloads stay local. Image pages can be viewed even without a parsed text record; page navigation does not change the citation. Interactive content and annotations are excluded. See [preview limits and verification](docs/PDF-PREVIEW.md).
