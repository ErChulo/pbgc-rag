# Architecture and interface v1

Workplace runtime: index.html and classic local scripts, no build, server or remote resources. Global namespace `PBGCRag`; modules also export via CommonJS for development tests. Source bytes remain separate from parsed records. All user content renders as text.

## Contract v1
`PBGCRag.parseText(name, text)` returns `{parserVersion: '1', records: [{text, locator}], warnings: []}`. Supported initial formats: TXT, MD, CSV, TSV, JSON. Locators are descriptive objects, never invented page positions. Reject unsupported formats explicitly.
`PBGCRag.search(records, query, mode)` returns records with `score`; modes keyword and exact initially. Records passed by UI include sourceId, sourceName, sourceHash, text and locator. Empty queries return no results. No implicit evidence interpretation.
Workspace: `{schemaVersion:1, id, name, sources: [{id,name,hash,bytesBase64,parserVersion,records,warnings}]}`. Portable JSON includes original bytes and verified SHA-256. Import validates full structure, recomputes hashes and reparses original bytes before replacing memory. No arbitrary scripts, HTML or rules execute.

## Ownership
Coordinator: architecture, index.html, assets/app.js, assets/style.css, persistence, packages and integration. Parsing/search agent: assets/core.js, tests/core.test.js, fixtures only. Audit agent: docs/UPSTREAM.md, SECURITY.md only. Verification agent: tests/browser* and tests/security* only. No shared file edits.

Official outputs, approved rules, binary parsers and local model inference require later implementations and evidence; they must not be represented as available by the initial shell.

## Increment 2 contracts and ownership

All new modules are classic scripts extending `PBGCRag` and CommonJS-compatible for dev tests. Coordinator exclusively owns index.html, assets/app.js, assets/style.css and integration documentation. Existing core parseText remains synchronous.

- Query agent owns assets/query.js and tests/query.test.js. `queryRecords(records, query, mode)` returns record array; modes `regex` (linear bounded safe subset), `sql` (strict read-only documented SELECT subset over records). No eval, dynamic code or unrestricted regex.
- Graph agent owns assets/graph.js, tests/graph.test.js. `buildGraph(sources)` returns typed document/record graph with sourceHash/locator evidence only; no inferred legal relationships. `queryGraph(graph, {startId,maxDepth,asOf,types})` bounded deterministic traversal. `validateGraph` rejects forged/dangling edges; support explicit user assertions separately with provenance and validity.
- Parsing agent owns assets/formats.js, tests/formats.test.js, vendor/ and docs/DEPENDENCIES.md only. `parseBytes(name, Uint8Array)` async returns same parse result shape as parseText; dispatches text through core. Implement audited feasible DOCX/XLSX/XLSM/HTML/XML, PDF only if reliable browser-local library fits. No macro/script execution, network or fake locators. Bound archives/decompression. No shared core edits.
- Rules/report agent owns assets/review.js, tests/review.test.js only. `validateRule`, `calculate` for explicitly synthetic deterministic arithmetic only with approval gates; `buildReview(workspace)` returns versioned nonofficial evidence inventory/R1 draft/internal BSRS representation with blockers. No official schema/formulas invented; exported text/JSON clearly provisional.
- Storage agent owns assets/storage.js, tests/storage.test.js only. `createRecoveryStore()` async returns `{kind,load,save,clear}` with IndexedDB then localStorage then memory fallback; versioned revision snapshots, transactional write, limit inputs, preserve prior known-good on failed write. Keep current localStorage KEY migration support. Store is recovery, not trusted until coordinator verifies package. No app edits.
- Verification agent owns tests/browser.test.js, tests/security.test.js, tests/accessibility.test.js only. Extend independent checks as integration lands; never bypass managed file policy.

Sources may gain `format` and parser-version metadata. Case package schema remains v1 in this increment for source-only compatibility; graph/rule/report proposals are derived and never trusted from imported packages. Coordinator will version package schema before persistent annotations are introduced. Rule objects and graph assertion contracts stay module-level until integrated explicitly.

