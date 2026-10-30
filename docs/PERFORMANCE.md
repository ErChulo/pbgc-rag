# Synthetic development workload

This is supplementary Linux Chromium/HTTP evidence, not Windows 11 enterprise acceptance or a 16 GB process-memory guarantee. Run `PBGC_TEST_URL=http://127.0.0.1:8765/ node tests/performance.test.js` with development browser tooling and a loopback server. The managed environment needs reviewed process-sandbox escalation. The test itself records current timings; the sample below is not a performance promise.

Independent verification on October 30, 2026 used 18,000 text records (1,889,999 original bytes). All operations preserved source evidence and remained under the test's broad safeguards.

| Operation | Sample elapsed |
| --- | ---: |
| Worker import, hashing and recovery | 1,176 ms |
| Keyword query | 148 ms |
| BM25 lexical ranking | 143 ms |
| Read-only record SQL | 111 ms |
| Build/validate/traverse graph, bounded at 100 nodes | 1,141 ms |
| Reparse/verify/export case | 604 ms |
| Full workload | 3,472 ms |
| Abort isolated synthetic busy parser | 11 ms |

The renderer reported about 127.7 MB used / 212.3 MB allocated JS heap in that run. These figures exclude parser workers, browser processes, native allocations, operating-system caches and peak whole-system memory. They cannot establish the workplace RAM budget. Worker heartbeat checks show the page stayed responsive during the cancellation test. Browser hard termination enforces elapsed deadlines, not per-worker memory quotas.

Legacy DOC/XLS generated-worker dispatch, exact stored formula metadata and portable bytes have separate browser/unit checks. The extracted-package test independently verifies packaged hashes/assets and actual worker import/search using only files extracted from the built ZIP; the repository files cannot mask missing packaged assets.

Expand malformed-document, large-format and actual enterprise profiling before final release. No official calculation or real participant data is used in these benchmarks.
