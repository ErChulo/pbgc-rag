# First-run wizard and built-in Qwen — 0.7

The 0.6 redesign still required a new user to understand cases, locate a model file and distinguish response modes. Those decisions were inappropriate prerequisites for a first answer.

## New user journey

1. Welcome: one primary Get started action and a guided synthetic example. The three steps are explained before the user starts. Advanced workspace navigation is not displayed.
2. Qwen: the included assistant is named and explained. Start Qwen reads the locally packaged model automatically. It does not ask the user to locate a file, sign in, install anything or connect to a service. Real reading/checking/starting progress is shown; Cancel setup, an actionable error and a source-passage fallback remain available. Continue appears when Qwen is ready. Its ready/not-started state remains visible in the header.
3. Documents: the first case is created automatically. The user chooses documents, not case metadata. The wizard enables local recognition for scanned PDF pages without a configuration decision. Original bytes remain unchanged and machine text is marked for review. Back preserves the current case and files.
4. First question: the question field is the main task. Written answers are selected automatically when Qwen is ready; source passages are used after the explicit no-assistant fallback. The synthetic example supplies a question button. Source links remain exact and a completion action leads into the ordinary workspace.
5. Return: Guided setup can be reopened without erasing work. Explicit Go to workspace keeps advanced workflows accessible. Existing saved case, source, graph and review formats remain unchanged.

## Interaction and visual design

PBGC palette, Arial, dark default, accessible light mode and the approved-artwork placeholder are retained. Short panel entry and button movement transitions provide continuity. Reduced-motion preference disables animations and transitions. Theme colors are not animated, avoiding transient low contrast while text colors switch. No remote fonts, illustrations, tracking or fabricated agency logo are used. Build 0.7 is visible in the footer.

Fresh Playwright screenshots were inspected for desktop welcome/Qwen and mobile guidance. Automated tests cover the actual wizard, example question, back/restart, missing pack, cancellation/retry, focus, source integrity, desktop/mobile layouts, both themes and reduced motion. Advanced regression tests deliberately use the visible workspace shortcut, while office acceptance uses the real first-run path.

## Offline model contract

The office ZIP stores Qwen as 59 sequential local classic-script chunks and a small pack description. The decoded original remains the same pinned 491,400,032-byte Qwen model. Raw GGUF is developer input and is not duplicated in the delivery ZIP. Each chunk is size/hash checked; the existing runtime then verifies the complete model hash before loading it. Pack paths and dimensions are bounded. Cancellation discards pending buffers; no raw model token bypasses existing source-grounding checks.

Packaging independently reconstructs the delivered scripts and checks their original model SHA-256. The extracted-package acceptance test starts Qwen with zero model file choosers, generates a real synthetic answer, checks exact citations, recognizes a scanned PDF and measures the full harness/browser process tree. This new startup path is measured separately from the existing raw-GGUF workload benchmark. Local HTTP is supplementary; Windows and Ubuntu actual offline file execution must pass CI before release.

The public source/core ZIP intentionally has no generation weights. Missing-pack guidance directs the user to the complete office package and allows source passages. Advanced manual model selection remains a developer option, not first-run setup. Official PBGC content/interpretation validation remains deferred.
