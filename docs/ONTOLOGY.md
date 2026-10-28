# Provisional internal ontology and contradiction screening

`js/ontology.js` exposes `PBGC.ontology`, `PBGC.detectConflicts(caseData, claims)`, and `PBGC.ontologyLimits`. CommonJS exports support local development tests.

The ontology version is `1.0.0`. Every term uses `internal:`. Acronym labels include NRD, ERD, EURD, RBD, QPSA, DOR, DORNSF, XRD, PC, DOPT, and other requirement labels. Definitions are deliberately `null`. These labels are not authoritative field names, a PBGC data dictionary, approved actuarial interpretations, or an official ontology. Only the approved versioned `data_dictionary_complete.xlsm`, when supplied and validated, can establish official field names.

## Claim contract

```js
{
  id: 'claim-1',
  caseId: 'case-a',
  kind: 'provision', // 'fact' or 'provision'
  subjectId: 'synthetic-plan',
  predicate: 'internal:NRD',
  group: 'synthetic-group-a',
  value: 65, // string, finite number, or boolean; types matter
  validFrom: '2025-01-01', // optional inclusive ISO date
  validTo: '2030-12-31',   // optional inclusive ISO date
  sourceRecordIds: ['source-record-1']
}
```

Other predicates may use `internal:` followed by one to 100 letters, digits, dots, underscores, or hyphens, starting with a letter or digit. This permits provisional internal claims without inventing official fields. Unknown claim properties fail validation. Claims need distinct IDs and citations. Every citation must resolve to a record in `caseData.sources`, and that record must identify its containing source. Optional source/record `caseId` metadata must match the case. All claims must explicitly identify the current case.

The case must use `schemaVersion: 1`, have a nonempty `id`, and contain source records with text and locators. This function checks local evidence membership and structure. It does not verify source hashes, parser correctness, documentary accuracy, or authenticity. Use the package module's source-integrity checks separately.

## Comparison and result

The detector compares claims with exactly equal `subjectId`, `predicate`, and `group`. It compares both fact and provision claims. It flags different typed scalar values when date intervals overlap. Dates are inclusive; absent bounds extend indefinitely. It does not infer group membership, treat any group label as a wildcard, normalize units or currencies, equate numeric strings with numbers, resolve synonyms, or detect contradictions expressed only in prose.

The result has this form:

```js
{
  schemaVersion: 1,
  ontologyVersion: '1.0.0',
  caseId: 'case-a',
  assessedClaims: 2,
  conflicts: [{
    status: 'unresolved',
    subjectId: 'synthetic-plan', predicate: 'internal:NRD',
    group: 'synthetic-group-a',
    overlap: { validFrom: '2025-01-01', validTo: null },
    left: { claimId, kind, value, valueType, sourceRecordIds, citations },
    right: { claimId, kind, value, valueType, sourceRecordIds, citations },
    resolution: null,
    reason: 'Different typed scalar values ...'
  }],
  interpretation: 'No legal interpretation or priority is determined. ...'
}
```

Each citation includes source and record IDs, available source name/hash, the original record excerpt, and its locator. Citation data is detached from the input. Input cases and claims are not mutated. A conflict is a review flag, not an adjudicated contradiction. Newer effective dates do not automatically override earlier provisions. Authorized reviewers must decide source authority, amendment effects, applicability, and interpretations. No rule activation or approval occurs. An empty conflict list does not establish correctness, completeness, or official acceptance.

Limits are 1,000 sources, 100,000 records, 1,000 claims, 100 citations per claim, and 10,000 result pairs, with a conservative 16 MiB output-character budget. Exceeding a limit fails closed; no partial success is reported. Plain JSON data only: cycles, accessors, unsafe prototype keys, invalid dates, cross-case claims, and invalid citations are rejected.

Run `node tests/ontology.test.js`. Synthetic tests cover overlap, date boundaries, group/subject/predicate isolation, typed values, evidence, cross-case attacks, cycles, accessors, and resource limits.
