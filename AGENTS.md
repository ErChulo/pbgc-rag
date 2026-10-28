# AGENTS.md — Instructions for Codex and specialist agents

This is the **PBGC-RAG** project at https://github.com/ErChulo/pbgc-rag.

## First actions in every session

1. Read `KICKOFF.md` (the six-round requirements interview consolidated).
2. Read `DESIGN.md` (PBGC September 2025 branding/editorial rules).
3. Read `PROGRESS.md`, `DECISIONS.md`, `BLOCKERS.md`, and `ACCEPTANCE.md` if present.
4. Inspect the current repository, upstream HKUDS/RAG-Anything, and previous tests.
5. Resume from the latest verified milestone. Never reset completed work.

## Autonomy

Proceed through all implementation phases without unnecessary user questions. Make routine, reversible choices yourself. Persist decisions and exact tests. Do not promise background execution beyond the available session. Never claim success without evidence. Official actuarial interpretation and confidential-data handling require human approval.

## Parallel work

If multiple Codex agents are available, **use them for independently scoped workstreams**, not for simultaneous edits to the same files. Have one coordinator own architectural contracts, integration, review and acceptance. Assign independent tasks across file ingestion, search/graph, actuarial rules, browser offline shell, reporting/artifacts, design/accessibility, and independent verification. Use worktrees/branches or explicit file ownership; version shared interfaces before delegation. Subagents provide commit IDs, tests, changed paths and risks. Coordinator integrates and runs full end-to-end tests. Cap parallelism based on CPU/RAM; serialize shared-file changes. If subagents are unavailable, follow the same plan sequentially.

## Mandatory constraints

- PBGC workplace mode: double-click `index.html` under `file://`, 16 GB RAM CPU, no installation, servers, Python, Node, external network, cloud, telemetry, CDN or remote fonts.
- Optional development mode may use upstream Python RAG-Anything locally, but must not be required in the workplace.
- Never add PII or restricted case files to this public repo. Use synthetic fixtures.
- Preserve original documents and exact locators; do not invent provisions, field names, formulas, citations or official output validity.
- Use the approved versioned `data_dictionary_complete.xlsm` for official field names when actually supplied.
- Approval-gate material actuarial interpretations and generated rules.
- All required exported official artifacts must undergo structural and numerical validation; block failed outputs.
- UI: minimal, wizard-first, dark option, accessible; follow `DESIGN.md`, local image placeholders until approved logos supplied, ASD-STE100-style language outside templates.

## Acceptance and stopping

Record test results as PASS, FAIL, or BLOCKED with evidence. Test real `file://` browser execution and network isolation; HTTP dev-server tests do not substitute. Use independently calculated expected results for actuarial regression. If official templates, BSRS syntax, ATPBGC specs, or workplace browser policies are unavailable, mark corresponding acceptance blocked, continue all independent work, and disclose limitations. A scaffold or prototype is never the finished application.
