/* Internal reviewer bundles v1. Stored-only ZIP, local codecs, no runtime dependencies. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ archiveBytes: 128 * 1024 * 1024, sources: 1000, entries: 1006, manifestBytes: 4 * 1024 * 1024, inventoryBytes: 4 * 1024 * 1024 });
  const FORMAT = 'pbgc-rag-internal-review-bundle';
  const DISCLAIMER = 'Hashes detect corruption and internal inconsistency. They do not authenticate authorship, sources, reviewers, extracted text, or interpretations.';
  const README = 'PBGC-RAG INTERNAL REVIEW BUNDLE\n\nPROVISIONAL. Official output: BLOCKED. This is not an official R1, BSRS configuration, benefit determination, or approved actuarial interpretation.\n\nreview.html is a standalone, script-free internal report. review.json contains its provisional evidence model. source-inventory.csv maps original source names to passive archive paths. case.json is the verified portable case envelope. manifest.json records every other file and its SHA-256.\n\nOriginals use .original names and are never executed. The original file name is metadata only; no source-supplied path or executable extension is used for an archive entry. Handle originals only in an approved local review workflow.\n\nUse PBGC-RAG verifyReviewBundle before accepting a bundle. Verification checks the archive, hashes, case/source membership, and regenerated reports. Do not infer a trusted identity or official acceptance from a passing integrity check.\n\n' + DISCLAIMER + '\n';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
  const fail = message => { throw new Error('Review bundle: ' + message); };
  function dependencies() {
    const artifacts = root.PBGC && typeof root.PBGC.exportCase === 'function' ? root.PBGC : typeof require === 'function' ? require('./artifacts.js') : null;
    const reports = root.PBGC && typeof root.PBGC.renderResearchReport === 'function' ? root.PBGC : typeof require === 'function' ? require('./reports.js') : null;
    if (!artifacts || !reports || !['exportCase', 'importCase', 'validateCase', 'buildReport'].every(key => typeof artifacts[key] === 'function') || typeof reports.renderResearchReport !== 'function') fail('the local case and report codecs are required.');
    return { exportCase: artifacts.exportCase, importCase: artifacts.importCase, validateCase: artifacts.validateCase, buildReport: artifacts.buildReport, renderResearchReport: reports.renderResearchReport };
  }
  function layoutOption(options) {
    if (!plain(options)) fail('options must be a plain object with only layout.');
    const keys = Reflect.ownKeys(options);
    if (keys.some(key => key !== 'layout')) fail('options may contain only layout.');
    const descriptor = Object.getOwnPropertyDescriptor(options, 'layout');
    if (descriptor && !Object.hasOwn(descriptor, 'value')) fail('option accessors are not accepted.');
    const layout = descriptor && descriptor.value !== undefined ? descriptor.value : 'review';
    if (!['review', 'evidence'].includes(layout)) fail('layout must be review or evidence.');
    return layout;
  }
  async function sha256(bytes) {
    const crypto = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!crypto || !crypto.subtle) fail('SHA-256 is unavailable.');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function safePath(path) { return typeof path === 'string' && !/[\s\\\u0000-\u001f\u007f]/.test(path) && (/^(?:case\.json|review\.html|review\.json|source-inventory\.csv|manifest\.json|README\.txt)$/.test(path) || /^originals\/[a-f0-9]{64}\.original$/.test(path)); }
  function entryLimit(path) { return path === 'manifest.json' ? LIMITS.manifestBytes : path === 'source-inventory.csv' ? LIMITS.inventoryBytes : path === 'README.txt' ? 8192 : path.startsWith('originals/') ? 16 * 1024 * 1024 : path === 'review.html' || path === 'review.json' ? 64 * 1024 * 1024 : LIMITS.archiveBytes; }
  function utf8Size(text) {
    let size = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) size++; else if (c < 2048) size += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { size += 4; i++; }
      else size += 3;
    }
    return size;
  }
  function decode(bytes, label) { try { return decoder.decode(bytes); } catch { fail(label + ' is not valid UTF-8.'); } }
  function originalBytes(source) {
    const raw = typeof atob === 'function' ? atob(source.originalBase64) : Buffer.from(source.originalBase64, 'base64').toString('binary');
    const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes;
  }
  function csvCell(value) {
    let text = String(value);
    if (/^[\t\r\n]/.test(text) || /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function inventory(caseData) {
    const rows = [['source_id', 'original_name', 'source_hash', 'format', 'bytes', 'records', 'passive_original_path']];
    for (const s of caseData.sources) rows.push([s.id, s.name, s.hash, s.format, s.size, s.records.length, 'originals/' + s.hash + '.original']);
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  async function contents(caseData, layout, caseBytes, api) {
    if (caseData.sources.length > LIMITS.sources) fail('source limit exceeded.');
    const entries = []; let bytesBudget = 22;
    function add(path, value) {
      const size = typeof value === 'string' ? utf8Size(value) : value.length;
      if (!safePath(path) || size > entryLimit(path)) fail(path + ' exceeds its entry size limit.');
      bytesBudget += size + 76 + 2 * path.length;
      if (bytesBudget > LIMITS.archiveBytes) fail('archive exceeds 128 MiB; no partial bundle was created.');
      entries.push({ path, bytes: typeof value === 'string' ? encoder.encode(value) : value });
    }
    add('case.json', caseBytes);
    // Apply the report's limits before constructing the complete machine-readable report.
    add('review.html', api.renderResearchReport(caseData, { layout }));
    add('review.json', JSON.stringify(api.buildReport(caseData), null, 2) + '\n');
    add('source-inventory.csv', inventory(caseData));
    add('README.txt', README);
    const sourceMap = [];
    for (const source of caseData.sources) {
      const path = 'originals/' + source.hash + '.original', bytes = originalBytes(source);
      add(path, bytes);
      sourceMap.push({ sourceId: source.id, sourceHash: source.hash, originalName: source.name, path, size: source.size });
    }
    const files = [];
    for (const entry of entries) files.push({ path: entry.path, size: entry.bytes.length, sha256: await sha256(entry.bytes) });
    const manifest = { format: FORMAT, version: 1, caseId: caseData.id, caseHash: files[0].sha256, layout, official: false, release: 'BLOCKED', disclaimer: DISCLAIMER, sourceMap, files };
    add('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    return { entries, manifest };
  }
  function writeZIP(entries) {
    if (entries.length > LIMITS.entries) fail('entry count limit exceeded.');
    let localSize = 0, centralSize = 0;
    for (const entry of entries) { entry.name = encoder.encode(entry.path); entry.crc = crc32(entry.bytes); entry.offset = localSize; localSize += 30 + entry.name.length + entry.bytes.length; centralSize += 46 + entry.name.length; }
    const size = localSize + centralSize + 22;
    if (size > LIMITS.archiveBytes) fail('archive exceeds 128 MiB.');
    const bytes = new Uint8Array(size), view = new DataView(bytes.buffer); let pos = 0;
    const u16 = (at, n) => view.setUint16(at, n, true), u32 = (at, n) => view.setUint32(at, n, true);
    for (const entry of entries) {
      u32(pos, 0x04034b50); u16(pos + 4, 20); u16(pos + 6, 0x800); u16(pos + 8, 0); u16(pos + 10, 0); u16(pos + 12, 0x21);
      u32(pos + 14, entry.crc); u32(pos + 18, entry.bytes.length); u32(pos + 22, entry.bytes.length); u16(pos + 26, entry.name.length); u16(pos + 28, 0);
      bytes.set(entry.name, pos + 30); bytes.set(entry.bytes, pos + 30 + entry.name.length); pos += 30 + entry.name.length + entry.bytes.length;
    }
    for (const entry of entries) {
      u32(pos, 0x02014b50); u16(pos + 4, 20); u16(pos + 6, 20); u16(pos + 8, 0x800); u16(pos + 10, 0); u16(pos + 12, 0); u16(pos + 14, 0x21);
      u32(pos + 16, entry.crc); u32(pos + 20, entry.bytes.length); u32(pos + 24, entry.bytes.length); u16(pos + 28, entry.name.length); u16(pos + 30, 0); u16(pos + 32, 0); u16(pos + 34, 0); u16(pos + 36, 0); u32(pos + 38, 0); u32(pos + 42, entry.offset);
      bytes.set(entry.name, pos + 46); pos += 46 + entry.name.length;
    }
    u32(pos, 0x06054b50); u16(pos + 4, 0); u16(pos + 6, 0); u16(pos + 8, entries.length); u16(pos + 10, entries.length); u32(pos + 12, centralSize); u32(pos + 16, localSize); u16(pos + 20, 0);
    return bytes;
  }
  function readZIP(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = bytes.length;
    function range(pos, size, end = length) { if (!Number.isSafeInteger(pos) || !Number.isSafeInteger(size) || pos < 0 || size < 0 || pos + size > end || end > length) fail('truncated or out-of-bounds ZIP structure.'); }
    const u16 = pos => { range(pos, 2); return view.getUint16(pos, true); }, u32 = pos => { range(pos, 4); return view.getUint32(pos, true); };
    range(length - 22, 22);
    const eocd = length - 22;
    if (u32(eocd) !== 0x06054b50 || u16(eocd + 4) || u16(eocd + 6) || u16(eocd + 20)) fail('ZIP must be a single disk without comments, ZIP64, or trailing bytes.');
    const count = u16(eocd + 10), centralSize = u32(eocd + 12), centralOffset = u32(eocd + 16);
    if (count < 6 || count > LIMITS.entries || u16(eocd + 8) !== count || centralOffset + centralSize !== eocd) fail('invalid ZIP entry count or central directory bounds.');
    range(centralOffset, centralSize, eocd);
    const files = new Map(); let central = centralOffset, expectedLocal = 0, total = 0;
    for (let i = 0; i < count; i++) {
      range(central, 46, eocd);
      if (u32(central) !== 0x02014b50) fail('invalid central ZIP signature.');
      const version = u16(central + 6), flags = u16(central + 8), method = u16(central + 10), time = u16(central + 12), date = u16(central + 14);
      const crc = u32(central + 16), packed = u32(central + 20), size = u32(central + 24), nameLength = u16(central + 28), extraLength = u16(central + 30), commentLength = u16(central + 32), attrs = u32(central + 38), offset = u32(central + 42);
      const mode = (attrs >>> 16) & 0xf000;
      if (version !== 20 || ![0, 0x800].includes(flags) || method !== 0 || packed !== size || extraLength || commentLength || u16(central + 34) || (attrs & 16) || (mode && mode !== 0x8000)) fail('unsupported ZIP encryption, compression, flags, extras, disk, or file type. Stored regular files only.');
      if (nameLength < 1 || nameLength > 100) fail('invalid ZIP path length.');
      range(central + 46, nameLength, eocd);
      const nameBytes = bytes.subarray(central + 46, central + 46 + nameLength), path = decode(nameBytes, 'ZIP path');
      if (!safePath(path) || files.has(path) || size > entryLimit(path)) fail('unsafe/duplicate ZIP path or oversized entry.');
      if (offset !== expectedLocal) fail('ZIP local entries have gaps, overlaps, or inconsistent offsets.');
      range(offset, 30, centralOffset);
      if (u32(offset) !== 0x04034b50 || u16(offset + 4) !== version || u16(offset + 6) !== flags || u16(offset + 8) !== method || u16(offset + 10) !== time || u16(offset + 12) !== date || u32(offset + 14) !== crc || u32(offset + 18) !== packed || u32(offset + 22) !== size || u16(offset + 26) !== nameLength || u16(offset + 28)) fail('ZIP local/central metadata disagreement.');
      range(offset + 30, nameLength + size, centralOffset);
      for (let n = 0; n < nameLength; n++) if (bytes[offset + 30 + n] !== nameBytes[n]) fail('ZIP local/central path disagreement.');
      const content = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
      if (crc32(content) !== crc) fail('ZIP CRC-32 check failed: ' + path);
      if ((total += size) > LIMITS.archiveBytes) fail('ZIP aggregate content exceeds limits.');
      files.set(path, content); expectedLocal = offset + 30 + nameLength + size; central += 46 + nameLength;
    }
    if (central !== eocd || expectedLocal !== centralOffset) fail('ZIP directory or local data has unlisted bytes.');
    return files;
  }
  function keysExactly(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
  function validateManifest(manifest) {
    if (!keysExactly(manifest, ['format', 'version', 'caseId', 'caseHash', 'layout', 'official', 'release', 'disclaimer', 'sourceMap', 'files']) || manifest.format !== FORMAT || manifest.version !== 1 || manifest.official !== false || manifest.release !== 'BLOCKED' || manifest.disclaimer !== DISCLAIMER || typeof manifest.caseId !== 'string' || !manifest.caseId || manifest.caseId.length > 200 || typeof manifest.caseHash !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.caseHash) || !['review', 'evidence'].includes(manifest.layout) || !Array.isArray(manifest.sourceMap) || manifest.sourceMap.length > LIMITS.sources || !Array.isArray(manifest.files) || manifest.files.length !== manifest.sourceMap.length + 5) fail('manifest shape, version, layout, or blocked release contract is invalid.');
    const paths = new Set();
    for (const file of manifest.files) {
      if (!keysExactly(file, ['path', 'size', 'sha256']) || !safePath(file.path) || file.path === 'manifest.json' || paths.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > entryLimit(file.path) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) fail('manifest has an invalid or duplicate file descriptor.');
      paths.add(file.path);
    }
    const sourceIds = new Set();
    for (const source of manifest.sourceMap) {
      if (!keysExactly(source, ['sourceId', 'sourceHash', 'originalName', 'path', 'size']) || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash) || source.sourceId !== 'src-' + source.sourceHash || sourceIds.has(source.sourceId) || typeof source.originalName !== 'string' || !source.originalName || source.originalName.length > 500 || source.path !== 'originals/' + source.sourceHash + '.original' || !Number.isSafeInteger(source.size) || source.size < 0 || source.size > 16 * 1024 * 1024 || !paths.has(source.path)) fail('manifest source membership is invalid.');
      sourceIds.add(source.sourceId);
    }
    for (const path of ['case.json', 'review.html', 'review.json', 'source-inventory.csv', 'README.txt']) if (!paths.has(path)) fail('manifest omits a required file.');
  }
  async function createReviewBundle(caseData, options = {}) {
    const api = dependencies(), layout = layoutOption(options), valid = api.validateCase(caseData);
    if (!valid.valid) fail('case validation failed: ' + valid.errors.join(' '));
    // Capture every input synchronously; mutations during SHA-256 cannot change this bundle.
    const snapshot = JSON.parse(JSON.stringify(caseData));
    const caseText = await api.exportCase(snapshot);
    const verified = await api.importCase(caseText);
    const result = await contents(verified, layout, caseText, api);
    return { bytes: writeZIP(result.entries), manifest: result.manifest };
  }
  async function verifyReviewBundle(input) {
    if (!(input instanceof Uint8Array) || input.length < 22 || input.length > LIMITS.archiveBytes) fail('input must be a ZIP Uint8Array of at most 128 MiB.');
    const bytes = new Uint8Array(input), files = readZIP(bytes), api = dependencies();
    if (!files.has('manifest.json') || !files.has('case.json')) fail('required case/manifest entry is missing.');
    let manifest; try { manifest = JSON.parse(decode(files.get('manifest.json'), 'manifest')); } catch (e) { fail('manifest JSON is invalid: ' + e.message); }
    validateManifest(manifest);
    if (files.size !== manifest.files.length + 1) fail('archive has missing or extra files.');
    for (const file of manifest.files) {
      const content = files.get(file.path);
      if (!content || content.length !== file.size || await sha256(content) !== file.sha256) fail('manifest SHA-256 or size mismatch: ' + file.path);
    }
    if (await sha256(files.get('case.json')) !== manifest.caseHash) fail('case hash does not match manifest.');
    const caseData = await api.importCase(decode(files.get('case.json'), 'case envelope'));
    if (caseData.id !== manifest.caseId) fail('cross-case bundle manifest rejected.');
    const expected = await contents(caseData, manifest.layout, files.get('case.json'), api);
    // Regeneration binds claims, text, locators, inventory and exact source bytes to
    // this verified case, even when an attacker recomputes CRCs and manifest hashes.
    if (JSON.stringify(manifest) !== JSON.stringify(expected.manifest)) fail('regenerated reports, inventory, or source membership disagree with this case.');
    const canonicalManifest = expected.entries.at(-1).bytes, actualManifest = files.get('manifest.json');
    if (canonicalManifest.length !== actualManifest.length || canonicalManifest.some((byte, i) => byte !== actualManifest[i])) fail('manifest must use the exact canonical version 1 encoding without duplicate keys.');
    const validation = api.validateCase(caseData);
    return { caseData, manifest, validation: { ...validation, fileCount: files.size, sourceCount: caseData.sources.length, official: false, release: 'BLOCKED', warnings: [...validation.warnings, DISCLAIMER] } };
  }
  const api = { createReviewBundle, verifyReviewBundle, REVIEW_BUNDLE_LIMITS: LIMITS, REVIEW_BUNDLE_VERSION: '1.0.0' };
  root.PBGC = Object.assign(root.PBGC || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
