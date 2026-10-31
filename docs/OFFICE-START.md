# Open the complete office package

The complete `PBGC-RAG-0.4-office.zip` contains the application, sentence encoder, generation runtime and Qwen generation model. Keep all extracted folders together.

1. Extract the ZIP to a local folder.
2. Double-click `index.html`.
3. Create or select a workspace and add documents.
4. For generated answers, expand **Local model settings**. Select the included `models/qwen2.5-0.5b-instruct-q4_k_m.gguf` and click **Load local model**. The supplied model manifest is already the default.
5. Ask a question and use **View evidence** to read its source.

These are browser and file-picker actions. No terminal, Python, Node, installation, local server or internet connection is needed at the office. The model is already supplied; the application does not download it. Load the model again after closing/reopening the browser or cancelling generation. Model loading and answers use the local CPU and can take time.

The `models` files are application assets. Do not import them as case documents. Use **Add source documents** only for the documents you want to review.

An organization may block local browser scripts, workers or WebAssembly. The application reports unsupported capabilities; do not change or bypass workplace policy. Answers and citations are review aids, not official actuarial approval. Use synthetic documents in this development build.

## Preparation outside the office

Preparation and automated tests are the developer's responsibility. The core developer ZIP and GitHub source archive omit the large generation weights and are not the complete office delivery. Do not run preparation commands at the office.
