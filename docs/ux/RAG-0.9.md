# Guided questions — development increment

## Purpose

Help a reader ask clear document questions, see what each answer supports, and open its source. Keep `main` and both delivered 0.8 packages unchanged. This increment is developed on `codex/rag-guided-questions-0.9`; no new office release is implied by its presence in the repository.

The current user scope is documentary retrieval and supported answers. Field dictionaries, actuarial rules and official output templates are not prerequisites. Existing advanced review tools remain separate from the first-use guide.

## User flow

1. **Get started → Start Qwen.** Load the assistant included with the complete package. No model picker is needed.
2. **Documents.** Add the files for the selected case. Original bytes remain unchanged.
3. **Ask your documents.** Ask one thing in the first question field.
4. **Add another question**, when needed. Enter a second or third question in its own labeled field. Keep one fact per question.
5. **Ask question** or **Ask questions.** Each question receives its own retrieval and guarded answer attempt. Requests run one at a time.
6. **Check each result.** Read the answer and open its own sources. A question without adequate support stays visibly unanswered; a source conflict stays visible for review.
7. **Save & reopen.** Save a case file before closing the app.

The helper text states: “Ask one thing in each question. Each answer shows its own sources.” Source passages remain a separate option that does not require Qwen.

## Behavior contract

- Users write the separate questions. The app does not guess how to split a compound request.
- The local model still releases one supported statement per request. Existing grounding, question relevance, conflict and citation checks remain in force.
- Different questions can find evidence in different documents. This is not unrestricted multi-document synthesis or a combined opinion about which provision governs.
- A successful answer to one question does not validate another result. Per-question answers, missing evidence and possible conflicts must remain distinct.
- Cancelling or changing the active source scope must not release stale or unverified output.
- Technical hashes and source offsets remain optional details. The reading view uses document names and clear locations.
- PBGC blue `#002D72`, red `#E4002B`, local Arial, dark/light themes, visible focus and reduced-motion support remain governed by [DESIGN.md](../../DESIGN.md). No unofficial logo is introduced.

## Guide changes

[README.md](../../README.md) now opens with the document task and a short start sequence. Its task table distinguishes passages, one written answer and separate questions. Advanced review/dictionary/template tools are optional and are not described as RAG release blockers.

[OFFICE-START.md](../OFFICE-START.md) covers opening the complete package, the first question, separate questions, source checks, save/reopen, scanned PDFs and common recovery actions. It distinguishes this development branch from the published 0.8 packages.

[LOCAL-LLM.md](../LOCAL-LLM.md) identifies both stable and experimental models and explains automatic startup. Manual model selection remains an advanced path. [RAG.md](../RAG.md) describes the guard boundary without treating mock checks as model-quality evidence.

## Verification status

Local integration: **246 module tests PASS** across 27 files, including 12 question-set and 21 single-question guard tests. Nine Python model-recovery guards and central profile check PASS. Twenty focused supplementary HTTP browser checks PASS: guide, actual learned retrieval, separate results/evidence, keyboard controls, blank/duplicate validation, cancellation/retry, case isolation, recovery, existing advanced workflows and automated contrast checks. Desktop/mobile screenshots were inspected in dark/light themes; this is not a full accessibility certification.

**Real-model local check FAIL:** the included 1.5B model hit the unchanged 120-second first-question deadline before its first output token in both integrated and isolated trials. No partial batch was shown. The exact synthetic prompt and failure are preserved in [local timeout evidence](../evidence/rag-questions-local-timeout.json). This is not accepted model-quality or batch-delivery evidence.

**Actual local file entry BLOCKED:** the managed browser reports `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy was changed. The first new-branch complete-ZIP tests passed actual bundled Qwen, OCR and original-page viewing on Windows and Ubuntu. The real two-question tests also passed two correct, independently cited answers on each platform (run [42502105692](https://github.com/ErChulo/pbgc-rag/actions/runs/42502105692)). Ubuntu's batch generation took about 110 and 109 seconds per question. That run failed a separate passage-view test because its immediate Help visibility assertion raced the hash route. The test now explicitly waits for the requested screen; no product guard or deadline was relaxed. Full new-commit checks must pass after this repair; follow the [branch checks](https://github.com/ErChulo/pbgc-rag/actions?query=branch%3Acodex%2Frag-guided-questions-0.9) for the current result.

The stable 0.5B model also passed two source-checked questions through the new UI locally: about 54 and 53 seconds, 108 seconds for the whole batch, no outside requests. See [stable-model baseline](../evidence/rag-questions-stable-baseline.json). This manually selected baseline did not change the branch's bundled model. These small synthetic trials on different machines do not establish general model accuracy or comparable hardware performance. Passing results for a published 0.8 package do not establish acceptance of new branch code.
