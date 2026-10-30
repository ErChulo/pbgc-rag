# Bounded legacy DOC/XLS extraction

`assets/legacy.js` is original, dependency-free project code. No third-party source, model, network client or executable parser is included. Public API: `PBGCRag.parseLegacyBytes(name, Uint8Array)` asynchronously returns `{parserVersion, records, warnings}`. CommonJS exports the same API for development tests.

Input limit: 5 MB. Extracted output limits: 2,000,000 UTF-16 code units and 50,000 records. Compound storage directory traversal is limited to depth 64; a workbook is limited to 1,000 sheets. The parser rejects unsupported or malformed input and does not fall back to guessed text. Source bytes and source-level SHA-256 remain the caller's responsibility.

## Compound File Binary (CFB/OLE)

Supports version 3 (512-byte sectors) and version 4 (4,096-byte sectors), the FAT/DIFAT directory and root mini-stream/MiniFAT. Checks sector alignment and counts, stream lengths, chain termination, allocation overlap, cycles, out-of-range entries, directory reachability, duplicate paths and mini-stream bounds. All reachable stream allocations are checked, including streams the document extractor does not use. Storage content is never executed. OLE macros, VBA, embedded objects and links stay inert source bytes.

## Word binary DOC

Supports Word 97–2007 FIB revisions with a CLX piece table. Extracts the main-document character sequence from compressed Windows-1252 or UTF-16LE pieces, then separates paragraphs at stored carriage returns. Returns `word-binary-paragraph` locators with paragraph number, main-text character start/end and original `WordDocument` stream byte spans. Stream offsets are relative to that logical OLE stream, not absolute file offsets or PDF pages.

This does **not** resolve page layout, tables/cells, formatting, lists, headers/footers, notes, text boxes, field results, annotations or tracked-change acceptance. Field/cell controls remain literal. Piece-table extraction does not establish a final legal reading of revisions or fields. Encrypted/obfuscated files, older Word formats, missing piece tables and unsupported structures fail explicitly. RTF/HTML renamed as `.doc` is not accepted as a binary Word file.

## Excel binary XLS

Supports BIFF8 Excel 97–2003 workbook streams (`Workbook` or `Book`). Extracts NUMBER, RK, MULRK, LABELSST, LABEL, BOOLERR, BLANK/MULBLANK and FORMULA cached values. Shared strings support rich/extended string data and SST CONTINUE character encoding boundaries; rich formatting and phonetic metadata are not rendered. Numeric values remain raw numbers/date serials; no style-based date conversion or number formatting is invented.

Cells have `excel-cell` locators with sheet name, exact A1 address and original workbook-stream record byte offset. Formulas retain raw BIFF8 RPN token bytes in `formulaTokensHex` and a clearly labeled token representation in `formula`; these are **not** decoded Excel expressions. Cached strings are supported when a direct STRING record follows the formula. No formula is evaluated. Missing/stale cached values cannot be repaired by this parser.

Non-worksheet sheets are explicitly listed as skipped warnings; chart, Excel 4 macro and VBA-module sheets do not execute. Worksheet formatting, drawings, names, external references, merged displays and chart content are not interpreted. Encrypted workbooks, BIFF2–5, unsupported old cell encodings, formula record extensions and routed/continued formula strings fail explicitly. Unsupported metadata records are not treated as source text. This is a useful extraction subset, not arbitrary legacy Office fidelity or official-template validation.

## Evidence

`node tests/legacy.test.js` exercises synthetic byte-generated CFB v3/v4 fixtures, normal/mini allocation, cycle/overlap/corruption rejection, DOC mixed pieces and literal field controls, XLS shared strings (including non-BMP Unicode and continuation), cached formulas, numeric/RK/MULRK values, A1 locators, encryption and malformed data. No confidential files or third-party fixtures are used. Browser integration and real workplace `file://` acceptance are separate from these module tests.
