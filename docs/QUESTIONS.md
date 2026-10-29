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

Current limits: 1,024 query characters; 32 meaningful query terms; 1–50 requested citations (default 10); 100,000 source records; 2 MiB of characters per record; 32 MiB of total record text; 8,388,608 source token matches; 64 MiB of normalized source characters; 48 MiB of aggregate case strings and keys; 1,500,000 structure nodes. String limits count JavaScript UTF-16 code units, not source-file bytes. Source original bytes, encoded originals, locators, and other case metadata remain subject to the case codec's separate aggregate limits. An SDK case at the 32 MiB text bound need not fit the UI's 32 MiB serialized working-case bound.

The record/count/text caps align with the case codec and supported working-case profile. No record prefix or source-text prefix is silently dropped. Matching scans every accepted record, including the final one. Source tokens are streamed from the normalized text of one record at a time instead of materializing arrays of every token. Stopwords count toward the token budget, so a long stopword suffix cannot bypass the bound. Ranking still uses all admitted records and global query-token document frequency.

Unsupported input or budget exhaustion throws before returning a partial success, even if useful citations were encountered earlier. A case within structural caps can still require a narrower source scope for a token-dense or expansion-heavy question. Use a separately validated case containing only the intended source window; this API does not silently choose one. Budget errors are not an `insufficient-evidence` result. These limits do not establish full 16 GB workplace performance acceptance.

The lower-level `PBGC.search` and `PBGC.querySQL` accept the same 100,000-record / 2 MiB-record / 32 MiB-total-text input bounds. Keyword search accepts at most 32 distinct terms and charges normalization, full-string scans, and occurrence iterations to a shared 128 MiB character-work budget. Non-overlapping occurrence counts use offsets rather than source splitting. Keyword/exact results remain limited to the highest-ranked 1,000 hits after examining all accepted input; this result cap is not an input truncation. Queries with many common terms can exhaust the budget and fail closed.

Regex and SQL `LIKE` retain shared five-million actual-operation budgets. They count state/epsilon transitions or wildcard dynamic-programming transitions across all input records. The earlier text-length estimates are removed: a cheap anchored regex or scalar SQL equality is not rejected merely because unrelated record text is long. Complex regex/LIKE requests can still exceed their operation budgets. SQL without `LIKE` continues to scan all admitted records, with a returned-row limit of at most 1,000. None of these limits relax the safe-regex or read-only SQL grammars.

Run:

```sh
node --test --test-isolation=none tests/questions.test.js
```

Synthetic tests cover realistic question retrieval, unrelated/all-stop abstention, exact token boundaries, missing date/numeric/sign/unit terms, multi-excerpt partial status, deterministic ranking, Unicode normalization, unchanged source excerpts, detached results, cross-case provenance, hostile markup/getters/prototype keys, and resource bounds. Browser UI integration and mandatory `file://` acceptance remain separate checks.

## Reproducible large-input evidence

`tests/search.test.js` and `tests/questions.test.js` parse synthetic local TXT files through the actual parser, including a line longer than 100 KiB, a 50,001-row source, and a 100,000-row source with a unique final marker. The tests verify exact record IDs, original text, final line locators, partial evidence, and unrelated-query abstention. Separate derived-record fixtures test the 32 MiB aggregate text boundary; those fixtures demonstrate query/schema bounds, not parser correctness for arbitrary compressed files. Token-dense data tests verify an explicit budget error rather than returning early evidence as a complete search.

The 100,000-record benchmark uses `filler\n` repeated 99,999 times followed by `uniquetail`. Its complete case serializes to about 31.27 MiB and passes the case codec. It records timings using `performance.now()` and process peak RSS as a test diagnostic, without machine-specific timing assertions. In one Node v24.19.0 Linux cloud run of the combined 34-test query suite, parsing took 35.5 ms, keyword retrieval 20.3 ms, scalar SQL 32.7 ms, and validated lexical question retrieval 411.4 ms. Process peak RSS was 349.9 MiB for the whole combined suite, including prior large fixtures and the test runner; this is not an isolated query allocation measurement. These observations are not enterprise Windows browser acceptance or a guarantee of identical performance on other machines.
