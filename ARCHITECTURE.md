# Architecture and interface v1

Workplace runtime: index.html and classic local scripts, no build, server or remote resources. Global namespace `PBGCRag`; modules also export via CommonJS for development tests. Source bytes remain separate from parsed records. All user content renders as text.

## Contract v1
`PBGCRag.parseText(name, text)` returns `{parserVersion: '1', records: [{text, locator}], warnings: []}`. Supported initial formats: TXT, MD, CSV, TSV, JSON. Locators are descriptive objects, never invented page positions. Reject unsupported formats explicitly.
`PBGCRag.search(records, query, mode)` returns records with `score`; modes keyword and exact initially. Records passed by UI include sourceId, sourceName, sourceHash, text and locator. Empty queries return no results. No implicit evidence interpretation.
Workspace: `{schemaVersion:1, id, name, sources: [{id,name,hash,bytesBase64,parserVersion,records,warnings}]}`. Portable JSON includes original bytes and verified SHA-256. Import validates full structure, recomputes hashes and reparses original bytes before replacing memory. No arbitrary scripts, HTML or rules execute.

## Ownership
Coordinator: architecture, index.html, assets/app.js, assets/style.css, persistence, packages and integration. Parsing/search agent: assets/core.js, tests/core.test.js, fixtures only. Audit agent: docs/UPSTREAM.md, SECURITY.md only. Verification agent: tests/browser* and tests/security* only. No shared file edits.

Official outputs, approved rules, binary parsers and local model inference require later implementations and evidence; they must not be represented as available by the initial shell.
