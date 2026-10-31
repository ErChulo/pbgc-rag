# Offline sentence embeddings

`assets/embeddings.js` exposes `await createEmbeddingProvider({signal})`. The provider supplies `id`, `dimension:384`, `kind:'learned-sentence-embedding'`, `manifest`, `embedTexts(texts,{signal})`, `coverage(text)`, and `dispose()`.

The bundled model is **@ternlight/base 0.1.1**, a real learned, MiniLM-distilled sentence transformer with embedded WordPiece tokenizer. It uses ternary transformer projections and an int4 embedding table. This replaces the earlier exploratory GloVe word-vector implementation; it does not average hash vectors or substitute lexical search for learned inference. It is not the full all-MiniLM-L6-v2 teacher.

The upstream npm tarball was verified against its pinned SHA-512 integrity value. The byte-exact 10,228,415-byte WASM contains weights, tokenizer and runtime; SHA-256 is `27819b70b83fb24a493792db7bdf6b9cae4a1531df408809d1e57d580a3e9087`. The manifest records npm integrity, source revision and output script digest. `vendor/embeddings/build-model.py` deterministically produces the classic local script from that verified tarball. Upstream MIT license, readme, attribution and original bindgen glue accompany it. Upstream quality/latency claims in the copied readme are upstream claims, not this project's acceptance evidence.

The local classic script is loaded lazily from the adjacent vendor directory. No runtime download, ES module import, network fetch, external model, shared memory or cross-origin isolation is required. The app verifies the WASM hash before compiling it. A browser Blob worker receives the compiled module and processes texts away from the UI thread. CSP needs the narrow `'wasm-unsafe-eval'` capability and `worker-src blob:`; `connect-src 'none'` remains supported. Browsers without WASM SIMD or worker permission fail with an explicit message and retain other search methods. Development Node tests use the same verified WASM directly; this Node path is not a workplace dependency.

The upstream encoder truncates after 128 tokens. This adapter instead recursively splits long text until every window fits its exact tokenizer limit, embeds all windows, and normalizes their token-weighted mean. This loses some cross-window context and order; it does not claim long-context transformer inference. Limits are 128 texts per batch, 12,000 UTF-16 characters per text, 1 MiB total and 120 seconds per worker exchange. Original source text and citation locators remain separate and unchanged. `coverage` reports nonempty WordPiece input, with `ratio:null`; it is not a confidence or vocabulary-quality score.

Requests are serialized per provider. Abort hard-terminates a running worker. The next request recreates a clean worker from verified weights. Disposal terminates pending work and permanently invalidates that provider. No source text is retained in the model pack or persisted to a shared model cache.

## Verification

- `node tests/embeddings.test.js`: **3 PASS**, covering pinned integrity rejection, actual 384d finite unit embeddings, determinism, long windows, limits, cancellation and disposal.
- `node tests/semantic.test.js`: **10 PASS**, including real inference ranking six unchanged synthetic synonym topics first with no exact query words in their target documents.
- A Chromium supplementary loopback fixture with `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:` performed real inference for 20 texts. UI timer ran 147 times, active cancellation returned `ABORT_ERR`, and the next request returned a valid 384d vector. This verifies actual worker responsiveness/recovery in that test environment; it does not establish enterprise file-policy acceptance.
- Independent four-question paraphrase retrieval evaluation is maintained separately in `tests/rag-evaluation.test.js`. Its corpus and ranking thresholds must not be weakened to fit a model. Retrieval evaluation does not prove generated-answer correctness or actuarial validity.
