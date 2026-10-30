# Specification status

KICKOFF.md is the authoritative requirements baseline and DESIGN.md governs visuals/editorial choices. No requirement is waived by the initial implementation.

The current increment covers isolated active-case memory, best-effort recovery, verified portable source-byte packages, bounded UTF-8 text/CSV/TSV/JSON parsing, keyword/exact retrieval with locators, a local classic-script shell, light/dark themes and a hash-routed guide. Search provides excerpts, not legal or actuarial conclusions. See ARCHITECTURE.md interface v1 and ACCEPTANCE.md for evidence and gaps.

A source version is its SHA-256 over original bytes. Parsed text uses versioned locators. Changed source bytes are imported as another source version; equal bytes are skipped. Library-wide references, applicability dates, authority/conflict reconciliation and source-version relationships are future schema work.
