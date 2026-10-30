# PDF extraction adapter

Implemented with pinned `pdfjs-dist` **6.4.299**, upstream build `d0991a0d5`, Apache-2.0. The unmodified upstream license and package manifest are in `vendor/pdfjs`; bundle/source SHA-256 and npm tarball integrity are in `build-info.json`. The bundler was esbuild **0.28.2** (MIT), installed only in `/tmp` for development. No Node, installation, server, fonts, model downloads or network is required by the delivered adapter.

## Reproducible bundle

After verifying pinned npm tarball integrity in an approved development environment:

```sh
npm install --prefix /tmp/pbgc-pdf --ignore-scripts --no-audit --no-fund pdfjs-dist@6.4.299 esbuild@0.28.2
/tmp/pbgc-pdf/node_modules/.bin/esbuild /tmp/pbgc-pdf/node_modules/pdfjs-dist/build/pdf.worker.mjs --bundle --format=iife --global-name=pdfjsWorker --platform=browser --outfile=vendor/pdfjs/pdf.worker.js --minify
/tmp/pbgc-pdf/node_modules/.bin/esbuild /tmp/pbgc-pdf/node_modules/pdfjs-dist/build/pdf.mjs --bundle --format=iife --global-name=pdfjsLib --platform=browser --outfile=vendor/pdfjs/pdf.js --minify
```

The resulting files are transformations of the upstream ESM distribution into classic IIFEs; minification changes formatting and identifiers. Upstream legal comments are retained. The optional npm dependency `@napi-rs/canvas` and its binaries are **not shipped or imported into these browser bundles**. PDF.js's build sources contain its browser implementation; npm has no mandatory runtime dependency declaration. No optional canvas/native dependency is a workplace requirement. Source/license inventory does not establish absence of vulnerabilities; no comprehensive advisory or full-source security audit is claimed.

Generate the self-contained worker source with `python vendor/pdfjs/build-worker-source.py`. This combines the pinned bundles and reviewed `parser-core.js` into a local classic-script source string. Load only `vendor/pdfjs/parser-worker-source.js`, then `assets/pdf.js` in the main page. Do not also load the two PDF.js library bundles in the page; they are embedded inside the worker source. `PBGCRag.parsePdfBytes(bytes)` returns `{format:'pdf',parserVersion,records,warnings}`. It rejects invalid headers/bytes, documents over 5 MB, more than 200 pages, 10,000 text items on one page, 50,000 output records or 2,000,000 extracted characters. Password-required PDFs are rejected, not prompted for or decrypted by this build.

## Security boundary

The adapter transfers a copy of in-memory bytes to a dedicated classic Blob worker, never a URL. The main page requires CSP `worker-src blob:`. If workers or Blob workers are unavailable, PDF import fails explicitly; there is no synchronous main-thread fallback. PDF.js still contains general URL/fetch/worker/dynamic-import APIs; this adapter does not expose them. Within the dedicated parser worker, preloaded `pdfjsWorker.WorkerMessageHandler` forces PDF.js's internal fake worker, avoiding nested worker module imports, network requests and file-origin module restrictions. During the internal worker library's initialization only, `window` is temporarily aliased to `self` to suppress its automatic binding to the outer worker message port; this alias is removed before the display library loads. The outer worker owns its single request/result port. `fetch` and `importScripts` are explicitly disabled inside it in addition to inherited CSP. A missing global fails explicitly before loading. An empty external binary-data factory rejects font/CMap/WASM retrieval. `useWorkerFetch`, `useWasm`, `useSystemFonts`, font-face loading, XFA, image decoders, offscreen canvas, stream/range/autofetch and image allocation are disabled. Optional missing assets are reported as warnings; some complex fonts can yield incomplete or rejected extraction. CSP must continue to deny connections, unsafe evaluation, plugins and remote scripts. A strict-CSP browser test verifies extraction through an actual dedicated worker and no requests beyond the two intercepted local scripts. `isEvalSupported:false` remains set.

The adapter only calls document/page text extraction. It does not render pages, execute document JavaScript/actions, invoke attachments, follow links, open annotations or submit forms. Macro/HTML activation is not a PDF text extraction feature.

**Resource control:** the main page hard-terminates the dedicated parser worker after 15 seconds, including synchronous decompression or infinite loops. Callers may lower this deadline with `timeoutMs` but cannot raise it, and may cancel with an AbortSignal. Success, failure, cancellation and timeout terminate the worker and revoke the Blob URL. Browser tests replace worker source with a synthetic infinite loop and verify timely hard termination without blocking the page; they also verify explicit rejection when Worker is unavailable. Byte/page/output limits remain in the isolated core. Browser workers provide thread isolation and termination, not an OS-enforced memory quota: an aggressive allocation could still exhaust the renderer before the deadline. Malformed-document and decompression-budget corpus coverage remains incomplete; no hostile-document certification is claimed.

## Provenance and limitations

Each nonempty text item records a one-based PDF page and original PDF.js item index, raw six-element transform, width/height, page view/rotation and coordinate system `PDF user space`. `advanceBox` is an **approximate text advance rectangle**, not an exact glyph outline or image bounding region. The raw transform is preserved rather than inventing a PDF line or paragraph. Text item order is parser order, which may differ from reading order in columns or tables. No table structure, scanned-page OCR, image extraction or exact glyph bounding boxes are claimed. Empty text pages generate a warning.

Test command: `node tests/pdf.test.js`. This environment requires reviewed process-sandbox escalation to launch Chromium. Two tests pass: byte/header/assets guards and actual strict-CSP Chromium isolated-worker text/geometry extraction, malformed-document rejection, hard timeout and Worker-unavailable behavior. The browser test serves scripts through Playwright interception on an allowed loopback HTTP origin; it is **supplementary HTTP evidence**, not mandatory file:// acceptance. Managed Chromium still blocks actual file URLs by administrator policy. No policy was changed.

## Bounded advisory snapshot

On October 30, 2026, `npm audit --omit=optional --json --prefix /tmp/pbgc-pdf` exited zero and reported zero advisories in its checked installation (pdfjs-dist 6.4.299 and esbuild 0.28.2; optional native packages omitted from the audit). Optional native dependencies and the bundler are not workplace runtime imports. This registry snapshot does not replace a full source/model/dependency security audit or prove absence of vulnerabilities.
