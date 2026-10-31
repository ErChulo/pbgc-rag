# Exact field dictionary mapping

`assets/dictionary.js` provides a source-bound mapping module for the approved field dictionary when it is actually supplied. It does not include that workbook, substitute `DD.csv`, invent official field names or infer field types/formulas. No real dictionary has been supplied or officially validated by this implementation.

## APIs

```js
const config = {
  mode: 'official-candidate', // or explicit 'synthetic'
  sheet: 'Fields',            // user chooses exact sheet; no header guessing
  column: 'B',                // exact uppercase Excel column
  headerRow: 1,
  lastRow: 42,                // optional explicit data bound
  version: 'user-supplied-version'
};
const proposed = PBGCRag.buildDictionary(verifiedSource, config);
const reviewed = PBGCRag.buildDictionary(verifiedSource, {
  ...config,
  review: {
    status: 'reviewed',
    reviewer: 'Recorded human reviewer',
    reviewedAt: '2026-10-30T12:00:00.000Z',
    binding: proposed.reviewBinding
  }
});
PBGCRag.validateDictionary(reviewed, verifiedSource);
const result = PBGCRag.validateFieldValues(reviewed, values, {
  source: verifiedSource
});
```

These are synchronous APIs. The shell must first rehash original source bytes and reparse Excel records through its validated import pipeline. The dictionary module validates metadata/locators, not source bytes. `verifiedSource` is a parsed source with `name`, lowercase SHA-256 `hash`, `parserVersion`, Excel `format` and `records` containing exact `excel-cell` sheet/cell/part locators.

Official-candidate mode accepts only exact filename `data_dictionary_complete.xlsm` and parsed `xlsm` format. Filename and review metadata alone never prove workbook authority. Synthetic mode permits an XLSX/XLSM fixture and always returns `synthetic-nonofficial`, even if review metadata is present. A fake fixture named like the dictionary still cannot produce `officialValidated:true` or enable official release: all results retain `officialValidated:false` and `releaseBlocked:true`.

## Mapping and review binding

Mapping reads the chosen header cell and then every selected-column row through `lastRow`. If omitted, `lastRow` is the largest existing cell row in the selected column. This is a deterministic bound, not a guess about authoritative headers. Empty/missing fields, duplicate cells, formula-derived fields, exact duplicate names, and Unicode-compatibility/case collisions reject the mapping. To avoid including formatted blank/footer cells, choose an explicit last row. No skipped blank rows or silent name trimming/normalization occurs.

Field names retain exact original spelling and Unicode. A conservative NFKC/case key detects potentially ambiguous pairs, but is never substituted for the actual names. Leading/trailing whitespace and control characters are rejected for human resolution. Fields retain source hash and exact worksheet cell locator. Arrays/Sets support names such as `__proto__` without prototype mutation. No field type or validation rule is fabricated from neighboring columns.

`reviewBinding` is canonical content, not a signature or password. It binds source filename/hash/parser version, mapping bounds/version, header and exact fields/locators. A reviewed record must match this full binding, record a reviewer and canonical UTC timestamp. Changed source/mapping/version/content invalidates it. `validateDictionary` reconstructs the mapping from the supplied source and rejects forged metadata, fields, locators or release flags. Object key order is irrelevant.

A stored review remains an unauthenticated human-review claim. It does not establish approval by PBGC, possession of the approved master, legal/actuarial interpretation, official output validity or authorization to release an artifact.

## Value checks and limits

`validateFieldValues` checks exact field-name membership only. Unknown names are reported; values are not coerced, executed or type-checked. Prototype-looking names stay ordinary strings, accessor/getter value objects are rejected, and non-plain objects are unsupported. Results explicitly report `typeValidation:'not-performed'`.

Pass `{source}` to rebind against verified parsed originals. Without it the function verifies only internal mapping consistency and reports `sourceBindingVerified:false`; that mode does not establish original-byte integrity or authority. Even a successful name-membership result is not official validation.

Limits: 50,000 parsed source records, 20,000 fields, 256 UTF-16 code units per field name, 128 per version and 50,000 supplied field names. Excel grid and locator bounds are validated. Mapping rejects unsupported or ambiguous inputs before returning any candidate.

`node tests/dictionary.test.js` uses synthetic parsed records only. It verifies exact/prototype-safe Unicode names, filename/mode gates, ambiguity/blank/formula rejection, explicit bounds, review invalidation, forged source binding, membership-only checks and getter rejection. These checks do not claim acceptance of an unavailable official dictionary.
