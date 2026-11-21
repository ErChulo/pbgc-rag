# Audit remediation 1.1

Status: **1.1 RC1 — accepted for controlled office pilot testing.** Updated November 21, 2026, Eastern time. Tested runtime: `5236770cbf10f13ea00b9dada3a7fc89ee8f381b`.

All six Windows/Ubuntu source, complete-package and full 1 GiB actual-file jobs passed for this runtime. See the [exact verification record](evidence/audit-5236-public-ci-status.json). The history below retains earlier failures and their repairs; old pending statements describe those checkpoints, not the final status. This acceptance covers the bounded documentary RAG workflow, not general semantic entailment, source truth, official outputs or every possible document format.

The independent audit examined `main` at `c429b8f`. Remediation developed on `codex/rag-audit-remediation-1.1`, based on `d28733f`, whose application runtime was `d3ce073`. After all six gates passed, the user explicitly requested integration into `main` on November 21. The fast-forward preserves main's history and the verified application bytes. Published releases and the earlier complete office ZIP remain intact. This integration does not publish a new release or cloud environment.

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
- Full-case text candidate search verifies compact authenticated term indexes, then loads matching passage shards. Learned embedding reranking covers its bounded shortlist. It is not global dense retrieval over the whole case. Broad matches can require a narrower question or document selection.

Primitive storage and archive tests alone do not accept the collection controller, UI, 1 GiB workload or complete offline package. A later intermediate synthetic 1 GiB run passed as recorded below; final-head scale and platform gates remain separate.

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

The 1 GiB baseline finished with a failed backup-sample assertion and full-case searches of 214–225 seconds. All 256 originals imported, original hashes and three exact marker locations were recovered, and the case reopened. The failed harness confused random source-ID archive order with corpus order. Its correction needs a full rerun; the original failed result is retained in the [baseline disposition](evidence/audit-large-case-baseline-1gib.json). No new release candidate claim or publication follows from these checks.

## Verification after the first audit commit

Commit `8cb887306267d7e4a069b9136fdd4ca8c1e8d61f` is saved and pushed on the isolated audit branch. Its source and complete-package workflows passed on Windows and Ubuntu: [four exact job links](evidence/audit-8cb-public-ci-status.json). These include real model, OCR and actual-file browser checks at their bounded workloads. The separate large-case jobs failed and do not earn a passing large-case badge.

A quiet, serialized real-Qwen UI rerun passed both checks with the unchanged 120-second generation deadline, zero external requests and exact source citations. The earlier concurrent-load timeout remains a recorded failure: [quiet rerun](evidence/audit-qwen-quiet-http.json). This is one generated synthetic fact, not a broad quality certificate.

A full persistent-browser restart retained a real 5 MiB original, its verified hash, authenticated derived data and the nonextractable HMAC key: [persistence evidence](evidence/audit-vault-persistent-http.json). This is distinct from the 1 GiB database/page reopen test.

The larger model now has a second pinned asset path: the existing permanent office ZIP. Its 777,132,222 bytes, archive hash, 91 model parts and reconstructed 760,944,640-byte GGUF were checked. Twenty-one Python supply tests pass. This adds **asset redundancy on GitHub**, not a second hosting provider: [actual secondary-asset verification](evidence/audit-model-secondary-asset-verified.json).

Compact exact term postings are being integrated to avoid rereading all passage bodies per query. Candidate ranking must retain complete source/generation inventories, count broad matches before limiting candidates, reject missing cache shards and bind selected IDs back to original passage payloads. This remains lexical candidate search followed by optional learned reranking, not a global dense index. The new implementation requires fresh browser, 1 GiB and actual-file CI results.

## Compact-index development checks

The compact index keeps exact normalized term postings separately from full passages. It verifies every selected inventory before choosing candidates, then checks complete ordered chunk IDs and source bindings when loading matching payloads. Missing compact shards, wrong generations, stale normalization profiles and mismatched candidate payloads fail closed. Older passage-only caches also check their signed passage count.

