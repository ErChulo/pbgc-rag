# Start PBGC-RAG

1. Download the complete **PBGC-RAG-0.8-office.zip** and extract it to a local folder.
2. Double-click **index.html**.
3. Follow the on-screen welcome guide. It explains the included **Qwen** assistant, helps you start it, then takes you through adding documents and asking your first question.

**Qwen is already included.** Starting offline answers reads the files supplied inside this package. You do not need to find a model file, choose a model type, download weights, or install anything. Keep the extracted **assets**, **vendor** and **models** folders with **index.html**. The app may take time to prepare Qwen on the local CPU; progress and cancellation are shown.

No terminal, Python, Node, installation, local server or internet connection is required at the office. Preparation and testing are the developer's responsibility.

## Your first question

The guide helps you start a case, add documents and ask a question. A case keeps a set of documents together. Try the supplied synthetic example if you want to learn before adding a file. Read the source passages linked to each answer; generated answers remain review aids.

You can also read source passages without starting Qwen. Search finds a specific passage. Save & reopen downloads a case file or opens a file you saved earlier. Save a case file before closing the app; browser recovery is best effort.

## Scanned PDFs

Enable scanned-page reading before adding an image-only PDF. If an imported PDF has no readable text, its document entry offers **Read scanned pages**. English recognition assets are included. Check machine-read words and numbers against the original page. Pages that already contain native text are not OCR-processed.

## Keeping the package complete

The **models** folder contains local application files. Do not import these files as case documents, rename individual parts, or move them away from the app. The source-code ZIP and small core developer ZIP do not contain the Qwen files and are not the complete office delivery.

Closing the browser or cancelling an active generation can release Qwen from memory. Start offline answers again when prompted; the included files remain on disk and no new download is needed.

An organization may block local scripts, workers or WebAssembly. The app reports unsupported capabilities; do not change or bypass workplace policy. Use synthetic documents in this development build. Answers and citations are not official actuarial approval.
