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
  diagnostics: {mode,providerId,retrievalMethod,grounding,modelOutputAccepted,reason,warnings}
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

**Synthesis mode** allows actual model-generated phrasing. It requires substantial cited-content token overlap, at least two distinct supporting content tokens for normal claims, bounded clauses, no unsupported numeric/date values or written numbers, no unsupported named entities, and preservation of source negation and mandatory/legal qualifiers. Exact quotations also pass. Diagnostics explicitly warn that these checks **do not prove entailment or factual truth**. An unsupported paraphrase can evade lexical safeguards; a supported paraphrase can be conservatively rejected. These checks are a release guard, not an automated legal or actuarial fact checker. Review the exact quotes and original sources.

**Quotation mode** requires each claim to equal an exact cited quote. It is labeled `model-guided-extractive`; the generation model chooses relevant evidence but does not produce free-form synthesis. This is a useful safe fallback, not a claim of unconstrained generative reasoning.

Raw generation tokens remain private until final grounding succeeds. `onToken` receives the complete validated answer once, rather than streaming unvalidated claims into the answer surface. Rejected JSON, unsupported claims and dangling citations yield abstention with diagnostic reasons, not a plausible-looking answer.

## Conflicts, weak retrieval and source instructions

- `retrieval.diagnostics.weak` causes abstention before generation. Semantic ranking ambiguity is not itself factual contradiction; no authority is inferred from a cosine score or RRF score.
- A deterministic possible-conflict detector compares overlapping textual subject/property statements. Different numbers, explicit month/date values or negation flag `status:'conflict'` before generation. It normalizes simple copulas such as “equals.” It does not settle amendments, statutory priority, dates, participant groups or source authority. It can miss paraphrased conflicts and can flag differences that a human could resolve by applicability.
- Source text containing recognizable role markers or instruction override/exfiltration language is quarantined. Other source text remains delimited untrusted data. This reduces common prompt injection, but cannot certify all semantic instructions are detected. Exact quote and synthesis guards remain necessary.
- `scope.sourceIds` and `scope.sourceHashes` explicitly filter candidates. Requested `asOf` and `group` are recorded and shown to the model but **not inferred as source applicability** from arbitrary prose. No cross-case corpus should be supplied by the caller.

## Budgets and cancellation

At most 10,000 chunks, 20,000,000 source text characters, 12,000 characters per chunk, 32 KiB locator metadata per chunk and 8 MiB total locator metadata. Context uses at most six excerpts, each at most 2,000 characters, and a 12,000-character serialized evidence budget. Large/escaped text is truncated with explicit coverage diagnostics. Hashes and large locator arrays stay out of the model prompt; exact metadata is bound outside generation.

Question length is at most 1,000 characters. Output is at most 16,000 characters; at most six claims. Generated synthesis claims are limited to 1,200 characters and three clauses. Generation deadline can be lowered but not exceed 120,000 ms. Cancellation rejects with `AbortError`; provider failures/timeouts abstain without output. The provider must honor its AbortSignal and terminate its own worker; a JavaScript orchestrator cannot kill an arbitrary uncooperative function supplied by another developer.

The character budget is not an exact tokenizer-token count. Runtime providers must enforce their own model context/token and memory limits. Model quality, latency and memory acceptance must use actual licensed local weights, not mocked tests.

## Verification

`node tests/rag.test.js` covers source-bound answers, genuine generated sentence synthesis versus quotation fallback, unsupported numbers/dates/entities/legal qualifiers, conflicts, irrelevant/missing/weak evidence, prompt-injection quarantine, malformed JSON, stale retrieval, context budgets, withheld raw tokens, cancellation and timeout. Those providers are explicitly **mock orchestration fixtures**, not model-quality evidence. Independent tests in `tests/rag-evaluation.test.js` repeat adversarial citation/conflict checks. Actual learned retrieval and local LLM evaluation are documented by their respective runtime/model test workstreams.

The generic provider contract uses structured JSON with model-emitted citations. Malformed JSON and unresolved quotes are rejected. The local Qwen provider explicitly opts into `plain-grounded-v1`: it generates one short sentence and the RAG layer automatically selects an exact supporting source sentence. Every substantive answer term must occur in that sentence; numeric, entity, negation and source qualification checks also apply. Joined claims, unsupported relations and dropped conditions abstain. Diagnostics distinguish automatic source selection from model-emitted citations. No failed model citation is repaired and raw tokens stay private until validation passes. Conservative lexical checks can reject valid paraphrases and do not prove entailment or applicability.
