# Targeted accessibility audit

Date: October 29, 2026. Scope: synthetic case workflow in local Chromium 154, headless Linux. This is a targeted engineering audit, not full WCAG or Section 508 compliance certification.

## Reproduce

```sh
cd /workspace/pbgc-rag
PBGC_HTTP_CHECK=1 node tests/accessibility-browser.cjs
node --test --test-isolation=none tests/design.test.js
```

The browser suite uses Playwright already present in the development environment. It starts a loopback-only HTTP server, blocks external HTTP/HTTPS/WebSocket requests, and preserves the managed Chromium URL policy. The ordinary file-origin mode remains available by omitting `PBGC_HTTP_CHECK`; managed policy currently denies `file://` navigation. HTTP results do not substitute for workplace file-origin acceptance.

## Findings

Final browser rerun: **30 PASS / 0 FAIL**, zero page exceptions or external request attempts. The coordinator corrected the router/skip-link interaction, workspace focus after user navigation or view replacement, and wrapping of long evidence IDs. Initialization retains the initial document focus so the first Tab still reaches the skip link. The same regression assertions now pass; tests were not weakened.

Initial browser run: **25 PASS / 5 FAIL**, zero page exceptions or external request attempts. The five failing assertions identified three focus/navigation problems and graph-page overflow at two viewport widths, all fixed and verified in the final rerun:

- **FIXED:** Creating a case removed the focused submit button and left focus outside the workspace.
- **FIXED:** Keyboard activation of a workflow route left focus outside the new workspace content.
- **FIXED:** Activating the skip link on Search changed the route to Case because `#main` was interpreted as a router destination.
- **FIXED:** The evidence graph page produced document-wide horizontal overflow: 575 CSS pixels at a 320-pixel viewport and 577 pixels at 375 pixels. Wrapping long evidence IDs corrected the overflow.

These findings concern keyboard navigation/focus order and reflow (WCAG 2.1.1, 2.4.1, 2.4.3, and 1.4.10 considerations). A failure is an engineering finding; success of these few checks does not establish conformance to an entire success criterion in every state.

The same run **passed** the first-Tab visible skip link, initial skip-to-main focus, exactly one main landmark and workspace heading, associated form labels on the six tested workflow routes, keyboard case creation/import/search/graph selection, live search-result announcement markup, preserved search-input focus, keyboard light-theme toggle, visible outline and unobscured focused export control, and 320/375-pixel reflow on Case, Import, Search, Rules, and Report pages. File-picker automation supplies synthetic bytes; it does not test operating-system dialog accessibility.

Existing CSS/token tests, independently rerun after fixes: **2 PASS / 0 FAIL**. Tested dark/light text pairs meet 4.5:1, tested control boundaries meet 3:1, and branding/local-asset assertions pass. These are specific source-derived pairs; they are not exhaustive computed-style contrast measurements of every rendered state or SVG label.

## Unrun and blocked acceptance

- **BLOCKED:** Real `file://` application and standalone-report execution under this managed browser's current URL policy. No policy modification or bypass was attempted.
- **UNRUN:** Windows 11 enterprise browser, screen-reader output (including dynamic announcements), speech input, high-contrast/forced-color modes, OS file-dialog navigation, 200%/400% browser zoom, every error/recovery/library state, exhaustive focus order and target sizing, touch assistive technology, and full Section 508/WCAG evaluation.
- **UNRUN:** Exhaustive contrast, graphical relationship descriptions, complex graph navigation at large display limits, and accessibility of official document outputs. Official outputs remain blocked by their separate authoritative-input gates.

The browser regression script checks intended behavior and exits nonzero if any assertion fails. Initial failure evidence is retained above alongside the verified final results.
