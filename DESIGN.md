# DESIGN.md — PBGC-RAG visual and editorial specification

**Reference:** Pension Benefit Guaranty Corporation, *Branding & Editorial Style Guide*, September 2025, user-supplied 44-page PDF. This file summarizes its relevant rules, not a replacement for the source. **The brand guide itself is not included in this public repository.** Do not upload internal or copyrighted assets without authorization. Branding does not imply PBGC endorsement.

## Governing design principles

- **Workplace first:** compact, uncluttered, wizard-first, accessible on Windows enterprise browsers, keyboard operable, and usable offline via `file://`.
- **Minimal surface:** show primary controls; place concise clarification in a small adjacent `i` tooltip/popover, keyboard accessible.
- **Dark mode by default:** near-black `#000000` reading surface is a user requirement. PBGC color palette must remain recognizable and contrast-checked; provide a compliant light mode. The guide's printed layouts remain separately governed by official templates.
- **Separate learning route:** include a SPA internal route (without requiring server history fallback) for examples and explanations of regex, SQL, graph and semantic search, actuarial notation, evidence locations, and report formats.
- **No unofficial logo:** until approved masters are supplied, show the text placeholder `[PBGC-approved logo asset]`. The placeholder is NOT a logo, may not be exported as an official mark, and must be replaced only by supplied approved artwork. Use logo artwork without altering proportions, text, palette or component arrangement.

## Official color palette (guide pp. 10, 13–14)

Use the guide's HEX palette for screen design. The guide's accompanying RGB figures are inconsistent with some HEX entries; HEX values below are the screen implementation targets, and any discrepancy should be documented, not silently 'corrected'.

| Token | HEX | Usage |
|---|---|---|
| `--pbgc-blue` | `#002D72` | Primary brand blue |
| `--pbgc-red` | `#E4002B` | Primary brand red |
| `--pbgc-gray` | `#81807F` | Secondary |
| `--pbgc-black` | `#000000` | Background/text |
| `--pbgc-light-blue-gray` | `#6E93C2` | Secondary |
| `--pbgc-medium-blue` | `#004B8D` | Secondary |
| `--pbgc-medium-green` | `#008065` | Secondary |
| `--pbgc-teal` | `#00A9A1` | Secondary |
| `--pbgc-light-green` | `#88B672` | Secondary |

Supporting tints (p. 14) are `#4DC3BD`, `#B3E5E3`, `#D9F2F1`, `#4DA693`, `#B8D3A7`, `#DBE7D1`, `#BEC6DF`, `#8B9FC7`, `#4A7DBA`, `#58585B`, `#D2D2D2`, `#E0E0E0`, and `#F2F2F2`. The guide's p. 14 presents `#004B8D` among supporting blue shades. Use the primary palette more prominently than the secondary palette (p. 12).

Use color to convey meaning sparingly; never rely on color alone for status. Run WCAG contrast tests for all text and controls in light and dark themes. Official PDF/Word templates retain their own specified colors, even if different from app dark mode.

## Logo usage (pp. 7–11, 19)

Approved variants include: square/vertical agency-name logo; horizontal agency-name logo for letterhead and web; alternate horizontal agency-name logo; internal-only styles without agency name; limited-space banner variants. Choose based on intended context and approval. For external use, the guide requires agency approval (p. 7). Preserve approved digital masters, never reconstruct from screenshots or replace text with a rough drawing. Clear space on every side is at least the width of the `P` in the logo (p. 9). Minimum width is **0.625 in** (p. 9). Never outline lettering, rearrange components, recolor, stretch, crop or distort the official mark (p. 11). Use original local assets only, e.g.:
- `assets/branding/logo-horizontal-approved.png`
- `assets/branding/logo-vertical-approved.png`
- `assets/branding/logo-monochrome-approved.png`

These are **reserved paths, not supplied assets**. No network fetch; if absent, show a neutral labeled placeholder.

## Typography (pp. 15, 27)

