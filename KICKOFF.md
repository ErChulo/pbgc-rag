# PBGC-RAG — Codex autonomous kickoff

> Status: requirements baseline. This is a project specification, not a claim that the application is implemented.

## Mission

Build a complete, tested, offline-first PBGC defined benefit pension casework RAG system in this repository. Study and reuse [HKUDS/RAG-Anything](https://github.com/HKUDS/RAG-Anything) where suitable. Record the upstream license, revision, architecture, and dependency inventory before importing code. Do not merely wrap Python RAG-Anything with an HTML frontend and call that a workplace build.

The product must ingest and natively process PDF, Word (DOCX/DOC), Excel (XLSX/XLSM/XLS), CSV, TSV, SQLite, TXT, Markdown, HTML, JSON, XML and other text formats through versioned parsers. Preserve structured content, formulas, tables, and precise locators. Provide semantic/natural-language search, full-text/keyword search, regex, read-only SQL, and typed multi-hop knowledge-graph queries with temporal validity and complete provenance. Provide reports, tables, charts, timelines, graphs, reusable report layouts, and production-targeted artifact generators using official templates for R5, DEL, PF, V1, BSRS, R1, 436 memos, reviews, checklists, and review packages.

The objective is **full feasible implementation, integrated verification, and a usable offline application**, not a demo or partial scaffold. Do not claim acceptance for an untested or unsupported capability.

## Environment profiles — nonnegotiable

**A. Mandatory workplace profile.** Windows 11; about 16 GB RAM; CPU-only; locked-down enterprise browser. Entry point is a double-clicked `index.html` opened using `file://`. No installation, server, Python, Node.js, outbound network, cloud models, CDN, telemetry, or privileged APIs. Local JS/WASM and adjacent portable local assets are allowed. Test with actual `file://` usage, not only HTTP dev server. Capability-detect browser restrictions on workers, WASM, file/directory access, storage, model assets and module imports. The browser-only profile must be fully functional for all declared mandatory capabilities; where impossible, show exact limitations, provide deterministic fallback, and mark acceptance BLOCKED rather than falsely passing. Search must continue using keyword, regex and structured queries when browser local semantic inference is unavailable.

**B. Optional advanced development profile.** Windows 11/Linux Mint; Python, Node, local models, upstream RAG-Anything, advanced OCR and local parsers allowed. All inference and processing remain local. It must never be a runtime dependency of Profile A. Use shared, versioned interchange schemas, not a network bridge. Never move PBGC data to a remote coding environment.

## Autonomous Codex execution and parallel subagents

Do not seek user approval for routine, reversible engineering decisions. Proceed through all milestones, run tests and repair failures autonomously. Do not promise uninterrupted background operation: persist state so later sessions can resume.

Use **parallel agents whenever tasks are truly independent and the current Codex environment supports them**. Establish a coordinator/integrator as the single owner of architecture contracts and final acceptance. Spawn specialist agents, each assigned a bounded workstream and isolated worktree/branch or nonoverlapping file ownership:

- Browser shell, `file://` behavior, security, accessibility and persistence.
- Native file parsing, provenance and incremental indexing.
- Search, lexical/regex/SQL, optional embeddings and graph query.
- PBGC ontology, data dictionary, temporal/legal evidence and calculations.
- Official-template rendering, R1, BSRS and artifact validation.
- Design system, reports/visualizations, learning appendix, UX.
- Independent security/e2e/numerical regression testing.

Run independent inspections, tests and modules concurrently; serialize work that shares interfaces or changes the same files. First agree on versioned schema interfaces, fixtures and acceptance contracts. Do not allow two agents to edit the same files at once. Each agent must report changes, tests, risks and interface impacts. Integrator reviews, merges, reruns complete suites, and resolves conflicts. Cap concurrency according to execution resources. If parallel agents are unavailable, execute the same work queue sequentially without blocking progress. Never treat a subagent's self-report as independent acceptance evidence.

## Security, privacy and repository hygiene

Never commit participant PII, internal case documents, confidential templates or downloaded proprietary PBGC material. The public repository must contain only synthetic fixtures, licensed dependencies, documentation and code. Keep imported local workspaces entirely outside Git-tracked files. Never execute uploaded macros, scripts, active HTML, remote references, untrusted SQL mutations or document attachments. No network calls, including DNS, fonts, model downloads, analytics, update checks or telemetry. Use strong CSP compatible with tested `file://` behavior; prefer `connect-src 'none'` and block network at test level. Sandbox untrusted inputs; guard zip bombs, malformed documents, regex denial-of-service, runaway graph traversals and resource use.

## Core data and evidence requirements

Maintain isolated per-plan case workspaces plus a separately versioned reference library. Do not cross-link confidential case records across cases. Preserve source bytes or read originals in place without altering them; keep parsed structure separate from search text and derived graph. Manual imports and directory scans where supported; incremental content hashing, dedupe, checkpoints, resume, cancellation and visible progress.

Source locators must resolve to: PDF page and bounding region (when available), Word paragraph/heading/table/cell, Excel sheet/cell, CSV row/column, SQLite table/key/column, text line/offset. Never invent exact positions. Evidence records require source hash/version, excerpt, locator, applicable date/group and confidence/verification status. Detect contradictory provisions; use authority, amendments, event dates and participant applicability rather than blindly preferring newest language. Abstain when evidence is insufficient.

Search: lexical/full-text, exact, regex, read-only SQL, semantic inference if CPU/browser allows, and typed graph traversal. Provide natural-language UI and advanced query editor, versioned PBGC ontology, cycle protection, bounded multi-hop traversal, explainable scoring and provenance-linked responses. GraphQL-like query capabilities need not require a GraphQL server.

## Actuarial architecture

Authoritative official field names **only** from a versioned user-imported `data_dictionary_complete.xlsm`. Never silently substitute `DD.csv`; internal metadata fields use an independent namespace. If dictionary is unavailable, use explicitly synthetic schema/test fields and mark official validation BLOCKED.

Separate documentary facts, approved legal/actuarial interpretations, and deterministic calculations. AI may propose rules but **never activates them without human approval**. Version every rule, effective date, input/output contract, source and rounding convention. Independently test numerical results, interest/mortality/annuity factors, limits and benefit scenarios. Do not fabricate official ATPBGC functions, BCV equivalence or statutory conclusions. Keep explicitly accepted administrator accrued benefits as case inputs, validating downstream logic.

Model NRD, ERD, EURD, RBD, QPSA, DOR, DORNSF, XRD, benefit forms, PC categories, Title IV/4022(c), 436, survivor cases, post-DOPT events, freeze dates, plan amendments, service and pension calculations. Never hardcode a single plan's provisions into general rules.

## Official outputs and validation

Preserve actual supplied Word, Excel and PDF templates. Modify only mapped, authorized areas; retain headings, styles, formulas, protected ranges, sheet names and layout. Do not claim arbitrary template fidelity. Reject unsupported templates or explicitly mark them blocked.

Generate:
- **R1:** complete initial actuarial case memo draft with case facts, sourced narratives, tables, assumptions, limitations, unresolved items and review flags.
- **BSRS:** real configuration text from documented syntax, with field maps, conditional paragraphs, scenario routing, benefit determination/recalculation support, rule checks, coverage and diagnostics. If authoritative syntax is missing, output only an explicitly provisional internal representation.
- R5, DEL, PF, V1, 436 memo, review/closeout checklists and reviewer packages.
- Reusable report schemas, tables, charts, source-linked reports, graphs and timelines.

Exports: individual files and versioned case packages with manifests, validation results, hashes, sources and approval states. Block affected official outputs when source, numeric or template validation fails. Do not issue final determination letters automatically.

## Design and editorial requirements

Implement `DESIGN.md` using the September 2025 **PBGC Branding & Editorial Style Guide**, and treat it as the authoritative visual/editorial reference. Primary HEX colors: PBGC blue `#002D72` and red `#E4002B`; approved secondary palette and fonts as specified there. The GUI must be minimal, wizard-first and dark-mode by default, with small nearby info icons and a separate SPA-routed instructional appendix for nontrivial search/formalism. Include 508/accessibility checks. Use approved official logo files only if authorized and supplied. **Until then use labeled placeholders, never hand-draw, recreate or distort the logo.** Respect logo variants, clear space and minimum size. The public app is not to misrepresent itself as an official PBGC-approved product.

Except text inserted into official templates, all app output should use ASD-STE100-*style* Simplified Technical English: brief active sentences, controlled terminology, minimal redundancy; preserve precise actuarial notation. Follow PBGC editorial conventions for typography, capitalization, dates, acronyms and preferred wording. Never assert formal ASD-STE100 compliance unless independently validated.

## Storage and resilience

IndexedDB/OPFS where available, with portable case import/export, integrity checks, versioned schema migrations, backups and recovery. Do not assume durable `file://` storage; implement verified fallback. Detect browser capabilities. Provide meaningful progress and clear failure messages.

## Development phases and gates

0. Inspect upstream, license, dependency/security audit and architecture spike; verify `file://` constraints first.
1. Offline browser shell, navigation, persistent storage, import/export, design tokens, and security tests.
2. Native parsing, locators, incremental indexing, checksums and large-file recovery.
3. Full search modes with deterministic fallback, search syntax appendix and citation UI.
4. Typed temporal knowledge graph, authority and contradiction reconciliation.
5. PBGC dictionary/ontology/rule approval and independently verified deterministic calculations.
6. Reporting, charts, graphs, timelines and report layout definitions.
7. Template-preserving artifact generation, R1, BSRS, then R5/DEL/PF/V1/436/checklists.
8. E2E integration, security, offline browser tests, resource/performance and final packaging.

Run synthetic end-to-end cases from import → search → provenance → rule approval → calculation → R1/BSRS/artifact → validation → export. Compare calculation results to independently constructed expected outputs. Validate official formats only when original fixtures/specifications are provided. Record PASS/FAIL/BLOCKED for every requirement, with commands and evidence. Never treat absence of a reference fixture as PASS.

## Persistent artifacts

Maintain `AGENTS.md`, `DESIGN.md`, `SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `PROGRESS.md`, `DECISIONS.md`, `BLOCKERS.md`, `ACCEPTANCE.md`, `SECURITY.md`, and an honest `README.md`. All agent workers must use these as common contracts.

## External dependencies and blockers

Work independently on everything possible. Only escalate true non-engineering blockers: withheld approvals, missing official PBGC field dictionary, proprietary BSRS grammar/validator, locked official R1/PF/V1 templates, inaccessible ATPBGC reference data, or verified enterprise browser restrictions. Record such blockers without stopping unrelated work. Do not upload restricted work data to the public repo.

## Final delivery and stop condition

Deliver the source, double-clickable offline `index.html` with adjacent assets, local portable package format, documentation, synthetic demo case, source-linked reports, R1 draft, BSRS configuration sample, automated tests and a rigorous acceptance matrix.

Codex: **Begin now.** Inspect this repository, audit upstream, write architecture/contracts, then parallelize independent workstreams and proceed through all phases. Commit tested increments and resume from repository progress documents when interrupted. Declare completion only when acceptance evidence supports it; report infeasible or externally blocked capabilities explicitly.
