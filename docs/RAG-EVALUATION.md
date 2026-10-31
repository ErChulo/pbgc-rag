# Independent RAG challenge evaluation

`fixtures/rag-challenges.json` is a fixed synthetic benchmark. Every fact, person name, date, provision and table label is invented; none is PBGC authority. The expected outcomes were written separately from production guard changes. Do not change a question, expected source, safety outcome or threshold to hide a model or guard failure.

## Release guards: deterministic providers

Run `node tests/rag-challenges.test.js`.

The corpus contains 30 guard cases plus a fixture contract and real retrieval evaluation: **32 PASS** after production fixes. Regressions exposed by real inference cover irrelevant factual answers, a wrong early/normal property and a wrong payer/payee question role. A supported-payment positive control prevents blanket refusal from passing. `MOCK` is explicit in every deterministic generation test name. These tests establish orchestration and release behavior, not actual Qwen accuracy.

Cases cover:

- Supported short factual answers and complete conditional wording.
- Conflicts within one chunk and across documents, including unresolved dates and employee groups.
- Explicit source-document selection without claiming legal applicability.
- Reversed payer/payee relations, invented relation verbs and changed condition payloads.
- Numbers taken from another sentence, unsupported written numbers, fabricated quotes and weak evidence.
- Source instructions and role-override instructions, quarantined before generation.
- A supported two-document response with two separate source-bound quotations in the generic JSON protocol.
- Exact table-row quotations and rejected number swaps between rows.
- A rejected local one-sentence answer that supplies only one property when the question requests two.

Every accepted citation must resolve to the original synthetic record locator, original source hash and exact source substring. Unsafe cases require conflict/abstention. Cases marked pre-generation unsafe require zero provider calls. Safe documentary cases remain positive controls, so blanket refusal cannot pass the suite. The local plain-answer protocol is bounded to one supported sentence; this suite does not claim that it can synthesize an arbitrary multi-document answer.

## Actual learned retrieval

The same command runs real inference using the pinned 384-dimensional Ternlight sentence encoder. No artificial vectors or synonym lookup substitutes are used.

The fixed corpus has 12 source topics and 12 questions. Thresholds are recall@1 >= 0.75 and recall@3 = 1.00. Results: **recall@1 0.8333 (10/12); recall@3 1.00 (12/12)**. The developer report is `test-results/rag-challenge-retrieval.json`.

Two first-place errors remain visible: the choice-paperwork question ranks appeal and retention ahead of the election form; the named death-payment recipient question ranks survivor income ahead of the beneficiary designation. Those are retrieval limitations, not approved answers. The cash-out query ranks its intended source first in this corpus but its cosine score is only 0.2145, below the application's default 0.25 weakness threshold. Rank recall with `minScore:0` does not claim the app should answer that weak question. The older independent four-question corpus remains unchanged and separate.

## Actual Qwen factual quality

The expensive quality gate is opt-in:

```bash
PBGC_CHALLENGE_QWEN=1 PBGC_REQUIRE_MODEL=1 node tests/rag-challenges.test.js
```

These are developer commands only. The office application requires no developer tools or network.

Without `PBGC_TEST_URL`, this gate uses an actual file URL and puts the browser network offline. A supplied loopback URL is explicitly supplementary HTTP evidence. The model pack must already exist locally. Root coordinates serialization with resource and OCR inference tests.

The frozen model corpus contains four positive questions: a retirement age, address-change recipient, bank-account document and file-retention period. Each has an independently specified expected source, exact source quotation and required factual answer pattern. At least three of four must release correct answers; accepted wrong facts or unrelated citations always fail. Four negative contexts cover same-chunk contradictions, document instructions, unavailable information and incomplete multi-property answers.

The harness loads the actual Qwen provider through the app, records its real raw output and actual call counts, uses actual learned retrieval and performs no model-output substitution. Source/model identity, fixture SHA-256, coverage, abstentions and per-query timings are recorded in `test-results/rag-challenge-qwen-file.json` or `-http.json`.

**First actual Qwen challenge run: FAIL.** Correct factual answer coverage was 3/4 (0.75). Age, bank-document and retention answers passed; the address answer added “should” and was correctly withheld by the conservative guard. Contradiction, injection and multi-property negative cases stopped before generation. However, the unsupported mortality-table question received a real generated retirement-age answer that was incorrectly released with an accurate but irrelevant quotation. Exact source quotation alone does not prove that an answer addresses the question. The added plain/JSON protocol regressions preserve this failure, and the production question-to-evidence fix now passes the deterministic regressions. An unchanged real-model rerun is still required. The four generation questions, their expected facts, their expected sources and the coverage/safety thresholds remain unchanged. The deterministic and embedding tests do not establish that this optional gate passed. Four factual questions remain a small synthetic quality sample; no legal applicability, semantic entailment proof or production actuarial correctness is certified.

## Coordinator final local gate

The unchanged actual-model quality gate now passes: 3 of 4 fixed factual questions release independently correct source-bound answers, 1 abstains, and all 4 unsafe contexts are blocked with no wrong accepted answer in this small corpus. A narrow explicit “X is listed on Y”/“Y lists X” equivalence preserves the original roles. Prompt distraction was reduced by supplying only topic-matched excerpts to the single-statement generator while analyzing the full retrieved evidence for conflicts. See docs/evidence/quality-0.5.json. Initial failures are findings that drove fixes, not acceptance passes. Actual-file Linux/Windows execution remains its own CI gate.
