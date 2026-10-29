# Legacy XLS / BIFF dependency audit

Audit date: October 29, 2026 (UTC). Read-only inspection; **no spreadsheet parser
was installed, vendored, or enabled**. Existing application source, dependency
manifests and browser/network policies were not changed.

## Decision

**Do not use npm `xlsx@0.18.5`, the frozen GitHub source, or an unverified fork.**
A maintained official SheetJS distribution appears suitable in principle for a
local classic-script BIFF parser, but its exact current secure revision, artifact
checksum, source API, and footprint **cannot be verified under the current network
policy**. The official maintained source, CDN, and documentation destinations all
fail before establishing an HTTPS tunnel. Legacy XLS remains unsupported until
that dependency is retrieved and audited, or an independently tested bounded
native BIFF/OLE implementation is provided.

This blocks this dependency acquisition, not other application development.

## Authoritative evidence

### Official repository relocation

A read-only Git operation through the inherited authenticated HTTPS proxy returned:

| Official GitHub ref | Verified commit |
|---|---|
| `SheetJS/sheetjs` HEAD / `github` | `3f44ddd99c704d7ca35ea76fef7b8af2d2d435cb` |
| Frozen `master` | `515d1c6f2e1d3ca422ee9198b177cfd926434936` |
| Requested `v0.20.2`, `v0.20.3`, `v0.20.4` tags | No matching refs returned |

The README at exact HEAD explicitly identifies:

- Maintained source: <https://git.sheetjs.com/sheetjs/sheetjs>
- Current scripts/modules: <https://cdn.sheetjs.com>
- Current documentation: <https://docs.sheetjs.com>
- CE license: Apache 2.0.
- The GitHub `master` branch contains commits only through the frozen SHA above.

The frozen `master` package manifest reports version `0.18.12`, Apache-2.0,
main `xlsx.js`, and browser exclusions for Node `buffer`, `crypto`, `stream`,
`process`, and `fs`. Those facts describe the obsolete source only, not the current
maintained release or its security status.

Pinned evidence URLs:

- <https://raw.githubusercontent.com/SheetJS/sheetjs/3f44ddd99c704d7ca35ea76fef7b8af2d2d435cb/README.md>
- <https://raw.githubusercontent.com/SheetJS/sheetjs/515d1c6f2e1d3ca422ee9198b177cfd926434936/package.json>

SHA-256 of the exact retrieved evidence bytes:

| Evidence | SHA-256 |
|---|---|
| Current relocation README | `be7d1c8877a9a3a531dd21c4f18fa10e09d7d1a4422435ec428cb6670af2229e` |
| Frozen package manifest | `55f5293e39701096721f6c5ddf08a8bc85445082c6ac783fc96015f0ccd2c942` |

These are evidence-document checksums, **not** an approved parser-artifact checksum.

### npm and known security advisories

`npm view xlsx version repository license dist.integrity` still returns version
`0.18.5`, Apache-2.0, and the obsolete GitHub repository. A recently changed npm
metadata timestamp does not mean that this package version contains security fixes.

Two authoritative GitHub-reviewed advisories establish why it is unsuitable for
reading arbitrary local documents:

1. **CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6** — prototype pollution when reading crafted
   files, affecting CE through `0.19.2`. The advisory explicitly says a non-vulnerable
   version cannot be found on npm and identifies official CDN version `0.19.3` as
   the fix for that issue.
2. **CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9** — ReDoS before `0.20.2`. The advisory again
   says the npm package and GitHub source are no longer maintained and identifies
   official CDN version `0.20.2` as the fix for that issue.

Sources read:

- <https://github.com/advisories/GHSA-4r6h-8v6p-xvw6>
- <https://raw.githubusercontent.com/github/advisory-database/main/advisories/github-reviewed/2023/04/GHSA-4r6h-8v6p-xvw6/GHSA-4r6h-8v6p-xvw6.json>
- <https://github.com/advisories/GHSA-5pgg-2g8v-p4x9>

The raw prototype-pollution advisory JSON retrieved during this audit has SHA-256
`f7e238a9248984a238f2c28bc1735290ab0f4d3ae9b6224ca619a2daa24088c4`.
Advisory data can change; recheck before selection. The minimum versions above fix
those specific issues and do **not** establish that an arbitrary later artifact
is current, authentic, or free from other vulnerabilities. No current secure
release number is claimed from inaccessible official destinations.

### Concrete access results

The managed network status reports current observations and restricted policy
state `enforced`. Its permitted package/GitHub destinations include
`github.com`, `raw.githubusercontent.com`, and `registry.npmjs.org`, but not the
three official maintained SheetJS hosts.

Approved command execution used the existing HTTPS proxy and retained TLS verification:

| Read-only operation | Observed result |
|---|---|
| `git ls-remote https://git.sheetjs.com/sheetjs/sheetjs.git HEAD ...` | Exit 128: `CONNECT tunnel failed, response 403` |
| HTTPS GET `https://cdn.sheetjs.com/` | curl exit 56: `CONNECT tunnel failed, response 403`; no upstream HTTP response |
| HTTPS GET `https://docs.sheetjs.com/docs/getting-started/installation/standalone` | curl exit 56: `CONNECT tunnel failed, response 403`; no upstream HTTP response |

