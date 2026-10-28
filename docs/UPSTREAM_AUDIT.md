# Upstream and browser audit

Audit date: October 28, 2026. Only synthetic/public material was inspected.

## Upstream RAG-Anything

Target: <https://github.com/HKUDS/RAG-Anything>.

Status: **BLOCKED**. The read-only command below used the inherited HTTPS proxy:

```sh
git ls-remote https://github.com/HKUDS/RAG-Anything.git HEAD
```

It exited with status 128: `Failed to connect to proxy port 8080 after 0 ms: Could not connect to server`.
This establishes a failed proxy connection, not an upstream authorization or license failure. No direct-network fallback was attempted.

No upstream revision, license, dependency inventory, or architecture was verified. No upstream source or dependency was imported. Before any future import, restore supported proxy access, record the exact upstream commit and license, inspect its dependency manifests and local/cloud model integrations, and assess compatibility with the mandatory offline browser profile. Python RAG-Anything must remain optional development functionality and cannot become a workplace runtime dependency.

## Available browser tooling

- **PASS:** `/usr/bin/chromium --version` reports Chromium 154.0.8037.57 on Debian GNU/Linux 13.
- **PASS:** Node can resolve the installed `playwright` package. Python can locate `playwright`.
- **BLOCKED in the restricted command sandbox:** Playwright could not launch `/usr/bin/chromium` for a `file:///workspace/pbgc-rag/DESIGN.md` navigation. The browser exited with SIGTRAP after Crashpad reported `setsockopt: Operation not permitted`.
- **BLOCKED in the restricted command sandbox:** A diagnostic retry with crash reporting disabled reached a different browser startup failure: `sandbox_host_linux.cc` reported `shutdown: Operation not permitted`, followed by SIGABRT.

These results do not establish application behavior, a Chromium incompatibility, or Windows enterprise-browser support. An approved execution context capable of Chromium's required local process/socket operations must run the actual browser tests. Do not report browser acceptance from static checks or a zero-test run.

## Required browser/security checks

1. Load the real application through `file://`; record page exceptions and failed resource loads. An HTTP server does not substitute for this check.
2. Block all HTTP, HTTPS, and WebSocket destinations at browser-context level, record attempted requests, and assert that the complete synthetic import/search/export workflow makes none. Browser-background traffic and application traffic should be identified separately.
3. Exercise missing-storage, unavailable-worker/WASM/model, and blocked-file-capability paths. Verify deterministic search fallback and portable export/import recovery.
4. Test malicious imported HTML/XML/text as inert data, active document content rejection, read-only SQL enforcement, regex/graph/resource bounds, and source-locator integrity.
5. Check keyboard flow, accessible names, focus, contrast, dark/light themes, malformed fixture handling, export validation failures, and clear blocked-official-output status.
6. Run independent numerical expected-value tests before actuarial acceptance. Official templates, field dictionaries, grammar, reference data, and enterprise browser policies require their actual approved fixtures; absence is **BLOCKED**, never **PASS**.

Use only synthetic fixtures in this public repository and cloud environment. No confidential PBGC material is needed for these engineering checks.
