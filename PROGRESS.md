# Progress

## Increment 0.5: local integration verified

Implemented real offline English OCR, bounded PDF rasterization and case schema 3 processing profiles. Original scans are preserved; derived text and estimated regions are labelled. Unknown engines and profiles hidden in older schemas reject. Versions 1 and 2 remain readable. The complete office ZIP includes all models, runtimes, licenses and offline audit evidence.

Fixed evaluation: 12 retrieval questions (recall@1 .8333, recall@3 1.0), 32 source-release challenge cases and 20 orchestration tests. Real Qwen releases 3 correct source-bound answers out of 4 frozen factual questions, conservatively abstains on 1, and blocks all 4 unsafe contexts. Fixes cover same-chunk conflicts, subject/number/order swaps, unrelated-question answers, dropped conditions, partial multi-part answers, archival identifiers and prompt distraction. The local single-statement profile intentionally cannot claim general multi-document/table synthesis or verified legal applicability.

The 1 MiB/128-source/748-chunk whole-process workload passed: sampled Linux PSS peak 1,778,615,296 bytes, indexing 54.4 s, real Qwen generation/grounding 34.4 s. The hard workload threshold is 12 GB under the 16 GB target; this does not certify every maximum-size/OCR/parser/desktop workload. Eight measurement helpers validate accounting; the expensive duplicate test is opt-in and the actual resource CLI is required separately in CI.

