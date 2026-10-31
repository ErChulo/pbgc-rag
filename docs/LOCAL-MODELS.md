# Offline model pack

The workplace application runs model inference locally. It makes no network request for a tokenizer, weights, inference, telemetry or updates. Keep the extracted core build's adjacent `assets` and `vendor` folders intact.

## Included in the core build

The portable 0.4 core ZIP includes a learned sentence encoder and its tokenizer/weights, plus the single-thread WebAssembly generation runtime. These assets load locally when needed. The generation runtime is wllama 2.3.7 with its licensed llama.cpp dependency. Source-bound chunks and cosine/lexical retrieval remain distinct from generated answers. A retrieval score is not a probability that an answer is correct.

The larger instruction-model GGUF is distributed separately. It is not a source document, a recovery record or part of a case export. Source-document import limits do not apply to the model picker. The local generation adapter accepts one verified GGUF of at most 768 MB; additional runtime/context/output limits are documented in [LOCAL-LLM.md](LOCAL-LLM.md). A browser must permit Blob workers and the required WebAssembly features. No enterprise browser policy is changed by the application.

## Prepare the separate pack on a development machine

This command uses Python's standard library to download public licensed weights and verify every part and the combined file. It is a development/distribution step, not a workplace dependency:

```sh
python tools/prepare-models.py
python tools/prepare-models.py --verify-only
```

The result is `dist/models/qwen2.5-0.5b-instruct-q4_k_m.gguf` and its manifest. Existing verified output is reused. `--parts-dir PATH` combines already downloaded `part-01.bin` through `part-06.bin` without network access. A corrupt, missing or mismatched local part rejects explicitly.

The prepared Qwen2.5 0.5B Instruct Q4_K_M file is 491,400,032 bytes. Its SHA-256 is:

```text
74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db
```

The pinned public distribution is [singulyar-llm, weights-v1](https://github.com/rtynbirf/singulyar-llm/releases/tag/weights-v1). Only the six weight parts are used; prompts, instructions and other project files from that repository are not part of this application. Part/whole hashes were checked against that distribution's published manifest. This does not claim independent verification against an inaccessible upstream model host. Model license: Apache-2.0; preserve the bundled model license/provenance records when redistributing. The manifest in `vendor/local-llm` records the exact file, byte length, hash, license and distribution source.

## Use the prepared pack offline

1. Transfer the core ZIP and prepared model pack through your approved local process.
2. Extract the core ZIP and double-click `index.html` in a policy-permitted browser.
3. Create/select a workspace and import the documents to review.
4. In **Ask documents**, select the local GGUF and load it. The supplied Qwen manifest is the default. A custom supported model requires its own valid JSON manifest.
5. Ask a question. Review the answer's supporting quotations with **View evidence**.

The interface must report model loading, indexing, cancellation and errors. A missing or unavailable generation model is an explicit extractive/search fallback, not a claim that an LLM produced an answer. Unload frees the generation worker. Cancelling a model operation terminates that worker; reload the model before generating again.

Model weights can remain loaded while the workspace changes, but retrieved evidence and answers belong to the selected workspace. Prompt cache state must not carry a previous question or case into a new generation. The model itself is a small general-purpose instruction model; it is not a PBGC authority and has no approved actuarial interpretation.

## Verification status

Real embedding retrieval and actual GGUF generation require their own tests. Mock-provider, parser and orchestration tests are narrower evidence. Current PASS/FAIL/BLOCKED results, citation checks, browser profiles and measured resource limits belong in [ACCEPTANCE.md](../ACCEPTANCE.md). This document does not assert that integration, model quality, Windows workplace policy or the 16 GB whole-process memory target has passed.
