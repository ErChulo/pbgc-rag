# Read-only source-table queries

The local `table-query.js` module reconstructs views from **already verified and parsed** source records. It never opens a database connection, executes uploaded SQL, computes formulas, activates macros or sends a query to a service. Its source-table namespace is separate from the older `SELECT * FROM records` evidence-text namespace.

## APIs

```js
const tables = PBGCRag.buildTables(sources, {
  headers: [{sourceId: 'source-id', tableName: 'Plan sheet', headerRow: 1}]
});
const result = PBGCRag.queryTable(tables[0],
  'SELECT "Case name", Benefit FROM "Plan sheet" WHERE Benefit IS NOT NULL LIMIT 25');
```

`buildTables(sources, options?)` returns descriptors with `id`, `sourceId`, `sourceName`, `sourceHash`, `name`, `kind`, `columns:[{name,type}]`, `rows` and `warnings`. Each row has `values` keyed by the exact column name and `evidence` containing source identity, source row/rowid and per-column `cells`. Cell evidence retains original locators, value type and any supplied formula/cache metadata. Projection returns only selected values and corresponding evidence; source objects are not modified. Row locator information remains available even when a primary-key column is not selected. Descriptors use a JSON tuple of source ID/kind/name as ID; equal source filenames remain separate selections. Duplicate source IDs reject.

`queryTable(table, query)` returns `{sourceId,sourceHash,tableName,columns,rows,warnings}`. It requires an explicit selected table descriptor: a matching name never searches other cases or sources. A `FROM` name must match that selected descriptor. Result hashes establish provenance against the caller's verified source; this module does not rehash original bytes or authenticate authorship itself.

## View construction

- **SQLite:** the actual stored table and column names become the view schema. Stored NULL/integer/real/text/blob types remain attached to each cell. Integers outside JavaScript's safe range stay exact decimal strings; they are never coerced to floating point. Missing/duplicate row-column records or inconsistent row widths reject. This inherits the SQLite parser's committed-rowid-table subset; absent/empty tables without parsed cell records cannot be reconstructed from records alone.
- **Excel XLSX/XLSM/XLS and CSV/TSV, default:** a generic cell view has the internal columns `row`, `column`, `text`, `formula`, `cachedValue`. Those labels describe the cell view; they are **not** invented official field names. The table name is the actual sheet name for Excel, or source filename for CSV/TSV. Each generic view row binds to its original source cell. Values are raw extracted text or cached formula text; dates, styles and formula results are not interpreted.
- **Explicit source headers:** configure an exact source ID, sheet/filename and one-based header row. Header cells supply exact, untrimmed column names, with their own evidence. Blank/duplicate/oversized header names and formula-defined headers reject. Rows before/including the header are excluded from data. A data cell under a column with no header rejects. An absent sparse cell becomes `null` with `null` cell evidence, rather than an invented source cell. Header-derived values remain text; a source value `001250` stays `001250`. No numeric type is guessed.

No source field is declared official merely because it is queryable. Authoritative dictionary validation is a separate explicit binding/review gate.

## SQL subset

```sql
SELECT * FROM "Benefits table"
WHERE "Participant id" > 9223372036854775806 AND note IS NULL
ORDER BY amount DESC LIMIT 100
```

The grammar is:

```text
SELECT (* | column [, column ...]) FROM selected-table
[WHERE column comparison literal [AND ...]]
[ORDER BY column [ASC | DESC]]
[LIMIT integer]
```

Comparisons: `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=`, `IS NULL`, `IS NOT NULL`. Literals are single-quoted text (escape a quote as `''`), signed decimal integers or finite decimal real numbers. Integers compare through BigInt exactly. Mixed integer/real comparisons reject when the integer is outside the safe integer range; text/number comparisons reject rather than silently coerce. NULL never passes ordinary comparisons; use `IS NULL` or `IS NOT NULL`. A blob is preserved as the parser's hex text with blob type; blob literals/casts are not supported in this subset.

Double-quoted identifiers preserve exact case/punctuation; escape an identifier quote as `""`. Bare identifiers use case-insensitive matching and reject ambiguity. Thus source columns `Name` and `name` require exact quoted identifiers. Identifiers with spaces, punctuation or filename extensions must be quoted. Projection order follows the query. Order ties retain source row order; NULL sorts before non-NULL ascending and after non-NULL descending. The default result limit is 1,000 and explicit zero returns no rows. A single trailing semicolon is allowed.

Mutations, joins, expressions, functions, aliases, OR, parentheses, comments, arbitrary regex, LIKE, extensions, multiple statements and casts reject explicitly. This is a documented subset, not full SQLite SQL or SQL compatibility.

## Bounds and evidence

At most 200 sources, 1,000 table views, 50,000 parsed records/rows, 1,024 columns per table, 20,000,000 source text characters (2,000,000 per record), 2,000 query characters and 5,000,000 comparison/sort work units (string comparisons also charge their character lengths). The largest result limit is 50,000. Parsing/import bounds apply before this module. Failed construction/query returns an error and no partial result.

`node tests/table-query.test.js`: nine tests pass. Independently supplied values cover exact maximum-int64 comparisons, numeric ordering, NULL behavior, text-preserving CSV headers, sparse Excel cells, cached-formula evidence, quoted identifiers, prototype-named columns, duplicate filenames/identities/locators, invalid bindings and rejected SQL injection/mutation/unsupported clauses. These are local module tests, not a claim of mandatory file:// workplace acceptance.
