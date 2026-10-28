# Offline lexical question retrieval

`js/questions.js` exposes synchronous `PBGC.retrieveQuestionEvidence(caseData, query, {limit})` and `PBGC.questionRetrievalLimits`. Load the local case-validation module before use. There is no runtime dependency, network request, model, embedding engine, or generated answer.

```js
const evidence = PBGC.retrieveQuestionEvidence(activeCase,
  'What is normal retirement age?', { limit: 10 });
```

The function returns:

```js
{
  status: 'evidence-found', // or partial-evidence / insufficient-evidence
  method: 'lexical-question-retrieval',
  modelUsed: false,
  query: 'What is normal retirement age?',
  terms: ['normal', 'retirement', 'age'],
  citations: [{
    recordId, sourceId, sourceName, sourceHash,
    excerpt, locator, score, matchedTerms
  }],
  missingTerms: [],
  notice: '...lexical retrieval limitations...'
}
```

The UI must present the notice and citations, preserve the status distinction, and render all query/source content as text. It must not turn `evidence-found` into a claim that a question has been answered, a provision verified, or a determination approved.

## Terms and ranking

Queries and source text are Unicode-NFKC normalized and lowercased for matching. Common English question/connector words such as “what”, “is”, and “the” are removed. Meaningful terms are deduplicated in original query order. There is no stemming, synonym expansion, translation, legal interpretation, unit conversion, date parsing, or number parsing. `age` does not match `wage`; `retire` does not match `retirement`. Negations including `not` and `no` are retained.

Internal punctuation in numeric/date spellings is retained as literal token content. Examples: `2026-01-01`, `-5`, `+5`, `$12,000.00`, `5%`, and `65.0` remain distinct spellings. A question containing `$12000.00` does not silently match `$12,000.00`. Normalization is a lexical comparison rule, not a numerical-equivalence claim. No inferred date chronology, actuarial equivalence, applicability, or source authority affects ranking.

Each source record is a separate retrieval document. BM25 uses question-token document frequency, token frequency, and record length with `k1=1.2`, `b=0.75`. A complete single-record token match ranks ahead of partial matches, then BM25 scores rank candidates, with deterministic record-ID tie-breaking. Scores are relative lexical weights, not probabilities, confidence in truth, source authority, or approval.

Returned excerpts are the exact unchanged record text. Locators are detached copies of recorded source locators; hashes are the recorded source hashes. The function validates case structure and source membership but does not independently rehash original bytes synchronously or establish parser correctness. Import/export and storage modules separately verify original-byte integrity. Hashes do not authenticate sources or reviewers.

## Status and abstention

- `evidence-found`: at least one **returned single excerpt** contains all meaningful query tokens. This is lexical coverage only. A matching excerpt can still be inaccurate, inapplicable, unapproved, negated, or contradictory.
- `partial-evidence`: useful token matches exist, but no returned single excerpt covers every meaningful term. Separate excerpts are never combined into an answer or legal conclusion.
- `insufficient-evidence`: no useful source-token matches, no imported source records, or no meaningful query terms after stopword removal. Empty/all-stopword questions produce an explicit abstention.

`missingTerms` lists meaningful query tokens absent from **all returned citations**. It can be empty with `partial-evidence` when separate excerpts cover different tokens. The notice explicitly explains that no single excerpt covers the question. A lower citation limit can leave additional terms missing. Numeric/date tokens are not discarded to turn a partial query into full coverage.

## Isolation and limits

The function receives one case and searches only its records. Local case validation rejects foreign source/record case IDs, missing/mismatched record provenance, malformed metadata and unsafe structures. Cycles, accessors and prototype-injection keys are rejected before property getters can execute. Neither the case nor query data is mutated; modifying returned locators or matched-term arrays cannot change the original case.

Current limits: 1,024 query characters; 32 meaningful query terms; 1–50 requested citations (default 10); 50,000 source records; 65,536 characters per record; 4 MiB total record text; one million token matches; 48 MiB of aggregate case strings and bounded structure traversal. Unsupported input or budget exhaustion throws before returning a partial success. Use a smaller case when a retrieval limit is exceeded. These limits do not establish full 16 GB workplace performance acceptance.

Run:

```sh
node --test --test-isolation=none tests/questions.test.js
```

Synthetic tests cover realistic question retrieval, unrelated/all-stop abstention, exact token boundaries, missing date/numeric/sign/unit terms, multi-excerpt partial status, deterministic ranking, Unicode normalization, unchanged source excerpts, detached results, cross-case provenance, hostile markup/getters/prototype keys, and resource bounds. Browser UI integration and mandatory `file://` acceptance remain separate checks.
