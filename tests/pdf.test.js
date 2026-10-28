'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deflateSync } = require('node:zlib');
const { parsePDF, pdfLimits } = require('../js/pdf.js');
function pdf({ content = 'BT /F1 12 Tf 72 720 Td (Synthetic pension evidence.) Tj ET', compressed = false, font = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', trailer = '', pageExtra = '', streamExtra = '', lengthOverride, extraObjects = [], twoPages = false } = {}) {
  const stream = compressed ? deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [3 0 R${twoPages ? ' 6 0 R' : ''}] /Count ${twoPages ? 2 : 1} /Resources << /Font << /F1 4 0 R >> >> >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R ${pageExtra} >>`,
    font,
    Buffer.concat([Buffer.from(`<< /Length ${lengthOverride ?? stream.length} ${compressed ? '/Filter /FlateDecode' : ''} ${streamExtra} >>\nstream\n`), stream, Buffer.from('\nendstream')]),
    ...(twoPages ? ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>'] : []),
    ...extraObjects
  ];
  const buffers = [Buffer.from('%PDF-1.7\n%\xFF\xFF\xFF\xFF\n', 'latin1')], offsets = [0]; let size = buffers[0].length;
  objects.forEach((object, i) => { offsets.push(size); const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object, 'latin1'), Buffer.from('\nendobj\n')]); buffers.push(part); size += part.length; });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${size}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([...buffers, Buffer.from(xref)]));
}
test('extracts real PDF text with page and decoded operand locators', async () => {
  const rows = await parsePDF(pdf()); assert.equal(rows.length, 1); assert.equal(rows[0].text, 'Synthetic pension evidence.');
  assert.equal(rows[0].locator.page, 1); assert.equal(rows[0].locator.contentObject, '5 0'); assert.equal(rows[0].locator.operandOffset, 23); assert.equal(rows[0].locator.boundingBox, null);
  assert.match(rows[0].fields.extraction, /not inferred/);
});
test('decompresses FlateDecode content locally and preserves encoded text order', async () => {
  const rows = await parsePDF(pdf({ compressed: true, content: 'BT /F1 10 Tf [(Age) -120 ( 65)] TJ (Next\\040line) \' 0 0 (Quote) " ET' }));
  assert.deepEqual(rows.map(r => r.text), ['Age 65', 'Next line', 'Quote']);
  assert.deepEqual(rows[0].fields.spacingAdjustments, [-120]); assert.deepEqual(rows[0].fields.fragments, ['Age', ' 65']);
});
test('supports hex strings, escaped delimiters and WinAnsi punctuation', async () => {
  const rows = await parsePDF(pdf({ content: 'BT /F1 10 Tf <486578> Tj (A\\(B\\) \\200) Tj ET' }));
  assert.deepEqual(rows.map(r => r.text), ['Hex', 'A(B) €']);
});
test('rejects encrypted, incremental, hybrid and unsupported font mappings', async () => {
  for (const trailer of ['/Encrypt 6 0 R', '/Prev 0', '/XRefStm 6']) await assert.rejects(parsePDF(pdf({ trailer })));
  for (const font of ['<< /Subtype /Type0 /BaseFont /Helvetica >>', '<< /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>', '<< /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Differences [65 /Z] >> >>', '<< /Subtype /Type1 /BaseFont /Symbol >>']) await assert.rejects(parsePDF(pdf({ font })), /font|encoding/i);
});
test('never claims OCR, image, form, replacement-text or unknown-operator support', async () => {
  for (const content of ['', 'q Q', '/Image1 Do', 'BI ID abc EI', '/Span << /ActualText (other) >> BDC', 'BT /F1 12 Tf (x) MadeUp ET']) await assert.rejects(parsePDF(pdf({ content })), /text|unsupported|parser/i);
});
test('rejects malformed streams, references, strings and fontless text', async () => {
  for (const config of [{ lengthOverride: 100000 }, { lengthOverride: '6 0 R' }, { content: 'BT (not allowed) Tj ET' }, { content: 'BT /F1 12 Tf (unclosed Tj ET' }, { content: 'BT /F1 12 Tf (x) Tj' }, { streamExtra: '/DecodeParms << /Predictor 12 >>' }, { streamExtra: '/Filter /LZWDecode' }]) await assert.rejects(parsePDF(pdf(config)));
  const corrupted = pdf(); corrupted[0] = 0; await assert.rejects(parsePDF(corrupted), /conventional PDF/);
});
test('bounded inflate rejects compressed bombs and oversized files', async () => {
  await assert.rejects(parsePDF(pdf({ compressed: true, content: ' '.repeat(pdfLimits.streamBytes + 1) })), /Decompressed stream limit/);
  await assert.rejects(parsePDF(new Uint8Array(pdfLimits.fileBytes + 1)), /16 MiB/);
});
test('page tree cycles and missing child references fail closed', async () => {
  const bytes = pdf(); const source = Buffer.from(bytes).toString('latin1');
  await assert.rejects(parsePDF(new Uint8Array(Buffer.from(source.replace('/Kids [3 0 R]', '/Kids [2 0 R]'), 'latin1'))), /Cyclic/);
  await assert.rejects(parsePDF(new Uint8Array(Buffer.from(source.replace('/Kids [3 0 R]', '/Kids [9 0 R]'), 'latin1'))), /Missing referenced/);
});

test('page numbers follow the page tree with inherited resources', async () => {
  const rows = await parsePDF(pdf({ twoPages: true }));
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => r.locator.page), [1, 2]);
});
