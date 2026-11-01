# Guided workspace redesign — 0.6

Problem: the previous workspace displayed five full work areas together and hid the required model picker inside a disclosure below the question. Save, restore, provisional exports and technical controls competed with the first-answer journey.

The PBGC design specification in DESIGN.md governs this change: the exact blue/red palette, Arial, dark default plus light mode, local assets and approved-logo placeholder are retained. No official artwork was reconstructed. No authoritative actuarial behavior changed.

## User journey

1. Case: create a named case, continue a local case or open a saved file. The rest of the workspace is not shown by default.
2. Documents: add files, see the resulting source inventory, then Continue to questions. The next button is unavailable until documents exist. Scanned-page reading has a plain-language opt-in; file limits are a disclosure.
3. Ask: ask for source passages without setup. For written answers, the visible Enable offline answers card names the exact included file and its models folder. Selecting written answers opens/focuses this guidance. The chosen filename is acknowledged. Successful loading shows a ready confirmation, collapses setup and focuses the question.
4. Evidence: cited passages and View evidence retain original source links. File fingerprints and exact parser fields stay in optional details.
5. Save/reopen: the case backup and restore controls are primary. Provisional reports, specialized exports, recovery administration and capability diagnostics are separate disclosures. A restore confirms its filename and offers a direct path to Search.

Search and Save & reopen remain accessible from every workspace task. Show all tools is a user-visible power-user view; it is also used for broad engineering regression coverage. The separate guided UX and extracted-office tests do not use that shortcut.

## Inspection and verification

Fresh Playwright captures were saved under test-results/ux/01-before.png and test-results/ux-flow-*.png. The before screen, start screen, question/setup and mobile light screenshots were opened and visually inspected. The desktop question and setup use separate columns; smaller screens stack them without horizontal overflow. The broad legacy suites continue to verify all tools. The dedicated guided test checks one visible panel, accessible current-task indication, source passages without a model, exact included-model instructions, source viewing, save/restore, cross-case draft clearing and 1280/375px layouts in both themes.

Screenshots alone do not establish accessibility compliance. Existing contrast, control-boundary, labeling and keyboard checks also run. Local HTTP is supplementary evidence; the managed local browser blocks file URLs. Actual offline file URLs must pass Windows and Ubuntu CI, including the complete extracted package with real Qwen and OCR, before release.

Browser security still requires the user to choose the adjacent model file. The new flow makes this a guided in-app action; it does not promise silent filesystem access. Recovery remains best effort. Official PBGC source/interpretation validation remains deferred.

Review repairs: successful model loading schedules question focus after the operation re-enables controls. Cancelling generation returns to the visible setup card when the worker/model is disposed. Empty cases disable Ask. A PDF imported with no readable records offers Read scanned pages; this reparses the already-held original with the pinned OCR profile and commits only after success, rather than silently deduplicating a re-upload. Failed or cancelled recognition keeps the prior source. The original-byte/v3 restore test covers this recovery path.
