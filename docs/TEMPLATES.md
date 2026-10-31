# Conservative local template rendering

`assets/templates.js` is original, dependency-free classic JavaScript. It provides a usable bounded DOCX/XLSX mapping subset, not official artifact acceptance. No actual authorized official templates, field maps or numerical reference specifications have been supplied. Every result is `official:false` and `officialReleaseAllowed:false`; no manifest flag can change that.

## API

```js
const rendered = await PBGCRag.renderTemplate(originalBytes, manifest, values);
// {bytes: Uint8Array, validation:{valid:true,checks:[...]},
//  official:false, officialReleaseAllowed:false, originalHash, outputHash, warnings}
```

Any failed hash, permission, mapping, archive, structural or numerical check throws. Failed validation never returns output bytes. Caller must display the error and withhold download. The source `Uint8Array` is not mutated. An original SHA-256 binding establishes byte identity, not authorship, authorization or official validity. The supplied manifest remains a human claim that must be reviewed through the application's approval process.

Manifest v1 example uses synthetic internal fields only:

```json
{
  "schemaVersion": 1,
  "format": "xlsx",
  "originalHash": "<64 lowercase SHA-256 hex characters>",
  "authorizedParts": ["xl/worksheets/sheet1.xml"],
  "mappings": [
    {
      "field": "synthetic.amount",
      "part": "xl/worksheets/sheet1.xml",
      "cell": "B1",
      "kind": "number",
      "expectedOriginal": "0"
    }
  ],
  "numericChecks": [
    {"field": "synthetic.amount", "expected": "1234.50", "tolerance": "0"}
  ]
}
```

Values are exact strings: `{"synthetic.amount":"1234.50"}`. Unknown or missing fields reject. Every number mapping needs an independently supplied expected value; comparison uses exact rational integers, never binary floating-point. Tolerance must be nonnegative. Decimal inputs support at most 18 integer and 12 fractional digits, optional sign, and no exponent notation. The renderer cannot establish that a supplied expected value was independently derived; reviewers must verify that provenance.

For DOCX use `format:"docx"`, parts `word/document.xml`, `word/headerN.xml` or `word/footerN.xml` and a mapping with `anchor:"{{synthetic.name}}"` instead of `cell`. `expectedOriginal` must equal the anchor. The entire anchor must occur exactly once in a single `w:t` element. Text is XML-escaped and `xml:space="preserve"` is retained or added. Split-run anchors, duplicate anchors, tracked changes, content controls, field codes, permission ranges and protected documents reject. Word mapped values with tabs or line breaks reject because preserving those requires explicit run markup beyond this subset.

For XLSX use `xl/worksheets/sheetN.xml` and an existing explicit grid address. The original value must exactly match `expectedOriginal`. Shared-string, inline-string, blank and ordinary numeric targets are supported. A shared-string target is rewritten as an inline string; the shared-string table remains byte-identical. Text beginning `=` remains inline text, never a formula. Styles and cell attributes remain intact except the explicitly changed cell type. Numeric values become ordinary numeric cells. Formula cells and protected mapped sheets reject; workbook protection also rejects. Boolean/error/date/formula-string target cells reject. Formulas in other cells are preserved but **not recalculated**; cached dependent results may be stale and must not be treated as validated outputs.

## Preservation and validation

- Original package SHA-256 must match the manifest before rendering.
- The package officeDocument relationship must resolve to the expected root. Mapped worksheets must resolve through actual workbook sheet relationships. Only mapped XML elements in explicitly authorized parts change. Original headings, styles, unrelated cells and other package parts are not reserialized.
- Every ZIP part is decompressed within bounds and checked against declared size and CRC, including untouched binary parts.
- Untouched ZIP local-entry blocks remain byte-for-byte identical, including original compression and local headers. Central-directory offsets necessarily change. Modified XML parts use stored ZIP entries with recomputed CRC/size; source package byte identity is not claimed for the rendered file.
- Output ZIP is reparsed. All changed XML is structurally checked; untouched local blocks are compared against originals. SHA-256 and explicit validation checks accompany the result.
- XML text and attributes are parsed inertly. No macros, scripts, formulas, document attachments or external references execute.

These checks establish the supported structural edit operation. They do not establish Word pagination, Excel layout fidelity, arbitrary OOXML schema conformance, formula recalculation, statutory conclusions, official field validity or final numerical artifact validity. Actual official output requires the supplied approved dictionary/templates/specifications, authorized mappings, independent numerical reference checks and separate human release approval.

## Limits and explicit rejection

Input/output: 5 MB; expanded archive: 20 MB; 2,000 entries; expansion ratio 200 with a 1 KB small-entry allowance. XML: 2,000,000 UTF-16 code units per part, 150,000 elements, depth 64. At most 200 mappings and 100 authorized parts; replacement/expected text at most 100,000 code units.

Supported ZIP methods: stored and deflate. Deflate requires native `DecompressionStream('deflate-raw')`; there is no download or server fallback. ZIP64, encryption, unsupported flags/compression, overlapping entries, prefixes, arbitrary entry padding, malformed data descriptors, unsafe/duplicate paths and corrupt CRC/size reject. ZIP package comments and untouched central metadata are preserved, with offsets rewritten.

Macro-bearing, ActiveX, embedded-object and digitally signed template packages reject. External OOXML relationships reject rather than follow links or preserve potential remote behavior in a new artifact. DTD, custom entities, CDATA, malformed XML and invalid Unicode/control characters reject. No legacy DOC/XLS/PDF template editing, arbitrary rich-text replacement, drawings, protected content or arbitrary part editing is claimed.

`node tests/templates.test.js` runs synthetic generated package tests: exact untouched-byte preservation, compressed input, XML escaping, shared strings, numerical equality/tolerance, hash/permission failures, split anchors, formula/protection refusal, active content, remote relationships, corruption, invalid Unicode, orphan worksheet refusal and independent re-ingestion of rendered DOCX/XLSX outputs. Synthetic templates are test fixtures, not stand-ins for missing official templates.
