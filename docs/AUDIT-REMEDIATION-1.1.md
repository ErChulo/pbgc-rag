# Audit remediation 1.1

Status: **development; not a release candidate for an approximately 1 GB case.** Updated November 18, 2026, Eastern time.

The independent audit examined `main` at `c429b8f`. This work is isolated on `codex/rag-audit-remediation-1.1`, based on `d28733f`, whose application runtime was `d3ce073`. `main`, published releases and the earlier complete office ZIP remain preserved. No new release or environment publication is authorized by this increment.

The audit's central conclusion stands: passing small fixtures is insufficient evidence for ordinary multi-paragraph documents, and the old workspace cannot hold the user's full case. The later branch had already fixed some findings from the older audited head. Those differences are recorded below; they do not close the new scale requirement.

## Release bar

Before another RC claim, require all of these results for the final source and package:

1. Retained P0 regression fixes on realistic multi-paragraph synthetic plan documents, with real conflicting and unsupported evidence still blocked.
2. Import, searchable coverage, source inspection, actual-model answer, cancellation, restart, backup and restore at the declared approximately 1 GB case size. Measure complete browser/process memory and elapsed time. A large configured limit, padded original file or tiny extracted-text corpus is insufficient.
3. Actual offline `file://` source and extracted-package tests on Windows and Ubuntu for the final head, including real included Qwen and OCR. Local HTTP browser checks are supplementary. The managed development browser's administrator block is recorded, not bypassed.
4. A fresh independent review of the integrated fixes, documented residual accuracy limits and plainly stated storage behavior.

Missing official actuarial rules, field dictionaries or output templates do not block the active document-search RAG workflow. Official output generation remains outside this increment.

## P0 dispositions

| Finding | Current change | Evidence and limit |
| --- | --- | --- |
| P0-1: unrelated numbers create conflicts | Compare property, unit, factor lookup key, frequency, person/group and temporal qualifiers; normalize number words; treat strict value-set elaboration as compatible. Check topic relevance before unrelated conflicts | `tests/rag-multiparagraph-audit.test.js` independently rerun: 12 PASS. Eight-paragraph/nine-source distractions, retained age conflicts, factor schedules and unsupported mortality questions are included. Heuristics do not establish legal applicability or general entailment |
| P0-2: singular/plural and acronym questions abstain | Shared topic normalization handles known singular forms and PBGC acronym expansions, including ERF/LRF/BFCF/AFTAP/NRD/ARF | Same multiparagraph regression includes singular factor and ERF question variants. This is documented vocabulary normalization, not unrestricted language understanding |
| P0-3: one false source appears authoritative | Successful answers record unique cited original-document hashes and disclose: “Only one source is cited. Check the source.” Both standard and large-case answer UIs include the notice | Module regression verifies a document saying age 99 is attributed and warned about. A citation establishes what the source says; the application cannot independently determine that source's truth. Integrated UI verification remains a separate gate |
| P0-4: native stamp/header masks scanned body | Explicit per-page native/OCR/both/unprocessed coverage, unknown native/external-OCR origin, and warnings listing native-text pages whose image areas were not read | `tests/ocr-coverage-audit.test.js`: 7 PASS in independent rerun. Selected-page OCR remains available. Automatic missing-text OCR does not claim to read every image area. Large-case final coverage aggregation and UI integration still need end-to-end checks |
| P0-5: unclosed hidden HTML element silently loses trailing text | Fail when a script/style/template/noscript hidden stack remains open at end of input | Regression added in `tests/formats.test.js`; no partial source is accepted. Other unsupported HTML structures remain bounded inert extraction, not browser layout fidelity |

## Retrieval and grounding

The new domain evaluation uses real pinned embeddings on multi-paragraph PBGC-flavored synthetic documents. A cosine threshold of 0.25 retains all 22 relevant targets **and all 12 unanswerable near misses**. It is retained only as candidate screening. `relevanceEstablished:false` makes that limit explicit; topic/source guards remain necessary. No stronger relevance claim follows from `weak=false`.

