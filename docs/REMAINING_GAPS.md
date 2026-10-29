# Remaining engineering and pilot gates

Reviewed October 28, 2026 against revision `ed2aee9`, `KICKOFF.md`, `DESIGN.md`, and the current acceptance record. This is an independent source review with two small synthetic module reproductions, not a new full-suite run. Later changes may resolve individual findings; verify them against the listed acceptance before closing them.

The implemented subset supports useful synthetic research evaluation. It does not yet establish the requested full core application or mandatory workplace readiness. A clearly scoped development pilot can evaluate supported imports and deterministic research tools while official release stays blocked. Do not make official-template availability a prerequisite for fixing the independent engineering below.

## Immediate correctness and supported-workflow gates

| Priority | Finding | Testable acceptance |
|---|---|---|
| P0 | Mandatory file-origin execution remains blocked by managed Chromium URL policy. Secondary HTTP tests are useful evidence, but do not establish the deployment method required by the user. | In a permitted Windows 11 enterprise browser, open the shipped `index.html` by double-click with network denied. Execute import → search → graph → claims/proposals → internal report → package export → close/reopen → restore. Verify native decompression, local scripts/CSP, source downloads, persistence or explicit memory fallback, and zero application network attempts. Record browser/version/policy and exact supported failures. Preserve the current policy; no bypass. |
| P1 | **Reproduced contract defect:** valid portable graph nodes may have independent node and evidence-record IDs, but `graphView()` writes `edge.recordId = from.value` (the node ID). A case with node `node-a` citing a real parser record validates; the UI's new edge fails case validation with “Graph edge record evidence is outside its case source.” This fails closed, but prevents legitimate editing after restore. | Restore a package with distinct node/record IDs. Add a link; retain the selected node's actual `recordId` and `sourceId`; traverse, export, and restore successfully. Nodes without evidence must receive a clear non-mutating refusal. Missing optional labels should have readable ID fallbacks. |
| P1 | **Reproduced limit mismatch:** a supported TXT containing `Synthetic\n` repeated 50,001 times parses and passes `validateCase`, but `search` rejects it because search caps records at 50,000 while parser/case limits allow 100,000. Selecting that source alone cannot resolve the error. | Every accepted source must either be searchable through bounded paging/chunking with deterministic complete results, or receive an explicit pre-import/searchability limitation. Exercise 49,999, 50,000, 50,001 and 100,000-record cases and text/work-budget boundaries. Keep result truncation separate from indexing completeness; do not silently drop evidence. |
| P1 | Main-thread parsing, conflict screening, package hashing/serialization, and repeated revision snapshots have narrow resource limits but no demonstrated representative 16 GB CPU-only performance envelope. Cancel stops at complete-source boundaries. | Measure time, peak memory, UI responsiveness, and cancellation latency for mixed supported files near documented limits on representative hardware. Define a bounded stop path for malformed/expanding input; verify no incomplete source/citations are committed. Publish practical working limits and recovery guidance based on measurements. |

The two reproduced defects above use public synthetic strings and the current exported APIs. They do not indicate confidential-data exposure or bypassed case validation.

## Native ingestion and evidence coverage

Legacy binary **DOC/XLS** remain missing requested formats; Office Open XML is not a substitute. Native browser parser work must preserve exact original bytes, never execute macros, and distinguish text, formulas/cached values, structure, and locators. Minimum acceptance: independent synthetic legacy fixtures, malformed/encrypted/active-content rejection, formula and table provenance, parser versioning, cancellation/resource limits, and portable round trips. If a format remains unsupported, reject it before a misleading import/index success and retain an explicit capability matrix.

PDF coverage is still a deliberately constrained native-text subset. Broader PDF objects/filters/font encodings, image-only pages, OCR, and precise geometry require independent fixtures and explicit extraction-completeness indicators. Mixed searchable/unsearchable pages must remain visible to users and reviewers. OCR needs local assets, confidence/verification metadata, and a comparison against independently transcribed synthetic pages. No parser should claim arbitrary document fidelity from a few generated fixtures.

Office acceptance should expand across non-main document parts, merged/hidden worksheet structure, formulas/shared strings and source locators, relationship targets, malformed archives, embedded objects, and unsupported legacy variants. SQLite acceptance must keep unsupported schemas/storage types explicit and preserve exact row/column/key provenance. Do not silently treat incomplete extraction as complete evidence.

## Search, domain review, and models

Current question retrieval is lexical excerpt retrieval, not semantic inference or answer synthesis. This limitation is correctly disclosed and does not prevent a supported deterministic pilot. It remains unfinished relative to the user's complete search request.