PBGC document font families: **Arial and Garamond**. Times New Roman is acceptable for correspondence/business writing. In official printed documents use 10–12 pt for ordinary body text, subject to the actual official template. Helvetica Neue/Adobe Garamond are mentioned for some design contexts but may not exist on standard workstations. Do not download fonts, embed unapproved font binaries, or make hosted fonts a dependency.

App GUI: favor locally installed Arial with generic sans-serif fallback, and responsive sizes appropriate for accessible on-screen UI. Keep long reading lines reasonably narrow; the guide flags lines exceeding about 50–60 characters (p. 16). Retain exact template font sizes in generated official artifacts.

## Editorial rules (pp. 26–43)

Priority: official output template requirements > applicable PBGC editorial instructions > simplified technical English for app-authored text. PBGC's guide generally follows AP style, except documented PBGC preferences; government policy writing uses the Government Publishing Office style manual (p. 26).

- Expand initialisms at first occurrence: `Pension Benefit Guaranty Corporation (PBGC)` (p. 27).
- Say **PBGC**, never `P.B.G.C.`, `the PBGC`, or “Pension Benefit Guarantee Corporation” (p. 34).
- Write **defined benefit plan**, without a hyphen (p. 31); write **multiemployer**, without a hyphen (p. 32).
- Spell out months in narrative dates (e.g. `December 31, 2025`); use short three-letter month names in tables (p. 30).
- Write `FY 2025` after spelling out `fiscal year` on first reference (p. 31).
- Use `a.m.` and `p.m.`; avoid time redundancies (p. 33).
- Generally spell out whole numbers zero–nine and use digits for 10+, with guide exceptions for dates, ages and percentages (p. 33).
- For percentages, use `3%` with no intervening space, and `0.4%` rather than `.4%` (p. 35).
- Use sentence case in routine web headings except proper nouns; do not put terminal punctuation on headings (pp. 31–32).
- Prefer clear plain language and **use**, not **utilize** (pp. 42–43).
- In lists capitalize first words and use end punctuation for complete sentences; omit end punctuation for single-word or phrase items (p. 27).
- Use ASD-STE100-*style* Simplified Technical English in app-authored reports, help and interface text: short active sentences, simple terms, minimal redundancy. Do not claim certification. **Do not rewrite existing official templates** to fit this secondary preference.

## Accessibility and privacy (p. 24)

The guide discusses Section 508. Build keyboard navigation, logical headings, labels for inputs, non-color status, visible focus, accessible tooltips, readable tables and charts, scalable text, and contrast-tested themes. Audit to an applicable WCAG standard and record test evidence. Do not use external media. Any included photographs must have rights clearance and be relevant; photographs are optional and should not crowd actuarial workspace screens.

## Design components and screen rules

- **Shell:** clear active case, build version, storage status, offline indicator and optional local-AI availability.
- **Wizard:** select case → import → index → search/review → link rules → generate → validate → export.
- **Search:** one principal search field; advanced regex/SQL/graph tools behind a disclosure.
- **Evidence panel:** exact locator, excerpt, effective period, source authority, conflict status and click-through navigation.
- **Calculation panel:** inputs, source rules, approval status, trace, rounding, independent comparison and blockers.
- **Artifacts:** preserve official templates, display validation status and refuse release for failed checks.
- **Microcopy:** short instructions, actionable error messages, adjacent `i` toggles; no large explanatory banners.
- **Brand status:** generic product name `PBGC-RAG` is a project label, not a claim of PBGC authorization.

## Branding acceptance

Verify official HEX tokens, typography fallback, visible placeholder for missing artwork, logo clear-space constraints once asset supplied, WCAG/508 checks, dark/light mode, readable line lengths, no remote assets/fonts, no promotional images, brief ASD-style text, app routes working through `file://`, and official artifact-template fidelity.


## Current user writing preference

Use ASD-STE100-style text in all assistant replies and app instructions. Use short,
active sentences. Give one action per step. Show source IDs and other technical
text in a details control when possible. Keep source text and official templates
unchanged. Do not claim formal ASD-STE100 certification.
