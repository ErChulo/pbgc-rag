# Local PDF OCR

PDF text extraction stays unchanged by default. `parsePdfWithOcr(bytes,{mode:'missing-text',signal,onProgress})` is the explicit derived-text path. It first runs the existing isolated native parser, inspects the PDF page count, then rasterizes and recognizes only pages with **no nonblank native text records**. An image page with a native header/footer or an existing but inaccurate invisible text layer is not recognized again. Explicit page subsets and all-pages OCR are unsupported by this profile.

`renderPdfPage(bytes,pageNumber,{scale,maxPixels,signal,timeoutMs})` returns RGBA pixels plus page view, rotation and the PDF.js viewport transform. `inspectPdfPages(bytes,{signal,timeoutMs})` returns the bounded page count. The rendering pack loads lazily as a fixed adjacent classic script. It embeds the already pinned PDF.js6.4.299 bundles in a dedicated Blob worker; it never imports modules or requests remote data. A local OffscreenCanvas renders without annotations, forms, XFA or document JavaScript. External fonts, CMaps, WASM decoders, transfer/color filters and unsupported rendering data are refused. Consequently some PDFs cannot be rendered by this bounded profile; this is not a universal layout/image decoder.

## Limits and isolation

Original source bytes remain unchanged. Each PDF is at most5MiB and200pages. At most20pages may need OCR. Default raster resolution is150DPI (scale150/72), with at most8,000,000pixels and4096pixels per edge. Oversized pages fail rather than silently lose requested resolution. Internal image and temporary canvas sizes use the same budgets. Each inspection/render operation runs in a fresh worker with a hard deadline of at most15seconds, and the worker is terminated on success, failure, abort or timeout. Recognition uses the separate OCR engine worker, at most60seconds per page. The aggregate PDF OCR deadline is at most180seconds. Source text remains bounded at2million UTF-16 characters and50,000records.

The worker blocks global fetch and imports. PDF.js binary-data loading is denied. Rendering does not request actions, attachments or annotations. Pixel/time limits are not a hard OS memory sandbox; hostile-document and unsupported codec risks remain explicitly bounded subsets. Browsers without worker OffscreenCanvas/DOMMatrix support report unavailability instead of rendering on the UI thread or enabling a server.

## Provenance and persistence

Native `pdf-text-item` records are preserved. Machine-recognized records use `pdf-ocr-line` locators with original PDF page number, engine line number, integer rendered-pixel rectangle, full raster dimensions, original page view/rotation and raster transform. Those rectangles are **machine estimates**, not native text bounds or exact glyph geometry. Confidence and the engine ID are separate record metadata under `ocr`, with `verification:'unverified-machine-text'`. Confidence is not an authority or correctness probability.

The result records `sourceProcessing:{schemaVersion:1,pdfOcr:'missing-text',engineId}`. The browser case loader can rerun this exact profile from original bytes and validate dependent source bindings. The result parserVersion binds the original native parser and pinned OCR engine identities. Repeated processing in the tested browser reproduces records/locators. Different browser rasterizers or future engine versions may change machine text/boxes: stale annotations must fail validation rather than trust imported OCR as fact.

Verify every recognized number, date and negation against the original page. An empty OCR result does not prove the page is blank. Handwriting, table structure, complex layouts and mixed native/image page OCR are not accepted capabilities.

## Evidence

`node tests/pdf-ocr.test.js` tests a synthetic two-page PDF containing one native text page and one raster-only page. It checks actual local rasterization and OCR, exact source-byte preservation, native record preservation, engine metadata, pixel-region locators, repeat-processing equality, hard render timeout, cancellation and no external requests. It also independently verifies build-provenance hashes and regeneration freshness. The local restrictive-CSP loopback fixture is supplementary evidence; actual file-profile execution is checked by the integrated application/office tests.