## Integrated 0.2 contracts

Runtime order is pinned PDF worker-source asset + PDF adapter; core/formats; generated ingest worker-source asset + ingest adapter; ranking/query/graph; review/reports/storage; app. Runtime never builds code, imports network modules or fetches assets. Blob worker source strings are generated during development from reviewed static code. PDFs and all binary Office/legacy/SQLite parsing require dedicated local workers; no UI-thread binary fallback. Active parser workers terminate after at most 15 seconds or AbortSignal cancellation. Small text has the documented 128 KiB bounded fallback.

`parseLegacyBytes(name,bytes)`, `parseSqliteBytes(bytes)`, `parsePdfBytes(bytes,{signal,timeoutMs}?)` and `parseIsolatedBytes(name,bytes,{signal,timeoutMs}?)` return parser result objects. See docs for each supported subset. Rebuild `vendor/ingest-worker-source.js` after source-parser edits; freshness is tested. PDF source generation/hash inventory is separately documented.

`rankRecords(records,query,{limit})` is transparent BM25 lexical ranking, not embeddings or inferred answers. `queryRecords` implements the documented safe regex and read-only internal-record SQL subsets. Graph structural validation can bind to verified source records; proposed links always remain proposed. Canonical locators and stable source/record identities must be used, not order-sensitive JSON object equality.

Case package remains schemaVersion 1, original-byte sources only. Valid IDs survive reparse; collisions when restoring an already-open case produce a separate new case identity. Portable imports never silently overwrite another open case.

Recovery payload schemaVersion 2: `{activeId,cases:[case-v1...],library:case-v1|null,pending?:{targetId,package:case-v1}}`. Reserved library ID is `reference-library`. At most eight cases, one library, 80 MB serialized total. Each workspace remains within 20 MB original bytes/200 sources/50,000 records/portable-size budgets. All cases/library/checkpoint sources rehash and reparse when loading a recovery catalog. Checkpoints contain only verified completed source files; active batches commit atomically. Reselecting source files skips hashes already active or checkpointed. Cancellation can retain the checked subset but never activates it without explicit completion/Keep checked sources.

Recovery store prefers transactional IndexedDB, falls back to localStorage then explicit memory. Current and prior revision snapshots, stale-tab conflict checks, legacy-v1 migration and explicit clear are tested. Recovery write errors keep current UI memory and last durable snapshot; no dropped write is reported as saved. Export/reload is required after conflicts. LocalStorage simultaneous-tab atomicity is not guaranteed.

Report layouts and proposed graph links stay per-workspace in session memory and use explicit separate exports or a reviewer package across reloads. They are not hidden inside a source-only case package. Report timelines require an explicit date and a resolving source locator. No legal effective date is inferred.

Reviewer package schemaVersion 1/kind `provisional-reviewer-package`: source case plus five artifacts (provisional R1 text, internal nonexecutable BSRS JSON, escaped HTML report, layout JSON, proposed graph JSON), per-artifact SHA-256/byte lengths and a release-blocked manifest. Restore recomputes hashes, reparses originals, binds graph/layout to sources and regenerates R1/BSRS/HTML before accepting. Imported manifest assertions never activate official output. Hashes do not authenticate authorship. Reviewer/catalog imports are size-limited and validate before workspace mutation.

## Increment 0.3 ownership and contracts

Coordinator owns assets/app.js, index.html, assets/style.css, tools/package.py, source-package/catalog migrations, integration docs and GitHub integration. Independent agents may edit only their new paths below; no concurrent shared edits. Modules remain local classic scripts extending PBGCRag and CommonJS dev-test compatible.

