# Reviewed source reparsing

`js/reindex.js` adds an explicit parser-upgrade lifecycle. It reparses retained original bytes in the current case with the currently loaded local parsers. It does not migrate the case schema, edit originals, contact a service, activate a rule, infer a locator, or provide official acceptance.

Load the parser handlers, registry, ontology and artifact modules first. The module exposes `PBGC.reindexSources` and `PBGC.reindexLimits` through classic scripts and CommonJS.

## Preview and apply

```js
const ids = [caseData.sources[0].id];
const preview = await PBGC.reindexSources(caseData, ids, { apply: false });
// Display changes, recordMappings and unresolved. Obtain explicit human review.
const result = await PBGC.reindexSources(caseData, ids, {
  apply: true,
  reviewed: true,
  expectedCaseHash: preview.caseHash,
  expectedPlanHash: preview.planHash
});
// Only use this recomputed result. Persist through the verified case store.
if (result.applied) caseData = result.candidateCase;
```

Preview results include `schemaVersion:1`, `caseId`, `sourceIds`, `caseHash`, `planHash`, `status`, `applied:false`, `changes`, `recordMappings`, `unresolved` and `candidateHash`. A detached `candidateCase` is included only for a valid, unblocked plan. The module never mutates the input or writes storage. Callers must serialize their own case edits and persist the apply result; a preview candidate is informational.

Statuses are `unchanged`, `review-required`, `blocked` and, after successful apply, `applied`. A no-op has `applied:false`, adds no provenance, and returns `unchanged`, including after an apply request. A blocked preview omits the candidate. Applying a blocked plan throws and leaves the original case unchanged.

Both hashes are required on apply. The case hash binds the exact case snapshot, including evidence, rules, approvals and metadata. The plan hash additionally binds the selected source set, current parser output and resulting candidate. This prevents a parser change between preview and apply from receiving stale approval. Apply reparses originals and recomputes every mapping; it never accepts caller-provided mappings or candidates. Unsupported option fields are rejected. The input is checked again before returning an apply replacement to detect edits during asynchronous parsing.

## Evidence identity and approvals

A record maps only when its text, complete locator and structured `fields` match exactly and uniquely in both the old and new source record sets. Object-key order is immaterial; array order, value types, absent versus present fields, locator labels and all coordinates matter. An unchanged record ID alone is insufficient. Ambiguous or unmatched records without references are reported and may be replaced after review. Any such record referenced by a graph node, graph edge, rule or structured claim blocks the entire operation.

Mappings update graph node citations, graph edge citations, rule citation arrays and claim citation arrays together. A graph node whose identity equals an old record ID also has its identity and edge endpoints remapped. Conflicting explicit node record/source identities and final node-ID collisions block the operation. Unknown custom metadata is preserved but is not interpreted as a citation; integrations must not hide evidence references in arbitrary fields.

Existing rule approval status and approval metadata are preserved only when every cited record maps exactly. A materially different cited excerpt, locator or structured field blocks application. Reparsing is not approval of a legal or actuarial interpretation, and it cannot make an official output valid.

## Provenance and validation

Source `id`, SHA-256, retained bytes, size and format must remain identical after reparsing. The source name, case binding, reference-library origin and existing source metadata remain intact. Exact matched records retain their case binding and additional metadata. Case graph, rule and claim bindings are validated before and after rebuilding.

Each changed source appends a separate `source.reindexProvenance` record:

```js
{
  schemaVersion: 1,
  history: [{
    operation: 'reindex', caseHashBefore,
    fromParserVersion, toParserVersion,
    fromRecordsHash, toRecordsHash
  }]
}
```

Changes also report old/new record counts. Record digests cover canonical complete record arrays; they do not certify parser correctness. An absent historical parser version is labeled `unrecorded`. No record-map data is trusted from this history. Existing history is preserved; a 128-entry limit fails rather than deleting history.

The case is verified through the existing package export/import codec before parsing; all original source hashes are checked. Unsupported schemas, cross-case metadata, corrupted original bytes, unsafe objects, accessors, hidden properties, sparse arrays and unknown source selections fail. Limits are 32 MiB of UTF-8 case JSON, 16 MiB per source, 1,000 selected sources, depth 40 and 1.5 million JSON nodes. Current parsers impose their own additional limits. Only the supported parser subset can be reparsed; unsupported variants stay blocked.

## Verification

Run `node --test --test-isolation=none tests/reindex.test.js`. Synthetic cases exercise current-parser no-ops, reordered TXT records, CSV structured-field matching, graph endpoint remapping, approved rule/claim citations, retained library provenance, package roundtrips, stale previews, changed parser output, concurrent case edits, ambiguous/unmatched evidence, identity collisions, source corruption, case isolation, unsafe objects and size bounds. Browser UI acceptance is a separate integration check.
