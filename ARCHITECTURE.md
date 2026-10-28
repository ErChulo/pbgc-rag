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
