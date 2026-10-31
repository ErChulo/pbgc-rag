# Whole-process resource acceptance

The workplace target is a CPU-only computer with approximately 16 GB RAM. Renderer JavaScript heap is only one part of browser memory and cannot establish that target. `tools/measure-resources.js` is development tooling that measures the harness Node process and its complete Chromium descendant tree, including browser, renderers, worker hosts and utility processes. None of this tooling is needed by the delivered app.

## Workload and acceptance

The benchmark loads the actual, exact-hash Qwen model, builds a real 384d learned sentence index over about 1 MiB of synthetic text across 128 documents, retrieves four question topics, and generates one short source-bound answer. Original synthetic source hashes and exact record locations are retained. The retirement-age answer must resolve to the correct exact source quotation; recording performance alone does not pass an incorrect answer. The report also retains ranks/weak-retrieval flags for widow, medical and address questions. Those four ranks are diagnostics, not a production quality certification.

Default budgets are **12,000,000,000 bytes** for the combined workload and **300 seconds** overall, leaving 4 GB of a 16 GB machine for its OS and other applications. Sampling begins before browser launch. Crossing the memory or elapsed-time budget terminates the browser and fails the run. There is no automatic pass when metrics or weights are missing. This workload exercises model/index/retrieval/generation, not document parsers, recovery, OCR or concurrent desktop workloads.

## OS measurements

- **Linux:** `/proc/PID/stat` provides parent relationships, stable start identifiers and user/system CPU ticks. `/proc/PID/smaps_rollup` provides RSS, proportional set size (PSS), and private resident bytes. The report includes whole-tree and browser-only peaks. PSS is preferred for the memory budget because it apportions shared physical pages; a sample without complete PSS conservatively falls back to summed RSS. CPU high-water marks retain sampled exited processes and distinguish reused process IDs.
- **Windows:** a persistent PowerShell collector reads process parent IDs, `WorkingSet64`, private committed bytes and `TotalProcessorTime`. The collector process itself is excluded. Summed WorkingSet can double count shared pages; it is a conservative resident-memory metric, not PSS. Private bytes are reported separately and do not mean all committed pages are resident. A missing or failed collector fails acceptance.

The requested interval is 200 ms. Actual mean interval and maximum gap are recorded because OS collection can take longer. Peaks are sampled lower bounds between observations; very brief spikes and short-lived CPU work can be missed. Linux sampling overhead is included in the Node measurement. Other processes on the machine are outside the measured workload, while machine RAM/CPU/OS metadata are recorded. Linux cgroup memory and CPU quotas are recorded separately from host capacities; a large host is not described as a 16 GB test machine. No process command lines, environment variables, document paths or credentials are captured.

## Commands outside the office

```bash
# Supplementary local HTTP evidence; owns and closes its loopback server.
node tools/measure-resources.js --http --out test-results/resources-http.json

# Actual workplace file profile; disables browser networking, creates no app HTTP server.
node tools/measure-resources.js --file --out test-results/resources-file.json

# Tests measurement correctness and requires real model acceptance when opted in.
PBGC_RUN_RESOURCES=1 PBGC_RESOURCE_FILE=1 node tests/rag-resources.test.js
```

`CHROMIUM_PATH`, `PBGC_MODEL_PATH`, and supplementary `PBGC_TEST_URL` are respected. An actual-file run never substitutes HTTP when policy blocks file entry. Playwright uses a development-only control WebSocket to obtain and monitor the browser process; the delivered application has no dependency on that control channel or server. Run the real-model benchmark serially with other inference tests; contention otherwise distorts timings. The default output is `test-results/resources-file.json` or `resources-http.json`.

## Evidence status

Eight measurement-helper tests pass for process ancestry, exclusion of the sampler subtree, shared-memory accounting, exited/reused CPU identities, hard-budget notification, bounded corpus generation, Windows collector fields and a live OS process measurement. The actual model benchmark is a distinct gate. Its current machine-specific results are recorded in the generated JSON, not inferred from helper tests. Windows whole-process evidence and the actual-file profile require their own runs; local HTTP evidence does not establish them.

Initial broad-corpus local evidence completed the learned index in 56.8 seconds with a combined peak PSS of 1.77 GB, but the overall run **FAILED** because a possible-conflict precheck blocked the otherwise supported retirement question before generation. That is not a full resource acceptance pass. The corpus was kept unchanged while grounding logic was repaired; a complete post-repair model run is required.

## Coordinator measured run

The final supplementary HTTP run passed on the synthetic 1 MiB/128-source/748-chunk workload: indexing 54.4 seconds; actual Qwen generation and grounding 34.4 seconds; sampled whole-process proportional memory peak 1,778,615,296 bytes (about 1.78 GB). The correct age answer retained its exact supporting quotation. The 12 GB workload threshold was not exceeded. This is a measured workload on this cloud host, not certification of maximum case sizes, OCR/parser peaks, all desktop processes or a particular office machine. Linux/Windows actual-file measurements are required in CI. Earlier failed runs are not acceptance passes.
