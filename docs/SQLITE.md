# Native SQLite extraction

`PBGCRag.parseSqliteBytes(Uint8Array)` is an async, dependency-free read-only extractor in `assets/sqlite.js`. It returns `{parserVersion:'sqlite-1', format:'sqlite', records, warnings}`. Each record contains text, typed `value`/`valueType`, and `{type:'sqlite-cell', table, rowid, column}`. Rowids and integers outside JavaScript's exact integer range use decimal strings. Null stays null in metadata, blobs use hex, and UTF-8/UTF-16 text uses the database header encoding.

Uploaded SQL never executes. The module decodes the SQLite file header, table b-tree pages, overflow chains, serial types and `sqlite_schema` records. A bounded tokenizer reads column names and INTEGER PRIMARY KEY alias information from stored CREATE TABLE text; it is not a SQL engine. Views, triggers and indexes are not evaluated. The parser neither loads extensions nor opens files or remote references.

## Supported subset

Committed rowid tables in a coherent rollback-journal-mode database. Supports interior/leaf table pages, overflow values, standard scalar serial types, UTF-8/UTF-16, quoted names, table/column INTEGER PRIMARY KEY aliases, and complete stored rows. It preserves original schema names rather than inventing official field names.

Rejects WAL-mode headers, virtual tables, generated columns, WITHOUT ROWID/index-backed table storage, incoherent page counters, unsupported schema forms and stored rows whose field count differs from current schema (for example, some ALTER TABLE default migrations). It does not apply missing defaults, recover deleted records, inspect active journal sidecars or claim the full `PRAGMA integrity_check` validation. Export a coherent copy under approved workplace procedures before import. SQLite source bytes alone cannot prove the absence of a pending external journal.

## Bounds and integrity controls

5 MB source; 10,000 pages; 64 b-tree/schema nesting levels; 1,000 tables; 2,000 columns per row; 50,000 visited rows and 50,000 exported cells; 2,000,000 extracted UTF-16 characters. Schema tokens/text are separately bounded. All page pointers, record lengths, varints and cell/overflow payload bounds are checked. Shared/reused/cyclic pages, overlapping b-tree cells, duplicate rowids, reserved serial types and malformed encodings fail the whole extraction before any partial result returns.

The original source bytes and their SHA-256 remain authoritative. These records establish locations and stored values, not legal meaning, source authority, official PBGC dictionary validity or actuarial correctness.

## Verification

`node tests/sqlite.test.js` generates synthetic databases through Python's standard-library sqlite3 only as a development fixture tool. No Python, Node, SQL engine or server is needed by the delivered browser parser. In the managed development sandbox, spawning Python from Node requires reviewed process escalation. Tests cover signed integer widths/int64, binary values, Unicode/UTF-16, interior b-trees, overflow chains, primary-key aliases/quoted names, malformed headers/pointers and explicit unsupported-subset failures.

Stored REAL values use their decoded IEEE-754 values without invented decimal precision. Nonfinite REAL values use explicit `Infinity`, `-Infinity` or `NaN` strings with valueType `real`; leading meaningful U+FEFF text is retained. These representations remain distinct from official numeric calculations.
