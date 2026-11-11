# Your first PBGC-RAG case

Use the complete office ZIP. Extract it. Keep all folders beside `index.html`. Open `index.html` to start.

## 1. Start the assistant

Choose **Get started**, then **Start Qwen**. Wait for the ready message. The model files are included. You do not need to select a model file or install software.

You can also choose **Use source passages instead**. This finds related text without writing an answer.

## 2. Add your documents

Choose the files for one case. The app keeps the originals unchanged.

For a spreadsheet or CSV, find **Check column names**. Look at the preview. Enter the row that contains the column names. Choose **Use this row as column names**. A title row is usually not the column-name row. You can change this choice later.

SQLite files already contain column names. No extra choice is needed.

## 3. Ask a question

Choose **Continue to questions**. Enter a short question. For example:

> What is the normal retirement age?

Use the same words as the document when possible. For a person in a table, include the person's name and the column you need:

> What is Alice's age?

You can ask up to three independent facts in one result. Write each question in full:

> What is the normal retirement age? How long are case files kept?

Each fact must have its own supporting source. The app does not fill a missing part from general knowledge. It does not calculate a benefit, decide which rule applies, or infer a relationship between separate facts.

Use **Add another question** when you want separate results. Use **Documents: All documents** to limit one question to a file. To compare the same fact in two files, enter it in two boxes and choose a different file in each box.

## 4. Check the answer

Open **Sources for this question** or **View evidence**. Read the text near the answer. Check the source name and location.

Table answers copy column labels and cell values. They are marked **Table values**. **View evidence** opens the value cell. Formulas, missing values and unclear table layouts do not provide table answers. Use **Search** to read these sources yourself. Excel date numbers are not converted to dates.

If documents disagree, the app asks you to review the sources. Selecting one file narrows the search. It does not make that file authoritative.

## 5. Read a scanned page

Open a PDF source. Choose **Original PDF page**. Go to the page you need. Choose **Read text from this page** if an image area has missing text. This also works on a page that already contains some selectable text.

Reading can take time. **Cancel reading** stops the operation and keeps the earlier text. Check machine-read words and numbers against the original page. The app keeps earlier notes and source links when it adds text.

## 6. Save your case

Choose **Save & reopen**, then **Save case to a file**. Keep that case file. Browser recovery is not a substitute for saving.

To return later, open the app and select your saved case file. The restore summary shows its name and document count. Original documents and table-heading choices are restored. Start Qwen again when you need written answers.

## When no answer appears

- Check that the right case and document are selected.
- For a table, confirm its column-name row under **Documents**.
- For an image, read the original page and use **Read text from this page**.
- Write each requested fact as a complete question. Include the person's name for a person-specific table value.
- Add the missing source or use **Search** to find its words.

The app keeps documents and questions on this computer. It makes no server calls. This guide describes the 1.0 candidate. See [candidate test status](HABEMUS-ACCEPTANCE.md) for the exact verified version.
