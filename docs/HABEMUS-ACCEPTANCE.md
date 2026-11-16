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

Status: final-commit platform checks required. Both source jobs and both complete-package jobs must pass for the revised candidate. Earlier results do not establish acceptance of the changed runtime or private workplace documents.
