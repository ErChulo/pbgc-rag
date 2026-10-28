# Security boundaries

Use synthetic data in this public repository and cloud environment. Real case records and restricted official materials belong only in an approved local workplace environment.

The app has no network client, telemetry, CDN, remote fonts, or update checks. CSP blocks connections, objects, forms and workers. Classic scripts and local styles allow double-click deployment where browser policy permits it. All imported user content is rendered with textContent. HTML is parsed as inert source text; imported scripts, macros, external resources and formulas never execute.

Inputs are bounded by source size, parser depth and record count. Query execution rejects unsupported syntax; regex uses nonbacktracking token simulation. SQL is a read-only restricted query language, not arbitrary SQLite execution. Graph traversal has explicit node/edge/depth/result limits and source provenance.

Packages check JSON shape, version, unsafe keys, SHA-256 payload integrity, source-byte hashes, evidence references and synthetic calculation replay. Hashes detect corruption; an attacker can recompute them, so they provide no authorship assurance. Approval records are audit metadata, not authenticated identities or a digital-signature system. Official release remains blocked even if a package claims a human approval.

Browser storage is plaintext and best effort. No encryption, access control, multi-user security, or durable backup is claimed. Export a portable package before closing. Cases are independent and queries receive only the active case, but local storage in the same browser profile is not a security boundary against another user with access to that profile. No application data should be committed.

Known required follow-up: adversarial binary parser review, hostile large-file performance, enterprise browser file/storage behavior, comprehensive accessibility audit, and authorized workplace deployment review. Do not weaken managed policy or TLS verification to make tests pass.


Reference-library persistence and package formats are separate from cases. Sharing consent and explicit source selection are required in the UI; the software cannot classify confidential text. Case copies pin reference editions and never copy graph/rule/approval state. Import checkpoints commit case and separately bound manifest atomically; stale manifests refuse rather than mixing state. Recovery quarantines corruption, never automatically rolls back, and requires explicit pruning to delete old history.

The local PDF.js bundle is pinned and licensed with recorded integrity/source hashes. Runtime loading accepts bytes only, embedded resource factories only, main-thread fake worker, disabled WASM/XFA/font installation, and no remote document/assets URLs. Independent preflight rejects unsupported structures and enforces decoded-stream/content bounds; no hard wall-clock interruption or comprehensive PDF fuzzing acceptance is claimed. GUI typography remains locally installed Arial/system fallback; bundled PDF font bytes are parser resources only.
