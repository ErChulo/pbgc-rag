# Offline English OCR

`recognizeImage({width,height,data:Uint8ClampedArray}, options)` recognizes rendered RGBA pixels with a real learned Tesseract LSTM model. The result contains machine `text`, engine confidence from 0–100, text `lines` with integer `{x,y,width,height}` bounding boxes in the original raster's pixels, and a pinned `engine.id`. Engine confidence is a recognition score, not a probability that a pension provision is correct. OCR is derived machine text: review the original page image before relying on a value.

The engine is Apache-2.0 **tesseract.js-core 6.0.0**, using its single-thread non-SIMD LSTM-only WebAssembly build. The pinned English model is Apache-2.0 **tessdata_fast 4.1.0**, SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`. We inspected Tesseract.js 6.0.1's wrapper to confirm the direct core API, but do not import its network/cache worker or its dependencies. The bundle contains the engine, trained weights, glue, manifests and their licenses. Exact compiled dependency revisions and retained BSD/MIT/IJG/zlib notices are in `vendor/ocr/THIRD-PARTY.md` and `third-party-licenses/`. The app never downloads language models or caches source images.

The npm core tarball is verified against its pinned SHA-512 integrity before extracting the exact WASM/glue. The English file is independently SHA-256 verified. `tools/build-ocr.py --core-tar <verified tarball> --traineddata <verified eng.traineddata>` produces the local classic pack; `--check` compares a reproducible build. Source URLs, input/output hashes and modifications are recorded in `vendor/ocr/manifest.json`. Licenses and the upstream core readme accompany the pack; its upstream web-server examples are not workplace instructions.

## Browser runtime

`assets/ocr.js` lazily loads only the adjacent `vendor/ocr/ocr-pack.js` classic script. It verifies the embedded WASM, English weights and patched glue against constants before creating a dedicated Blob worker. The module supplies `wasmBinary` directly. All upstream browser network calls are additionally patched to hard-denied functions; worker network/import entrypoints are unavailable. The existing CSP needs only local scripts, `worker-src blob:` and the narrow `'wasm-unsafe-eval'` permission, retaining `connect-src 'none'`. No installation, server, Python, Node, external request, shared memory or cross-origin isolation is used by the app.

Every recognition creates a fresh worker and API instance. It writes only the public English weights to the worker's in-memory filesystem, passes the derived image pixels to TessBaseAPI, recognizes text, groups TSV word boxes into lines, and terminates. No classifier or source image survives in a shared worker across cases. Public verified model bytes alone are cached in the page. The caller's image data is copied and remains unchanged.

`options.signal` cancels initialization or active recognition. Cancellation and deadlines terminate the whole worker and reject; the next call starts clean. `onProgress` reports initialization/recognition phases. Callback failure also terminates the worker. Missing workers, cryptography, WASM policy permission or local assets fail explicitly; no main-thread OCR or remote service fallback runs.

## Bounds and scope

- At most 8,000,000 pixels, 4096 pixels per edge; exactly four RGBA bytes per pixel.
- Default 30-second worker budget; `timeoutMs` may be 1–60,000 ms. PDF orchestration separately bounds page count and total duration.
- At most 100,000 output characters and 5,000 lines. Pixel geometry, confidence and output sizes are checked again on the main thread.
- English only. No orientation/script-detection model, handwritten-text guarantee, table reconstruction, formula recognition or mathematical OCR is claimed. Rotated, low-resolution, low-contrast, complex-column or unusual-font scans can be misrecognized or empty.
- Coordinates describe rendered-image regions, not exact original glyph positions. PDF integration must preserve its original bytes/hash, page number and render transform separately. Machine OCR must not silently replace native PDF text or claim a human verification state.

## Evidence

`PBGC_OCR_HTTP=1 node tests/ocr.test.js` passed three tests locally: exact pinned-asset rejection, malformed/cancelled/bounded input, and **real browser OCR** of two independently rendered text lines. It recognized “Normal retirement age is 65.” and “Monthly benefit is 1250 dollars.” with confidence 95. Recognition plus cancellation/deadline probes took about 585 ms; 46 UI timer ticks ran during work, original pixels stayed unchanged, line boxes stayed within the raster, and no external requests occurred. This is a small clean synthetic raster test, not a general OCR accuracy benchmark.

The default browser test uses actual `file://` with browser networking disabled; the managed local browser's file-entry policy is not bypassed. GitHub Windows/Ubuntu actual-file results and integrated scanned-PDF/package evidence are recorded by the coordinator. Supplementary HTTP evidence does not establish workplace browser-policy approval.
