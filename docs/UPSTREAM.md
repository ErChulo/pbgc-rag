# RAG-Anything upstream review

Reviewed October 30, 2026. **PASS: pinned source, license, declared direct-dependency and architecture inspection. BLOCKED: resolved transitive inventory, advisory audit and runtime offline validation.** No upstream code or dependencies were imported into the workplace application.

## Source and method

Upstream: <https://github.com/HKUDS/RAG-Anything>.
Pinned revision: `2cd2b3329c470ccb53923f8a6d320596b34e56c5`.
Package version declared by `raganything/__init__.py`: `1.4.5`.

The initial sandboxed `git ls-remote` failed to reach the inherited proxy. The coordinator verified that an approved sandbox escalation resolved this boundary. Source retrieval then succeeded through the inherited proxy using:

```sh
git clone --depth 1 https://github.com/HKUDS/RAG-Anything.git /tmp/pbgc-upstream-audit
git -C /tmp/pbgc-upstream-audit rev-parse HEAD
```

The clone stayed in a temporary development directory. No upstream code was executed; no Python dependencies or models were installed. Files inspected: LICENSE, pyproject.toml, requirements.txt, setup.py, env.example, docs/offline_setup.md and the Python modules cited below. This is a source review, not a successful upstream application test.

## License

[LICENSE at the pinned revision](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/LICENSE) is MIT, copyright `2025 ✨Data Intelligence Lab@HKU✨`. Copies or substantial portions require preservation of the copyright and permission notice. The license disclaims warranty. This license finding covers this repository's code, not separately licensed dependencies, model weights or assets. Those need their own inventory before distribution.

## Declared dependency inventory

