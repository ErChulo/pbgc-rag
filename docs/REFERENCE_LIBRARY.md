# Reference-library lifecycle

`js/library.js` supplies a separate version 1 reference-library schema. It does not reinterpret a case package as a reference library and never copies case graphs, rules, claims, calculations, or approval states into another case.

Only use reference documents you are authorized to share. The API cannot classify confidential text. It requires explicit source arrays and rejects case-scoped metadata, prior case-copy provenance, unknown source/record keys, unsafe objects, unsupported versions, malformed revision sequences, and invalid source bytes. Public/cloud fixtures must remain synthetic.

## APIs

Load `artifacts.js` and its dependencies before use. The browser API is `PBGC`; CommonJS exports support development tests.

```js
let library = PBGC.createReferenceLibrary({
  id: 'synthetic-reference-library',
  name: 'Synthetic public references'
});
const source = await PBGC.parseFile(file); // authorized original reference file only
library = await PBGC.addLibrarySources(library, [source], {
  versionLabel: 'Synthetic reference edition 1'
});
const validation = PBGC.validateReferenceLibrary(library);
const encoded = await PBGC.exportReferenceLibrary(library);
const restored = await PBGC.importReferenceLibrary(encoded);
const updatedCase = await PBGC.copyReferenceSources(caseData, restored, [source.id]);
```

`createReferenceLibrary` is synchronous and accepts only `id` and `name`. It records revision 1 as an empty inventory. `validateReferenceLibrary` synchronously checks schema, source shape, and revision membership and returns `{valid,errors,warnings}`. It does not hash original bytes; all async add/import/export/copy operations also verify those bytes using the existing case package integrity module.

`addLibrarySources` returns a detached new library. Inputs are snapshotted before asynchronous hashing. Each new content hash enters the cumulative source inventory once. A version-label snapshot records the complete source-ID membership at its monotonically numbered revision. Previously returned libraries and previous revision metadata are not mutated. Exact duplicate additions return a detached unchanged library without advancing its revision. A corrupted duplicate is rejected before dedupe. Source removal is unsupported rather than silently rewriting history.

`exportReferenceLibrary` and `importReferenceLibrary` use format `pbgc-rag-reference-library`, schema/envelope version 1, SHA-256 payload integrity, and independent original-byte hashes. Libraries and cases use distinct envelope formats. A case importer cannot import a library as a case. Unsupported versions fail instead of guessing a migration. Hashes detect corruption, not source authenticity or factual accuracy; stored parsed text and locators still require source review.

`copyReferenceSources` validates a case and library, then returns a detached new case with only the selected reference sources added. Each added source carries:

```js
referenceOrigin: {
  libraryId: 'synthetic-reference-library',
  revision: 2,
  versionLabel: 'Synthetic reference edition 1'
}
```

This pins the exact imported library version. Later library changes do not update a case automatically. Source IDs and precise record IDs remain content-addressed. Existing case content hashes dedupe without replacing existing metadata or sources. Case A and case B receive independent copies; mutating either does not mutate the library or the other case. Explicit case-specific interpretation, approval, and graph links remain necessary after import. Promoting a case copy back into a library is rejected; reimport the authorized original reference document instead.

## Limits and persistence

Maximum 1,000 sources, 1,000 revisions, 100,000 records through the case validator, 16 MiB per original source, and a 48 MiB JSON payload. Encoded packages have a separate 49 MiB envelope limit. Bounded plain JSON only; prototypes, accessors, cycles, excessive depth/node counts, and unexpected schema keys reject.

The module supplies immutable-by-operation revision snapshots and portable files. It does not itself select a browser persistence backend or imply durable storage. The shell must explicitly persist/export library packages and distinguish libraries from case workspaces. No directory scan, permission decision, official data-dictionary validation, or legal/actuarial authority is inferred from library membership.

Verification: `node --test --test-isolation=none tests/library.test.js` covers real parser-produced sources, revision lifecycle, payload/source tampering, case isolation, explicit provenance, dedupe, unsupported revisions, hostile objects, unknown metadata, and async snapshot safety.
