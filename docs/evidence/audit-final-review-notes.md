# Post-ac68 review record — November 20, 2026

This record separates the intermediate benchmark from later corrective work. It does not accept the current branch as a release candidate.

## Intermediate 1 GiB result

[The scoped benchmark projection](audit-large-case-ac68-1gib.json) records a clean `ac68c7fd198f5edd40548343e780e553f729f50a` run. It imported 256 original files totaling 1 GiB, searched the full case, returned one exact synthetic fact through real Qwen, checked every backup original hash, and reparsed three distinct original samples. Runtime fingerprints stayed unchanged during the run. No external requests were observed.

The run took 17 minutes 33 seconds. The sampled whole-process PSS peak was 5,306,892,288 bytes. The three full-case searches took 28.4, 27.0 and 34.3 seconds; a selected-source search took 448 milliseconds. The Qwen provider call took 99.1 seconds under the unchanged 120-second generation deadline. Its enclosing stage also includes retrieval. This is one distinctive synthetic fact, not broad answer-quality evidence.

The browser used an incognito context. It reopened the database and page in the same context. It did not restart the full browser or reimport a complete second 1 GiB copy. The later persistent-profile benchmark is a separate gate. Previous failed raw reports retain their FAIL status.

## Later guard corrections

The post-ac68 working changes address three concrete findings:

- **Complete safety inventory.** Learned reranking must not remove an exact candidate from conflict analysis. The collection answer path keeps ranked candidates first, then retains the remaining bounded exact candidates for the answer guards. A seventh conflicting fact and encoder-coverage exclusions have regression checks.
- **Property owner.** A requested person's name in attribution or another person's condition does not establish ownership of an age, income or other property. The bounded prose guard checks the requested subject against the quoted statement. It preserves original quotations. Typed table fields retain their separate source-row and focus-column checks.
- **Wrapped source text.** Choice creation and answer validation now share source-statement splitting. Header and page-number lines can be separated from a fact. Explicit conditions, dates, group qualifiers and alternatives across line breaks remain part of the exact source span. A clipped qualification cannot become a bare factual answer. Malformed or untrusted table hints cannot downgrade into answer prose.

The repair-specific checks are `tests/collection-rerank-safety.test.js`, `tests/rag-subject-role.test.js` and `tests/rag-source-lines.test.js`. Final targeted direct runs reported 3, 37 and 58 checks passing, respectively. Together with the existing answer-selection, combined-question, single-selection, qualifier, core RAG, table-identity and multi-paragraph checks, all 191 checks passed. These synthetic/mock-provider results establish the tested guards. They do not establish general semantic entailment, source truth or Qwen quality.

The coordinator's complete final Node run passed 558 checks, with zero failures and seven explicit skips (`test-results/audit-node-commit-final.log`). A preceding supplementary Chromium run passed all 31 collection, PDF, persistent-restart and visible question-flow checks with zero external requests (`test-results/audit-targeted-browser-final-http.log`). The last definite-head qualification refinement followed that browser run and passed the full Node suite. Exact committed-runtime platform and scale verification remains the next gate.

A final independent read-only check passed 12 bounded probes: complete definite-head qualifiers and a buried service number remain quoted; clipped tails abstain; digit and written-number conflicts still block; attribution, counterparty and family-owner substitutions are rejected. No new material finding arose within that scope. These are mock-provider orchestration probes, separate from actual-model quality and platform acceptance.

## Remaining acceptance gates

At the time of this record, a normal persistent-profile full-browser restart at 1 GiB, real-model integration for the final guard runtime, exact-head Windows/Ubuntu actual-file checks, and the independent final re-audit remain separate pending gates. New evidence must state its exact commit, workload and browser profile. A supplementary HTTP PASS does not replace actual offline-file evidence.

The large-case search uses authenticated exact-term candidates with bounded learned reranking. It is not a global dense index. Format-specific extraction caps, PDF/OCR coverage warnings and unencrypted storage still apply. Representative authorized real-plan evaluation remains necessary; no restricted documents belong in this public repository.
