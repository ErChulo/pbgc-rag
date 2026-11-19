# Use a large case

This guide covers the **1.1 development branch**. This version is under audit and scale testing. Keep the earlier app in its own folder. See [current test status](AUDIT-REMEDIATION-1.1.md).

## Open the case workspace

1. Extract the complete office app. Keep `index.html`, `assets`, `vendor` and `models` together.
2. Double-click `index.html`. Choose **Get started**. You can choose **Use source passages instead** to start without Qwen.
3. Open **Case**. Choose **Open a large case workspace**.
4. Enter a case name. Choose **Create large case**.
5. Use **Add case documents** to select the original files. Wait for import to finish. Read all listed errors and coverage notes.

The app stores each original file separately. Completed imports remain when you cancel a later file. A cancelled, incomplete new file is removed. You can add the remaining files later; identical originals are kept once.

The configured bounds are 1 GiB of originals, 2,000 documents and 64 MiB per file. A parser or browser storage limit can be lower. These bounds do not certify performance. PDFs are read in page groups. Pages without extracted text are listed. This workspace currently searches their text layers; add a text layer or import an image separately when needed.

## Find and check information

1. Under **Documents for this question**, choose one document or **All documents**.
2. Enter a short question. Include a plan name, participant ID or date when needed.
3. Keep **Find source passages** selected. Choose **Search large case**.
4. Read the excerpts and their locations. Use **Save original** to check the file. For a PDF citation, choose **Original PDF page**.

Search checks stored passages in the selected documents. The local encoder can rank a bounded text-search shortlist. This is not a dense semantic index of the full case. A broad question can match too many passages; choose a document or make the question more specific. Full-case searches at 1 GiB can be much slower than a search in one document.

To write an answer, choose **Start included Qwen**, then **Write an answer with sources**. Qwen must be included in the complete office package. Check each citation. **Only one source is cited** means that the answer has no independent cited support. A quotation does not prove that a document is correct or applies to the person in the question.

For a CSV or spreadsheet, select the document, open **Check table column names**, select its table or sheet, and choose the row with column names. Choose **Use this row as column names**. Confirm each sheet separately. Unsupported table layouts remain searchable but cannot supply a written table answer.

## Save and reopen

1. Choose **Save large case backup**. Keep the ZIP in an appropriate local folder.
2. To restore it, use **Open a large case backup**. The app creates a separate case, checks original file hashes and rebuilds the passages.
3. Check the restored documents before removing an older browser copy.

Backups contain originals and your confirmed column choices. They do not contain the app or its model. Keep the app folder separately. Browser storage and backups are **unencrypted**. Browser storage can be cleared; keep your originals and a portable backup.

Use **Remove document** or **Remove this case from browser** only after you keep the originals or a backup. These controls remove the browser copy.
