# Retrieval audit remediation

This work belongs to the 1.1 audit branch. It does not change the tested 1.0 release candidate, certify real plan answers, or establish support for a 1 GB case.

The fixed evaluation uses the actual pinned Ternlight encoder and the actual chunker and retrieval modules. It contains six invented plan and administrative documents, 35 paragraphs, 22 answerable questions, and 12 unanswerable questions about nearby plan topics. The fixtures include plan names, years, singular factor questions, acronyms, ordinary paraphrases, ages, percentages, and factors. They contain no actual case data or official provisions.

Run the evaluation with:

```sh
node tests/fixtures/evaluate-retrieval-domain.js
node tests/retrieval-domain-evaluation.test.js
node tests/retrieval-audit.test.js
```

The full ranks, scores, fixture hash, and model hash are in [retrieval-domain-v1.json](evidence/retrieval-domain-v1.json). The test reproduces the recorded ranks and six-decimal cosine scores. Timing is development-host evidence only.

| Passage maximum | Passages | Recall at 1 | Recall at 3 | Answerable targets retained at 0.25 | Unanswerable questions with a hit at 0.25 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,800 characters | 7 | 22/22 | 22/22 | 22/22 | 12/12 |
| 800 characters | 15 | 17/22 | 22/22 | 22/22 | 12/12 |

The measured 800-character alternative reduced first-result recall on this corpus. The default remains 1,800 characters. This is a small corpus and does not prove that 1,800 is best for other documents. The encoder still segments long input to fit its 128-token window and pools the window vectors. The chunker does not treat character or lexical-token counts as model token counts.

A cosine threshold cannot determine whether a question is answered. With the 1,800-character profile, the lowest relevant target score was 0.342899 and the highest unanswerable score was 0.777418. Raising the threshold to 0.50 retained only 12 of 22 target passages while still returning a hit for six of the 12 unanswerable questions. At 0.80, all answerable and unanswerable questions lost their hits.

The provider retains 0.25 as a recall-oriented **candidate screen**. Its versioned `retrievalProfile` names the evaluation and fixture hash. Retrieval diagnostics state `thresholdUse: 'candidate-screening-only'` and `relevanceEstablished: false`, including when `weak` is false. Topic, property, person, plan, date/group scope, and exact-source grounding checks must determine whether the retrieved text can support an answer. A passing score is not factual confidence or a probability.

Hybrid retrieval now keeps `semanticWeak` separately from `weak`. It can pass the weak gate when a returned BM25 passage contains every non-framing query term, with at least two distinct terms. A single incidental term cannot pass that gate. This exact lexical coverage is also a candidate-screen rule; it does not establish factual support or resolve scope. Queries above the 500-character hybrid limit fail before query embedding.

Returned context omits a lower-ranked passage only when its complete text, after whitespace normalization, is literally contained in a higher-ranked passage from the same source ID, original hash, parser version, and text-verification class. New statements, changed numbers, negations, qualifications, dates, different documents, and distinct table cells remain eligible. A 70% token-overlap rule is deliberately insufficient: the remaining words can contain a decisive condition. The complete issued index remains unchanged. The deduplication diagnostic lists omitted chunk IDs and their retained passages.

The chunker prefers sentence boundaries before splitting at whitespace. Each segment retains exact UTF-16 source offsets and reports whether it cuts a sentence. OCR metadata and native PDF text-layer uncertainty survive into segments and chunk summaries. An explicit `headers: [{sourceId, tableName, headerRow}]` binding repeats actual Excel or delimited header cells in every affected passage, within the same character and token budgets. Repeated header segments retain their original record indices and cell locators and have `headerContext: true`. The first row is not inferred to be a header. A requested header must be present in that bounded source batch; otherwise chunking fails clearly. The answer-corpus path continues to use typed table evidence and confirmed column names.

`chunkSourcesInWorker` runs the same trusted chunker in a disposable local Blob worker. Source text travels as data. The worker denies network APIs and supports an abort signal and a hard deadline; it returns no partial passage set after a failure. The existing synchronous API remains available for small, bounded work.

The encoder also exposes `inspectTextCoverage(texts)`. It measures the fraction of WordPiece tokens other than `[UNK]`, excluding framing special tokens. `coverage(text)` reports whether that value has been measured, rather than calling every nonempty string known vocabulary. Entirely unknown input cannot be embedded. Numeric tokens remain allowed for source tables. This check does not measure token fragmentation, meaning, relevance, or truth. Inspection and embedding cache at most 128 coverage records and 1 MiB of text per provider, cleared on disposal.

Browser worker checks are in `tests/retrieval-worker-browser.test.js`. Their default target is actual `file://`. A `PBGC_TEST_URL` override is explicitly labelled supplementary HTTP evidence and must not be substituted for an actual-file acceptance result. This managed development browser blocks file navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; actual-file execution therefore requires the unchanged CI/office gate for the new audit head.
