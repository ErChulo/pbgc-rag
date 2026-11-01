# Open the complete office package

The complete `PBGC-RAG-0.6-office.zip` contains the application, sentence encoder, generation runtime and Qwen generation model. Keep all extracted folders together.

1. Extract the ZIP to a local folder.
2. Double-click `index.html`.
3. Create a case in **1. Case**. Add files in **2. Documents**, then click **Continue to questions**.
4. For written answers, use the visible **Enable offline answers** card in **3. Ask**. Select the included `models/qwen2.5-0.5b-instruct-q4_k_m.gguf` and click **Enable offline answers**. The supplied model manifest is already the default.
5. Ask a question and use **View evidence** to read its source.

These are browser and file-picker actions. No terminal, Python, Node, installation, local server or internet connection is needed at the office. The model is already supplied; the application does not download it. Load the model again after closing/reopening the browser or cancelling generation. Model loading and answers use the local CPU and can take time.

The `models` files are application assets. Do not import them as case documents. Use **Add your documents** only for the documents you want to review.

An organization may block local browser scripts, workers or WebAssembly. The application reports unsupported capabilities; do not change or bypass workplace policy. Answers and citations are review aids, not official actuarial approval. Use synthetic documents in this development build.

## Preparation outside the office

Preparation and automated tests are the developer's responsibility. The core developer ZIP and GitHub source archive omit the large generation weights and are not the complete office delivery. Do not run preparation commands at the office.

## Scanned PDFs

Enable **Read text from scanned PDF pages** before adding an image-only PDF. The English OCR engine and model are already included. Check machine-read words and numbers against the original page. There is no extra download or setup. Pages that already contain native text are not OCR-processed.

## Finding your way

**1. Case → 2. Documents → 3. Ask** is the main path. **Search** finds a specific passage. **Save & reopen** downloads a case file or opens a saved one. Read source passages without model setup, or enable written offline answers. Advanced report, query, model and recovery options are available when needed; **Show all tools** opens the full workspace.
