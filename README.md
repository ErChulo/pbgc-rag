# PBGC-RAG

An independent, offline-first pension casework application in development. This is not an official PBGC product or a completed actuarial system. Use synthetic documents in this build.

## Open the workplace build

Double-click `index.html` with its adjacent `assets` folder intact. No installation, build, server or network is required by the application. An enterprise browser may prohibit `file://`; that policy is a release blocker, not a reason to bypass browser controls. Current managed Chromium does prohibit file URLs; see ACCEPTANCE.md.

Create a case or load the synthetic example. Import UTF-8 TXT, Markdown, CSV, TSV or JSON. Search all keywords or an exact phrase. Results retain source hashes and honest line, cell or JSON-pointer locators. Save original bytes from the source list. Export your case before closing it or the browser. Portable packages contain plaintext original documents: keep them under appropriate workplace controls.

Recovery storage is best effort and scoped to the browser/location. Package restoration recomputes SHA-256, reparses originals and replaces the active case only after validation. Hashes detect inconsistent contents; they do not authenticate authorship. Imports never execute document HTML, scripts, formulas or macros.

Limits: 5 MB and 2,000,000 UTF-16 code units per source; 20 MB, 200 sources and 50,000 parsed records per case. JSON nesting is bounded at 64. Packages are capped at 40 MB. JSON duplicate keys follow native parsing (last value wins); inspect original bytes when ambiguity matters. Search is per record: keywords must occur in the same line, cell or JSON value.

## Development checks

```sh
node tests/core.test.js
node tests/security.test.js
node tests/browser.test.js
```

Node and Playwright are development tools only; neither ships as a workplace requirement. Browser test commands and environmental limitations are recorded in ACCEPTANCE.md. No dependency code has been imported. Pinned upstream source/license/architecture review is recorded in docs/UPSTREAM.md; transitive dependency and runtime audits remain pending.

## Not yet implemented

Binary PDF/Office/SQLite ingestion, OCR, regex, read-only SQL, semantic inference, typed temporal graph, rule approval/calculations, official dictionary validation, reports and template-preserving official artifacts remain pending. No official output is enabled. The approved field dictionary, templates, BSRS syntax and actuarial references have not been supplied. This first increment is a tested foundation, not final project acceptance.

Read KICKOFF.md, ARCHITECTURE.md, PROGRESS.md and ACCEPTANCE.md before resuming development.