Measured chunk comparison: 1,800-character chunks achieved 22/22 Recall@1; 800-character chunks achieved 17/22. Both achieved 22/22 Recall@3. The normal default is retained rather than changing it on intuition. Exact corpus, model identity and scores are in [retrieval evidence](evidence/retrieval-domain-v1.json), with interpretation in [retrieval audit](RETRIEVAL-AUDIT.md).

Saved retrieval changes include conservative same-source passage deduplication, lexical support in hybrid weakness, early query-length validation and measured tokenizer coverage. A changed number, qualifier, negation or other document must not disappear as a duplicate. Chunking prefers sentence boundaries, carries OCR/text-layer metadata and repeats only explicitly selected table headings. Safe defaults are 2,600 context characters, three chunks and a 512-token output maximum; advanced context settings remain bounded separately.

These are source-support checks. They do not prove entailment, applicability, factual truth or general answer quality. Real-Qwen regression and integrated browser execution are required in addition to mock-provider/module tests.

## Ingest and coverage

Native PDF parsing now has explicit trusted input budgets up to 64 MiB and page windows up to 200 pages within a document of up to 10,000 pages. A dense or over-budget page is omitted wholly and identified; a truncated prefix is not presented as a complete page. Parent output validation and generated native/raster worker integrity checks reject malformed or replaced worker output.

A new bounded OCR profile can read the first bounded set of missing-text pages and identify the remainder. Existing saved profiles remain strict. Low-confidence text is retained with an unverified, low-confidence marker and a warning rather than silently discarded. Native text layers, including possible Adobe OCR, have unknown origin and require source review.

Static PNG, JPEG and WebP sources have a bounded isolated OCR path. Header/pixel limits precede decoding, original bytes are kept, and generated text carries image locators and machine-text provenance. Standalone images and large native PDFs still require integrated browser, restore and package tests.

DOCX extraction reports skipped nonempty related parts. HTML hidden-element truncation fails explicitly. Individual formats still have internal expanded-text, structure and record budgets; the 64 MiB input allowance does not imply arbitrary format fidelity or complete extraction.

## Recovery and large-case architecture

Legacy current and previous recovery snapshots decode independently. A corrupt previous snapshot does not block an intact current snapshot. A corrupt current snapshot requires explicit prior-snapshot selection before a rollback save; no silent replacement occurs. Thirteen independent recovery regression checks pass, including failed-write preservation and stale-tab conflicts.

The old JSON workspace remains bounded at 20 MB, 200 sources and 50,000 records. Raising those numbers alone would retain repeated whole-catalog copies and cannot establish large-case viability.

The new **Large case workspace** is separate:

- IndexedDB holds original Blobs separately from source metadata and bounded record/passage shards. Large cases do not fall back to memory or localStorage.
- Configured bounds are 1 GiB of original bytes, 2,000 documents, 64 MiB per source and 8 GiB of derived cache. Browser quotas can reject a write below those limits. These are guards, not accepted workload measurements.
- Original writes and reads verify SHA-256. Locally generated shards are HMAC-bound to case/source/hash/revision/parser identity using a persisted nonextractable browser key. This protects cache integrity; it does not encrypt case data or establish document truth.
- Header reconfiguration stages a new derived generation before switching the summary. Backup ZIPs contain originals and explicit column choices. Reopen verifies original bytes and reparses them; imported cached records/vectors never supply trusted evidence.
- Full-case text candidate search scans selected authenticated passage shards. Learned embedding reranking covers its bounded shortlist. It is not global dense retrieval over the whole case. Broad matches can require a narrower question or document selection.

Primitive storage and archive tests are useful but do not accept the collection controller, UI, 1 GiB workload or complete offline package. That integration is in progress. The largest prior published resource test used an approximately 1 MiB corpus, not a 1 GiB case.

## Storage decision

