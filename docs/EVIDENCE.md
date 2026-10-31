# Source-bound evidence annotations

This module records descriptive fact, provision and event annotations. It does not interpret official actuarial rules, decide legal priority or activate calculations. Use synthetic fixtures during remote development.

## Public API

All operations are synchronous and return new values without changing caller annotations or source records. `verifiedSources` must be the current workspace's sources after original-byte hashing and reparsing. The module checks exact source-hash and typed-locator membership; it does not independently authenticate original documents or reviewer identities.

- `createEvidenceAnnotation(input, verifiedSources)` creates a proposed schema-v1 annotation at integer version one.
- `updateEvidenceAnnotation(annotation, patch, verifiedSources)` changes descriptive content, increments the version and removes any review. IDs, version and review status cannot be patched directly.
- `validateEvidenceAnnotation(annotation, verifiedSources, {requireReviewed?})` returns `{valid, errors}`. It checks content, bounds, source bindings and exact review binding. Unknown schemas/fields reject.
- `validateEvidenceAnnotations(annotations, verifiedSources)` validates a whole case annotation set and returns `{valid, errors}`. It builds the verified source index once, applies the same exact binding/review checks to every annotation, rejects duplicate IDs and enforces the 2,000-annotation limit. Use this bulk API when restoring a case rather than repeatedly indexing the same source records. It does not require annotations to be reviewed.
- `evidenceContentKey(annotation)` returns a canonical exact-content JSON snapshot. Object key order does not change the snapshot. It is not a cryptographic signature.
- `reviewEvidenceAnnotation(annotation, {reviewer, at, version, contentKey}, verifiedSources)` records review only when the supplied version and canonical content snapshot match the current annotation. `at` uses YYYY-MM-DD. A caller should show the exact content being reviewed before recording this action.
- `reconcileEvidence(annotations, verifiedSources, {subject?, predicate?, asOf?, group?})` returns `{status, value, reason, annotationIds, possibleConflicts, warnings}`. Status is `abstain` or `reviewed-consistent`.
- `INTERNAL_EVIDENCE_TERMS` lists descriptive topic tags from the project requirements. Each term has `officialDefinition: null`. It is an internal navigation vocabulary, not an authoritative PBGC dictionary.

## Annotation contract

```js
{
  schemaVersion: 1,
  id: 'synthetic-annotation',
  version: 1,
  kind: 'fact', // fact | provision | event
  subject: 'synthetic-plan',
  predicate: 'internal.NRD',
  value: '65', // string, or null when unknown
  sources: [{ sourceHash: '64 lowercase hex characters', locator: { type: 'text-line', line: 1, offset: 0, length: 38 } }],
  authority: { label: 'Synthetic source description', reference: null },
  applicability: 'unknown', // unknown | all-dates | period
  validity: { from: null, to: null },
  group: null, // null means unknown; '*' explicitly means all groups
  status: 'proposed',
  review: null
}
```

Source references must resolve to existing parsed records in the supplied workspace. Hashes identify source-byte versions; locator comparison uses canonical JSON rather than insertion order. Duplicate references reject. A missing reference, removed source or changed locator invalidates an annotation.

`period` requires at least one date endpoint. A null endpoint means an explicitly open boundary. `all-dates` is an explicit user assertion and carries null endpoints. `unknown` carries null endpoints and always prevents reconciliation from supplying a value. A specific group needs an explicit query group; null does not mean every group.

Reviewed annotations carry `{reviewer, at, version, contentKey}`. This is a portable, unauthenticated human-review claim. Anyone who can rewrite the package can rewrite these fields. It does not prove authorization, official approval, the truth of the value or the correctness of legal interpretation. Source bindings and exact content are revalidated when a package is imported. No official release or rule activation follows from a reviewed annotation.

## Conflict flags and abstention

Possible conflicts are deterministic pairs of annotations with the same exact subject/predicate, different non-null values and potentially overlapping dates/groups. Unknown scope is treated as potentially overlapping. Labels and source dates never establish legal priority; a later amendment or stronger-sounding authority label does not automatically win. Conflict flags cover matching subject/predicate candidates and may include periods outside an optional as-of filter. They remain review prompts, not findings of legal contradiction.

Reconciliation filters by explicit requested dates/groups and abstains for unknown scope, mixed subject/predicate, unreviewed annotations, unknown values/authority, or disagreement. It returns `reviewed-consistent` only when applicable, exact-content reviewed annotations agree for a known scope. That result describes agreement among annotations; it is not an official determination or inferred answer.

No source date, participant group, provision, field name or rule is guessed. Values and applicability remain explicit user assertions with documentary references.

## Bounds and verification

At most 2,000 annotations, 50 references each, 4,000 value characters, 20,000 canonical content characters, 4,096 locator characters and bounded JSON depth/complexity. At most 2,000 possible-conflict pairs are returned; callers must narrow an excessive conflict scope rather than receive silent truncation. Verified source input is limited to 200 sources/50,000 records. Calendar dates are validated, including leap days.

`node tests/evidence.test.js` verifies exact binding, review/content/version checks, edit invalidation, immutable operations, canonical locators, unknown-fact abstention, temporal/group filtering, conflict flags, malformed-input bounds and the absence of fabricated official definitions.
