'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const { deflateRawSync } = require('node:zlib');
const { parseOffice } = require('../js/office.js');
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function zip(files, options = {}) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = Buffer.from(name), bytes = Buffer.from(content), compressed = options.stored ? bytes : deflateRawSync(bytes), method = options.stored ? 0 : 8, crc = crc32(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(options.encrypted ? 1 : 0, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(options.encrypted ? 1 : 0, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); centrals.push(central, filename); offset += 30 + filename.length + compressed.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
const word = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Synthetic plan</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Benefit &amp; evidence</w:t><w:tab/><w:t>123</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Second cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:del><w:r><w:delText>Deleted</w:delText></w:r></w:del><w:r><w:instrText>INCLUDETEXT https://invalid</w:instrText><w:t>Cached result</w:t></w:r></w:p></w:body></w:document>';
function wordZip(document = word, options) { return zip({ '[Content_Types].xml': contentTypes, 'word/document.xml': document }, options); }
function bookFiles(worksheet) { return {
  '[Content_Types].xml': contentTypes,
  'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic &amp; plan" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Shared benefit</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': worksheet || '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>9007199254740993</v></c><c r="C1"><f>SUM(B2:B3)</f><v>25</v></c><c r="D1" t="inlineStr"><is><t>Inline text</t></is></c><c r="E1" t="s"><v>1</v></c></row></sheetData></worksheet>',
  'xl/vbaProject.bin': 'Inert synthetic macro bytes. Never executed.'
}; }
test('DOCX extracts paragraphs and table cells with exact OOXML locators', async () => {
  const records = await parseOffice(wordZip(), 'docx');
  assert.deepEqual(records.map(x => x.text), ['Synthetic plan', 'Benefit & evidence\t123', 'Second cell', 'Cached result']);
  assert.equal(records[0].fields.style, 'Heading1'); assert.equal(records[1].locator.table, 1); assert.equal(records[1].locator.row, 1); assert.equal(records[1].locator.cell, 1); assert.equal(records[2].locator.cell, 2); assert.equal(records[3].locator.paragraph, 4);
});
test('stored ZIP archives and sliced Uint8Arrays work without relying on buffer offsets', async () => {
  const bytes = wordZip(word, { stored: true }); const outer = Buffer.concat([Buffer.from('padding'), bytes, Buffer.from('tail')]);
  assert.equal((await parseOffice(outer.subarray(7, outer.length - 4), 'docx'))[0].text, 'Synthetic plan');
});
test('XLSX and XLSM preserve sheet/cell, shared and inline strings, raw numbers, cached values and formulas', async () => {
  for (const extension of ['xlsx', 'xlsm']) {
    const records = await parseOffice(zip(bookFiles()), extension);
    assert.deepEqual(records.map(x => x.fields.value), ['Shared benefit', '9007199254740993', '25', 'Inline text', 'Rich text']);
    assert.equal(records[0].locator.sheet, 'Synthetic & plan'); assert.equal(records[2].locator.cell, 'C1'); assert.equal(records[2].fields.formula, 'SUM(B2:B3)'); assert.equal(records[2].fields.formulaEvaluated, false);
    assert.equal(records.length, 5);
  }
});
test('Office XML blocks DTDs, malformed nesting/attributes, duplicate attributes and multiple roots', async () => {
  for (const document of ['<!DOCTYPE a SYSTEM "https://invalid"><a/>', '<w:document><w:body></w:document>', '<a/><b/>', '<a x="1" x="2"/>', '<a x=>bad</a>', '<a>&bad;</a>']) await assert.rejects(parseOffice(wordZip(document), 'docx'), /Office import/);
});
test('ZIP checksums, encryption, traversal and expansion attacks fail closed', async () => {
  const damaged = wordZip(word, { stored: true }); const position = damaged.indexOf(Buffer.from('Synthetic plan')); damaged[position] ^= 1;
  await assert.rejects(parseOffice(damaged, 'docx'), /checksum/);
  await assert.rejects(parseOffice(wordZip(word, { encrypted: true }), 'docx'), /encrypted/);
  await assert.rejects(parseOffice(zip({ '../escape': 'x' }), 'docx'), /unsafe/);
  await assert.rejects(parseOffice(zip({ bomb: 'x'.repeat(100000) }), 'docx'), /expansion/);
  await assert.rejects(parseOffice(Buffer.from('not a zip'), 'docx'), /ZIP/);
  await assert.rejects(parseOffice(wordZip(), 'doc'), /legacy DOC/);
});
test('XLSX refuses external sheets, absent shared strings, duplicate cells and out-of-range coordinates', async () => {
  const external = bookFiles(); external['xl/_rels/workbook.xml.rels'] = '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://invalid/sheet.xml" TargetMode="External"/></Relationships>';
  await assert.rejects(parseOffice(zip(external), 'xlsx'), /worksheet relationship/);
  for (const cell of ['<c r="A1" t="s"><v>999</v></c>', '<c r="A1"/><c r="A1"/>', '<c r="XFE1"/>', '<c r="A1048577"/>', '<c/>']) await assert.rejects(parseOffice(zip(bookFiles(`<worksheet><sheetData><row>${cell}</row></sheetData></worksheet>`)), 'xlsx'), /Office import/);
});
test('ZIP member local/central size mismatch and truncation are rejected', async () => {
  const mismatch = wordZip(); mismatch.writeUInt32LE(123, 22);
  await assert.rejects(parseOffice(mismatch, 'docx'), /disagree/);
  const truncated = wordZip().subarray(0, -5); await assert.rejects(parseOffice(truncated, 'docx'), /ZIP/);
});
