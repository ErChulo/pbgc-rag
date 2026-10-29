'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../js/office.js');
const { parseFile } = require('../js/parsers.js');
const B = require('../js/review-bundle.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const bytes = Buffer.from('SYNTHETIC ONLY: benefits are source evidence, not an approved interpretation.');
  const digest = hash(bytes), sourceId = 'src-' + digest;
  return { schemaVersion: 1, id: 'synthetic-review', name: 'Synthetic review case', createdAt: '2026-10-29', sources: [{ id: sourceId, name: '=SUM(1,2).txt', hash: digest, size: bytes.length, format: 'txt', originalBase64: bytes.toString('base64'), records: [{ id: sourceId + ':1', sourceId, text: bytes.toString(), locator: { kind: 'text', label: 'Line 1', line: 1, offset: 0, length: bytes.length } }] }], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
}
// Independent small stored-ZIP fixture writer; deliberately accepts unsafe paths
// so the production verifier is tested against archives it would never produce.
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function pack(entries) {
  const local = [], central = []; let offset = 0;
  for (const [filename, value] of entries) {
    const name = Buffer.from(filename), bytes = Buffer.from(value), crc = crc32(bytes), l = Buffer.alloc(30), c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20, 4); l.writeUInt32LE(crc, 14); l.writeUInt32LE(bytes.length, 18); l.writeUInt32LE(bytes.length, 22); l.writeUInt16LE(name.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(bytes.length, 20); c.writeUInt32LE(bytes.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    local.push(l, name, bytes); central.push(c, name); offset += l.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(directory.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, e]);
}
function unpack(input) {
  const bytes = Buffer.from(input), entries = []; let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 22), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extra;
    entries.push([bytes.subarray(offset + 30, offset + 30 + nameLength).toString(), bytes.subarray(start, start + size)]); offset = start + size;
  }
  return entries;
}
function updateManifest(entries, change) {
  const manifest = JSON.parse(entries.find(([name]) => name === 'manifest.json')[1]);
  change(manifest);
  return entries.map(([name, bytes]) => [name, name === 'manifest.json' ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n') : bytes]);
}
function rehashManifest(entries) {
  return updateManifest(entries, manifest => {
    for (const file of manifest.files) { const bytes = entries.find(([name]) => name === file.path)[1]; file.size = bytes.length; file.sha256 = hash(bytes); }
    manifest.caseHash = manifest.files.find(file => file.path === 'case.json').sha256;
  });
}
test('internal reviewer bundle round trips the verified case and every exact source byte', async () => {
  const c = fixture(), before = JSON.stringify(c), bundle = await B.createReviewBundle(c, { layout: 'review' });
  assert.ok(bundle.bytes instanceof Uint8Array); assert.equal(bundle.manifest.official, false); assert.equal(bundle.manifest.release, 'BLOCKED');
  assert.equal(bundle.manifest.caseId, c.id); assert.equal(bundle.manifest.files.length, 6);
  const files = new Map(unpack(bundle.bytes)), original = files.get('originals/' + c.sources[0].hash + '.original');
  assert.deepEqual(original, Buffer.from(c.sources[0].originalBase64, 'base64'));
  assert.equal(hash(files.get('case.json')), bundle.manifest.caseHash);
  for (const file of bundle.manifest.files) assert.equal(hash(files.get(file.path)), file.sha256);
  const verified = await B.verifyReviewBundle(bundle.bytes);
  assert.deepEqual(verified.caseData, c); assert.deepEqual(verified.manifest, bundle.manifest);
  assert.equal(verified.validation.valid, true); assert.equal(verified.validation.fileCount, 7); assert.equal(verified.validation.sourceCount, 1);
  assert.equal(verified.validation.official, false); assert.equal(verified.validation.release, 'BLOCKED');
  assert.ok(verified.validation.warnings.some(warning => warning.includes('do not authenticate')));
  assert.equal(JSON.stringify(c), before);
});
test('hostile HTML and macro-bearing Office originals remain passive while reports escape their text', async () => {
  const c = fixture(); c.name = '<img src=x onerror=alert(1)> Synthetic';
  const office = pack([
    ['[Content_Types].xml', '<Types/>'],
    ['xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Synthetic macro-bearing source</t></is></c></row></sheetData></worksheet>'],
    ['xl/vbaProject.bin', 'SYNTHETIC INERT MACRO BYTES: never execute.']
  ]);
  c.sources.push(await parseFile(new File([office], '../../synthetic.xlsm')));
  c.sources.push(await parseFile(new File(['<p>Synthetic evidence</p><script>window.compromised=true</script><img src="https://invalid.test/tracker">'], '../hostile.html')));
  const bundle = await B.createReviewBundle(c, { layout: 'evidence' }), files = new Map(unpack(bundle.bytes));
  assert.equal(bundle.manifest.layout, 'evidence');
  assert.ok([...files.keys()].every(name => !name.includes('..') && !/\.xlsm$|hostile\.html$|vbaProject/.test(name)));
  assert.doesNotMatch(files.get('review.html').toString(), /<script\b|<img\b/); assert.match(files.get('review.html').toString(), /&lt;img/);
  assert.match(files.get('review.html').toString(), /connect-src 'none'/); assert.match(files.get('review.json').toString(), /PROVISIONAL/);
  assert.match(files.get('README.txt').toString(), /Originals use .original names and are never executed/);
  assert.deepEqual(files.get('originals/' + c.sources[1].hash + '.original'), office);
  assert.deepEqual((await B.verifyReviewBundle(bundle.bytes)).caseData, JSON.parse(JSON.stringify(c)));
});
test('source inventory neutralizes spreadsheet formula prefixes and quotes newlines without changing manifest names', async () => {
  for (const name of ['=SUM(1,2).txt', ' +CMD.txt', '\t@command.txt', '\rmalicious.txt', '-1.txt', 'Normal,"quoted"\nname.txt']) {
    const c = fixture(); c.sources[0].name = name;
    const bundle = await B.createReviewBundle(c), inventory = new Map(unpack(bundle.bytes)).get('source-inventory.csv').toString();
    if (/^[\t\r\n]|^[\s\u0000-\u001f]*[=+\-@]/.test(name)) assert.ok(inventory.includes('"\'' + name.replace(/"/g, '""') + '"'));
    else assert.ok(inventory.includes('"Normal,""quoted""\nname.txt"'));
    assert.equal(bundle.manifest.sourceMap[0].originalName, name);
  }
});
test('case, options and incoming archive bytes are captured before the first await', async () => {
  const c = fixture(), options = { layout: 'evidence' }, before = JSON.stringify(c), pending = B.createReviewBundle(c, options);
  c.name = 'Changed after request'; c.sources[0].records[0].text = 'Changed'; options.layout = 'review';
  const bundle = await pending, verifying = B.verifyReviewBundle(bundle.bytes);
  bundle.bytes.fill(0);
  const verified = await verifying;
  assert.deepEqual(verified.caseData, JSON.parse(before)); assert.equal(verified.manifest.layout, 'evidence');
});
test('ZIP CRC, local/central disagreement, flags, compression, symlinks and offset corruption fail closed', async () => {
  const { bytes } = await B.createReviewBundle(fixture());
  const original = Buffer.from(bytes), central = original.readUInt32LE(original.length - 6);
  for (const change of [
    b => b[30 + b.readUInt16LE(26)] ^= 1,
    b => b.writeUInt32LE(1, central + 42),
    b => b.writeUInt16LE(1, central + 8),
    b => b.writeUInt16LE(8, central + 10),
    b => b.writeUInt16LE(8, 6),
    b => b.writeUInt16LE(1, central + 30),
    b => b.writeUInt32LE(0xa1ff0000, central + 38),
    b => b.writeUInt32LE(0xffffffff, central + 24),
    b => b[30] ^= 1
  ]) { const b = Buffer.from(original); change(b); await assert.rejects(B.verifyReviewBundle(b), /Review bundle/); }
  await assert.rejects(B.verifyReviewBundle(Buffer.concat([original, Buffer.from('junk')])), /ZIP/);
  await assert.rejects(B.verifyReviewBundle(original.subarray(0, original.length - 1)), /ZIP/);
});
test('unsafe, duplicate, missing and unlisted ZIP entries are rejected', async () => {
  const { bytes } = await B.createReviewBundle(fixture()), entries = unpack(bytes);
  for (const name of ['../case.json', '/case.json', 'originals/../case.json', 'originals\\evil.original', 'C:case.json', 'review.HTML']) await assert.rejects(B.verifyReviewBundle(pack([...entries, [name, 'bad']])), /unsafe|ZIP/);
  await assert.rejects(B.verifyReviewBundle(pack([...entries, entries[0]])), /duplicate/);
  await assert.rejects(B.verifyReviewBundle(pack(entries.filter(([name]) => name !== 'review.json'))), /missing|extra/);
  await assert.rejects(B.verifyReviewBundle(pack([...entries, ['originals/' + '0'.repeat(64) + '.original', 'unlisted'] ])), /missing|extra/);
});
test('manifest shape, release policy and source membership are strict', async () => {
  const { bytes } = await B.createReviewBundle(fixture()), entries = unpack(bytes);
  for (const change of [
    m => m.official = true, m => m.release = 'APPROVED', m => m.layout = '__proto__', m => m.extra = 'hidden',
    m => m.sourceMap[0].originalName = 'foreign.txt', m => m.sourceMap[0].sourceId = 'foreign',
    m => m.files[0].unexpected = true, m => m.files[0].path = '../case.json', m => m.files.pop()
  ]) await assert.rejects(B.verifyReviewBundle(pack(updateManifest(entries, change))), /manifest|source membership|regenerated/);
});
test('SHA-256 mismatches and manifest-rehashed forged reports, inventories and originals are rejected', async () => {
  const { bytes } = await B.createReviewBundle(fixture());
  for (const target of ['review.html', 'review.json', 'source-inventory.csv', 'README.txt', 'originals/' + fixture().sources[0].hash + '.original']) {
    const entries = unpack(bytes).map(([name, value]) => [name, name === target ? Buffer.from('Forged content with valid ZIP CRC') : value]);
    await assert.rejects(B.verifyReviewBundle(pack(entries)), /SHA-256/);
    await assert.rejects(B.verifyReviewBundle(pack(rehashManifest(entries))), /regenerated/);
  }
});
test('a verified case from another bundle cannot replace the bound case silently', async () => {
  const first = await B.createReviewBundle(fixture()), other = fixture(); other.id = 'another-case';
  const second = await B.createReviewBundle(other), replacement = new Map(unpack(second.bytes)).get('case.json');
  const entries = unpack(first.bytes).map(([name, bytes]) => [name, name === 'case.json' ? replacement : bytes]);
  await assert.rejects(B.verifyReviewBundle(pack(rehashManifest(entries))), /cross-case/);
});
test('invalid cases, accessors, unsupported layouts and report resource excess reject without partial output', async () => {
  const c = fixture(); c.sources[0].records[0].sourceId = 'foreign'; await assert.rejects(B.createReviewBundle(c), /case validation/);
  await assert.rejects(B.createReviewBundle(fixture(), { layout: 'official' }), /layout/);
  await assert.rejects(B.createReviewBundle(fixture(), { layout: 'review', extra: true }), /only layout/);
  let executed = false; const options = {}; Object.defineProperty(options, 'layout', { get() { executed = true; return 'review'; } });
  await assert.rejects(B.createReviewBundle(fixture(), options), /accessors/); assert.equal(executed, false);
  const large = fixture(), base = large.sources[0].records[0]; large.sources[0].records = Array.from({ length: 5001 }, (_, i) => ({ ...base, id: base.id + ':' + i }));
  await assert.rejects(B.createReviewBundle(large), /5000-record limit/);
  await assert.rejects(B.verifyReviewBundle(new Uint8Array(21)), /128 MiB/);
  assert.equal(B.REVIEW_BUNDLE_LIMITS.archiveBytes, 128 * 1024 * 1024); assert.ok(Object.isFrozen(B.REVIEW_BUNDLE_LIMITS));
});
test('Buffer inputs are copied before asynchronous verification and empty source cases remain valid internally', async () => {
  const bundle = await B.createReviewBundle(fixture()), buffer = Buffer.from(bundle.bytes), pending = B.verifyReviewBundle(buffer);
  buffer.fill(0); assert.equal((await pending).validation.valid, true);
  const empty = fixture(); empty.sources = [];
  const result = await B.verifyReviewBundle((await B.createReviewBundle(empty)).bytes);
  assert.equal(result.validation.sourceCount, 0); assert.equal(result.validation.fileCount, 6);
  assert.equal(result.validation.official, false);
});
test('duplicate manifest keys and noncanonical encodings fail rather than relying on JSON viewer interpretation', async () => {
  const bundle = await B.createReviewBundle(fixture()), entries = unpack(bundle.bytes);
  for (const rewrite of [text => text.replace('"official": false', '"official": true, "official": false'), text => JSON.stringify(JSON.parse(text))]) {
    const changed = entries.map(([name, bytes]) => [name, name === 'manifest.json' ? Buffer.from(rewrite(bytes.toString())) : bytes]);
    await assert.rejects(B.verifyReviewBundle(pack(changed)), /canonical/);
  }
});
