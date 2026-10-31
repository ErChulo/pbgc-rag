# Source-bound retrieval chunks

`assets/chunking.js` builds bounded retrieval text from verified parser records. It does not interpret provisions, infer table headers, generate answers or authenticate a document. Source-byte hashing and parser validation happen before this module. Chunks are derived data and must be rebound to the current source/parser version before reuse.

## API

```js
const result = PBGCRag.chunkSources(sources, {
  maxChars: 1800,
  maxTokens: 400,
  overlapChars: 250,
  maxChunks: 10000,
  previous: priorResult,
  signal: controller.signal
});
```

All options are optional. `previous` may be a prior result or its chunk array. The synchronous return is `{schemaVersion:1,chunks,warnings,stats}`. Each input source needs distinct nonempty `id`, name, 64-character lowercase SHA-256 `hash`, nonempty `parserVersion` and parsed records with text and typed JSON locators.

Each chunk contains:

- `id`, `text`, `sourceId`, `sourceName`, `sourceHash`, `parserVersion`
- `locators`: exact source locator values, canonicalized by JSON object key order
- `recordIndices`: zero-based original parser record positions, in chunk order
- `segments`: each source excerpt's `recordIndex`, original `locator`, `recordStart`, `recordEnd`, derived `chunkStart`, `chunkEnd`, `offsetUnit:'UTF-16 code units'` and `overlap` flag
- `contentHash`: SHA-256 of UTF-8 chunk text
- `lexicalTokenCount`, `chunkerVersion:'1'`, and the explicit `config`

Every segment satisfies:

```text
chunk.text.slice(chunkStart, chunkEnd)
=== source.records[recordIndex].text.slice(recordStart, recordEnd)
```

Record excerpt offsets are **not** inserted into source locators. A PDF text item keeps its original page/item transform; a spreadsheet cell keeps its sheet/address; a Word paragraph remains a paragraph. Derived chunk offsets do not pretend to be page, document-byte or glyph offsets. Segment intervals exclude derived separators.

## Boundaries and overlap

Adjacent line/paragraph records accumulate to the character/token bounds. An empty record acts as a paragraph boundary once enough context has accumulated. It contains no excerpt and is counted in `stats.emptyRecords`. Different sources never share a chunk or overlap. A separately scoped source ID remains separate even when original bytes have the same hash.

Adjacent Excel, delimited-text and SQLite cells, and Word table paragraphs with explicit table/row metadata, from the same source row are collected as one unit when that row fits. All original cell locators are retained. Joined text uses explicit derived newlines; no column label, row sentence, table structure or field meaning is invented. A row exceeding the bounds must split; individual source cell evidence remains intact. The module does not sort or silently rearrange parser records.

Large records split into exact source excerpts, preferring nearby newline/space boundaries and avoiding cuts between UTF-16 surrogate pairs. No source character in a nonempty record is lost. Excerpts that are contiguous in the same original record concatenate without an invented newline; different/noncontiguous records use a derived newline. Chunk tails overlap where space and token limits allow. Whole table rows are retained for overlap when they fit the overlap budget; oversized rows or units may have no overlap. A chunk containing only previously emitted overlap is never emitted again.

The lexical tokenizer counts Unicode letter/number sequences and individual nonspace punctuation/symbols. `maxTokens` is this module's **lexical** limit, not the embedding or language model's tokenizer limit. Model adapters must enforce their actual tokenizer/context bounds separately.

## Identity, reuse and bounds

Chunk IDs use synchronous FIPS 180-4 SHA-256 over source ID/hash/parser version, chunk configuration, excerpt intervals, overlap state, canonical source locators and text content digest. IDs do not depend on random UUIDs or object-key insertion order. Changed source version, parser version, text, locator, interval or configuration changes the ID. Digests establish deterministic identity, not authorship or official status.

Previous entries are reused by object identity only after the new chunk has been independently reconstructed and every field agrees. Cache text and IDs alone never override source evidence. Additional or forged fields prevent reuse. Cache comparison is bounded. Rebuilding from a source package does not trust precomputed imported chunks.

Limits:

- 200 sources; 50,000 source records; 2,000,000 characters per record
- 20 Mi UTF-16 code units of input text; 40 Mi of derived output text
- 64 Mi serialized chunk characters including provenance metadata
- `maxChars` 128–8,000; `maxTokens` 16–2,000
- `overlapChars` zero up to strictly less than half `maxChars`
- At most 10,000 chunks, or a lower caller-selected `maxChunks`
- Source locators: 4,096 serialized characters, 512 JSON nodes and depth 12

A failing bound throws and returns no partial result. The default overlap is 250 characters for the default 1,800-character chunks; when only `maxChars` changes, default overlap is reduced to at most one fifth of that limit.

An already-aborted signal fails immediately with `AbortError`; bounded loops check the signal. Because this API is synchronous, a UI event cannot deliver a new abort during the same JavaScript task. Call it inside a caller-owned worker for hard mid-run cancellation or very large cases. No asynchronous/background-completion claim is made.

## Verification

`node tests/chunking.test.js`: eight tests pass. Checks include source-exact segment slices, independent Node SHA-256 comparisons, Unicode surrogate safety, full long-record coverage and overlap, row-boundary grouping, deterministic IDs/cache rejection/reuse, source isolation, lexical punctuation bounds, paragraph breaks, input/locator/count limits and already-aborted cancellation. Additional development checks exercised combinations of text scripts, punctuation, sizes and limits. No real-model semantic quality or mandatory file:// claim follows from chunking tests alone.