The source requires Python `>=3.10`. The following declarations are from pinned [pyproject.toml](https://github.com/HKUDS/RAG-Anything/blob/2cd2b3329c470ccb53923f8a6d320596b34e56c5/pyproject.toml); requirements.txt agrees on the core requirements. These are ranges, not installed versions.

| Group | Declared requirements |
| --- | --- |
| Build | `setuptools>=64`, `wheel` |
| Core | `huggingface_hub`, `lightrag-hku<1.5`, `mineru[core]>=3.4.1,<4; python_version < "3.14"`, `tqdm` |
| image | `Pillow>=10.0.0` |
| text | `reportlab>=4.0.0` |
| office | No Python extras; external LibreOffice required |
| paddleocr | `paddleocr>=2.7.0`, `pypdfium2>=4.25.0` |
| markdown | `markdown>=3.4.0`, `weasyprint>=60.0`, `pygments>=2.10.0` |
| audio | `faster-whisper>=1.0.0`, `av<19` |
| video | `scenedetect[opencv]>=0.6.0`, `moviepy>=2.0.0`, `faster-whisper>=1.0.0`, `av<19`, `opencv-python>=4.8.0` |
| all | Union of the listed image, text, paddleocr, markdown, audio and video requirements |
| Development (tool.uv) | `pytest>=6.0`, `pytest-asyncio`, `black`, `isort`, `flake8`, `mypy`, `openai`, `python-dotenv` |

Compatibility notes in the manifests explain `lightrag-hku<1.5` as a multimodal extraction incompatibility with 1.5+, MinerU `<4` as a CLI incompatibility, MinerU `>=3.4.1` as a pdftext API correction and `av<19` as faster-whisper API compatibility. These are upstream explanations, not independently reproduced results.

Additional source observations: Docling is an optional parser selected through a registry but has no versioned extra in this pyproject; its code instructs users to install `docling`. The entry module directly imports `dotenv`, while python-dotenv is listed in development dependencies rather than direct core declarations. It may be transitively available, but this audit did not resolve that graph. Legacy setup.py extras differ from pyproject: its `all` omits the new audio/video packages and it has no audio/video extras. Use the actual selected packaging path when resolving an optional development environment; do not assume interchangeable manifests.

No resolved lockfile or SBOM was found by `rg --files -g '*lock*' -g '*requirements*' -g '*LICENSE*' -g '*sbom*'`. Therefore exact transitive versions, dependency licenses, installed size and vulnerability status remain **BLOCKED**, not PASS. No absence-of-vulnerabilities claim is made.

## Architecture and data flow

- `raganything/raganything.py`: `RAGAnything` combines `QueryMixin`, `ProcessorMixin` and `BatchMixin`; it accepts injected text LLM, vision LLM and embedding functions or a preinitialized LightRAG instance. Initialization selects a parser, creates a working directory and configures modality processors. Configuration supports LightRAG key-value, vector, graph and document-status stores; parse/completion caches use its key-value storage.
- `raganything/config.py`: default parser is MinerU, default parse method is auto, default working directory is `./rag_storage`, output directory is `./output`; image, table and equation processing default on; audio/video default off.
- `raganything/parser.py`: registry and base Parser plus MinerU, Docling and PaddleOCR implementations. MinerU uses a subprocess CLI. Docling uses a lazily loaded Python API and model-bearing converters. Office conversion paths invoke external LibreOffice. Parsed document content becomes typed text and multimodal content-list records.
- `raganything/processor.py`: document parsing, caching and text/multimodal insertion orchestration. `modalprocessors.py` provides context extraction and image/table/equation/generic processors, generating descriptions and entities/chunks for retrieval. Generated descriptions are model-derived material, not verified source facts.
- `raganything/query.py`: synchronous/async query entry points, multimodal query descriptions, caching and optional vision-enhanced query construction, delegated to LightRAG and supplied model functions.
- `batch.py`, `batch_parser.py`, `callbacks.py` and `resilience.py`: bounded-concurrency configuration, batch processing, progress/metrics callbacks and retry/circuit-breaker utilities. Their presence is not a verified workplace resource-budget guarantee.

All source paths above resolve under the pinned [tree](https://github.com/HKUDS/RAG-Anything/tree/2cd2b3329c470ccb53923f8a6d320596b34e56c5).

## Network and security findings

The upstream Parser accepts URLs: `_download_file` calls `urllib.request.urlopen` with a 30-second timeout and streams downloaded bytes into a temporary file. Thus local-only operation is not an invariant enforced by this source. The MinerU path warns about stalled model downloads; Docling can require local model artifacts. `docs/offline_setup.md` explicitly identifies LightRAG/tiktoken first-use tokenizer downloads and requires a prepopulated cache. That document alone does not establish that every parser, model and embedding backend runs offline.

`examples/raganything_example.py` imports OpenAI completion/embedding helpers and defaults the embedding model name to `text-embedding-3-large`. The core accepts injected functions, so remote inference is configurable rather than necessarily universal; the supplied example must not be used unchanged with confidential workplace data. `env.example` also describes optional public asset URLs and server configuration. Those are not approved workplace features.

This review did not execute parsers, test malformed archives, inspect every transitive dependency or certify telemetry absence. Optional development reuse requires pre-staged approved local models, explicit local-only backend selection, network-denial tests, parser resource limits, source-locator verification and dependency/license/advisory checks.

## Workplace decision

The inspected Python code, external parser programs and model/runtime dependencies cannot run directly as a double-clicked no-install file:// browser application. A server wrapper would violate KICKOFF.md. No workplace runtime reuse is proposed for this increment. Independently authored classic local JavaScript implements the browser contract; no upstream compatibility or feature equivalence is claimed.

An optional local development adapter may later exchange a versioned portable package after review. It must never require sending PBGC records to this remote coding environment, a cloud model or a network bridge from workplace mode. Preserve verified original-byte locators separately from generated summaries and graph descriptions.

## Remaining gates

Before optional integration: resolve and pin transitive dependencies for the selected platform; audit their licenses/advisories; verify model licenses and hashes; test full network isolation and document safety; record exact imported files and attribution; independently validate source locators and outputs. Official actuarial interpretations and artifact acceptance remain separate approval/validation gates.
