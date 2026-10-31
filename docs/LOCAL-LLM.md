# Offline local generation

The generation adapter runs actual GGUF inference with a pinned, single-thread CPU build of `@wllama/wllama` 2.3.7 (MIT), backed by llama.cpp b7179-4abef75 (MIT). This is separate from semantic retrieval. No generation server, GPU, SharedArrayBuffer or network is required.

`vendor/local-llm/wllama-classic.js` is loaded lazily as a local classic script. The pinned upstream JavaScript and single-thread WASM are retained under `vendor/local-llm/upstream`; `python tools/build-local-llm.py --check` reproduces and validates the bundle. Changes embed the WASM bytes, use a classic Blob worker, disable worker network/import entrypoints, and disable model URL/download entrypoints. The page CSP permits only local scripts plus `wasm-unsafe-eval`, Blob workers, and no connections. This does not permit JavaScript `eval`.

## Local model pack

The tested model is Qwen2.5 0.5B Instruct Q4_K_M, Apache-2.0, 491,400,032 bytes, SHA-256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`. Its small manifest is tracked; the weights are a separate local model pack and are never added to Git or treated as source documents. Download provenance is the public GitHub `rtynbirf/singulyar-llm` `weights-v1` release, which distributes six parts and publishes their hashes and the whole-file hash. The mirror identifies these as the original Qwen weights; we independently verify the distributed bytes against its manifest, not against an inaccessible upstream hosting service. Do not import the mirror's unrelated prompts or instructions.

The browser requires the user-selected local GGUF plus a manifest containing exact filename, byte count, digest, source, license and ChatML/plain prompt format. Loading validates GGUF version and full SHA-256 before inference. It does not fetch model URLs. Keep the model pack and its manifest with the workplace distribution.

## Adapter API

After loading the runtime script and `assets/local-llm.js`:

```js
const provider = await PBGCRag.createLocalLlmProvider({
  files: fileInput.files,
  manifest,
  contextSize: 2048,
  timeoutMs: 120000,
  generationTimeoutMs: 120000,
  signal,
  onProgress: ({phase}) => { /* hashing, loading, ready */ }
});
const text = await provider.generate({prompt, maxTokens: 256, temperature: 0, signal, onToken});
await provider.dispose();
```

`info()` reports model/runtime identity, limits and loaded/disposed state. Only one request may run at a time. Every generation sets `useCache:false`; the pinned runtime explicitly calls `kvClear()` before decoding the entire new prompt. No previous case/question prompt is reused. Generation alone produces untrusted text; `answerQuestion()` must validate citations and claims before displaying it as an answer.

Limits: one model up to 768 MiB; context 256–4096 tokens; output 1–512 tokens; prompt at most 24,000 characters; deadlines at most 180 seconds. Prompt and output must fit the context. Cancellation, deadline or runtime errors terminate the worker and mark the provider disposed. The UI must ask the user to reload the local model before further generation. This prevents continuing with uncertain model state and releases the worker. Input/context errors do not dispose a healthy provider.

## Verification

`tests/local-llm.test.js` exercises real inference, streamed cancellation, disposed-state rejection and external-request isolation. Set `PBGC_MODEL_PATH` to the GGUF path and `PBGC_REQUIRE_MODEL=1` to make a missing model fail. Without that mandatory flag, an absent model produces an explicit skipped test, never a model-inference pass. `PBGC_TEST_URL` selects supplementary HTTP; the default tests actual `file://`. Browser policy can block the latter before application load; HTTP evidence cannot replace it.

A local narrow-CSP HTTP probe on 2026-10-31 loaded the verified Qwen model in 2.57 seconds and generated “The normal retirement age is 65.” from a synthetic source in 26.26 seconds on one CPU thread. Metadata reported 24 layers, 896 embedding dimensions and 151,936 vocabulary entries. These are measurements of this environment, not performance guarantees for workplace machines. Broader quality and actual file-profile results are recorded by the integration suite.

The local provider declares `answerFormat:plain-grounded-v1`: it generates one short factual sentence. The RAG layer independently selects an exact supporting source sentence, checks every substantive answer term plus numeric/entity/negation/qualification guards, and attaches that sentence’s original citation. These citations are selected by code, not emitted by the model. Unsupported, joined or malformed answers are rejected. This conservative mode can abstain on valid paraphrases; it does not prove entailment.
