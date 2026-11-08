# Larger-model test build

This branch keeps the stable 0.8 build separate. It includes **Qwen2.5 1.5B Instruct Q3_K_S** instead of Qwen2.5 0.5B Q4_K_M. More parameters do not guarantee better answers. The lower precision can affect answer quality. This is an experimental build for comparison.

## Start the app

1. Extract **PBGC-RAG-0.8-larger-model-office.zip** into its own folder.
2. Open **index.html**.
3. Choose **Get started**, then **Start Qwen**.
4. Add documents. Ask one specific question at a time.
5. Open **View evidence** to check each answer. For a PDF, choose **Original PDF page** to check the saved page.
6. Use **Save & reopen** to save a case file before closing the app.

No model picker, installation, server or network is needed. Keep the assets, vendor and models folders beside index.html. Start Qwen again when you reopen the app. The larger model can take longer to start and answer. Source passages remain available without Qwen.

Keep this build and the stable build in different folders. Save a portable case before moving work between builds. Import rebuilds and checks the original source bytes. Model weights are application assets, not case documents.

## Model and limits

| Item | Experimental build |
| --- | --- |
| Model | Qwen2.5 1.5B Instruct, about 1.54 billion parameters |
| Quantization | Q3_K_S, made from the original F16 GGUF |
| Model file | 760,944,640 bytes, about 726 MiB |
| Existing app cap | 805,306,368 bytes, 768 MiB; unchanged |
| Next candidate | Q3_K_M: 824,178,688 bytes; rejected because it exceeds the cap |
| Context | 2,048 tokens in the interface; adapter maximum 4,096 |
| Runtime | Single CPU thread, local WebAssembly; no GPU or network |
| Output | One source-checked factual sentence with a citation; the prompt requests exact source wording |
| Workload memory gate | 12 GB for the test process and full browser process tree |

The selected file is larger than the stable 491,400,032-byte model. It is the higher-precision candidate that fit among the two measured standard Q3 variants, not a claim to be the largest or best model in every model catalog. The factual-answer, unsafe-context and citation gates must pass without lower thresholds.

## Source and reproducibility

Source: Docker's public model distribution, **ai/qwen2.5:1.5B-F16**. The actual GGUF metadata identifies Qwen2.5 1.5B Instruct, architecture qwen2 and Apache-2.0. The source is 3,093,669,376 bytes, SHA-256 b6eaec3509f1d0373d1f4802654c4a7bfcde0768645d2d45e8885f6922b428ee.

Development quantization uses the same llama.cpp revision as the browser runtime: **4abef75f2cf2eee75eb5083b30a94cf981587394** (b7179), generic CPU build, Q3_K_S and four preparation threads. No previously quantized model is requantized. The resulting GGUF SHA-256 is **39feb79d0c05e4099cb928b0be0576b70dd7f166a08c8d3c756804260600df9d**.

The manifest, original OCI metadata, source license and quantization provenance are under vendor/local-llm. The separately published experimental weights asset is a development input; use the complete office ZIP to run the app. Preparation, downloads and compilation run only during development. They are not office runtime steps.

## Acceptance

Require real inference, source-bound answers and citations, cancellation and reload, source-only recovery, OCR, original PDF preview and byte-preserving source downloads. Require zero external requests, the unchanged quality thresholds and whole-process memory limits. Both Windows and Ubuntu must run the actual offline file profile and extracted complete package before an app prerelease is published. Verify the anonymous public package download and run its extracted app as a separate delivery check.

This branch is not merged into main. Neither the existing office-v0.8.0 tag nor its download is replaced. Experimental releases are prereleases and do not replace the latest stable release.

The [initial larger-model run](evidence/larger-model-initial-quality-fail.json) released two of four factual answers. Two paraphrases were correctly rejected by the grounding checks. The experimental prompt now explicitly requests the exact source sentence. The checks and minimum coverage threshold are unchanged; a fresh real-model evaluation is required.

The final concise select-and-copy prompt passed the unchanged local evaluation: three of four factual questions produced independently correct cited answers; the address question abstained when the model added unsupported wording. All four unsafe contexts were blocked. Factual responses took about 91–100 seconds on the tested CPU. This matches the stable model's small-corpus coverage threshold; it does not establish better general accuracy. The larger model has more parameters but also lower precision and slower CPU answers. Exact-head platform and public delivery checks remain required.
