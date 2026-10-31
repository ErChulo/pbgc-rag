# Local grounded question answering

`assets/rag.js` orchestrates retrieval context and a separately supplied local language-model generation provider. It does not load models, run a server, contact an endpoint, implement embeddings or approve actuarial interpretations. Real learned retrieval and generation runtimes have separate model/license/runtime inventories. No toy, lexical or mocked provider is represented as a production semantic model.

## API and provider contract

```js
const result = await PBGCRag.answerQuestion({
  question,
  chunks,                         // verified source-bound chunk corpus
  retrieval,                      // optional semantic/hybrid results
  provider,                       // actual locally loaded generation provider
  scope: { sourceIds, asOf, group }, // all optional
  signal,
  onToken: validatedText => {},
  options: {
    groundingMode: 'synthesis',    // default; 'quotation' is the conservative mode
    contextCharacters: 12000,
    maxChunks: 6,
    maxTokens: 512,
    timeoutMs: 60000
  }
});
```

Chunk metadata follows CHUNKING.md: `id`, `text`, `sourceId`, `sourceName`, SHA-256 `sourceHash`, `locators` and optional `recordIndices`. Citation locators remain exact original locators; chunking does not invent source offsets. `retrieval` accepts a semantic/hybrid `{results:[flat chunk plus score],diagnostics}` object or a flat/nested chunk result array. If `chunks` is supplied, every retrieved chunk must exactly match that corpus, including canonical locator contents. Source bytes must already have been rehashed and parsed by the case import workflow. This module cannot authenticate a supplied hash without original bytes.

A generation provider is `{id,generate({prompt,maxTokens,temperature,signal,onToken}) -> Promise<string>}`. The application must ensure that provider really uses the approved local runtime and weights. The orchestrator sets temperature zero and forwards a bounded token budget. It does not turn a mock function into real model inference.

Without supplied retrieval, selection uses explicitly labeled lexical token overlap, with at least 50% question-term coverage. This fallback is not semantic search. A missing generation provider returns `status:'abstained'`, `diagnostics.mode:'extractive'` and source excerpts for review. It never claims a generated answer.

Result:

```js
{
  status: 'answered' | 'abstained' | 'conflict',
  answer,
  citations: [{label:'C1',chunkId,sourceId,sourceName,sourceHash,locators,excerpt,quotes}],
  retrieved: [{label,chunkId,sourceId,sourceName,sourceHash,locators,excerpt,score}],
  official:false,
  officialReleaseAllowed:false,
  diagnostics: {mode,providerId,retrievalMethod,grounding,modelOutputAccepted,reason,warnings,evidenceAnalysis}
}
```

## Structured generation and grounding

The prompt identifies source text as untrusted JSON data. It requests only JSON:

```json
{
  "status": "answered",
  "claims": [
    {
      "text": "The normal retirement age is 65.",
      "citations": [
        {"label": "C1", "quote": "Normal retirement age: 65."}
      ]
    }
  ]
}
```

A single-claim `{status,answer,citations:[{label,quote}]}` form is also accepted. A JSON Markdown fence is tolerated; arbitrary commentary or unsupported output is rejected. Explicit model `abstained` and `conflict` statuses are respected without releasing the model's unverified explanation as a fact.

Every citation label must exist in the actual context. Every evidence quote must be an exact substring of the supplied excerpt. Returned citations preserve source hashes and original locators; the displayed answer includes enforced `[C1]` labels. Source quotes cannot be substituted with a fabricated quotation.

**Synthesis mode** permits bounded model-generated wording backed by one exact source sentence for each claim. In addition to overlap, numeric/date, written-number, named-entity and negation checks, substantive words and relationship-bearing prepositions must preserve source order. Articles and simple copulas may vary. Two named relationship endpoints must remain present. Qualified source sentences and sentences containing multiple distinct numeric values require the complete normalized source sequence; a model cannot remove a condition, swap a number between subjects, reverse who pays whom, or change “from” to “for.” These checks deliberately reject some valid paraphrases. They **do not prove entailment or factual truth** and are not automated legal/actuarial interpretation.

