# Local semantic retrieval

`assets/semantic.js` indexes dense vectors returned by an explicit embedding provider. It does not contain a model or manufacture embeddings from hashes, keyword counts or random numbers. The learned model adapter and its license/asset identity are documented separately in EMBEDDINGS.md. Injected vectors in semantic.test.js are protocol fixtures only, not evidence of semantic quality.

## Provider and chunk contracts

A provider has `{id, dimension, embedTexts(texts, {signal}?)}`. `embedTexts` returns a Promise of one Float32Array per input. The ID must identify exact model assets, tokenizer/pooling and implementation versions; a reused ID with different behavior cannot be detected by this module. The provider is responsible for actual model inference and terminating its CPU work on cancellation. Core orchestration races cancellation and forwards the same signal so the caller need not wait for a provider that ignores cancellation.

Chunks come from `chunkSources`, retaining `{id,text,sourceId,sourceName,sourceHash,locators,recordIndices,...}`. This module preserves complete chunk metadata and exact citations; it does not fabricate source offsets. Caller-supplied chunks must already be validated against verified original sources. Numeric-only or out-of-vocabulary text may not be embeddable for some models. Zero vectors reject rather than masquerade as meaningful semantic evidence; use the explicitly labeled lexical fallback when the model cannot represent a text.

## APIs

- `buildSemanticIndex(chunks, provider, {signal?, onProgress?, batchSize?})` embeds chunks in bounded batches (default 16), validates dimensions/finiteness and normalizes each nonzero vector to unit length. Returns a source-bound runtime index. No partial index is returned after failure or cancellation. Progress includes `{completed,total,phase:'embedding'}`.
- `validateSemanticIndex(index, currentChunks, provider)` returns `{valid,errors}`. It checks runtime-issued status, provider identity/dimension, normalized vectors and exact canonical current chunk metadata, including text, source hashes, locators and record indices. Root must invoke this or rebuild whenever case/source/chunk state changes: a retrieval function cannot independently know which workspace is currently active.
- `retrieveSemantic(index, query, provider, {topK?, minScore?, ambiguityMargin?, signal?})` returns `{results,diagnostics}`. Results are flat chunk records with `score`, `semanticScore` and exact citations. Cosine ties sort by chunk ID. Default topK is eight, minScore is 0.25 and ambiguity margin is 0.02. These are explicit engineering defaults, not calibrated probabilities or validated legal thresholds.
- `retrieveHybrid(...)` has the same arguments plus `{semanticWeight?,rrfK?}`. It combines semantic and BM25 lexical ranks with weighted reciprocal-rank fusion. Defaults: semantic weight 0.7, rank constant 60, at most 100 candidates from each path. Formula: `semanticWeight/(rrfK+semanticRank) + (1-semanticWeight)/(rrfK+lexicalRank)` for present ranks. Returned `score` is fusion rank score; `semanticScore` and `lexicalScore` remain separate. This is not a learned cross-encoder reranker. Hybrid inherits the lexical engine's 500-character query/20,000,000 corpus-character bounds.
- `rerankSemantic(index, query, provider, candidateIds, options?)` uses the existing model's cosine scores to reorder one to 1,000 distinct existing candidate IDs. It is explicit embedding reranking, not an additional learned cross-encoder. Unknown IDs reject.
- `serializeSemanticIndex(index)` returns a portable schema-v1 `dense-semantic-cache` object with chunk metadata, provider identity and numeric vector arrays. Only a built/restored runtime index can be serialized.
- `restoreSemanticIndex(cache, currentChunks, provider, options?)` checks schema, source/chunk identity, dimensions, finiteness and normalization, then **re-embeds verified text**. Imported vectors are derived untrusted material and never silently become retrieval authority. Even a forged but unit-normalized imported vector cannot steer restored retrieval. This safety gate intentionally sacrifices cache restore speed. A cache is not a source document or an authenticated artifact.

Runtime index objects are registered in memory. Directly passing a parsed JSON cache or a spread copy into retrieval rejects; use restore. This prevents accidental treatment of user-provided cache arrays as model-generated results. It does not protect against arbitrary already-executing application code rewriting memory.

## Diagnostics and abstention

Dense diagnostics include provider ID/dimension, indexed chunk count, best cosine, top-two margin, threshold, `weak` and `ambiguous` flags. `weak` means the best score fails the chosen threshold. Results below the threshold are omitted. `ambiguous` means the best two scores are close; it does not prove the sources contradict each other. Hybrid retains these semantic diagnostics while adding fusion metadata. Lexical-only hybrid hits have null semanticScore.

Cosine and fusion scores do not establish fact validity, authority, applicability, legal confidence or actuarial correctness. A generation layer must separately validate citations, scope, contradictions and abstention. Do not feed weak retrieval into an unqualified official conclusion.

## Budgets

At most 20,000 chunks, 8,000 text characters per chunk, 40 MiB overlap text, 4,096 vector dimensions and 64 MiB raw Float32 vector storage. Batch sizes are one to 64. Query text is at most 2,000 characters (500 for hybrid). topK is one to 100. Portable JSON cache content is capped at 160 MiB characters; JSON encoding can be much larger than raw vectors and is not promised to fit source-case package budgets. Derived semantic caches must remain separate from original-byte case packages.

All loops and allocations have explicit corpus/model budgets compatible with CPU-only 16 GB machines. These bounds do not constitute a measured enterprise performance guarantee. Actual inference memory/latency depend on the selected local model. No dependency, model download, server or outbound request exists in this module.

## Verification

`node tests/semantic.test.js` checks provider batching, unit normalization, exact citations, deterministic ties, weak/ambiguous diagnostics, stale source/provider rejection, invalid vectors, cancellation, untrusted cache re-embedding, hybrid labels, candidate reranking and budgets. Fixtures inject clearly labeled finite vectors to test these mechanics. The suite also runs the actual pinned bundled learned provider on six synthetic synonym topics (automobile/car, medical/doctor, school/student, exchange/stock, pension/retiree and crops/agriculture), with no exact query words in their target texts. Recall@1 is 6/6 on this bounded fixture. This is real inference, separate from the protocol fixtures, and is not a general PBGC-domain quality or confidence calibration claim. Independent broader evaluation remains necessary.
