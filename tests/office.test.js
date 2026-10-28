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
test('XLSX parseFile and case package pipeline preserve original bytes, SHA-256, cell provenance and formulas', async () => {
  const { createHash } = require('node:crypto');
  const { parseFile } = require('../js/parsers.js');
  const { validateCase, exportCase, importCase } = require('../js/artifacts.js');
  const bytes = zip(bookFiles());
  const source = await parseFile({ name: 'synthetic-case.xlsx', size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  assert.equal(source.hash, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(Buffer.from(source.originalBase64, 'base64'), bytes);
  assert.equal(source.records[2].sourceId, source.id);
  assert.equal(source.records[2].locator.label, 'Synthetic & plan!C1');
  assert.equal(source.records[2].fields.formula, 'SUM(B2:B3)');
  const caseData = { schemaVersion: 1, id: 'synthetic-office-case', name: 'Synthetic Office evidence', createdAt: '2026-10-28T00:00:00.000Z', sources: [source], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
  assert.equal(validateCase(caseData).valid, true);
  const restored = await importCase(await exportCase(caseData));
  assert.deepEqual(restored, caseData);
  const altered = JSON.parse(JSON.stringify(caseData));
  const corrupted = Buffer.from(altered.sources[0].originalBase64, 'base64'); corrupted[0] ^= 1;
  altered.sources[0].originalBase64 = corrupted.toString('base64');
  await assert.rejects(exportCase(altered), /hash mismatch/);
});

test('spreadsheet phonetic annotations do not alter actual rich-string cell values', async () => {
  const files = bookFiles('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><r><t>Visible</t></r><rPh sb="0" eb="7"><t>phonetic</t></rPh></is></c></row></sheetData></worksheet>');
  files['xl/sharedStrings.xml'] = '<sst><si><r><t>Benefit</t></r><rPh sb="0" eb="7"><t>phonetic</t></rPh></si></sst>';
  const records = await parseOffice(zip(files), 'xlsx');
  assert.deepEqual(records.map(x => x.fields.value), ['Benefit', 'Visible']);
});

function relatedWordFiles() {
  const relationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  return {
    '[Content_Types].xml': contentTypes,
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Main evidence</w:t><w:footnoteReference w:id="5"/><w:endnoteReference w:id="7"/></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h1"/><w:headerReference w:type="first" r:id="h2"/><w:footerReference w:type="default" r:id="f1"/></w:sectPr></w:body></w:document>',
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + [
      ['h1', 'header', 'header1.xml'], ['h2', 'header', 'header1.xml'], ['f1', 'footer', 'footer1.xml'],
      ['fn', 'footnotes', 'footnotes.xml'], ['en', 'endnotes', 'endnotes.xml']
    ].map(([Id, Type, Target]) => `<Relationship Id="${Id}" Type="${relationshipType + Type}" Target="${Target}"/>`).join('') + `<Relationship Id="link" Type="${relationshipType}hyperlink" Target="https://invalid.test/synthetic" TargetMode="External"/></Relationships>`,
    'word/header1.xml': '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Shared header</w:t></w:r><w:fldSimple w:instr="INCLUDETEXT https://invalid.test/field"><w:r><w:t> cached value</w:t></w:r></w:fldSimple><w:r><w:instrText>SECRET FIELD INSTRUCTION</w:instrText></w:r></w:p></w:hdr>',
    'word/footer1.xml': '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Footer table evidence</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:ftr>',
    'word/footnotes.xml': '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:t>Separator control text</w:t></w:r></w:p></w:footnote><w:footnote w:id="5"><w:p><w:r><w:t>Footnote current</w:t></w:r></w:p></w:footnote><w:footnote w:id="8"><w:p><w:r><w:t>Stored uncited footnote</w:t></w:r></w:p></w:footnote></w:footnotes>',
    'word/endnotes.xml': '<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="7"><w:p><w:moveFrom><w:r><w:t>Moved old endnote</w:t></w:r></w:moveFrom><w:r><w:t>Endnote current</w:t><w:delInstrText>Deleted field instruction</w:delInstrText></w:r></w:p></w:endnote></w:endnotes>',
    'word/header-not-related.xml': '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Unrelated part must not be guessed as active</w:t></w:r></w:p></w:hdr>'
  };
}
test('DOCX related text parts retain role and precise part/note/table locators, shared headers deduplicate', async () => {
  const records = await parseOffice(zip(relatedWordFiles()), 'docx');
  assert.deepEqual(records.map(r => r.text), ['Main evidence', 'Shared header cached value', 'Footer table evidence', 'Footnote current', 'Stored uncited footnote', 'Endnote current']);
  assert.equal(records[0].locator.label, 'Paragraph 1');
  assert.equal(records[0].locator.part, 'word/document.xml'); assert.equal(records[0].locator.role, 'body');
  const header = records.find(r => r.locator.role === 'header');
  assert.equal(header.locator.part, 'word/header1.xml'); assert.equal(header.locator.paragraph, 1);
  assert.deepEqual(header.fields.relationshipIds, ['h1', 'h2']);
  assert.deepEqual(header.fields.referenceTypes, ['default', 'first']); assert.equal(header.fields.referencedInDocument, true);
  const footer = records.find(r => r.locator.role === 'footer');
  assert.equal(footer.locator.part, 'word/footer1.xml'); assert.equal(footer.locator.table, 1); assert.equal(footer.locator.row, 1); assert.equal(footer.locator.cell, 1);
  const note = records.find(r => r.locator.noteId === '5');
  assert.equal(note.locator.role, 'footnote'); assert.equal(note.locator.part, 'word/footnotes.xml'); assert.equal(note.locator.paragraph, 1); assert.equal(note.fields.referencedInDocument, true);
  assert.equal(records.find(r => r.locator.noteId === '8').fields.referencedInDocument, false);
  assert.ok(!records.some(r => /SECRET|Moved old|Separator|Deleted field|Unrelated part/.test(r.text)));
});
test('DOCX text parts linked but unused in current sections are explicitly marked stored, not rendered applicability', async () => {
  const files = relatedWordFiles();
  files['word/document.xml'] = files['word/document.xml'].replace(/<w:headerReference[^>]*\/>/g, '');
  const records = await parseOffice(zip(files), 'docx');
  const header = records.find(r => r.locator.role === 'header');
  assert.equal(header.fields.referencedInDocument, false); assert.deepEqual(header.fields.referenceTypes, []);
  assert.equal(header.text, 'Shared header cached value');
  assert.ok(!Object.hasOwn(header.locator, 'page'));
});
test('DOCX actual relationship targets and source locators survive parseFile and portable recovery', async () => {
  const { parseFile } = require('../js/parsers.js'), { exportCase, importCase } = require('../js/artifacts.js');
  const files = relatedWordFiles();
  files['word/_rels/document.xml.rels'] = files['word/_rels/document.xml.rels'].replace('Target="footer1.xml"', 'Target="parts/footer-custom.xml"');
  files['word/parts/footer-custom.xml'] = files['word/footer1.xml']; delete files['word/footer1.xml'];
  const bytes = zip(files), source = await parseFile(new File([bytes], 'synthetic-related-parts.docx'));
  assert.equal(source.records.find(r => r.locator.role === 'footer').locator.part, 'word/parts/footer-custom.xml');
  assert.deepEqual(Buffer.from(source.originalBase64, 'base64'), bytes);
  const c = { schemaVersion: 1, id: 'synthetic-related-parts', name: 'Synthetic related Word text', createdAt: '2026-10-28T00:00:00.000Z', sources: [source], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
  assert.deepEqual(await importCase(await exportCase(c)), c);
});
test('DOCX relationship-linked text rejects missing, malformed, conflicting or external targets', async () => {
  const variants = [];
  const missing = relatedWordFiles(); delete missing['word/header1.xml']; variants.push(missing);
  const malformed = relatedWordFiles(); malformed['word/header1.xml'] = '<w:hdr><w:p>broken'; variants.push(malformed);
  const wrongRoot = relatedWordFiles(); wrongRoot['word/header1.xml'] = '<w:ftr><w:p/></w:ftr>'; variants.push(wrongRoot);
  const noRelations = relatedWordFiles(); delete noRelations['word/_rels/document.xml.rels']; variants.push(noRelations);
  for (const target of ['https://invalid.test/header.xml', '//invalid.test/header.xml', '../../escape.xml', '%2e%2e/header.xml']) {
    const files = relatedWordFiles(); files['word/_rels/document.xml.rels'] = files['word/_rels/document.xml.rels'].replace('Target="header1.xml"', `Target="${target}"`); variants.push(files);
  }
  const external = relatedWordFiles(); external['word/_rels/document.xml.rels'] = external['word/_rels/document.xml.rels'].replace('Target="header1.xml"', 'Target="header1.xml" TargetMode="External"'); variants.push(external);
  const conflicting = relatedWordFiles(); conflicting['word/_rels/document.xml.rels'] = conflicting['word/_rels/document.xml.rels'].replace('relationships/footer', 'relationships/header').replace('Target="footer1.xml"', 'Target="endnotes.xml"'); variants.push(conflicting);
  for (const files of variants) await assert.rejects(parseOffice(zip(files), 'docx'), /Office import/);
});
test('DOCX notes reject missing citations, duplicate ids, unsupported roots and ambiguous note parts', async () => {
  const variants = [];
  const missingCited = relatedWordFiles(); missingCited['word/footnotes.xml'] = missingCited['word/footnotes.xml'].replace('w:id="5"', 'w:id="6"'); variants.push(missingCited);
  const duplicate = relatedWordFiles(); duplicate['word/footnotes.xml'] = duplicate['word/footnotes.xml'].replace('w:id="8"', 'w:id="5"'); variants.push(duplicate);
  const wrongRoot = relatedWordFiles(); wrongRoot['word/endnotes.xml'] = '<w:comments/>'; variants.push(wrongRoot);
  const ambiguousZero = relatedWordFiles(); ambiguousZero['word/footnotes.xml'] = ambiguousZero['word/footnotes.xml'].replace('w:id="8"', 'w:id="-0"'); variants.push(ambiguousZero);
  const noNoteRelation = relatedWordFiles(); noNoteRelation['word/_rels/document.xml.rels'] = noNoteRelation['word/_rels/document.xml.rels'].replace(/<Relationship Id="fn"[^>]*\/>/, ''); variants.push(noNoteRelation);
  const multiple = relatedWordFiles(); multiple['word/_rels/document.xml.rels'] = multiple['word/_rels/document.xml.rels'].replace('</Relationships>', '<Relationship Id="fn2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes-other.xml"/></Relationships>'); multiple['word/footnotes-other.xml'] = multiple['word/footnotes.xml']; variants.push(multiple);
  for (const files of variants) await assert.rejects(parseOffice(zip(files), 'docx'), /Office import/);
});
test('DOCX deleted references do not require live parts, strict relationship URIs and alternate prefixes remain supported', async () => {
  const files = relatedWordFiles();
  files['word/document.xml'] = files['word/document.xml'].replace('<w:sectPr>', '<w:p><w:del><w:r><w:footnoteReference w:id="999"/></w:r></w:del></w:p><w:sectPr>');
  files['word/_rels/document.xml.rels'] = files['word/_rels/document.xml.rels'].replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships/', 'http://purl.oclc.org/ooxml/officeDocument/relationships/');
  files['word/footnotes.xml'] = files['word/footnotes.xml'].replaceAll('w:', 'n:').replace('xmlns:w=', 'xmlns:n=');
  const records = await parseOffice(zip(files), 'docx');
  assert.equal(records.find(r => r.locator.noteId === '5').text, 'Footnote current');
  assert.equal(records.filter(r => r.locator.role === 'header').length, 1);
});
