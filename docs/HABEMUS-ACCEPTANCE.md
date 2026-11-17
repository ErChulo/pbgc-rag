# Complete office candidate acceptance

This development candidate stays on `codex/rag-habemus-1.0`. These checks do not publish the environment, create a release, move a tag or change `main`.

The source workflow, `verify.yml`, checks the exact pushed commit on Windows and Ubuntu. It runs module tests, supplementary HTTP tests, actual offline `file://` tests, the fixed real-model quality checks and whole-process resource checks. HTTP results do not establish offline acceptance.

The separate `rag-habemus.yml` workflow builds `dist/PBGC-RAG-1.0-rc1-office.zip` on each operating system. The model must match the branch's pinned size and SHA-256. The office package test verifies all manifest entries, starts the bundled model without a file picker, checks a real answer, reads a scan and opens the original PDF page.

The workflow then extracts that same ZIP to a path with spaces. It checks archive paths, CRC values and the required new runtime assets. Every feature test opens the extracted `index.html` through `file://` with browser networking disabled:

- Separate questions and selected document answers retain their prior checks.
- Table setup requires an explicit column-name row and keeps original bytes unchanged through save and reopen.
- Mixed-page PDF reading preserves earlier records, reviews and graph links. Cancellation and invalid replacements must keep the previous source.
- Real bundled Qwen checks cover combined answers and table values. Mock orchestration checks cannot replace model acceptance.

The extracted app is supplied through `PBGC_TEST_URL` as a file URI. `PBGC_QUESTIONS_ROOT`, `PBGC_SCOPE_ROOT` and `PBGC_HABEMUS_ROOT` name the same extracted directory. `PBGC_REQUIRE_SCOPE_MODEL=1` and `PBGC_REQUIRE_HABEMUS_MODEL=1` make the respective actual-model checks mandatory. No model size, memory or generation deadline is increased by this workflow.

`test-results/habemus-candidate.json` records the commit, ZIP byte count, ZIP SHA-256 and verified asset names. The candidate ZIP and bounded synthetic test evidence are retained as workflow artifacts for seven days. A passing result applies only to the exact tested commit and ZIP. A later edit requires fresh checks.

Previous commit `3d15767` passed both source jobs and the Windows package job; Ubuntu reached the combined-answer deadline. Commit `d7be991` passed both source jobs and the Ubuntu package job; Windows reached the same deadline. These failures are retained rather than retried as passes.

The current revision keeps the proven full question/source schema and uses a compact source-selection system policy. Its fixed combined fixture has118 actual formatted tokens, within one128-token prefill batch. Local1.5B combined/table checks pass in about82/64seconds. The generic answer policy, source guards, output budget and two-minute deadline remain unchanged. CI retains `rag-habemus*.json` and emits bounded counts for input tokens, first-text timing and partial output length. Public summaries do not expose source or partial-output text.

## Verified runtime and maturity

**Status: PASS — 1.0 RC1, ready for office pilot testing.** Runtime commit [`d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89`](https://github.com/ErChulo/pbgc-rag/commit/d3ce073c7bd4cecfe64b8cdc38bdb8ec028f1e89) completed all four required gates:

| Gate | Result | Job |
| --- | --- | --- |
| Source, Windows | PASS | [133694663979](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663979) |
| Source, Ubuntu | PASS | [133694663857](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279082/job/133694663857) |
| Complete office ZIP, Windows | PASS | [133694663540](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663540) |
| Complete office ZIP, Ubuntu | PASS | [133694663958](https://github.com/ErChulo/pbgc-rag/actions/runs/43980279100/job/133694663958) |

Both source jobs passed actual offline file entry, the fixed real-model quality corpus and whole-process resource checks. Both complete-package jobs passed the previously failing combined/table inference, together with bundled-model startup, OCR, source integrity, original PDF pages, selected documents, table setup and save/reopen. No deadline, memory, model-size, output or quality threshold was relaxed.

The fixed factual corpus had three correct cited answers and one abstention on both platforms; all four unsafe cases were blocked or returned conflict. That is a small synthetic supported-answer-coverage result, not a general accuracy estimate or a production certification. Representative real-plan and manual assistive-technology validation remain pilot work.

The [versioned verification record](evidence/habemus-1.0-rc1-verified.json) retains bounded results and immutable run/job links. Badges refer to this tested runtime and its existing ZIP. This documentation-only follow-up does not rebuild that ZIP or claim that a new application commit passed old runs. A changed runtime or new archive requires its own checks. No release, tag, `main` merge or environment publication is performed by recording these results.