Each JSON citation must independently support its claim. A real but unrelated quote is rejected even when another citation is correct. Distinct source-supported claims can use distinct documents; one claim cannot be created by joining otherwise unrelated excerpts. Exact faithful multi-line/source quotations remain allowed by the structured protocol. No failed quotation is repaired or assigned a fabricated locator.

**Quotation mode** requires each claim to equal an exact cited quote. It is labeled `model-guided-extractive`; the generation model chooses relevant evidence but does not produce free-form synthesis. This is a useful safe fallback, not a claim of unconstrained generative reasoning.

Raw generation tokens remain private until final grounding succeeds. `onToken` receives the complete validated answer once, rather than streaming unvalidated claims into the answer surface. Rejected JSON, unsupported claims and dangling citations yield abstention with diagnostic reasons, not a plausible-looking answer.

## Conflicts, weak retrieval and source instructions

- `retrieval.diagnostics.weak` causes abstention before generation. Semantic ranking ambiguity is not itself factual contradiction; no authority is inferred from a cosine score or RRF score.
- A deterministic possible-conflict detector checks complete retrieved chunks before prompt clipping, including different statements in the same chunk and retrieved chunks excluded by the prompt count/character budget. Different numbers (including common written-number words), month/date values, units, negation or reordered named relationships can flag `status:'conflict'`. It normalizes simple copulas and ignores recognized leading documentary record/section identifiers when comparing provision values; original source text and citations remain unchanged. When literal question-topic matches exist, unrelated-only conflict pairs do not decide that question. Without such topic matches the comparison remains conservative. This lexical heuristic can still miss paraphrased conflicts or flag differences that require human applicability review. It does not settle amendments, legal priority or authority.
- Source text containing recognizable role markers or instruction override/exfiltration language is quarantined. Other source text remains delimited untrusted data. This reduces common prompt injection, but cannot certify all semantic instructions are detected. Exact quote and synthesis guards remain necessary.
- `scope.sourceIds` and `scope.sourceHashes` explicitly filter candidate documents. An `asOf` or `group` applicability request is not established by that filter: generation abstains unless this layer has verified applicability, which the current unstructured protocol does not provide. Questions selecting current/effective priority or deciding which rule/age applies also abstain. Multiple documentary groups without an explicitly named question group, or multiple documentary periods, are flagged for review. Exact documentary questions such as “What does the Hourly row show?” or “What condition applies to normal retirement age?” may quote complete source statements; they do not establish an individual's membership or legal applicability. Named subjects/groups in the question must bind to the returned supporting source text. No cross-case corpus should be supplied by the caller.
- Conflict/applicability analysis is bounded to 64 retrieved chunks, 96,000 characters and 256 statements (at most 256 comparison tokens per statement). If that complete retrieved evidence cannot be checked within the limits, generation abstains with `evidence-analysis-budget`. The check is not silently reduced to a potentially misleading clipped prompt. Unretrieved corpus material is not certified by this module.

## Budgets and cancellation

At most 10,000 chunks, 20,000,000 source text characters, 12,000 characters per chunk, 32 KiB locator metadata per chunk and 8 MiB total locator metadata. Context uses at most six excerpts, each at most 2,000 characters, and a 12,000-character serialized evidence budget. Large/escaped text is truncated with explicit coverage diagnostics. Hashes and large locator arrays stay out of the model prompt; exact metadata is bound outside generation.

Question length is at most 1,000 characters. Output is at most 16,000 characters; at most six claims. Generated synthesis claims are limited to 1,200 characters and three clauses. Generation deadline can be lowered but not exceed 120,000 ms. Cancellation rejects with `AbortError`; provider failures/timeouts abstain without output. The provider must honor its AbortSignal and terminate its own worker; a JavaScript orchestrator cannot kill an arbitrary uncooperative function supplied by another developer.

The character budget is not an exact tokenizer-token count. Runtime providers must enforce their own model context/token and memory limits. Model quality, latency and memory acceptance must use actual licensed local weights, not mocked tests.

## Verification