Before claiming local semantic capability, implement versioned local model/asset import, license and checksum inventory, actual CPU/browser inference detection under `file://`, bounded indexing/retrieval, and explicit consent for only local processing. Acceptance must include relevant paraphrases, negation/numerics, irrelevant-query abstention, source-linked results, missing/corrupt model fallback, cancellation and measured 16 GB resource use. A model score cannot establish factual or actuarial correctness. Keyword/exact/regex/structured search must remain available without any model.

The internal ontology and overlap screen flag differences, but do not establish amendment priority, legal applicability, participant eligibility or approved interpretations. Add explicit reviewed facts, authority/applicability status, effective-date/group reconciliation and unresolved-issue tracking before promising domain reasoning. Tests must include contradictory provisions across sources and cases, ambiguous applicability, date boundaries, and human approval/version changes; no priority rule should silently activate itself.

## Reports and reviewer delivery

Internal review/evidence HTML, JSON packages, source links, provisional timelines and SVG evidence graph exist. Requested reusable charts, analytical report layouts, and a cohesive reviewer package remain incomplete. A portable case JSON retaining originals is useful recovery, but is not by itself an independently validated presentation/reviewer workflow.

Acceptance for the next internal reporting increment: source-backed chart/table definitions with named units and filters; inspectable aggregation calculations; empty/missing/contradictory data states; accessible tabular alternatives; deterministic report layout versions; visible unresolved items and synthetic/provisional status; and an export bundle containing readable report, exact originals or verified retained-source package, citations, manifests/hashes, validation results and approval states. Reopen that bundle offline on a clean profile and navigate every evidence link. Do not fabricate official R1/BSRS/template fidelity to satisfy an internal reporting milestone.

## Storage, recovery, security and usability

Checkpoint/recovery, separate reference libraries, pinned source imports, incremental manifests and reviewed reindexing have substantial tested paths. Remaining acceptance includes real file-origin durability behavior, schema-version migrations, power/process interruption around every write boundary, concurrent-tab edits/version changes, quota exhaustion, corrupted current/history/library records, and a clear conflict/recovery UX. Verify case and library data remain isolated through restore, update, reindex, prune and delete. Record limits of OPFS availability rather than assuming its existence.

Resource-limited hostile-input tests and CSP are valuable, but are not a broad parser/enterprise-security audit. Prioritize fuzz/adversarial corpora for ZIP/XML/PDF/SQLite, active and embedded content, path/relationship traversal, decompression bombs, nonfinite/oversized/hostile schema values, regex/SQL/graph bounds, stale plans/manifests and tampered provenance. Verify rejection is atomic, failures preserve earlier checkpoints, and all runtimes remain local with HTTP/HTTPS/WebSocket blocked. Separately audit third-party transitive licenses/security and locally supplied models. Hashes detect corruption; they do not authenticate authorship, reviewers, extracted text or legal authority.

The 30-check accessibility regression suite and source-derived contrast tests are narrower than full accessibility acceptance. Before broad workplace testing, cover Windows screen readers, keyboard-only error/recovery/library workflows, high-contrast/forced-colors, zoom/reflow, touch targets, large-graph equivalents, and exported report navigation. Use synthetic user tasks and independently observed outcomes rather than only implementation-mirroring assertions.

## Official-output blockers remain separate

Approved versioned `data_dictionary_complete.xlsm`, authoritative BSRS grammar/validator, official template originals and mappings, ATPBGC/reference numerical specifications, and authorized actuarial/release approvals remain external prerequisites. Continue independent engineering without them. Official outputs must remain **BLOCKED** until supplied inputs and structural/numerical/approval gates pass; synthetic arithmetic or a research pilot cannot substitute for those gates.


## Follow-up closures in increment0.4

Both specifically reproduced supported-workflow defects above are fixed and covered by actual Chromium secondary-HTTP regressions: independent graph node/record identities retain proper link evidence, and real accepted long-line/50,001/100,000-record cases can retrieve their final unique evidence within documented work budgets. Full source/result caps remain explicit, not silent input truncation. Case serialization and shared-string amplification now have aggregate guards.

Optional native OPFS two-generation recovery and a cohesive checksum/source-verified internal reviewer ZIP are now implemented and browser-tested. This closes those defined delivery/recovery subsets, not schema migration, durable file-origin acceptance, arbitrary format coverage, full resource/security/accessibility acceptance, or official validity. Analytical charts and broader report layouts remain next reporting work. Maintained XLS source access has an actual three-host network-policy blocker with a saved settings draft. Current acceptance evidence and exact counts are in ACCEPTANCE.md; baseline findings above are retained for traceability.