The tunnel denial is a proxy/network prerequisite, not evidence of missing
SheetJS credentials or a failure of the upstream service. No direct route,
alternate mirror, changed proxy, disabled TLS check, token request, or policy
bypass was attempted. No allowlist was replaced.

If the coordinator chooses the supported environment-configuration workflow,
required domain additions are `git.sheetjs.com`, `cdn.sheetjs.com`, and
`docs.sheetjs.com`; preserve all existing custom domains and presets. After an
actual policy update, retry the official operations and inspect the exact current
source tag/commit, license, security advisories and authenticated HTTPS artifact
before approving an import. A saved draft alone does not establish access.

### Alternatives checked

Official npm metadata identifies ExcelJS `4.4.0` (MIT) and `read-excel-file`
`9.3.13` (MIT). Neither was installed. Their versions/licenses alone are not a
security audit or proof of BIFF support.

ExcelJS official repository HEAD was
`5bed18b45e824f409b08456b59b87430ded023ab`; its README describes reading/writing
**XLSX and JSON**, with XLSX/CSV I/O documentation. This does not provide the
needed legacy BIFF/OLE XLS reader. Source:
<https://github.com/exceljs/exceljs>. The attempted npm README-field lookup for
these alternatives returned no content, so no additional format claims are
inferred from that lookup. No fork or XLSX-only package was accepted as an XLS fix.

## Proposed bounded integration after acquisition

This is an engineering plan, **not executed or accepted parser behavior**. API
names/options must be rechecked against the exact maintained source before use.

1. **Pin and retain provenance.** Select an official maintained release containing
   applicable security fixes. Record full source commit/tag, license/NOTICE files,
   current advisory review, HTTPS artifact URL, actual SHA-256/SHA-512 and any
   official published checksum. Record runtime bundle bytes, uncompressed source
   footprint and measured browser memory. No current artifact checksum or footprint
   is available in this audit; do not substitute a mirror's claim.
2. **Classic local bundle only.** Audit the maintained standalone browser build and
   its code-page tables. No runtime import, package install, CDN, network fetch,
   Node filesystem, eval, macro engine or formula-calculation plugin. Test under
   application CSP `connect-src 'none'`, `worker-src 'none'` and no `unsafe-eval`.
   Browser `read(Uint8Array, options)` must be a byte-only operation, with all
   optional filesystem/download APIs unused or excluded. JavaScript source must
   be inspected before assuming any option guarantees this behavior.
3. **Bound OLE/CFB before library allocation.** Enforce 16 MiB original input and
   a confirmed CFB magic/header, supported sector sizes/endianness and bounded
   sector counts. Validate FAT/DIFAT/mini-FAT/directory and Workbook/Book stream
   chains against file bounds; detect cycles, invalid indices, cross-chain
   ambiguity and oversized declared stream lengths before allocating. Do not
   rely on an untrusted declared size to allocate an array. Never execute VBA,
   ActiveX, XLM macros, attachments, scripts or external links.
4. **Start with explicit BIFF8 scope.** Verify actual Workbook/Book stream BOF and
   version; do not reinterpret a disguised HTML/XML/CSV payload as XLS. Bound
   record lengths, CONTINUE chains, SST counts/string lengths, rows, columns,
   styles, sheet counts and formulas against the validated stream. Unsupported
   encryption, macro sheets, code pages, malformed continuation strings or older
   BIFF dialects must fail explicitly. Preserve original bytes in every outcome.
   This preflight needs actual implementation/tests; a `sheetRows` option that
   silently truncates input is not a resource-safety or completeness gate.
5. **Preserve source semantics.** Produce sheet/cell/row/column locators and raw
   typed cached values. Preserve formula text separately with
   `formulaEvaluated:false`; do not calculate it. Preserve raw numeric/date serials
   and workbook date-system metadata rather than inferring actuarial dates or
   official fields. Unsupported encodings must reject instead of guessing text.
   Only provide binary stream offsets when verified against actual BIFF records;
   sheet/cell is the meaningful locator otherwise. Do not invent byte offsets.
6. **Bound output before promotion.** Limit cells/records to the existing 100,000
   case budget, each searchable text item to 65,536 characters and serialized
   working case to 32 MiB; cap decoded strings and parse work before expensive
   materialization. A main-thread parser cannot be preempted mid-call: either
   prove safe bounded work for supported inputs or explicitly reject the variant.
   Do not claim a hard CPU deadline from an asynchronous timeout around
   synchronous code. Any verified local-worker path must retain a tested fallback.
7. **Verify and integrate.** Use independent synthetic files from actual BIFF8
   writers plus hostile OLE/FAT/SST/formula fixtures. Assert source hashes/bytes,
   exact sheet/cell/formula-cache values, code-page handling, parser-version
   repeatability, no macros/eval/network, malformed-input rejection, resource
   limits, resumable imports, reindex no-op stability and portable case recovery.
   Run the classic bundle through actual permitted `file://` browser execution;
   secondary HTTP testing cannot pass the workplace file-origin gate.

Reading a versioned `data_dictionary_complete.xlsm` remains a separate official
schema/approval workflow. Legacy XLS support must not infer official field names
or activate actuarial interpretations merely because spreadsheet parsing works.