The latest Node suite has **455 passing checks, zero failures and seven explicit skips**. Thirty targeted real-Chromium collection, persistence and visible question-flow checks pass, with zero external requests. Additional joined-condition regressions preserve full benefit wording and complete `and`, `or` and comma conditions; irrelevant rates cannot supply an age answer.

Intermediate measurements are in the [compact-search development evidence](evidence/audit-compact-development.json): 32 MiB full-case queries took 834/857/785 ms, compared with the earlier several-second scans. A 4 MiB run with actual Qwen returned the exact 731 fact and citation inside the unchanged 120-second generation deadline. Generation took about 97 seconds on this host; the 70-second automated file handoff is recorded separately from model hash/load. No claim of 30-second model answers follows from this result.

The app now uses verified source selection for single facts as well as compound/table answers. The prompt contains complete relevant source statements while conflict, applicability, injection and grounding checks still cover the full retrieved evidence. External auto/plain provider contracts retain their earlier behavior. A new complete 1 GiB run with the pinned model and final-head Windows/Ubuntu CI remain required.

## Persistent restore and final safeguard checks, November 20

The clean intermediate `ac68c7f` runtime passed the [1 GiB supplementary benchmark](evidence/audit-large-case-ac68-1gib.json): 256 original files, 1,219,840 chunks, a real cited Qwen answer, all original backup hashes and three distinct sample reparses. The 17 minute 33 second run had a 5.31 GB process PSS peak. Its incognito context only reopened the database/page; it did not restart the browser or restore a complete second case. Source and complete-package checks also [passed on Windows and Ubuntu](evidence/audit-ac68-public-ci-status.json) at that commit. Its separate scale CI jobs failed at import and remain recorded failures.

Later review fixes retain every bounded exact candidate through reranking safety checks, reject facts assigned to another named subject, and share exact source-statement parsing between choice creation and validation. Ambiguous newline conditions, scope, reference clauses and definite-head qualifications remain attached to their source fact. Complete direct numeric conflicts still block before generation. [Review scope and limits](evidence/audit-final-review-notes.md).

The final Node suite passed **558 checks, zero failures and seven explicit skips**. Targeted Chromium integration passed **31 checks**, including native PDF headers/wrapped conditions, full persistent-browser restart, visible 26-original backup/restore, and selected-document questions. The final definite-head refinement followed that browser run and passed the complete Node suite; committed-runtime CI and the full scale run must verify the combined version.

The scale harness now uses a normal on-disk browser profile, records a changed browser PID on restart, captures quota/free-disk evidence and supports mandatory complete second-case restore. Both 4 MiB and 32 MiB full-restore smokes passed with exact stored bytes, every original/header binding, three restored source-location queries, original-case invariance and cleanup. The 32 MiB run took 55.3 seconds with a 756 MB PSS peak and zero external requests. These smokes used no model. The full 1 GiB restart, real-Qwen and complete-restore run, plus final Windows/Ubuntu actual-file checks, remain pending.

## Complete scale evidence and deletion repair

All six [Windows/Ubuntu checks passed for `a987a6e`](evidence/audit-a987-public-ci-status.json), including actual offline 1 GiB import, real Qwen, complete browser restart and full second-case restore. Ubuntu completed the scale workload in 17 minutes 16 seconds, with a 2.56 GB sampled process PSS peak. Windows completed it in 21 minutes 12 seconds, with a 4.25 GB sampled process-memory peak. Each verified all 256 restored originals and header bindings, three exact restored source locations, unchanged runtime bytes and zero sampler errors. This remains synthetic UTF-8 prose and one model fact per scale run, not arbitrary document-format or general answer-quality certification.

