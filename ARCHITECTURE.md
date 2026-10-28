# Architecture and version 1 contracts

The workplace build uses classic deferred scripts, local assets, and `file://` without a server or package runtime. Each module attaches to `globalThis.PBGC` and may also export through CommonJS for Node tests. No dependencies are downloaded at application runtime. Untrusted content is text, never markup or executable code.

## Shared contracts

- `PBGC.parseFile(file)` is async and returns `{id,name,hash,format,size,records,originalBase64}`. `file` implements browser File (`name`, `size`, `arrayBuffer`). IDs are `src-` plus SHA-256. Each record is `{id,sourceId,text,locator,fields?}`. A locator is `{kind, label, ...preciseCoordinates}`. Parsers reject unsupported formats rather than guessing.
- `PBGC.search(records, query, mode='keyword')` returns `{record,score,reason}[]`. Modes keyword, exact, regex. Bounded safe query execution; no eval.
- `PBGC.querySQL(records, query)` returns rows for a documented read-only subset; unsupported SQL fails closed.
- `PBGC.queryGraph(graph, query)` operates on `{nodes:[],edges:[]}` with typed, source-linked edges and explicit bounds.
- Case: `{schemaVersion:1,id,name,createdAt,sources:[],graph:{nodes:[],edges:[]},rules:[],calculations:[]}`. Case data lives outside source control. Only synthetic fixtures enter Git.
- `PBGC.validateCase(caseData)` returns `{valid,errors,warnings}`. `PBGC.exportCase(caseData)` async returns a JSON string envelope with version, payload, SHA-256 integrity. `PBGC.importCase(json)` validates integrity and schema and returns a case. `PBGC.buildReport(caseData)` produces a provisional evidence-linked internal report object. Official release always blocked without authoritative dictionary, specifications, template and approval.
- Rules remain proposals. No inferred actuarial rule activates automatically. Synthetic deterministic arithmetic must be identified as synthetic, with explicit inputs, rounding and independent tests.

The coordinator owns index.html, app.js, CSS, package metadata, browser integration, and acceptance documentation. Independent agents own parsers, search/graph, and package/report modules and their separate tests. Use the existing checkout: no worktree is needed in this isolated task.

## Integrated extensions

- Binary handlers load before the parser registry: `parseOffice(bytes,extension)`, async `parsePDF(bytes)`, and `parseSQLite(bytes)` return raw records. `parseFile` wraps them with original bytes, hash identity and stable record IDs. Every handler has explicit supported-subset limitations.
- Optional case `claims` use the contract in docs/ONTOLOGY.md. Package validation invokes the conflict validator; mismatched case IDs or citations fail. Conflict screening never chooses legal authority.
- `createCaseStore()` probes IndexedDB transactions, then exposes verified async list/get/put/remove and bounded history. Memory fallback is explicit. The coordinator queues immutable persistence snapshots, blocks mutations during restore/delete/import, and warns before unload with unsaved work. Portable packages remain required backups.
- `renderResearchReport(case,{layout})` produces script-free local HTML with escaped text, evidence anchors, hashes, timelines and unresolved conflicts. `review` and `evidence` are versioned internal layouts, never official templates.
- Search records and queries are preflight-bounded; regex and SQL LIKE additionally share actual operation budgets. Exhaustion throws rather than returning partial success.
- The app probes local capabilities and retains deterministic search without workers/models. `file://` behavior cannot be inferred from HTTP diagnostics; current managed policy blocks the required origin.

## Development increment 0.2

- Reference libraries use an independent versioned schema and a separate IndexedDB database. Only explicitly selected authorized original sources are copied into cases. Copies pin library id, edition and revision; case graph/rule/claim state never transfers. Packages and storage codecs reject libraries masquerading as cases or vice versa.
- `importFiles(caseSnapshot,files,options)` captures a verified immutable case, hashes actual bytes, skips unchanged sources, and yields complete-source checkpoints. Case storage commits each case envelope and its separately bound import manifest in the same transaction. Normal case edits invalidate the resume manifest. Directory inputs expose relative paths only; no absolute path is inferred.
- Recovery scans quarantine damaged cases without hiding healthy ones. Verified older checkpoints restore as new revisions. Ambiguous revision metadata fails closed. Explicit history pruning preserves the current verified payload and requires a user action; no automatic deletion occurs.
- `renderEvidenceGraph` draws a bounded, keyboard-selectable SVG. Selection resolves evidence only against the current case. Temporal links are user-entered proposed claims; layout does not rank legal authority.
- `retrieveQuestionEvidence` ranks exact normalized source terms for natural-language question text and returns unchanged excerpts and citations with full/partial/insufficient lexical coverage. It never generates an answer or claims semantic inference.
- DOCX extraction includes supported relationship-linked headers, footers, footnotes and endnotes. Part/role/note provenance is explicit and stored but uncited parts are marked; parser version 1.1.0 identifies these semantics.


The integrated advanced PDF path loads the audited self-contained vendor classic script before pdf-engine.js. parseFile prefers parsePDFAdvanced when present and records the engine/preflight version; direct legacy parsePDF remains independently tested. Native PDF source geometry is not treated as exact glyph bounds. Empty native-text pages are explicitly identified, and no-text documents refuse with an OCR limitation. The portable runtime carries all required notices and verifies vendor provenance hashes.