- Dictionary workstream: assets/dictionary.js, tests/dictionary.test.js, docs/DICTIONARY.md. `buildDictionary(source,config)` derives exact field names from explicitly chosen Excel sheet/column/header row of the actual named data_dictionary_complete.xlsm source. Config includes version and explicit human review metadata; no inferred authoritative fields, no substitution DD.csv. Validation preserves source hash/cell locators, rejects ambiguous/duplicate names, and `validateFieldValues` reports unknown fields without inventing types/formulas.
- Evidence review workstream: assets/evidence.js, tests/evidence.test.js, docs/EVIDENCE.md. Versioned source-bound fact/provision/event annotations with explicit authority/applicability/group/date and proposed/reviewed status; deterministic possible-conflict flags and abstention, not legal priority inference. Human review status must refer to exact content/version; changed content invalidates approval. Provide versioned descriptive internal ontology using requirement terms only, no fabricated official legal definitions.
- Template workstream: assets/templates.js, tests/templates.test.js, docs/TEMPLATES.md. Generic local template mapping/rendering with original-byte hashes, explicit permitted anchors/parts, protected/formula refusal and structural/numerical validation gates. Synthetic test fixtures only. Preserve untouched parts and source bytes; no official output claim without supplied authorized templates/specifications. No uploaded code/macros/formulas execute.
- Query workstream: assets/table-query.js, tests/table-query.test.js, docs/TABLE-QUERY.md. Reconstruct typed source table views from SQLite/Excel/CSV records and provide strict bounded read-only SELECT projections/filter/order/limit preserving cell/row provenance. Reject ambiguity, mutation, extensions and unsupported syntax; no eval or unbounded user regex. Exact int64 must not be coerced to floating point.
- Automation workstream: tools/verify-browser.js, .github/workflows/verify.yml, tests/automation.test.js, docs/AUTOMATION.md. One-command lifecycle-owned loopback HTTP Playwright verification and CI checks, preserving a distinct actual file:// blocked gate. No browser policy modification. Artifacts/source scanner prevents confidential-data/credentials upload; do not alter remote/user credentials.
- Independent verifier: tests/workflow-0.3.test.js and tests/persistence-0.3.test.js only; coordinator will communicate final IDs/APIs. Review source/permission/approval controls and automatic full workflow. No user manual tests.

Case package v1 remains readable. Before persisted annotations/dictionary bindings are introduced coordinator adds case package v2 explicitly. Import must reconstruct/validate every binding from verified originals and retain approval as an unauthenticated human-review claim, never proof of official authority. Unknown schemas reject. Official release remains disabled while actual authoritative inputs/validations are absent.

## Integrated case v2 review state

Source-only case schema 1 remains readable/exported for cases with no review state. A case with persisted workbench data uses schema 2 and adds `workbench:{schemaVersion:1,annotations,dictionary,reportLayout,graphAssertions,tableHeaders}`. The catalog schema remains 2 and accepts either child-case version. Every imported source is rehashed/reparsed before `validateWorkbench` validates exact dictionary/evidence/graph/report/header bindings. Unknown fields/schemas reject; no imported approval is authenticated or used as an official release flag. Review state is capped at 8 MB and the complete case at 40 MB.

`validateEvidenceAnnotations` indexes verified sources once for a whole batch and rejects duplicate IDs. Case changes clear private draft controls. Annotation and dictionary review actions compare all visible source/content/scope/settings with the exact saved version before recording a review. Same-case metadata autosave retains selected evidence only if its source still resolves; cross-case selections never carry over.

The main template control uses `renderTemplateIsolated`, a dedicated Blob worker with a 15-second maximum deadline/cancellation and no main-thread fallback. The generated ingest source includes the template renderer and a separate render-template protocol; document content never becomes executable code. Direct renderer APIs remain for bounded developer tests.

Automation: `tools/verify-browser.js` owns server/child lifecycles and source scanning. Default results are explicitly supplementary HTTP. `--file` preserves actual-file tests and administrator blocks; CI tests its own unmanaged Chromium and cannot establish final Windows workplace approval. Only scoped synthetic logs/build ZIPs are uploaded by CI.
