# Original PDF page preview — 0.8

Open a PDF through View evidence or View source, then choose Original PDF page. The reader shows a locally rendered page from the preserved original PDF, with page navigation, Fit width/150%/200% zoom, cancellation/retry and Save original. Extracted text remains available separately. Non-PDF sources retain the text reader and unchanged-original download.

The initial preview page follows the selected source record's page locator, or starts at page 1 when no page locator exists. Navigating the preview does not change the selected quotation, its citation or saved review annotations. Image-only pages can be viewed even when they have no extracted text record; a visual page is not an invented text citation or an approved interpretation.

Original source bytes, fingerprints and parsed records are unchanged. Raster pixels are temporary and are not included in case exports, searches or model context. Closing the reader, changing sources/cases or cancelling invalidates pending work, aborts the isolated renderer and releases the canvas. Late results cannot paint over another source. A failed preview leaves the text reader and original download available. The main interface uses a plain error; technical details stay in optional Source details.

## Bounds and limitations

Uses the already pinned PDF.js raster worker through inspectPdfPages/renderPdfPage, not a browser PDF plugin, iframe, HTML conversion or recreated transcription. No additional dependencies, network, fonts, installation or server are required. Existing renderer guards apply: 5 MB source, 200 pages, 4096-pixel edge and a hard 15-second worker deadline. The preview additionally caps each raster at 4 million pixels and keeps one page at a time. Success, failure, timeout and abort terminate the dedicated worker.

Interactive PDF content, annotations, forms and attachments are not displayed or executed. Font substitution and unsupported PDF rendering features can affect appearance; this is not a fidelity certification for every PDF. Large pages may exceed the budget at high zoom. Save original preserves the complete file for a separate approved reader. Machine-read OCR text and numbers still require checking against the original.

## Verification

Synthetic two-page evidence tests render both native text and an image page absent from parsed records. They check distinct, nonblank rasters, page navigation, zoom, rejected invalid page inputs without renderer calls, both-theme control/text contrast, mobile layout and byte-for-byte original downloads. Separate explicitly simulated delayed-worker tests cover cancellation, close/Escape, source changes, stale results, friendly errors and retry. They do not substitute for actual PDF rendering tests.

The complete office-package test also displays the original scanned PDF from the extracted ZIP, checks original download bytes and retains the real bundled Qwen, cancellation, OCR, network isolation and whole-process memory gates. Local HTTP is supplementary evidence; Windows and Ubuntu actual offline file gates must pass for release.
