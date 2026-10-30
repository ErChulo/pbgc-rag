# Security model

Status: initial architecture security review, October 30, 2026. This is not a security certification or authorization to process confidential records in a remote development environment. Only synthetic fixtures belong in this public repository.

## Trust boundaries

A user-selected document and a portable case package are untrusted bytes. Parsing must never execute scripts, macros, formulas, external references, attachments or embedded SQL. Parsed excerpts and file names must render through text-only DOM APIs. Documents, derived records and interpretations are separate layers; a document excerpt cannot approve a rule or establish an official determination.

The workplace runtime is local file:// HTML with adjacent assets. It must not call remote endpoints, resolve external document resources or load hosted fonts, models, analytics or updates. Development tooling and this upstream audit are separate from workplace execution. See ARCHITECTURE.md for the versioned package and parser contract.

## Controls required for the initial implementation

These are review criteria; acceptance requires actual tests in ACCEPTANCE.md, not this document alone.

| Risk | Required control and verification |
| --- | --- |
| HTML/script injection | Use textContent and static DOM construction; test adversarial names/excerpts containing HTML and event handlers |
| Network exfiltration | Local-only assets; CSP with connect-src 'none', object-src 'none', base-uri 'none' and form-action 'none'; browser request interception and offline file:// tests |
| Package tampering | Validate schema and bounds; recompute SHA-256 over decoded original bytes; reparse originals rather than trust supplied derived records |
| Source corruption | Preserve original bytes separately; never alter input documents; verify round-trip original hashes |
| Resource exhaustion | Bound source/package sizes, record count, nesting and query length; malformed input must fail clearly without partial workspace replacement |
| Regex denial of service | Do not expose unrestricted synchronous user regex; only a documented safe subset or bounded isolated execution with cancellation |
| Unsafe binary parsing | Reject unsupported binary formats explicitly until audited parsers and fixtures exist; do not treat binary bytes as text |
| Storage loss | Treat file:// browser storage as best effort; clearly show memory-only fallback and provide verified portable export/import |
| Cross-case disclosure | Keep workspaces isolated; replacement/import must not mix records from previous cases; test switching and clearing |
| False authority | Mark synthetic fixtures and unverified evidence; block official outputs and actuarial activation without required sources, validation and approval |

## Current limits

The architecture defines an initial text/CSV/TSV/JSON parser boundary and deterministic search, not complete binary ingestion, OCR, SQL, graph reconciliation, local AI, official artifact generation or actuarial validation. Unsupported paths must remain visibly unavailable. Parser correctness and browser security must be tested against the implementation after integration.

SHA-256 establishes integrity against an expected digest; it does not prove authorship or safety. An attacker who can replace a package can replace its hashes. Portable exports are plaintext and may contain original document bytes. They are not encrypted, authenticated or suitable for unrestricted sharing. Store and transfer them under the user's approved workplace controls. Source hashes, excerpts and file names may themselves be sensitive.

Browser storage is not an encrypted case vault. Browser profiles, operating-system users, extensions and other local software are outside this application security boundary. Clearing application memory does not securely erase operating-system caches or previously exported files. No enterprise Windows browser policy has been supplied; Linux Chromium evidence cannot establish enterprise acceptance.

## Future release gates

- Audit each vendored dependency, pinned version, license and local-only configuration before use.
- Add decompression budgets and archive-path protections before ZIP-based Office parsers.
- Add isolated bounded execution before general regex or complex graph traversal.
- Verify read-only SQL parsing and deny mutations and filesystem/network extensions before enabling SQL.
- Retain source versions and exact locators; do not let later amendments silently overwrite evidence applicability.
- Separate proposed interpretations, approved rules and deterministic numerical traces; block failed official exports.
- Test actual file:// execution, network isolation, malformed packages, storage failures, case isolation and independently calculated actuarial expectations.

Report security findings to the repository owner through an authorized private channel. Do not include confidential participant data, credentials or live restricted case documents in public issues or fixtures.
