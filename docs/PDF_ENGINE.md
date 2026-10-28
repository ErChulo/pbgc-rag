# Local PDF engine audit and bounded extraction

`js/pdf-engine.js` exposes `PBGC.parsePDFAdvanced(Uint8Array)` and `pdfAdvancedLimits`.
It returns raw parser records, ready for the existing `parseFile` source-byte wrapper.
Load `vendor/pdfjs/pdfjs-local.js`, then `js/pdf-engine.js` before the application.
The small original `parsePDF` module is unchanged and remains separately testable.

## Provenance and licenses

The official npm package `pdfjs-dist` version **6.4.299**, distribution build
`d0991a0d5`, was downloaded through the configured HTTPS proxy. Its actual tarball
SHA-512 matched npm's published integrity exactly:

`sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==`

Official repository: <https://github.com/mozilla/pdf.js>. The package is Apache-2.0.
Original legacy main/worker distribution files are preserved under `vendor/pdfjs/source/`;
per-file hashes, build tool identity, and source URLs are recorded in
`vendor/pdfjs/PROVENANCE.json`. Apache, core-js MIT, CMap, standard-font and codec
license notices are preserved. This is a pinned provenance/integrity audit, not a
claim that every transitive code path has undergone an independent security audit.

The build-only tool is esbuild 0.28.2 (MIT). It was installed outside the checkout
under `/tmp` using normal npm integrity/TLS verification, with install scripts
disabled. No npm dependency or installer is required by the workplace application.
Rebuild with the verified pinned tool:

```sh
node vendor/pdfjs/build.mjs /path/to/esbuild/lib/main.js
```

The source's Node and disabled WASM helpers contain `import.meta` references. The
IIFE build warns that those references are empty; these helpers are unreachable in
the configured browser-only/no-WASM text path. The runtime bundle is a classic
script, not an ESM import and not a script that fetches another module.

## Offline and content boundaries

The classic bundle contains both the main API and `WorkerMessageHandler`, so PDF.js
uses its main-thread fake-worker path without creating a Worker. All bundled CMap
and standard-font parsing bytes are supplied from an exact-key in-memory factory.
There is no URL-based document load, runtime font/CMap fetch, WASM, external image
resource, viewer, form scripting sandbox, XFA execution, font-face installation,
or page rendering. No links, launch actions, JavaScript actions, attachments or
macros are executed. GUI fonts remain local Arial/system fallbacks.

Native text extraction supports tested conventional xrefs, xref streams,
explicit ToUnicode mappings and embedded TrueType fonts. The embedded-font fixture
uses newly generated synthetic rectangle outlines, not a third-party GUI font.
Each item preserves the actual page, text-item order, PDF transform, width/height,
page view and rotation. These values are extraction geometry; they are **not**
asserted as exact per-glyph bounding boxes. Normalized logical text is not a visual
layout reconstruction. First-record metadata identifies pages without native text.
Scanned-image OCR remains unavailable; an all-image/no-text document is rejected.

## Conservative resource preflight

A bounded independent preflight runs before PDF.js:

- PDF 1.0–1.7; 16 MiB original input; original input is copied and never detached.
- Direct stream lengths only; raw or single FlateDecode streams only.
- Compressed object streams, indirect content arrays, indirect stream lengths,
  multiple/other filters, malformed dictionaries and unsupported predictor sizes
  are explicitly rejected. Xref streams are supported; object streams are distinct.
- At most 50,000 parsed objects, 10,000 streams, 8 MiB per decoded stream and
  32 MiB total decoded streams. Page-content streams have a tighter 2 MiB cap and
  65,536-character encoded literal cap before font/glyph allocation.
- PDF.js output: at most 2,000 pages, 100,000 text items, 65,536 characters per searchable text item, and 4 MiB text. Individual
  transforms/dimensions must be finite. Reader/document resources are released on
  errors as well as success.

This deliberately rejects some valid PDFs rather than allowing unbounded decoded
allocation. The fake-worker path cannot preempt a synchronous parser mid-operation;
these limits are not a hard wall-clock CPU quota or a full hostile-parser fuzzing
acceptance claim. Text interpretation and authority remain unverified source facts.

## Verification

`node --test --test-isolation=none tests/pdf-engine.test.js`: eight tests pass:
source-byte retention/geometry, xref-stream ToUnicode, actual embedded synthetic
TrueType, no Worker/fetch resource path, encrypted/no-text/invalid inputs, bounded
unsupported structure rejection, and decompression/literal bombs.

The coordinator must still verify actual browser CSP/offline behavior and source
package integration. Managed cloud Chromium blocks `file://`; secondary HTTP
checks do not pass the mandatory workplace file-origin acceptance gate.

Only `pdfjs-local.js` and the NOTICE/LICENSE files are needed in a portable runtime
bundle. `assets.json`, entry/build modules, provenance and original sources are
retained for review/reproducibility and need not be duplicated in the runtime ZIP.
