# Autonomous development verification

The workplace app has no server, Node, Python, installation or network requirement. The tools here are development-only. All fixtures and test workspaces are synthetic. These commands do not publish or push anything.

## One command owns the full browser lifecycle

```sh
node tools/verify-browser.js
```

The supervisor scans first-party source, starts a static server bound to **127.0.0.1 on an ephemeral port**, and asynchronously starts `node tools/check.js --browser` with the server URL in `PBGC_TEST_URL`. Its event loop keeps serving while the child suite runs. It waits for the entire suite, propagates its exit code, then closes the server. There is no separately managed test-server session to stop too early. Only `index.html`, `assets/` and `vendor/` are served; directory listings, repository metadata, non-GET/HEAD methods and escaping symlinks are denied.

Output is explicitly labeled **SUPPLEMENTARY HTTP ONLY**. A passing HTTP run does not establish actual `file://` workplace acceptance. The runner writes bounded logs and a versioned JSON result under ignored `test-results/verification-supplementary-http.*`. Defaults: ten-minute timeout and a 20 MB log budget. `--timeout-ms N` accepts 100–3,600,000 ms. Timeout exits 124; interrupt/termination exits 130/143; child failures retain their nonzero code. On POSIX, termination targets the owned child process group. Windows uses its built-in taskkill utility for the owned child process tree, with direct-child termination as a fallback. Windows process-tree behavior has not been independently verified in this Linux environment.

To test actual local files:

```sh
node tools/verify-browser.js --file
```

File mode starts no HTTP substitute and removes any inherited `PBGC_TEST_URL`. It makes no browser-policy changes. The same complete suite includes some explicitly supplementary package/lifecycle tests that own their own loopback servers; app browser tests use actual file URLs in this mode. An administrator denial is recorded as BLOCKED and remains a nonzero exit. Tests on an unmanaged CI browser establish evidence only for that tested browser, not locked-down Windows workplace approval.

## Prerequisites and evidence

Use Node 24, Python 3.12, Playwright 1.62.1 and a compatible Chromium as development tools. Tests read `CHROMIUM_PATH`, defaulting to `/usr/bin/chromium`; the CI workflow uses Playwright's installed Chromium path. The repository has no workplace package-install step. Browser process/socket restrictions in a managed coding environment may require the execution tool's normal reviewed sandbox escalation; do not modify enterprise browser policies or bypass network controls.

The source-only scanner is also available separately:

```sh
node tools/verify-browser.js --scan-only
```

It inspects first-party source extensions in the repository root and `assets`, `tests`, `tools`, `docs`, `fixtures` and `.github`. It excludes `.git`, runtime credential/config directories, dependency directories, generated builds/results and all symlinks. It does not read process environment values, credential files or external user documents. Findings contain only relative path, line and category, never matched token values. Checks cover high-confidence token/private-key markers and personal absolute paths; this is not a PII classifier, a full secrets audit or a substitute for reviewing source changes.

`node tests/automation.test.js` checks scanner behavior without opening sockets. The supervisor sets `PBGC_AUTOMATION_NETWORK_TEST=1` for the full child suite, enabling additional real loopback lifecycle tests: delayed child access, cleanup, failure propagation, timeouts and actual-file mode isolation. Those are skipped during a plain sandboxed nonbrowser run unless explicitly enabled.

## CI

`.github/workflows/verify.yml` runs on push, pull request or manual dispatch with read-only repository permissions. It installs pinned development Playwright in the runner's temporary directory, runs supplementary HTTP and actual-file verification, and packages only a passing source build. The workflow runs an Ubuntu/Windows matrix. GitHub-maintained Node24 actions are pinned to full verified commit SHAs, and matrix jobs use distinct artifact names. Full transitive action/browser supply-chain attestation is not claimed.

Artifact upload is narrowly scoped to generated verification logs/JSON and the portable source-build ZIP, retained for seven days. No arbitrary workspace, case export, user upload, credential directory or temporary-directory glob is uploaded. Keep confidential case material out of this public repository and out of CI. The generated source bundle and manifest are not official PBGC outputs or a publication operation.

On failure, `tools/ci-summary.js` publishes at most 12 bounded, escaped synthetic test names as annotations/step summary. It does not publish captured diagnostic values or arbitrary workspace files, so public status can be inspected without exposing case data.
