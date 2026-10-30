# Workplace parser dependency and capability inventory

Increment 2 format parser is original project code in `assets/formats.js`. No third-party code, package, CDN, model or remote parser is required or imported by this module. License review for reused upstream code does not apply to this independently authored module. Any PDF adapter or later vendored parser has a separate inventory.

## Runtime browser primitives

- `Uint8Array`, `DataView`, UTF-8 `TextDecoder` and `Blob`.
- `DecompressionStream('deflate-raw')` for compressed Office ZIP entries. Stored entries work without that primitive. Unsupported browsers receive an explicit error; there is no network fallback.
- SHA-256 and original-byte handling belong to the shell, outside this module.

## Implemented extraction

| Format | Implemented output | Limits and exclusions |
| --- | --- | --- |
| TXT/Markdown/CSV/TSV/JSON | Delegates to versioned core text parser | Existing UTF-8 and record limits |
| DOCX | Text from main document, numbered headers/footers, footnotes and endnotes; paragraph and table/row/cell locators | Does not reproduce layout, numbering, drawings, equations, images, tracked-change semantics or official template validity |
| XLSX/XLSM | Named sheet/cell locators, shared and inline strings, stored values, formula text/attributes and cached values | Does not calculate formulas or format date serials/numbers; no macro, link, chart or pivot execution; no merged-cell display interpretation |
| HTML/HTM | Inert text segments with exact UTF-16 source offsets | Lexical extraction, not browser layout/DOM; scripts/styles/templates/noscript text skipped; XML/numeric entities and nbsp decoded; other HTML named entities stay literal; no assets loaded |
| XML | Text values with element-index paths and source offsets | Bounded structural parser; rejects DTD, custom entities, malformed nesting and duplicate attributes; namespace names are preserved, not schema-validated |

PDF, legacy DOC/XLS, SQLite and other binary formats are explicitly rejected by this module. The shell may delegate PDF to its separately audited adapter. A valid document outside this implemented subset can be rejected; no fabricated result or locator replaces it. Original source bytes remain authoritative.

## Archive and input controls

Maximum source input: 5 MB; total declared expanded ZIP bytes: 20 MB; 2,000 ZIP entries; maximum declared expansion ratio: 200 (with a 1 KB small-entry allowance). ZIP64, split/encrypted archives, unsupported compression, unsafe or duplicate paths, inconsistent central/local headers, and directory bounds errors are rejected. The parser verifies decompressed size and CRC for every part it reads. Unused image/macro parts are not decompressed, executed or CRC-validated; original-byte source hashing covers their exact bytes without establishing their safety.

Streaming decompression cancels as soon as output exceeds its declared size or expansion budget. XML is limited to 2,000,000 UTF-16 code units per part, 150,000 tokens and nesting depth 64. Extracted text is limited to 2,000,000 code units and 50,000 records per source. Workbook cells must have valid Excel grid addresses, worksheet targets must be internal under `xl/worksheets/`, and missing shared-string values fail explicitly. External workbook relationships are never followed.

`node tests/formats.test.js` uses synthetic, generated ZIP fixtures for stored and deflated Office packages, formulas/macros, malformed XML, CRC/path/encryption failures and expansion budgets. Passing extraction tests do not establish arbitrary Office rendering fidelity or official artifact validity.
