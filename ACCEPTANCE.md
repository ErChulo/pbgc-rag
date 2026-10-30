# Acceptance evidence

Initial increment, October 30, 2026. Final application acceptance: **NOT COMPLETE**.

| Requirement | Status | Evidence and limits |
| --- | --- | --- |
| Bounded TXT/MD/CSV/TSV/JSON parsers and honest locators | PASS (initial scope) | `node tests/core.test.js`: nine tests pass; CRLF/UTF-16 offsets, multiline CSV, escaped JSON pointers, malformed/binary/oversize/deep inputs |
| Keyword/exact evidence retrieval | PASS (initial scope) | Core tests verify AND matching, phrase order, ranking and provenance preservation; browser workflow verifies source text |
| Strict local CSP and text-only rendering | PASS (tested controls) | `node tests/security.test.js`: two tests; browser adversarial image/event text remains inert; no external requests observed in tested workflows |
| Package bytes, restore and tamper rejection | PASS (HTTP development evidence) | Supplementary Chromium test verifies byte-exact original download/export, restore, hash-tamper rejection, atomic malformed JSON/unsupported PDF failures, close cancel/accept and case isolation |
| Memory-only storage fallback | PASS (HTTP development evidence) | Browser localStorage getter throws; example/search/export still function |
| Theme and help route | PASS (functional HTTP evidence) | Browser test toggles theme and navigates #help; no comprehensive WCAG/508 claim |
| Double-click actual file:// workplace execution | BLOCKED | `node --test tests/browser.test.js`: Chromium returns `net::ERR_BLOCKED_BY_ADMINISTRATOR`; managed policy URLBlocklist `*`, allowlist omits file scheme. No policy bypass attempted |
| No workplace runtime installation/server/network | PASS (source inspection only) | Static classic scripts and local CSS; no runtime dependency, fetch, CDN or dynamic code. Actual file-profile runtime evidence remains BLOCKED |
| Upstream audit | PASS (source review); BLOCKED (full dependency/runtime gate) | Revision 2cd2b3329c470ccb53923f8a6d320596b34e56c5, MIT license, declared inventory and architecture inspected. No upstream runtime code imported. See docs/UPSTREAM.md |
| Binary formats, OCR, SQL, regex, semantic and typed temporal graph | FAIL / NOT IMPLEMENTED | Explicitly unavailable; no claims of parity |
| Reference library, migrations, checkpoint/cancel/resume, large-file performance | FAIL / NOT IMPLEMENTED | Initial bounded single-active-case workflow only |
| Official dictionary and template/syntax validation | BLOCKED | Required authoritative inputs absent |
| Approved actuarial rules and independent numerical regressions | FAIL / NOT IMPLEMENTED | No calculation or rule activation path exposed |
| Reports, R1, BSRS and official artifacts | FAIL / NOT IMPLEMENTED | No official release path exposed |
| Windows enterprise policy, CPU/RAM and accessibility acceptance | BLOCKED / UNVERIFIED | Current environment is Linux; no enterprise approval or full accessibility/performance audit |

## Reproduction

Development prerequisites: Node, Playwright and Chromium. None are workplace runtime requirements.

```sh
node tests/core.test.js
node tests/security.test.js
node --test tests/browser.test.js  # actual file://; currently blocked by policy
```

Supplementary HTTP only (not a substitute for file acceptance):

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory /workspace/pbgc-rag
PBGC_TEST_URL=http://127.0.0.1:8765/ node --test tests/browser.test.js
```

Chromium needs the managed execution tool's reviewed process-sandbox escalation in this environment. The coordinator independently reran both browser tests after integration: two browser checks and two static security checks PASS, zero FAIL. Node's `--test` wrapper reports core/security file-level counts in this host; running each script directly shows nine core and two security assertions.
