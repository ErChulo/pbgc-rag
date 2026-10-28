'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFile, parserRegistry } = require('../js/parsers.js');
const { createHash } = require('node:crypto');
function file(name, text) { const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text); return { name, size: bytes.length, async arrayBuffer() { return Uint8Array.from(bytes).buffer; } }; }
test('text keeps bytes, SHA-256, stable IDs and exact source line offsets', async () => {
  const text = 'First\r\n\r\nBenefit: 123\n'; const result = await parseFile(file('synthetic.txt', text));
  assert.equal(result.hash, createHash('sha256').update(text).digest('hex'));
  assert.equal(Buffer.from(result.originalBase64, 'base64').toString(), text);
  assert.deepEqual(result.records.map(x => [x.text, x.locator.line, x.locator.offset]), [['First', 1, 0], ['Benefit: 123', 3, 9]]);
  assert.equal((await parseFile(file('renamed.md', text))).id, result.id);
  assert.equal(result.parserVersion, '1.0.0');
});
test('CSV preserves quoted delimiters, embedded newlines, escaped quotes, empty cells and source coordinates', async () => {
  const text = 'name,amount,note\r\n"Synthetic, A",12,"one\r\ntwo ""quoted"""\r\nB,0,';
  const result = await parseFile(file('synthetic.csv', text));
  assert.deepEqual(result.records[1].fields.cells, ['Synthetic, A', '12', 'one\r\ntwo "quoted"']);
  assert.equal(result.records[1].locator.row, 2); assert.equal(result.records[2].locator.line, 4);
  const cell = result.records[1].locator.columns[0]; assert.equal(text.slice(cell.offset, cell.offset + cell.length), '"Synthetic, A"');
  assert.deepEqual(result.records[2].fields.cells, ['B', '0', '']);
});
test('CSV rejects malformed quotes without silently changing fields', async () => {
  for (const text of ['a,"unclosed', 'a,"closed"bad', 'a,un"quoted']) await assert.rejects(parseFile(file('bad.csv', text)), /quote|Quote/);
});
test('TSV treats formula-looking cells as inert text', async () => {
  const result = await parseFile(file('synthetic.tsv', 'a\tb\n=HYPERLINK("https://invalid")\t2'));
  assert.equal(result.records[1].fields.cells[0], '=HYPERLINK("https://invalid")');
});
test('JSON supports RFC 6901 pointers, typed scalar values and empty structures', async () => {
  const result = await parseFile(file('synthetic.json', '{"a/b":{"~x":[false,null,{}]}}'));
  assert.deepEqual(result.records.map(x => x.locator.pointer), ['/a~1b/~0x/0', '/a~1b/~0x/1', '/a~1b/~0x/2']);
  assert.equal(result.records[0].fields.value, false); assert.equal(result.records[1].fields.value, null);
  await assert.rejects(parseFile(file('bad.json', '{bad}')), /JSON|property/);
});
test('XML locates repeated siblings, decodes entities, preserves CDATA and rejects unsafe or malformed input', async () => {
  const text = '<?xml version="1.0"?><plan><term>A &amp; B</term><term><![CDATA[x < y]]></term></plan>';
  const result = await parseFile(file('synthetic.xml', text));
  assert.deepEqual(result.records.map(x => [x.text, x.locator.path]), [['A & B', '/plan[1]/term[1]'], ['x < y', '/plan[1]/term[2]']]);
  assert.equal(text.slice(result.records[0].locator.offset, result.records[0].locator.offset + result.records[0].locator.length), 'A &amp; B');
  for (const text of ['<!DOCTYPE a SYSTEM "https://invalid"><a/>', '<a><b></a>', '<a>&unknown;</a>', '<a/><b/>', '<a>', '<a attr=>x</a>']) await assert.rejects(parseFile(file('bad.xml', text)));
});
test('HTML extracts inert evidence without loading active markup', async () => {
  const html = '<!doctype html><html><head><script>alert(1)</script><style>body{background:url(https://invalid)}</style></head><body><p>Plan &amp; benefit</p><img src="https://invalid" onerror="alert(1)"><p>Second</p></body></html>';
  const result = await parseFile(file('synthetic.html', html));
  assert.deepEqual(result.records.map(x => x.text), ['Plan & benefit', 'Second']);
  assert.equal(result.records[1].locator.path, '/html[1]/body[1]/p[2]');
});
test('limits, unsupported binary formats and invalid encodings fail closed', async () => {
  await assert.rejects(parseFile({ name: 'big.txt', size: parserRegistry.maxBytes + 1, arrayBuffer() { throw Error('must not read'); } }), /16 MiB/);
  for (const name of ['plan.pdf', 'plan.docx', 'plan.xlsm', 'plan.sqlite']) await assert.rejects(parseFile(file(name, 'fake')), /Unsupported format/);
  await assert.rejects(parseFile(file('bad.txt', Buffer.from([0xff, 0x80]))));
  await assert.rejects(parseFile(file('bad.txt', 'a\0b')), /Binary/);
  await assert.rejects(parseFile(file('deep.json', '['.repeat(66) + '0' + ']'.repeat(66))), /depth/);
});
test('UTF-16 BOM sources retain original bytes and decode accurately', async () => {
  const bytes = Buffer.concat([Buffer.from([255, 254]), Buffer.from('Synthetic\nBenefit', 'utf16le')]);
  const result = await parseFile(file('synthetic.txt', bytes));
  assert.equal(result.encoding, 'utf-16le'); assert.equal(result.records[1].text, 'Benefit');
  assert.deepEqual(Buffer.from(result.originalBase64, 'base64'), bytes);
});
