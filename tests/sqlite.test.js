'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseSQLite, SQLITE_PARSER_VERSION, SQLITE_LIMITS } = require('../js/sqlite.js');
const fixture = name => new Uint8Array(fs.readFileSync(__dirname + '/fixtures/sqlite-' + name + '.db'));
test('SQLite reads real synthetic rowid tables and preserves column values and exact locators', () => {
  const records = parseSQLite(fixture('synthetic'));
  assert.equal(records.length, 122);
  const r = records[0];
  assert.equal(r.fields.id, -2); assert.equal(r.fields['case label'], 'Synthetic α');
  assert.equal(r.fields.salary_cents, 6000000); assert.equal(r.fields.ratio, 1.5); assert.equal(r.fields.note, null);
  assert.deepEqual(r.fields.payload, { type: 'blob', hex: '00ff' });
  assert.equal(r.locator.table, 'synthetic cases'); assert.equal(r.locator.rowid, -2);
  assert.deepEqual(r.locator.columns, ['id', 'case label', 'salary_cents', 'ratio', 'note', 'payload']);
  assert.ok(r.locator.page > 0); assert.ok(r.locator.byteOffset > 0);
  assert.equal(records[1].fields.id, '9223372036854775807');
  assert.equal(records[1].fields.salary_cents, '-9223372036854775808');
});
test('SQLite walks interior table pages and matches all 120 independently generated rows', () => {
  const rows = parseSQLite(fixture('synthetic')).filter(r => r.locator.table === 'counts');
  assert.equal(rows.length, 120);
  for (let i = 0; i < 120; i++) { assert.equal(rows[i].fields.key, i + 1); assert.equal(rows[i].fields.label, 'Synthetic row ' + (i + 1)); }
  assert.ok(new Set(rows.map(r => r.locator.page)).size > 1);
});
test('SQLite decodes native UTF-16 text without external dependencies', () => {
  const rows = parseSQLite(fixture('utf16'));
  assert.equal(rows[0].fields.value, 'Synthetic 😀 α');
});
test('SQLite reads the original overflow fixture but still rejects WITHOUT ROWID and WAL snapshots', () => {
  assert.equal(parseSQLite(fixture('overflow'))[0].fields.text_value, 'X'.repeat(2000));
  assert.throws(() => parseSQLite(fixture('without-rowid')), /WITHOUT ROWID/);
  const wal = fixture('synthetic'); wal[18] = 2;
  assert.throws(() => parseSQLite(wal), /Checkpoint/);
});
test('SQLite rejects encryption, truncated pages and malicious cell pointers', () => {
  assert.throws(() => parseSQLite(new Uint8Array(512)), /unencrypted/);
  const bytes = fixture('synthetic');
  assert.throws(() => parseSQLite(bytes.subarray(0, bytes.length - 1)), /truncated/);
  const bad = bytes.slice(); bad[108] = 255; bad[109] = 255;
  assert.throws(() => parseSQLite(bad), /cell pointer/);
});
test('quoted INTEGER type names preserve rowid primary-key aliases for all SQLite quoting forms', () => {
  const rows = parseSQLite(fixture('quoted-types'));
  assert.equal(rows.length, 6);
  for (const table of ['double_quote', 'single_quote', 'backtick', 'bracket']) {
    const row = rows.find(r => r.locator.table === table);
    assert.equal(row.locator.rowid, 17); assert.equal(row.fields.id, 17);
    assert.equal(row.fields.value, 'Synthetic ' + table);
  }
  // The historical inline PRIMARY KEY DESC exception and BIGINT do not alias rowid.
  for (const table of ['descending', 'big_type']) {
    const row = rows.find(r => r.locator.table === table);
    assert.equal(row.locator.rowid, 1); assert.equal(row.fields.id, 17);
  }
});
function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function firstOverflowPointer(record) { const local = record.locator.payloadSegments[0]; return local.byteOffset + local.length; }
test('SQLite v1.1 reconstructs multi-page text/blob records and exact integers without altering bytes', () => {
  assert.equal(SQLITE_PARSER_VERSION, '1.1.0'); assert.equal(SQLITE_LIMITS.totalPayloadBytes, 16 * 1024 * 1024);
  assert.ok(Object.isFrozen(SQLITE_LIMITS));
  const bytes = fixture('overflow-mixed'), before = bytes.slice(), rows = parseSQLite(bytes);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].fields.id, 17);
  assert.equal(rows[0].fields.value, '😀'.repeat(700) + 'αβ'.repeat(137) + ' Synthetic end');
  assert.deepEqual(rows[0].fields.payload, { type: 'blob', hex: Buffer.from(Array.from({ length: 1280 }, (_, i) => i % 256)).toString('hex') });
  assert.equal(rows[0].fields.exact_value, '9223372036854775807');
  assert.equal(rows[1].fields.value, 'Synthetic ' + 'é'.repeat(600));
  assert.equal(rows[1].fields.payload.hex, Buffer.from(Array.from({ length: 3100 }, (_, i) => (i * 17 + 11) % 256)).toString('hex'));
  assert.equal(rows[1].fields.exact_value, '-9223372036854775808');
  assert.equal(rows[2].fields.value, 'Synthetic fallback ' + 'Z'.repeat(2000));
  assert.equal(rows[2].fields.payload.hex, ''); assert.equal(rows[2].fields.exact_value, -17);
  assert.deepEqual(bytes, before);
});
test('SQLite physical payload segments are exact, ordered and cross UTF-8 code-point boundaries safely', () => {
  const bytes = fixture('overflow-mixed'), rows = parseSQLite(bytes), allOverflow = new Set();
  let splitCodePoint = false;
  for (const row of rows) {
    const segments = row.locator.payloadSegments;
    assert.equal(segments[0].kind, 'local'); assert.equal(segments[0].page, row.locator.page);
    const payload = new Uint8Array(row.locator.payloadBytes); let offset = 0;
    for (const segment of segments) {
      assert.equal(segment.payloadOffset, offset);
      assert.equal(Math.floor(segment.byteOffset / 512) + 1, segment.page);
      assert.ok(segment.byteOffset + segment.length <= segment.page * 512);
      if (segment.kind === 'overflow') { assert.ok(!allOverflow.has(segment.page)); allOverflow.add(segment.page); assert.equal(segment.byteOffset, (segment.page - 1) * 512 + 4); }
      payload.set(bytes.subarray(segment.byteOffset, segment.byteOffset + segment.length), offset); offset += segment.length;
    }
    assert.equal(offset, row.locator.payloadBytes);
    if (row.fields.id === 17) {
      const text = new TextEncoder().encode(row.fields.value);
      const start = Buffer.from(payload).indexOf(Buffer.from(text)); assert.ok(start >= 0);
      for (const segment of segments.slice(1)) if (segment.payloadOffset > start && segment.payloadOffset < start + text.length && (payload[segment.payloadOffset] & 0xc0) === 0x80) splitCodePoint = true;
    }
  }
  assert.ok(splitCodePoint, 'Fixture must split a multi-byte UTF-8 code point at a physical page boundary.');
});
test('SQLite reconstructs UTF-16BE surrogate pairs across overflow pages', () => {
  const rows = parseSQLite(fixture('overflow-utf16'));
  assert.equal(rows[0].fields.value, 'Synthetic 😀 αβ '.repeat(300));
  assert.ok(rows[0].locator.payloadSegments.length > 10);
});
test('SQLite accounts for index overflow, auto-vacuum pointer maps and freelist pages', () => {
  const indexed = parseSQLite(fixture('overflow-index'));
  assert.equal(indexed.length, 50);
  for (let i = 0; i < 50; i++) {
    assert.equal(indexed[i].fields.id, i + 1); assert.equal(indexed[i].fields.label, 'Synthetic ' + (i + 1) + '😀'.repeat(200));
    assert.equal(indexed[i].fields.payload.hex, Buffer.from(Array.from({ length: 768 }, (_, n) => n % 256)).toString('hex'));
  }
  assert.equal(parseSQLite(fixture('overflow-freelist'))[0].fields.value, 'Synthetic ' + 'α'.repeat(2400));
});
test('SQLite rejects cyclic, shared, early-ending, excess and out-of-range overflow pointers', () => {
  const original = fixture('overflow-mixed'), rows = parseSQLite(original), first = rows[0], overflows = first.locator.payloadSegments.slice(1);
  for (const corrupt of [
    bytes => view(bytes).setUint32(firstOverflowPointer(first), 0),
    bytes => view(bytes).setUint32(firstOverflowPointer(first), original.length / 512 + 1),
    bytes => view(bytes).setUint32(firstOverflowPointer(first), first.locator.page),
    bytes => view(bytes).setUint32((overflows[0].page - 1) * 512, overflows[0].page),
    bytes => view(bytes).setUint32((overflows.at(-1).page - 1) * 512, overflows[0].page),
    bytes => view(bytes).setUint32(firstOverflowPointer(rows[1]), overflows[0].page)
  ]) {
    const bytes = original.slice(); corrupt(bytes);
    assert.throws(() => parseSQLite(bytes), /SQLite:.*(?:overflow|ownership)/);
  }
});
test('SQLite rejects overflow pointers into freelist, pointer-map and index pages', () => {
  const free = fixture('overflow-freelist'), kept = parseSQLite(free)[0];
  view(free).setUint32(firstOverflowPointer(kept), view(free).getUint32(32));
  assert.throws(() => parseSQLite(free), /ownership/);
  for (const target of [2, 4]) {
    const bytes = fixture('overflow-index'), row = parseSQLite(bytes)[0];
    view(bytes).setUint32(firstOverflowPointer(row), target);
    assert.throws(() => parseSQLite(bytes), /ownership|b-tree root/);
  }
  const indexChild = fixture('overflow-index'), row = parseSQLite(indexChild)[0];
  const childPage = Array.from({ length: indexChild.length / 512 }, (_, i) => i + 1).find(page => page !== 4 && indexChild[(page - 1) * 512] === 10);
  assert.ok(childPage, 'Fixture needs non-root index pages.');
  view(indexChild).setUint32(firstOverflowPointer(row), childPage);
  assert.throws(() => parseSQLite(indexChild), /ownership/);
});
test('SQLite refuses missing physical pages, impossible logical sizes and nonterminal chains', () => {
  const bytes = fixture('overflow-mixed'), row = parseSQLite(bytes)[0];
  const truncated = bytes.slice(0, bytes.length - 512);
  view(truncated).setUint32(28, truncated.length / 512);
  assert.throws(() => parseSQLite(truncated), /ownership|overflow|snapshot/);
  // 16 MiB declared record payload plus the already-read schema exceeds the global budget.
  const bomb = bytes.slice(); bomb.set([0x88, 0x80, 0x80, 0x00], row.locator.byteOffset);
  assert.throws(() => parseSQLite(bomb), /payload budget/);
});
test('SQLite reconstructs serial headers and eight-byte integers split across local/overflow storage', () => {
  const bytes = fixture('overflow-boundaries'), rows = parseSQLite(bytes);
  const wide = rows.find(row => row.locator.table === 'wide_row');
  assert.equal(Object.keys(wide.fields).length, 80);
  for (let i = 0; i < 79; i++) assert.equal(wide.fields['c' + i], 'Synthetic ' + String(i).padStart(2, '0') + ' ' + 'x'.repeat(89));
  // 80 serial types require a 162-byte logical header, exceeding this local segment.
  assert.ok(wide.locator.payloadSegments[0].length < 162);
  const numeric = rows.find(row => row.locator.table === 'numeric_boundary');
  assert.equal(numeric.fields.exact_value, '-9223372036854775808'); assert.equal(numeric.fields.tail, 'T'.repeat(1000));
  assert.equal(numeric.fields.prefix.hex, Buffer.from(Array.from({ length: 30 }, (_, i) => i)).toString('hex'));
  assert.equal(numeric.locator.payloadSegments[0].length, 39);
  const payload = Buffer.concat(numeric.locator.payloadSegments.map(segment => Buffer.from(bytes.subarray(segment.byteOffset, segment.byteOffset + segment.length))));
  const numberStart = payload.indexOf(Buffer.from('8000000000000000', 'hex'));
  assert.equal(numberStart, 36); assert.ok(numberStart < 39 && numberStart + 8 > 39);
  assert.equal(rows.find(row => row.locator.table === 'bom_text').fields.value, '\ufeffSynthetic BOM preserved');
});
