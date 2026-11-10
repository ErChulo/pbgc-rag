# Choose documents for each question — development increment

## Purpose

Let a reader ask about all documents or one selected file. Two question boxes can ask the same factual question about different files, with a separate result and citations for each.

This work is on `codex/rag-document-scope-0.10`, based on the completed guided-question commit `2c4786b`. It leaves `main`, the earlier model branch and the published office packages intact. No new office release or environment publication is part of this increment. Official templates, field dictionaries and actuarial rules are not prerequisites for document questions.

## User steps

1. Add the documents to a case. Open **Ask** and write one factual question.
2. Leave **Documents: All documents** closed to search all available document passages.
3. To search one file, open that control and use **Documents for this question** to choose the file.
4. To ask the same question about a second file, choose **Add another question**. Enter the same text and select the second file for Question 2.
5. Choose **Ask questions**. Read **Searched:** in each result, then open its evidence.
6. To check the case for a possible conflict, ask a question with **All documents** selected.

A filename in one result does not establish that file's authority or priority. The app does not decide which conflicting provision governs. This feature groups separately supported statements; it does not create an unrestricted combined explanation.

## Behavior contract

- **All documents** is the default. One-file choice is optional and starts collapsed.
- Each question gets fresh retrieval inside its effective document selection. Both dense and keyword ranking filter candidates before selecting top results.
- Question selections intersect the existing global source limits and cannot widen them.
- The same normalized question is allowed for different effective source sets. Reordered lists or an explicit list equivalent to **All documents** remain duplicates.
- Each result reports the verified sources selected for that question. The reader does not need to see file hashes.
- Removing a chosen document or finding no readable text must not silently switch to all documents.
- Changing a choice clears stale results. Changing cases resets private questions and document choices.
- All-document conflicts remain visible. Citation, relevance, source-qualification and numeric guards remain unchanged.
- Cancellation and deadlines release no partially completed question set. Processing remains local and uses the existing CPU model and budgets.
- PBGC colors, local Arial, dark/light themes, keyboard access and reduced-motion support remain governed by [DESIGN.md](../../DESIGN.md).

## Verification

The base guided-question commit passed the [full source workflow](https://github.com/ErChulo/pbgc-rag/actions/runs/42512257991) and [complete offline ZIP workflow](https://github.com/ErChulo/pbgc-rag/actions/runs/42512258050) on Windows and Ubuntu. Those results establish the base milestone only.

Local integration passed 266 module tests across 27 files, including 19 semantic retrieval and 19 question-set tests. Targeted browser checks passed: seven new document-selection and citation checks, three existing question checks, and 15 guide, contrast, existing browser-workflow and persistence checks (25 targeted browser checks in total). The new tests cover selection changes during both index preparation and retrieval, no-readable-text/stale selections, exact document evidence, controls and narrow layouts. Independent review found and repaired live-vector mutation during asynchronous embedding; retrieval now uses validated private vector copies.

A real manually selected stable 0.5B model answered the same question correctly from both documents (65 and 67), with exact source hashes/citations, in 106.1 seconds for the batch. All documents then reported conflict without a third inference. The 120-second per-call deadline stayed unchanged; outside requests and browser errors were zero. See [the synthetic local benchmark](../evidence/document-scope-stable-baseline.json). This is supplementary HTTP evidence and did not change the bundled 1.5B profile.

The first complete-ZIP document-selection workflow passed on both Windows and Ubuntu at commit52633b4 (run42924436336), including real pinned1.5B 65/67 answers and All-documents conflict rejection. A subsequent long-document check found a pre-existing citation-navigation bug: sorted locator keys did not match parser key order, so a valid passage near line75 opened the first40records. The reader now matches exact locator values regardless of key order, prefers a quoted record within cited locations, and refuses an unbound location. The targeted learned-retrieval regression now opens records41–80 with the target included; five pure presentation tests cover the matching contract. See [before/fix evidence](../evidence/document-scope-citation-regression.json). Original bytes, stored locators and records are unchanged.

New final-commit full source and complete-ZIP Windows/Ubuntu verification is pending after the navigation repair. Required evidence includes:

- Two synthetic files state retirement ages 65 and 67. **All documents** still reports a possible conflict before generation.
- Two equal questions with different selected files return the correct separate quotes and citations.
- More than four stronger global distractors cannot displace the selected document; ranking diagnostics use only selected candidates.
- Invalid, stale, unreadable or empty selections never widen the search or invoke the model with other documents.
- Duplicate equivalence, source/scope mutation, cancellation and case switching remain guarded.
- Labels, focus, collapsed controls, both themes and narrow-screen layouts work in Playwright.
- Actual bundled Qwen and the complete ZIP pass the selected-file comparison on offline file URLs on Windows and Ubuntu, without outside requests.

Mocks establish orchestration behavior only. Actual-model results, resource checks and complete-package outcomes must be recorded separately before this increment is called ready. Two fixed synthetic facts do not establish general answer accuracy or applicability to a real plan.
