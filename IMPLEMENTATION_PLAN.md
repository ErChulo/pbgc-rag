# Implementation plan and gates

Use the existing isolated checkout. Never create a worktree unless explicitly requested. Preserve completed work and use disjoint agent file ownership.

| Phase | Work | Gate |
|---|---|---|
| 0 | Inspect source, upstream license/revision/dependencies, actual file execution | Source inspected; upstream proxy and managed file navigation currently blocked |
| 1 | Offline shell, isolated cases, capability fallback, package recovery, accessibility | Unit and actual file browser checks; enterprise file gate remains blocked |
| 2 | Native parsing, originals, locators, limits, dedupe | Synthetic round-trip and hostile fixtures per parser; no guessed unsupported content |
| 3 | Keywords, exact, safe regex, read-only SQL and query help | Reference comparisons and injection/resource tests |
| 4 | Typed temporal graph, evidence provenance, conflict review | Cycle/date/case bounds; no automatic authority adjudication |
| 5 | Dictionary, ontology, approved actuarial rules | Human-approved authoritative definitions and independent reference values; synthetic arithmetic is separate |
| 6 | Source-linked reports, timeline, charts and reusable layouts | Evidence links and export integrity; no official validity claim |
| 7 | R1, BSRS, R5, DEL, PF, V1, 436 and checklists | Actual templates, grammar, reference data, validation and approval required |
| 8 | Integrated file browser, security, accessibility, resource/performance, package | All acceptance rows pass before completion |

Coordinator owns shell, contracts, integration and final acceptance. Parser, search, artifact and independent test agents own separate modules/tests. Commit tested increments; record exact outcomes in ACCEPTANCE.md and remaining work in PROGRESS.md. No fabricated official outputs or hidden fallback to network models.
