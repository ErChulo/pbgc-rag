# Upstream and browser audit

Audit date: October 28, 2026. Only synthetic/public material was inspected.

## Upstream RAG-Anything

Target: <https://github.com/HKUDS/RAG-Anything>.

Status: **PASS for source inspection; runtime integration untested**. An approved command context used the inherited HTTPS proxy to clone public upstream into `/tmp/pbgc-rag-anything-audit`:

```sh
git clone --depth 1 https://github.com/HKUDS/RAG-Anything.git /tmp/pbgc-rag-anything-audit
git -C /tmp/pbgc-rag-anything-audit rev-parse HEAD
```

Verified revision: `2cd2b3329c470ccb53923f8a6d320596b34e56c5`. Package version in `raganything/__init__.py`: `1.4.5`. License: MIT, copyright 2025 Data Intelligence Lab@HKU. Any future substantial code reuse must preserve its copyright and permission notice. The earlier restricted-command `ECONNREFUSED` did not establish unavailable upstream access: the same HTTPS proxy works in the approved context. No direct-network fallback was used.

### Dependency inventory

Verified from upstream `pyproject.toml` and `requirements.txt` at that revision. Python requirement: `>=3.10`. Core dependencies are `huggingface_hub`, `lightrag-hku<1.5`, `mineru[core]>=3.4.1,<4` for Python below 3.14, and `tqdm`. Build requirements are `setuptools>=64` and `wheel`. These are dependency constraints, not a fully resolved or vulnerability-audited lockfile.

Optional extras include Pillow (image), reportlab (text), PaddleOCR/pypdfium2, markdown/weasyprint/pygments, faster-whisper/PyAV (`av<19`) for audio, and scenedetect/moviepy/OpenCV for video. Office conversion requires the external LibreOffice program. Docling requires separate installation and is not included in `[all]`. Development declarations include pytest/pytest-asyncio, black/isort/flake8/mypy, openai, and python-dotenv. Upstream `setup.py` has a shorter optional-extras inventory than `pyproject.toml`; reproduce the selected build metadata deliberately rather than assuming both routes are identical.

### Architecture and profile fit

`raganything/raganything.py` defines the Python `RAGAnything` dataclass, composed from query, processor, and batch mixins. It accepts text LLM, vision, and embedding function callbacks and a LightRAG instance/configuration. `processor.py` coordinates parser output, text chunk insertion, multimodal image/table/equation handling, caching, and processing status. `query.py` layers retrieval/query functionality over LightRAG; `parser.py` supports selectable parser backends. LightRAG storage choices are configurable, including key/value, vector, graph, and document-status stores. These observations are source inspection, not executed integration validation.

This Python pipeline cannot run as the mandatory no-install `file://` browser application. Reusable architectural ideas include separating original sources, parser records, provenance, graph claims, derived calculations, and caches. Browser modules remain independently implemented; no upstream code or dependencies were copied into the product checkout.

Optional advanced development would require a separately isolated Python environment, selected parser/backend dependencies, local model assets, and explicitly local LLM/vision/embedding callbacks. The README states that default MinerU models download on first use; its examples also configure model endpoints. Do not use those defaults with confidential documents or claim offline readiness without testing all model/cache paths with network blocked. The README warns that trusted local Markdown image references can be sent to the configured vision model; this needs explicit ingestion restrictions. Office conversion and all parser subprocesses need a separate untrusted-input security review.

No optional Python stack, OCR models, LibreOffice, audio, or video dependencies were installed. They are not prerequisites of the selected dependency-free browser workflow. Upstream runtime tests, transitive license/security audit, model provenance, and offline integration are **UNRUN**, not passed.

## Available browser tooling

- **PASS:** `/usr/bin/chromium --version` reports Chromium 154.0.8037.57 on Debian GNU/Linux 13.
- **PASS:** Node can resolve the installed `playwright` package. Python can locate `playwright`.
- **BLOCKED in the restricted command sandbox:** Playwright could not launch `/usr/bin/chromium` for a `file:///workspace/pbgc-rag/DESIGN.md` navigation. The browser exited with SIGTRAP after Crashpad reported `setsockopt: Operation not permitted`.
- **BLOCKED in the restricted command sandbox:** A diagnostic retry with crash reporting disabled reached a different browser startup failure: `sandbox_host_linux.cc` reported `shutdown: Operation not permitted`, followed by SIGABRT.

The approved command context permits Chromium startup, but managed browser policy is a separate restriction. `/etc/chromium/policies/managed/urls.json` contains `URLBlocklist: ["*"]` and allows HTTP/HTTPS/WSS and selected Chrome pages; it does not allow `file://`. The coordinator's actual file navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`. Do not alter or bypass that policy. A secondary loopback HTTP browser check can validate app interactions but cannot satisfy required workplace `file://` acceptance.

These results do not establish Windows enterprise-browser support. Do not report browser acceptance from static checks, HTTP-only execution, or a zero-test run. See the current acceptance record for actual application check outcomes.

## Required browser/security checks

1. Load the real application through `file://`; record page exceptions and failed resource loads. An HTTP server does not substitute for this check.
2. Block all HTTP, HTTPS, and WebSocket destinations at browser-context level, record attempted requests, and assert that the complete synthetic import/search/export workflow makes none. Browser-background traffic and application traffic should be identified separately.
3. Exercise missing-storage, unavailable-worker/WASM/model, and blocked-file-capability paths. Verify deterministic search fallback and portable export/import recovery.
4. Test malicious imported HTML/XML/text as inert data, active document content rejection, read-only SQL enforcement, regex/graph/resource bounds, and source-locator integrity.
5. Check keyboard flow, accessible names, focus, contrast, dark/light themes, malformed fixture handling, export validation failures, and clear blocked-official-output status.
6. Run independent numerical expected-value tests before actuarial acceptance. Official templates, field dictionaries, grammar, reference data, and enterprise browser policies require their actual approved fixtures; absence is **BLOCKED**, never **PASS**.

Use only synthetic fixtures in this public repository and cloud environment. No confidential PBGC material is needed for these engineering checks.