Optional passphrase encryption is wanted but not a prerequisite for this repair. The interim choice is explicit **unencrypted local storage and unencrypted portable backups**, with a visible notice where cases are created. Keep originals and a portable backup. Browser recovery can be cleared. HMAC cache authentication is not encryption. AES-GCM/passphrase handling, unlock/recovery behavior and encryption-specific tests remain future work.

No confidential documents, PII or case backups belong in the public repository. All development and measurement fixtures must be synthetic.

## Performance work and remaining audit items

Saved work reduces repeated report locator scans, repeated graph construction/validation and workbench save-time rendering. Frozen-source index/cache bindings prevent reuse after source mutation. Legacy source pagination and normalized-text caches are integrated; the large-case controller and visible backup/reopen controls have separate browser coverage. A meaningful annotation, import and search workload must verify the final behavior; a microbenchmark alone cannot close the max-scale findings.

The audit's remaining P1/P2 items require individual disposition, not a blanket “all fixed” claim. In particular: model supply fallback robustness, platform sampler behavior, broader parser edge cases, optional encryption, full legacy catalog serialization reduction, global dense large-case retrieval, reviewed-annotation/RAG integration and shared-helper consolidation are not accepted by the targeted checks listed here. Avoid broad refactors that weaken existing source/citation guards.

Some old-head observations were already superseded in the base branch: the bundled model is now Qwen2.5 1.5B Q3_K_S, selected-page mixed OCR exists, typed table-field evidence exists, and the model reconstruction path no longer uses the audited triple-Blob assembly. Earlier Windows/Ubuntu actual-file/resource results apply to those tested commits only. Inspect current code and rerun final-head checks before closing related findings.

## Verification recorded for this document

Independent module rerun on the saved working tree:

```sh
node tests/rag-multiparagraph-audit.test.js  # 12 PASS
node tests/storage.test.js                  # 13 PASS
node tests/ocr-coverage-audit.test.js        # 7 PASS
node tests/pdf-native-protocol.test.js      # 5 PASS
```

The RAG tests use deterministic local test providers; they are not real-Qwen quality evidence. PDF protocol/coverage tests include instrumented workers and synthetic parser output; actual browser raster/OCR is a separate suite. A combined `node --test` invocation of these files and the format regressions also exited successfully. The coordinator must record the complete final integration/browser/resource runs and immutable commit identity before release acceptance.

Preserved historical RC1 evidence: [exact runtime/package record](evidence/habemus-1.0-rc1-verified.json). Its old badges are explicitly scoped to that runtime in the README. No new passing badge is earned merely by saving these fixes.

## Integrated development checks, November 19

- Complete Node suite: 423 pass, zero failures and seven explicit skips (before the additional question-set provenance regression, which also passes). Browser tests are separate.
- Real Chromium IndexedDB/vault: 16 pass, including authenticated generation cleanup and transaction rollback.
- Real collection orchestration: 13 pass, covering quoted CSV batches, independent Excel sheets, 250 native PDF pages, image OCR, a long physical text line, original-only backup/reparse, scope, cancellation and stale-source rejection.
- Visible large-case workflow: 26-document import, pagination, search, portable backup, full 26-original restore and browser reopen pass.
- Model-supply integrity tooling: 14 Python tests pass. Generated ingest/native-PDF/OCR worker freshness checks pass; source-only leak scan finds no issues.

Browser evidence above is supplementary HTTP only. Actual local file navigation is BLOCKED by administrator policy in this managed environment; no policy bypass was used. The Windows/Ubuntu actual-file workflows must verify the new branch. The full HTTP integration run found an immutable question-set snapshot that omitted new provenance fields; this was repaired without relaxing source equality, and its actual-chunker regression passes. A real-Qwen run also exceeded its unchanged deadline while the 1 GiB benchmark ran concurrently; it must be repeated in isolation before acceptance.

The 1 GiB workload is still running. Its result, timing, memory, exact runtime fingerprints and backup coverage must be recorded separately. No new release candidate claim or publication follows from these development checks.