`node tests/rag.test.js` covers source-bound answers, genuine generated sentence synthesis versus quotation fallback, unsupported numbers/dates/entities/legal qualifiers, conflicts, irrelevant/missing/weak evidence, prompt-injection quarantine, malformed JSON, stale retrieval, context budgets, withheld raw tokens, cancellation and timeout. Those providers are explicitly **mock orchestration fixtures**, not model-quality evidence. Independent tests in `tests/rag-evaluation.test.js` repeat adversarial citation/conflict checks. Actual learned retrieval and local LLM evaluation are documented by their respective runtime/model test workstreams.

The generic provider contract uses structured JSON with model-emitted citations. Malformed JSON and unresolved quotes are rejected. The local Qwen provider explicitly opts into `plain-grounded-v1`: it generates one short sentence and the RAG layer automatically selects an exact supporting source sentence. Every substantive answer term must occur in that sentence; numeric, entity, negation and source qualification checks also apply. Joined claims, unsupported relations and dropped conditions abstain. Diagnostics distinguish automatic source selection from model-emitted citations. No failed model citation is repaired and raw tokens stay private until validation passes. Conservative lexical checks can reject valid paraphrases and do not prove entailment or applicability.
Conditional source sentences require every substantive condition term in the answer. Sentences with multiple distinct numeric values require an exact sentence answer; otherwise the local profile abstains to avoid swapping a number between subjects.


## Single-statement local profile and broader checks

The current Qwen `plain-grounded-v1` profile releases one supported factual statement at a time. Recognizable requests for two distinct properties (for example age **and** file-retention period) or separate questions abstain before inference, rather than silently answering one half. `diagnostics.answerProfile` explains that limit. The generic structured protocol can return multiple independently supported claims and citations. This is a declared local-model/orchestration limit, not a claim that multi-document synthesis has passed actual Qwen evaluation.

`node tests/rag.test.js` now has 18 passing orchestration checks. Added regressions cover same-chunk and outside-prompt conflicts, relation/preposition reversal in plain and structured output, source-inflated citations, valid separate multi-document claims, wrong named subjects/groups, explicit unverified date/group scope, bounded incomplete analysis, incomplete compound responses, and archival record identifiers/distractor topics. These tests use mock output intentionally to test release guards, not model quality. The independently owned fixed corpus in `tests/rag-challenges.test.js` separately checks safety and actual learned retrieval; real Qwen and whole-process resource acceptance belong to the browser/resource workstreams.


## Source-question topic and relationship binding

A valid source quote is insufficient when it answers another question. Before generation, all meaningful question-topic anchors must be present in the retrieved source text after bounded ordinary-language normalization. After generation, they must occur in the actual supporting quotes, not merely somewhere in an uncited context chunk. Thus retirement-age text cannot answer an unavailable mortality-table question, even when learned similarity exceeds its retrieval threshold. Distinct requested modifiers such as **early** versus **normal** remain distinct. Named/group checks remain separate.

Normalization removes interrogative/documentary framing and includes a small explicit ordinary-language alias inventory (for example widow/spouse, money/income, doctor/physician, certified/verification, and kept/retained). These are generic language matches, not official fields, applicability rules or actuarial definitions. Unrecognized valid paraphrases may abstain; lexical alias matching does not prove semantic entailment, intent, relevance or factual correctness for every possible question. For “Who pays whom?” style questions, the predicate/object sequence must also match an individual cited statement; containing the same names and amount is not enough.

The added regression reproduces the actual-model wrong-question failure with both plain and structured mock output, adds unrelated-topic and early/normal controls, checks post-generation binding when relevant uncited text exists elsewhere in context, and verifies correct versus reversed payment-role questions. The actual four-positive/four-negative Qwen quality suite is owned independently and must pass unchanged before model-quality acceptance is reported.

The local single-statement profile supplies only context excerpts that cover the question topics when such excerpts exist. This narrows distraction in generation; every retrieved candidate still participates in bounded conflict/applicability checks before the prompt is built. Diagnostics distinguish prompt context count from analyzed evidence count. A source-valid sentence must also answer the asked topics and preserve relationship roles; a valid citation alone is insufficient.

An explicit unqualified listing statement, “X is listed on Y,” can support “Y lists X” when the item and container phrases match in their original roles. This narrow grammatical equivalence does not permit swapped roles, extra items, changed conditions, negation or modal/legal conclusions. The generated text is validated as returned; it is not repaired into a different answer.