The separate 30-minute local HTTP run is still **FAIL**: all 256 originals restored and the real Qwen answer passed, but whole-case deletion exceeded its unchanged 30-second transaction budget. The old cursor unnecessarily read about 5.6 GB of cached payloads. The repair deletes through key cursors within the same atomic transaction, without reading original Blobs or cached values. Revision checks, cancellation and neighboring-case isolation remain intact. Twenty real Chromium/IndexedDB checks pass, including rollback after earlier deletions. The exact repair runtime and newly named `PBGC-RAG-1.1-rc1-office.zip` require fresh platform checks; no RC acceptance follows from the earlier commit alone.

The reproducible `tools/measure-rag-multiparagraph.js` probe adds actual local Qwen questions over a nine-document, eight-paragraph synthetic plan corpus, with full conditions and conflicting/unsupported controls. It is a separate bounded quality check, not a replacement for the scale or complete-package gates.

## Numeric answer-choice repair

The first actual multi-paragraph run at `98c1bb3` correctly blocked conflict and unsupported-topic questions, but returned `NONE` on an answerable age question. Its prompt offered the repeated, nonnumeric statement “The review does not change the normal retirement age” alongside the complete conditional age fact. No unsupported answer was released. The [original failed run](evidence/audit-98c1-real-model-failure.json) remains FAIL.

Prose choices for age/factor value questions now require an assertion of the requested numeric role. Explicit definitions/explanations, WHO questions and typed table statuses remain supported. Exact duplicate prose quotations from the same verified original hash retain the first eligible citation; different originals, numbers, conditions, negations and typed table rows remain distinct. These changes affect prompt choices only. The full retrieved safety inventory, model `NONE` result, grounding checks and deadlines are unchanged. Independent review passed 41 relevant checks and confirmed that genuine conflicts still stop before generation. A fresh actual-model and exact-head platform run is required.

## Final 1.1 RC1 acceptance

The corrected runtime `5236770` passed all six required jobs: source, complete office ZIP and full 1 GiB workload on both Windows and Ubuntu. Both source jobs also passed the new actual-Qwen multi-paragraph check. The test corpus and 120-second generation deadline were unchanged from the failed regression. The two ordinary questions now retain the complete service/vesting and early-election conditions with exact original citations; conflict and unrelated questions stop before generation. [Local actual-model record](evidence/audit-5236-multiparagraph-http.json).

Both scale jobs imported 256 originals totaling 1 GiB, searched 1,219,840 chunks, generated a real source-bound answer, restarted the full browser and rebuilt all 256 originals from backup into a second case. Original hashes, table bindings, three restored source locations and final deletion passed. The key-only deletion repair preserves the original atomic transaction, cancellation guards and 30-second storage deadline. [Platform summaries and job links](evidence/audit-5236-public-ci-status.json).

The independent local complete-ZIP check also passed: 270 manifest files, automatic included-Qwen startup, one exact cited answer, English OCR, original PDF-page reading and zero external requests. Its sampled full-process PSS peak was 4.43 GB under the unchanged 12 GB budget. Its local archive digest is distinct from each CI ZIP and the outer GitHub artifact: [local package evidence](evidence/audit-5236-office-http.json).

The local Node suite passed 573 checks with zero failures and seven explicit skips; the targeted Chromium workflow passed all 31 checks, and the vault suite passed all 20. Independent review covered the final source-role/qualification fixes, atomic key deletion and numeric-choice/dedup changes. Required real-model and platform gates ran separately, rather than treating skipped optional module tests as acceptance.

RC maturity means readiness for controlled office testing of the documented workflow. The scale corpus is synthetic UTF-8 prose; it does not certify arbitrary PDF/OCR/Office collections, the configured 2,000-document maximum, general model accuracy or the actual office desktop. Local storage/backups remain unencrypted by the documented interim decision. Global dense retrieval, optional passphrase encryption and broader format/quality coverage remain future work. No official actuarial approval is claimed. The verified increment is integrated into main; earlier packages and published environments remain preserved.
