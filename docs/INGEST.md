# Isolated local ingestion

`PBGCRag.parseIsolatedBytes(name, bytes, {signal, timeoutMs}?)` returns a Promise of the normal `{parserVersion, records, warnings, format?}` parser result. `bytes` must be a Uint8Array no larger than 5 MB. Names are bounded to 255 characters. `signal` is an optional AbortSignal. The default and maximum active-parser deadline is 15,000 ms; callers may choose an integer from one to 15,000 ms.

The module owns one active classic Blob worker and a queue of at most eight additional requests. It snapshots input bytes, transfers a separate copy and leaves caller bytes intact. Queued cancellation removes the request before execution. Active cancellation and timeout terminate the worker. Completion, document rejection, worker errors and message-transfer errors terminate the worker and revoke its Blob URL. The caller owns workspace changes and must commit only after the Promise resolves and its own integrity checks pass. This module never mutates a workspace.

## Worker asset

`vendor/ingest-worker-source.js` is generated from our authored local parser modules by:

```sh
python tools/build-ingest-worker.py
python tools/build-ingest-worker.py --check
```

The builder is development tooling only. The generated asset contains a source string and SHA-256 inventory of the source modules. It includes core.js and formats.js plus legacy.js and sqlite.js when available. Rebuild it whenever any included parser changes. Runtime startup creates a Blob from that local source string; no fetch, importScripts, dynamic Function, eval, network request or external worker import is used. The worker overrides fetch, XMLHttpRequest, WebSocket, EventSource, importScripts and nested Worker construction to throw. The page must also enforce `connect-src 'none'` and permit `worker-src blob:`. Parser limitations and archive/text bounds remain enforced inside isolation.

Dispatch:

- DOC/XLS: `parseLegacyBytes(name, bytes)` when the legacy module is in the generated asset
- SQLITE/SQLITE3/DB: `parseSqliteBytes(bytes)` when the SQLite module is in the generated asset
- Other supported formats: `parseBytes(name, bytes)`

PDF has a separate adapter and is intentionally not included here. Unsupported files fail explicitly.

## Browser-policy fallback

Binary Office, legacy and SQLite files require a working local Blob worker. Missing assets/APIs, constructor blocking or worker startup errors produce explicit capability errors; binary parsing never falls back to the UI thread.

When worker APIs/assets are missing or construction fails, only TXT, MD, CSV, TSV, JSON, HTML, HTM and XML at or below 128 KiB may use the existing deterministic bounded parser on the UI thread. This fallback yields once and checks cancellation before/after parsing; it cannot interrupt a synchronous parse in progress. Larger text also requires isolation. Worker runtime errors reject rather than silently retry on the UI thread.

## Verification

`node tests/ingest.test.js` runs unit tests for concurrency, queue bounds, input copies, cancellation, timeout, worker errors, URL cleanup, fallback and asset freshness, then a real Chromium test on an intercepted local HTTP origin with strict CSP. The latter verifies genuine Blob-worker parsing, invalid binary rejection, forced worker timeout, cancellation, recovery and absence of requests leaving the local origin. Chromium requires the managed tool's reviewed process-sandbox escalation here.

This is supplementary development evidence. Managed Chromium still blocks actual file:// pages by administrator policy. No browser policy is changed; successful local-HTTP Blob workers do not establish enterprise file:// acceptance.
