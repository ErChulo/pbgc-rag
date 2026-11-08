# Use PBGC-RAG

PBGC-RAG helps you find information in documents and check the source of an answer. It runs on your computer. It does not send your documents or questions to a service.

## Open the app

1. Download a complete office ZIP from the [stable 0.8 release](https://github.com/ErChulo/pbgc-rag/releases/tag/office-v0.8.0) or the separate [larger-model test release](https://github.com/ErChulo/pbgc-rag/releases/tag/larger-model-v0.8.0).
2. Extract the ZIP to a local folder. Keep **index.html**, **assets**, **vendor** and **models** together.
3. Double-click **index.html**.
4. Choose **Get started**, then **Start Qwen**.
5. Wait for the ready message. Follow the guide to add documents.

Qwen is the included local assistant. You do not need to find a model file, install software, open a terminal or run a server. Model startup can take time on the local CPU. The app shows progress and lets you cancel.

The GitHub source-code ZIP and small core developer ZIP are not complete office packages. Keep the stable and larger-model packages in separate folders. The larger-model package uses Qwen2.5 1.5B Instruct Q3_K_S; it is an experiment, not a promise of better answers.

## Ask your first question

1. Add a document, or choose the supplied example to learn the controls.
2. Open **Ask**. Type one short question, such as **What is the normal retirement age?**
3. Ask the question. Wait for the result.
4. Select **View evidence**. Read the supporting text and nearby records.
5. For a PDF, choose **Original PDF page** to check the saved page.

A case keeps documents together. Questions use the selected case or reference library. You do not need a field dictionary, official template or approved actuarial rule to use this flow.

Each written answer must pass source checks. If the app cannot support an answer, it says so. If sources appear to disagree, read both before deciding what to use. A citation does not prove that the answer applies to a particular person or date.

## Ask separate questions in this development branch

These controls belong to the guided-question development branch. They are not in the published 0.8 packages. Current verification is recorded in `docs/ux/RAG-0.9.md` in the package.

1. In **Ask your documents**, write the first question.
2. Choose **Add another question**. Enter a different question in **Question 2**. You can add **Question 3**.
3. Ask one thing in each question. For example, ask about the retirement age in one field and the case file retention period in another.
4. Choose **Ask questions**. The app checks the questions one at a time.
5. Read the result and sources for each question. Some questions can have supported answers while others need more evidence or source review.

Each question gets its own search and source checks. An answer can come from a different document. This does not create a free-form combined report or decide which conflicting provision governs.

## Read passages without Qwen

Choose the source-passage answer mode to read retrieved document text. You can do this without starting Qwen. Use **Search** when you want to find a word or phrase. Open a result to read its source.

## Save and reopen your work

1. Choose **Save & reopen**.
2. Save a case file before closing the app.
3. To return later, open the app and select the case file you saved.
4. Read the restore summary beside the file picker. Check the case name and document count.

The case file contains original documents and saved case data. Browser recovery is best effort; keep the case file yourself. Starting Qwen again reads the same included model files. No new model download is needed.

## Check scanned PDFs

The first-run guide enables scanned-page reading. In the document workspace, enable it before adding an image-only PDF if it is off. If a PDF has no readable text, its entry offers **Read scanned pages**.

English recognition files are included. Machine-read words and numbers can be wrong. Check them against **Original PDF page**. Pages that already have a native text layer are not processed again, even if part of the page is an image.

## Check an original file

Open **View evidence** or **View source**. For a PDF, choose **Original PDF page**. Navigate or zoom, then return to **Extracted text**. Interactive content and annotations are not shown.

**Save original** downloads the unchanged file. **Source details** contains optional technical checks such as the file hash. You do not need those numbers to read or check a source.

## If you need help

- **Qwen is not ready:** Start it from the guide or Ask screen. Source passages remain available.
- **You cancelled a question:** Start Qwen again when prompted. The included model files remain on disk.
- **No supported answer:** Ask about one fact. Use words from the document. Read the retrieved passages and check that the needed document is in this case.
- **The package is incomplete:** Extract the complete office ZIP again. Keep its folders beside **index.html**. Do not import model files as documents.

PBGC-RAG is an independent project, not an official Pension Benefit Guaranty Corporation (PBGC) product. Its answers are review aids. Synthetic fixtures belong in the public repository and remote development environment; your local case documents do not belong there.
