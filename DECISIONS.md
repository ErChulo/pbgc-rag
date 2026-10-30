# Decisions

- 2026-10-30: Start from the actual documentation-only repository; no earlier implementation was present to reapply.
- Use classic local scripts, not ES modules or fetch, for the workplace shell. No runtime dependencies or remote assets.
- Schema v1 stores original source bytes as base64 plus SHA-256 and parsed records. Restore discards supplied derived records and reparses verified bytes. Export is a case package, never an official artifact.
- Bound synchronous parsing/search tightly; expose keyword/exact only. General regex remains unavailable until bounded isolated execution exists.
- Treat file:// recovery storage as best effort. Portable exports remain necessary. Plaintext packages are not authenticated or encrypted.
- Reject binary formats and invalid UTF-8 explicitly. JSON pointers do not pretend to be source line locations; duplicate keys use native last-value behavior with a warning.
- Pinned upstream source/license/architecture inspection is complete. Keep Python-based upstream out of the mandatory workplace runtime; optional reuse still requires resolved dependency, security and runtime offline audits.
- Managed Chromium file:// policy must not be bypassed. Supplementary HTTP browser evidence is recorded separately from mandatory file:// acceptance.