Local regression covered 279 tests: 277 passed, 1 initial checkbox boundary defect was fixed and its accessibility rerun passed, 1 duplicate resource invocation was intentionally skipped. Real-quality and extracted complete-ZIP inference/OCR also pass. Initial failing evidence is retained honestly. Durable results are under docs/evidence/*0.5*. Actual Ubuntu/Windows file-profile, quality and resource gates precede merge; the complete office-v0.5.0 ZIP release must be anonymously downloaded, checksummed, extracted and tested before delivery. No office preparation commands and no environment publication. Authoritative PBGC work remains deferred.

## Complete office delivery fix — 0.4.1

The previous workspace links and core-only ZIP did not satisfy delivery. The complete `--office` package now includes the verified 491400032-byte Qwen GGUF, model manifest/license, all application assets and a root office-start guide. Preparation commands are developer-only. Office use is extraction, opening index.html and ordinary in-app file selection of the already included model; no terminal, Python, installation, server or network is required.

An independent extracted-ZIP test streams every member against the package manifest, uses a directory with spaces, loads the actual included Qwen, generates a source-quoted answer and checks evidence navigation and absence of external/outside-package loads. Supplementary local test PASS in45seconds; actual file with browser network disabled is gated on Ubuntu/Windows CI. The release workflow stages the exact tested ZIP privately, waits for both platform jobs, re-downloads/checks the exact bytes, then exposes a normal GitHub release download. Large weights remain out of Git history and no environment publication is performed.


## Local RAG increment — build 0.4

Implemented source-bound chunking, verified 384d learned sentence embeddings in an isolated worker, semantic/BM25 hybrid retrieval and real local Qwen CPU generation. Heavy packs load lazily. The question flow displays readable source quotations with View evidence, retains model files separately from case sources, clears workspace-derived answers/indexes on changes, and supports hard cancellation. Network remains blocked by CSP.

The local Qwen profile generates one short factual sentence. Code independently selects an exact supporting source sentence with every substantive term present and numerical/entity/negation/qualification checks; it abstains on unsupported relations, joined claims and dropped conditions. Diagnostics distinguish automatic supporting-source selection from model-emitted citations. Generic JSON providers keep their explicit citation contract. These checks do not prove semantic entailment or legal applicability. Coordinator full suite: 221 PASS, zero FAIL/skipped, with real model required. Actual UI answer/source citation/cancellation passed in37.8seconds. Durable evidence: docs/evidence/rag-0.4.json and .log. Linux/Windows actual-file gates follow in GitHub CI.

The independent four-question paraphrase set returns recall@1 .75 and recall@3 1.00; the cash-out query remains weak. Official PBGC authority is deferred by user direction, and official-output/enterprise gates remain unchanged. The491400032-byte Apache Qwen pack is ignored by Git and excluded from the core ZIP; tools/prepare-models.py verifies every download part and the whole file before separate local delivery. No environment publication.


## Cross-platform verification hardening

The first Ubuntu/Windows matrix isolated two portability defects: PDF-specific tests bypassed CHROMIUM_PATH with a Linux-only executable path, and ZIP manifests used host-native Windows separators. Those are fixed; package paths are POSIX-canonical and every PDF test honors the configured browser. Git text attributes preserve audited LF source/bundle bytes across checkout platforms. The coordinator complete local run passes 183 checks with zero failures/skips. Durable evidence: docs/evidence/portability-0.3.json and .log. Remote platform outcomes remain inspectable in GitHub Actions for each commit; no manual user checks are required.

## GitHub integration and independent CI

The 0.3 source increment was committed as 1c3ce6e, pushed to codex/source-review-0.3 and fast-forwarded into main. GitHub Actions run 41152768376 completed Success in 1m 37s, including the supplementary HTTP and actual file:// steps and packaged synthetic evidence. This establishes actual-file evidence on the tested Linux Chromium runner without bypassing managed local browser policy. It does not establish locked-down workplace Windows approval.

CI now uses pinned Node24 GitHub actions and an Ubuntu/Windows matrix, with distinct artifact names and bounded failure annotations containing synthetic test names only. This removes the Node20-action deprecation warning and automates Windows compatibility checks. Local supervisor/CI replace manual browser walkthroughs; no environment publication is performed.

## Case-review increment — build 0.3

Continued autonomously with source-bound field dictionary mapping, evidence observations and exact-content human review claims, conservative conflict/abstention checks, typed read-only source-table queries, isolated mapped DOCX/XLSX test generation, and version 2 case persistence. Source-only v1 imports remain compatible. Reports/graph links, dictionary bindings, explicit headers and annotations revalidate against original source bytes on reload/import. Unknown schemas or forged review/source fields reject before case mutation. Official release remains disabled.

Added a lifecycle-owned Playwright supervisor and GitHub Actions verification. The supervisor scans source, owns its loopback server, runs all tests, propagates failure and cleans up without manual checks. CI also tests real file URLs on its own browser. The managed local Chromium restriction remains; no browser policy was bypassed. Test/CI evidence is browser-specific, not Windows enterprise approval.

Coordinator final full verification: 181 PASS, zero FAIL, zero skipped across 29 files. Durable evidence: docs/evidence/review-0.3.json and .log.

Independent review found and fixed empty-startup recovery blocking, unsaved scope/mapping review mismatches, private cross-case drafts and selected-evidence loss on autosave. Bulk annotation validation now builds the source index once, avoiding repeated indexing for each fact. Generic template rendering has hard worker timeout/cancellation and never falls back to the UI thread.

GitHub: the audited passing 0.2.2 commits were pushed to codex/offline-casework-0.2.2 and fast-forwarded main to 64d18a8 under the user's explicit push/merge authorization. The passing 0.3 source increment uses codex/source-review-0.3 for integration. The initial automatic push review was cleared after source/destination audit; no confidential files or actual official templates/dictionaries are committed. GitHub API calls are restricted here; Git transport works. No environment publication is authorized or performed.

Remaining official acceptance still requires authorized dictionaries/definitions, original official templates/maps, BSRS grammar/validator, actuarial reference data and reviewed legal interpretations. Generic mappings, unauthenticated reviewer claims and synthetic arithmetic do not establish those official inputs or results. Continue independent engineering/automation; do not ask the user to perform checks available to Playwright.

## Automated restore verification — build 0.2.2

The user asked to stop the manual walkthrough and use Playwright. Playwright reproduced the UX problem: a successful same-file restore left an empty picker and two identical case labels, with feedback only in the distant global status. Restoration itself preserved the source data.

Fixed adjacent restore feedback with the chosen filename, active copy, document/excerpt counts and a Search restored case action. Pending, error and cancellation feedback is local to the picker. Duplicate case names receive distinct display labels while stored names and source bytes remain unchanged. Workspace changes clear stale restore summaries.

Independent Playwright verified the extracted 0.2.2 package through repeated same-file restores, search, original-data/export integrity, tamper rejection and cancellation with no mutation on failed restore. Coordinator ran the full automated suite: 124 PASS, zero FAIL across 21 files. Two older PDF/legacy assertions were updated to verify readable default locations and exact locators inside Source details. Evidence: docs/evidence/automated-restore-0.2.2.json and .log. Tests use supplementary Chromium HTTP; the user's live Firefox session is not connected, and local Firefox automation is unavailable here. No manual walkthrough is required for the tested flows. No publication or push performed.

## Reading view correction — build 0.2.1

User feedback during the guided manual check identified hashes and raw JSON locators dominating source reading. The default source list, search results, graph excerpts and evidence dialog now use readable locations (for example, Line 2, Paragraph 7 or Sheet · Cell B2). File fingerprints, parser versions, exact locators and extraction warnings remain in collapsed Source details. Original sources, hashes, parser output, package schemas and export validation are unchanged. Evidence dialog scrolling and selected-excerpt spacing were simplified.

Targeted independent and coordinator checks cover hidden-by-default/revealable metadata, readable locations, byte-preserving source/package export, Office/SQLite citations, graph/report recovery and both-theme accessibility. A separate extracted-package check verifies the added local presentation asset. No publication or push performed. Guided walkthrough remains paused at the user's request.

User-reported manual evidence now confirms a basic file:// workflow in Firefox on the user's Linux computer: entry, synthetic example, keyword result and selected evidence dialog. This narrows the earlier file-profile uncertainty for those specific checks; it does not establish Windows enterprise, binary import, recovery or network-isolation acceptance. Managed Chromium here remains blocked by its administrator policy.

## Latest integrated milestone — build 0.2, October 30, 2026

Continued from tested foundation commit 37226b7 without resetting prior work. Added bounded worker-isolated extraction for PDF, DOC/DOCX, XLS/XLSX/XLSM, SQLite, HTML/XML and existing text; transparent BM25, safe regex and strict record SQL; exact supported evidence locators/source viewing; bounded source-bound graph traversal/proposed temporal links; case/reference-library isolation; IndexedDB/localStorage/memory recovery with prior snapshots, verified backups and resumable checked-source checkpoints; provisional R1/internal BSRS, report layouts/timelines/HTML/formula-safe CSV, verified reviewer packages and portable ZIP tooling.

Original bytes/hash integrity remain central. Failed imports/cancellation do not activate partial data. Restored reviewer artifacts are regenerated from verified sources, not accepted from matching hashes alone. No document scripts/macros/formulas or uploaded SQL execute. Proposed links/dates are unverified; no material legal/actuarial rule is approved automatically. Generic exact arithmetic stays module-only and explicitly synthetic.

Parallel agents implemented independently owned modules; a separate verifier extended browser/security/accessibility/workload/packaging evidence. Cross-review found/fixed nested Word table, CDATA/BOM and graph locator-identity bugs. Coordinator independently reran the final full suite: 121 tests PASS, zero FAIL across 19 files. Separate actual file:// entry remains administrator-BLOCKED. Evidence is durable in docs/evidence/; HTTP results never substitute for workplace acceptance.

A synthetic 18,000-record 1.89 MB case completed coordinator import/search/graph/export in 3.65 seconds; renderer-heap scope excludes workers/native/whole-process peaks. ZIP extraction independently verifies all packaged hashes/assets and actual worker execution. See ACCEPTANCE.md and docs/PERFORMANCE.md for limits. Portable build: run `python tools/package.py` to generate dist/PBGC-RAG-0.2.zip and manifest.

Pinned RAG-Anything source/license/architecture and PDF.js package/license/build hashes/advisory snapshot reviewed. No Python RAG-Anything runtime imported. No publication or remote push performed.

## Gates for the next official-validation phase

1. Obtain a policy-approved browser/environment allowing actual file:// and actual Windows enterprise/508/resource evidence. Do not bypass managed policy.
2. Obtain authorized authoritative dictionary/templates/maps/BSRS grammar+validator/reference factors and approved interpretations. Do not invent official field names or rule validity.
3. With those contracts, implement/validate dictionary mapping, full approval/ontology/authority/conflict workflows, actuarial calculations and template-preserving official artifacts. These remain unfinished engineering; missing inputs block their authoritative validation.
4. Extend optional semantic/OCR, binary-format/query coverage and malformed-document/resource corpus only with explicit licenses/assets/contracts and honest acceptance limits.

Current build is substantial but not final application acceptance or an official actuarial system. No official release path is enabled. Use only synthetic/public fixtures in this repository and remote development environment.

Windows portability repair: the first extended CI run found a native-newline/encoding mismatch when regenerating the PDF OCR worker and a live PowerShell sampler initialization failure. The generator now explicitly reads UTF-8 and writes LF on all platforms. The sampler suppresses PowerShell progress/information records, uses a bounded cold-start allowance and retains strict counter-error handling; scalar-only initialization diagnostics make further CI failures inspectable without user log checks. Affected PDF/OCR and process-collector tests pass locally; the new exact head must pass Windows CI before merge.

## Guided UX — 0.6, November 1, 2026

Replaced the long all-at-once workspace with Case → Documents → Ask, persistent Search and Save/reopen navigation, clear continuation state and an optional All tools view. Written-answer setup is visible beside the question, names the included file, acknowledges selection, collapses after successful loading and returns focus to the question. Source passages require no model setup. Specialized reports/recovery/model options are disclosed only when needed. PBGC palette, Arial, dark/light support and supplied-artwork policy are preserved. See docs/ux/REDESIGN-0.6.md for rationale and verification scope. No RAG grounding, source byte integrity or official interpretation contract changed.

## First-run wizard and automatic Qwen — 0.7, November 1, 2026

Replaced setup-by-settings with Welcome → Start Qwen → Documents → First answer. Qwen is explicitly named in the guide/header and starts from included local classic-script model chunks, with no model file picker. The first case is created automatically. A guided example supplies documents and a first question. Scanned PDFs are read automatically in the wizard; normal expert controls remain available. Added honest loading/error/cancel/ready states, backward navigation, completion/restart, restrained transitions and reduced-motion support. See docs/ux/WIZARD-0.7.md.

Packaging no longer duplicates a raw GGUF: it checks all delivered chunk bytes plus their reconstructed original model hash. Preliminary extracted-package Playwright acceptance passed actual Qwen, exact citations, OCR, zero external requests and no model chooser; the whole-process startup/answer/OCR workload peaked near 4 GB locally, within the 12 GB app budget for a 16 GB target. Source/full actual-file platform CI is still required for the final commit before merge and release. Official content and actuarial validation remain deferred.

## Original PDF page reader — 0.8

Recovered and backed up the interrupted preview work. Added original-page viewing inside the evidence dialog using the existing bounded local PDF raster worker: text/page toggle, page navigation, Fit/150%/200% zoom, cancellation/retry and unchanged-original downloads for all source formats. Source bytes, parsed records, citation locators and case schemas remain unchanged. The view excludes active content and annotations and does not invent text citations for image pages. See docs/PDF-PREVIEW.md. Dedicated synthetic preview tests cover real native/image rendering and separate lifecycle races; final exact-head source and extracted-package Windows/Ubuntu offline gates remain required before release. Authoritative PBGC source/interpretation and actual workplace approval remain deferred.

## Separate larger-model branch — November 7, 2026

Branch codex/office-delivery-larger-model-0.8 keeps main and office-v0.8.0 at c429b8f. It selects Qwen2.5 1.5B Instruct Q3_K_S, 760,944,640 bytes, derived from hash-verified public F16 weights using the browser runtime's pinned llama.cpp revision. Q3_K_M was measured at 824,178,688 bytes and rejected against the unchanged 768 MiB cap. The central model profile binds the loader, packaging, runtime default and real-model tests to the same exact digest.

Local real browser inference, cancellation/disposal and no-external-request checks: 2 PASS. Both-theme HTTP accessibility PASS; this managed browser still blocks local file entry, so actual offline file acceptance belongs to the Windows/Ubuntu CI gates. Complete local larger-model ZIP built with original-byte and decoded-model hash verification. Full quality, extracted-package and exact-head platform results are mandatory before app delivery. Source weights are a separate immutable prerelease, not the office app; their reproducible build and subsequent public asset verification passed in runs 42407491053 and 42407853008. The first bootstrap attempt failed; the unchanged preparation implementation passed on the next attempt. No model integrity threshold was waived.

See docs/LARGER-MODEL.md. Do not merge this branch into main or replace the stable release. Publish experimental app assets only under larger-model-v* prerelease tags with latest=false.

The long exact-source prompt passed four of four factual questions and blocked all four unsafe contexts locally. Saved evidence records 108–119 seconds per factual response; the prompt was shortened without relaxing guards or deadlines, and requires a fresh real evaluation. Packaged startup was reproduced as an intermittent NotReadableError in Chromium's large constructed File path after all 91 parts passed integrity checks. The experimental loader now preallocates one bounded model buffer; the adapter transfers exclusive ownership, verifies its full digest, streams independent 8 MiB copies and releases the input. Four manifest/buffer protocol tests pass, including cancellation and altered-input rejection. Native file loading is retained. Package readiness tests now expose phase/failure details instead of hiding startup errors behind the full wait.

Experimental delivery is branch-only and requires both exact-head source platform checks plus both office-package platforms. The Ubuntu job waits for those independent gates, stages a separate prerelease, verifies downloaded bytes and publishes with latest=false. Branch advancement or conflicting existing tags/assets aborts publication. This avoids depending on a long-lived local Git credential for a final tag push. Main and the stable release are not publication targets.

## Guided separate questions — November 8, 2026 (development branch)

Completed larger-model 0.8 delivery is preserved. New branch `codex/rag-guided-questions-0.9` adds up to three explicit questions, independent retrieval and guarded per-question results. There is no automatic prose decomposition or combined multi-document conclusion. Batch cancellation/deadlines discard all pending results; source snapshots, exact citations and case-switch clearing preserve the existing evidence boundary. Main is unchanged. No environment/release publication was performed.

The question screen visibly distinguishes passages from Qwen answers, explains time per answer, and moves focus to results. Help now begins with the basic RAG flow. Dictionary details and query syntax are collapsed. Plain-language guides describe the same controls and the stable/development package distinction.

Initial checks: 246 module tests PASS across 27 files, nine Python recovery guards PASS, central model-profile check PASS, 12 question-set orchestration tests PASS, and20 focused browser checks PASS (supplementary HTTP). The current managed browser's actual file entry is BLOCKED_BY_ADMINISTRATOR; Windows/Ubuntu offline CI is required for new-head acceptance. Initial real Qwen batch hit the existing per-question deadline and released no answer. Preserve this failed result; further actual-model and same-ZIP platform checks are pending.

Integration follow-up: the same old single-question 1.5B UI also hit the local first-token deadline, while a manually selected stable 0.5B model passed the new two-question flow (2/2, 108 seconds total, zero outside requests). Both Windows/Ubuntu complete-ZIP inference/OCR/page checks and actual two-question 1.5B generation passed in run42502105692. Its Ubuntu job failed a separate Help visibility assertion, proven from bounded recovered evidence at testline90; the assertion ran before hash-route completion. The test now waits for visible Help/Notes/workspace screens. Source/body behavior and quality thresholds are unchanged. Fresh full source and same-ZIP checks on the repaired head are required; consult the branch workflows, not the earlier red run's aggregate status. Temporary artifact-dependent diagnostic CI was removed; bounded current-run failure summaries remain. No environment, release, main or prior model branch was published/modified.

## Verified guided-question milestone

Commit `2c4786ba59c904abf529e07407172fd9040ed215` completed both full source workflow42512257991 and complete office ZIP workflow42512258050 on Windows and Ubuntu. Both OS passed actual offline file entry, Qwen, OCR, original-page viewing, question controls and exact two-answer citations. The independent fixed factual corpus had three accepted correct answers and one abstention; all four unsafe contexts were blocked on both platforms. Whole-process resource checks passed: Ubuntu119,366ms/2,499,393,536bytes; Windows235,982ms/2,596,577,280bytes. The managed local browser's file restriction and the local1.5B timeouts remain separate observations. Main, the earlier larger-model branch and published packages were unchanged.

## Per-question document selection — November 10, 2026

Branch `codex/rag-document-scope-0.10` builds on the verified question milestone. Each question optionally chooses one document; All documents stays the default. The same question can compare two files through separate guarded answers and explicit Searched labels, without deciding which provision governs. Dense and keyword candidates are filtered before ranking/top-K. Per-question IDs intersect global IDs/hashes, canonical equivalent selections remain duplicates, and unknown/empty/stale selections never broaden to all sources. Source metadata and selected vectors are captured before asynchronous work. Changing inputs during preparation suppresses retrieval and stale publication. Case changes reset every choice.

Local checks: 266 module tests across 27 files PASS, nine model-recovery tests/profile check PASS, 25 targeted browser checks PASS (including seven new scope/citation tests), and the real stable-model document comparison PASS (two exact 65/67 citations, 106.1-second batch, All-documents conflict without a third inference, zero outside requests). This is supplementary HTTP evidence; the bundled model/profile remains unchanged. New complete-ZIP and full source Windows/Ubuntu actual-file acceptance are required on the final commit. No environment/release publication or main merge is authorized by this increment.

Long-document review found and reproduced a real navigation bug: a citation for lines73–77 around an answer on75 opened records1–40 because locator comparison depended on object-key order. The corrected reading helper matches exact canonical locator values, prefers supported quoted records within the cited set, and returns no target when none bind. The UI no longer silently opens record zero. Five presentation tests and an actual learned-retrieval90-record regression passed; the correct records41–80 now include the target. This correction requires a new final head and fresh complete-ZIP/full-source acceptance; the earlier52633b4 package run42924436336 already passed bothOS selected-document real1.5B tests. No thresholds or generation rules changed.

## Habemus candidate — 1.0 RC1 (separate branch)

`codex/rag-habemus-1.0` builds on verified `4718010` while keeping main and all published packages intact. It adds a bounded source-selection protocol for up to three explicit independent factual parts, literal field-level table answers with explicit CSV/Excel heading confirmation, and selected-page OCR for mixed native/image PDFs. Model output selects existing statement IDs; every requested part must bind independently to the correct person/property. No calculations, authority decisions, invented clauses or partial combined answers are released.

Table answers exclude flattened cell fallback, empty/formula/cached values, ambiguous identities and unverified merged Excel layouts. Native worksheet XML now binds a layout profile to parsed records; legacy unverified layouts remain searchable but cannot supply table answers. Exact focus-cell navigation avoids distant heading anchors. The Documents preview requires an explicit row choice and collapses after confirmation. UI table values use actual labels and cells. The new plain guide is `docs/USER-GUIDE.md`.

Selected-page OCR preserves existing native and earlier OCR records as the exact prefix, revalidates saved notes/graph bindings, reproduces processing on restore from original bytes and cancels atomically before source replacement. Its bounded parser identity hashes the native parser and complete ordered profile. The legacy missing-text profile retains its previous identity and behavior.

Local evidence: 335 module tests PASS across 33 files; nine model-recovery tests and generated-profile/worker checks PASS. Guide browser workflow PASS (explicit headings, originals, restore, case isolation, 375/1280px light/dark); real mixed-page OCR and cancellation browser tests PASS with zero outside requests/page errors. Real compatible 0.5B Qwen supplementary HTTP test PASS: two source-selection inferences, combined65/seven-year answer, exact table row150, 169.3seconds total, zero outside requests. See `docs/evidence/habemus-local-real-model.json`. The earlier hidden-panel status assertion failed before generation and was corrected to inspect textContent; it is not a failed model answer.

These local HTTP checks do not establish actual offline file acceptance or acceptance of the unchanged bundled 1.5B model. New exact-commit source and same-ZIP Windows/Ubuntu workflows are required. No release/environment publication or main merge has been performed.
