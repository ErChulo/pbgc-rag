'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseSQLite } = require('../js/sqlite.js');
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
test('SQLite rejects overflow, WITHOUT ROWID and WAL snapshots explicitly', () => {
  assert.throws(() => parseSQLite(fixture('overflow')), /overflow payload/);
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
