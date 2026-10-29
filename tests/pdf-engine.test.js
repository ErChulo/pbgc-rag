'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{deflateSync}=require('node:zlib');
require('../vendor/pdfjs/pdfjs-local.js');
const {parsePDFAdvanced,pdfAdvancedLimits,PDF_ADVANCED_PARSER_VERSION}=require('../js/pdf-engine.js');
function stream(content,filter=''){const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} ${filter} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);}
function pdf({content='BT /F1 12 Tf 72 720 Td (Synthetic PDF text) Tj ET',unicode=false,xrefStream=false,extra=[],compress=false,secondFont=false}={}){
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R ${secondFont?'/F2 6 0 R':''} >> >> /Contents 5 0 R >>`),Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${unicode?'/Encoding << /Type /Encoding /Differences [1 /A] >> /ToUnicode 6 0 R':'/Encoding /WinAnsiEncoding'} >>`),compress?stream(deflateSync(Buffer.from(content)),'/Filter /FlateDecode'):stream(content)];
 if(unicode)objects.push(stream('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Synthetic) /Ordering (Synthetic) /Supplement 0 >> def /CMapName /Synthetic def /CMapType 2 def 1 begincodespacerange <01> <01> endcodespacerange 1 beginbfchar <01> <03A9> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end'));
 if(secondFont){if(unicode)throw Error('Test helper font options conflict.');objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'));}
 objects.push(...extra);const offsets=[0];let out=Buffer.from('%PDF-1.7\n');
 objects.forEach((o,i)=>{offsets.push(out.length);out=Buffer.concat([out,Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from('\nendobj\n')]);});
 const position=out.length;
 if(xrefStream){const xrefId=objects.length+1;offsets.push(position);const rows=Buffer.alloc((offsets.length)*7);for(let i=0;i<offsets.length;i++){rows[i*7]=i===0?0:1;rows.writeUInt32BE(offsets[i],i*7+1);rows.writeUInt16BE(i===0?65535:0,i*7+5);}const encoded=deflateSync(rows);out=Buffer.concat([out,Buffer.from(`${xrefId} 0 obj\n<< /Type /XRef /Root 1 0 R /Size ${offsets.length} /W [1 4 2] /Filter /FlateDecode /Length ${encoded.length} >>\nstream\n`),encoded,Buffer.from(`\nendstream\nendobj\nstartxref\n${position}\n%%EOF\n`)]);}
 else {out=Buffer.concat([out,Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`)]);}
 return Uint8Array.from(out);
}
// Synthetic font was created from original rectangle outlines with fontTools; no third-party font binary is embedded.
const fixtures={"embedded":"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NTAgMCA1NTAgNzAwIF0gL0ZvbnRGaWxlMiA1IDAgUiAKICAvRm9udE5hbWUgL0FBQUFBQStTeW50aGV0aWNUZXN0T25seSAvSXRhbGljQW5nbGUgMCAvTWlzc2luZ1dpZHRoIDYwMCAvU3RlbVYgODcgL1R5cGUgL0ZvbnREZXNjcmlwdG9yCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9CYXNlRm9udCAvQUFBQUFBK1N5bnRoZXRpY1Rlc3RPbmx5IC9GaXJzdENoYXIgMCAvRm9udERlc2NyaXB0b3IgNiAwIFIgL0xhc3RDaGFyIDEyNyAvTmFtZSAvRjIrMCAvU3VidHlwZSAvVHJ1ZVR5cGUgCiAgL1RvVW5pY29kZSA0IDAgUiAvVHlwZSAvRm9udCAvV2lkdGhzIFsgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIAogIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCAKICA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgCiAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIAogIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCAKICA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgCiAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIAogIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCAKICA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgCiAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIAogIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCAKICA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgCiAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCBdCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgMTAgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago5IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iagoxMCAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDMgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iagoxMSAwIG9iago8PAovRmlsdGVyIFsgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCA5Nwo+PgpzdHJlYW0KeJwzVDAAQkMwmZyroOAUoqDvZqhgaKQQkqZgaKJnohDio+AawgUUN4QqNTcCIgOFkFygSiNtAzS1GsGVeSUZqSWZyQqpuUmpKSmpKQoxBgaGmgohWQohWiCzFLgA3JsbI2VuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEyCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTA0IDAwMDAwIG4gCjAwMDAwMDAyMTEgMDAwMDAgbiAKMDAwMDAwMDQxNiAwMDAwMCBuIAowMDAwMDAxMTc0IDAwMDAwIG4gCjAwMDAwMDE3MjkgMDAwMDAgbiAKMDAwMDAwMTk0NiAwMDAwMCBuIAowMDAwMDAyNjc1IDAwMDAwIG4gCjAwMDAwMDI3NDQgMDAwMDAgbiAKMDAwMDAwMzAwNSAwMDAwMCBuIAowMDAwMDAzMDY1IDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDFjMTc4MTk4ZmJkZmE1MWIyNTk5NWQ4OWQ0MTAyMDQzPjwxYzE3ODE5OGZiZGZhNTFiMjU5OTVkODlkNDEwMjA0Mz5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gOSAwIFIKL1Jvb3QgOCAwIFIKL1NpemUgMTIKPj4Kc3RhcnR4cmVmCjMyMzcKJSVFT0YK","encrypted":"JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDE1MDkwZjIyMGE+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCi9PdXRsaW5lcyAxMiAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0NvbnRlbnRzIDUgMCBSCi9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdCi9SZXNvdXJjZXMgPDwKL0ZvbnQgNiAwIFIKL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4KL1JvdGF0ZSAwCi9UcmFucyA8PAo+PgovVHlwZSAvUGFnZQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvRmxhdGVEZWNvZGUgXQovTGVuZ3RoIDk3Cj4+CnN0cmVhbQo2ZyVU+62eWzXjO7uheM0V3P0+5ghKiURZ2WLXTjAc9SXoOKIKd0mCVBsGCFLbyN7w9tVgoVbFEq1fih5QV61TDR/lPyQjIsukwwmmYAgvfxHVgLoT6ZvxNOlS1joWbyhVCmVuZHN0cmVhbQplbmRvYmoKNiAwIG9iago8PAovRjEgNyAwIFIKL0YyKzAgOCAwIFIKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL05hbWUgL0YxCi9TdWJ0eXBlIC9UeXBlMQovVHlwZSAvRm9udAo+PgplbmRvYmoKOCAwIG9iago8PAovQmFzZUZvbnQgL0FBQUFBQStTeW50aGV0aWNUZXN0T25seQovRmlyc3RDaGFyIDAKL0ZvbnREZXNjcmlwdG9yIDkgMCBSCi9MYXN0Q2hhciAxMjcKL05hbWUgL0YyKzAKL1N1YnR5cGUgL1RydWVUeXBlCi9Ub1VuaWNvZGUgMTEgMCBSCi9UeXBlIC9Gb250Ci9XaWR0aHMgWyA2MDAgNjAwIDYwMCA2MDAgNjAwIDYwMCA2MDAg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"};
test('pinned local PDF engine extracts native text and real geometry without changing source bytes',async()=>{
 const input=pdf(),original=input.slice();const records=await parsePDFAdvanced(input);assert.deepEqual(input,original);assert.equal(records[0].text,'Synthetic PDF text');assert.equal(records[0].locator.page,1);assert.deepEqual(records[0].locator.transform,[12,0,0,12,72,720]);assert.ok(records[0].locator.width>0);assert.equal(records[0].fields.documentPageCount,1);assert.deepEqual(records[0].fields.pagesWithoutNativeText,[]);assert.match(records[0].fields.extractor,/6\.4\.299/);
});
test('xref streams and explicit ToUnicode mappings extract actual source Unicode',async()=>{
 const records=await parsePDFAdvanced(pdf({content:'BT /F1 12 Tf 72 720 Td <01> Tj ET',unicode:true,xrefStream:true,compress:true}));assert.equal(records[0].text,'Ω');assert.equal(records[0].locator.page,1);
});
test('synthetic embedded TrueType font extraction preserves its logical Unicode without external assets',async()=>{
 const input=Uint8Array.from(Buffer.from(fixtures.embedded,'base64')),original=input.slice();const records=await parsePDFAdvanced(input);assert.equal(records.map(r=>r.text).join(''),'Synthetic embedded Ω');assert.deepEqual(input,original);
});
test('fake-worker local font and CMap paths never instantiate a Worker or call network fetch',async()=>{
 const fetch=globalThis.fetch,Worker=globalThis.Worker;globalThis.fetch=()=>{throw Error('NETWORK FORBIDDEN');};globalThis.Worker=class{constructor(){throw Error('WORKER FORBIDDEN');}};
 try{const result=await parsePDFAdvanced(pdf({compress:true}));assert.equal(result[0].text,'Synthetic PDF text');const factory=new PBGC_PDFJS.LocalBinaryDataFactory();assert.ok((await factory.fetch({kind:'cMapUrl',filename:'UniJIS-UTF16-H.bcmap'})).length>0);await assert.rejects(factory.fetch({kind:'cMapUrl',filename:'../escape'}),/Unsupported/);}finally{globalThis.fetch=fetch;if(Worker===undefined)delete globalThis.Worker;else globalThis.Worker=Worker;}
});
test('encrypted PDFs, invalid bytes and documents without native text fail explicitly',async()=>{
 await assert.rejects(parsePDFAdvanced(Uint8Array.from(Buffer.from(fixtures.encrypted,'base64'))),/PDF import:/);await assert.rejects(parsePDFAdvanced(pdf({content:'BT ET'})),/no native text/);await assert.rejects(parsePDFAdvanced(new Uint8Array(20)),/PDF 1/);await assert.rejects(parsePDFAdvanced(new Uint8Array(pdfAdvancedLimits.bytes+1)),/16 MiB/);
});
test('bounded stream preflight rejects indirect lengths, unsupported filters and hidden object streams',async()=>{
 const indirect=pdf({extra:[Buffer.from('<< /Length 9 0 R >>\nstream\nx\nendstream')]});await assert.rejects(parsePDFAdvanced(indirect),/direct Length/);
 await assert.rejects(parsePDFAdvanced(pdf({extra:[stream('x','/Filter /LZWDecode')]})),/raw and Flate/);
 await assert.rejects(parsePDFAdvanced(pdf({extra:[stream('x','/Type /ObjStm')]})),/compressed object streams/);
 await assert.rejects(parsePDFAdvanced(pdf({extra:[stream('x','/Filter /FlateDecode /DecodeParms << /Columns 2147483647 >>')]})),/predictor/);
});
test('stream bombs and giant content literals reject before PDF.js allocation',async()=>{
 const bomb=stream(deflateSync(Buffer.alloc(pdfAdvancedLimits.expandedStream+1,65)),'/Filter /FlateDecode');await assert.rejects(parsePDFAdvanced(pdf({extra:[bomb]})),/expansion/);
 await assert.rejects(parsePDFAdvanced(pdf({content:'BT /F1 12 Tf ('+'x'.repeat(65537)+') Tj ET',compress:true})),/literal exceeds/);
 await assert.rejects(parsePDFAdvanced(pdf({content:'BT /F1 12 Tf <'+'41'.repeat(65537)+'> Tj ET',compress:true})),/hex literal/);
});

test('raw stream limits and oversized combined text spans fail before creating unsearchable records',async()=>{
 await assert.rejects(parsePDFAdvanced(pdf({extra:[stream(Buffer.alloc(pdfAdvancedLimits.expandedStream+1,32))]})),/raw stream size/);
 const content='BT /F1 .001 Tf 72 720 Td [('+'x'.repeat(40000)+')('+'y'.repeat(40000)+')] TJ ET';
 await assert.rejects(parsePDFAdvanced(pdf({content,compress:true})),/searchable 65536/);
});

test('source wrapper prefers the audited engine and packages untouched originals with engine version', async () => {
  const { parseFile } = require('../js/parsers.js');
  const { exportCase, importCase } = require('../js/artifacts.js');
  const input = pdf({content:'BT /F1 12 Tf 72 720 Td <01> Tj ET',unicode:true,xrefStream:true,compress:true});
  const source = await parseFile(new File([input], 'synthetic-unicode.pdf'));
  assert.equal(source.records[0].text, 'Ω');
  assert.deepEqual(await parseFile(new File([input], 'synthetic-unicode.pdf')), source);
  assert.match(source.parserVersion, /pdfjs-6\.4\.299/);
  assert.deepEqual(Buffer.from(source.originalBase64, 'base64'), Buffer.from(input));
  const c = {schemaVersion:1,id:'pdf-wrapper-case',name:'Synthetic PDF wrapper case',createdAt:'2026-10-28T00:00:00.000Z',sources:[source],graph:{nodes:[],edges:[]},rules:[],calculations:[]};
  assert.deepEqual(await importCase(await exportCase(c)), c);
});

test('identical PDF bytes produce deeply equal records across repeated extraction calls', async () => {
  const input = pdf({compress:true});
  const first = await parsePDFAdvanced(input);
  const second = await parsePDFAdvanced(input);
  assert.deepEqual(second, first);
  assert.equal(first[0].fields.fontResourceId, 'font-1');
  assert.equal(Object.hasOwn(first[0].fields, 'fontName'), false);
  assert.equal(first[0].fields.adapterVersion, PDF_ADVANCED_PARSER_VERSION);
  assert.equal(PDF_ADVANCED_PARSER_VERSION, '1.1.0');
});

test('document-local font identity is stable for multiple fonts and concurrent loading tasks', async () => {
  const input = pdf({secondFont:true,content:'BT /F1 12 Tf 72 720 Td (First font) Tj /F2 12 Tf 0 -20 Td (Second font) Tj /F1 12 Tf 0 -20 Td (First font again) Tj ET'});
  const first = await parsePDFAdvanced(input);
  const transitions = first.map(r => r.fields.fontResourceId).filter((id, index, all) => index === 0 || id !== all[index - 1]);
  assert.deepEqual(transitions, ['font-1', 'font-2', 'font-1']);
  assert.equal(first[0].text, 'First font');
  assert.equal(first.at(-1).text, 'First font again');
  assert.equal(first.filter(r => r.fields.fontResourceId === 'font-2').map(r => r.text).join(' '), 'Second font');
  assert.ok(first.every(r => /not a source font name/.test(r.fields.fontResourceIdKind)));
  const parallel = await Promise.all([parsePDFAdvanced(input), parsePDFAdvanced(input)]);
  assert.deepEqual(parallel[0], first);
  assert.deepEqual(parallel[1], first);
});

test('embedded-font and xref-stream records remain deterministic after unrelated documents load', async () => {
  const embedded = Uint8Array.from(Buffer.from(fixtures.embedded, 'base64'));
  const unicode = pdf({content:'BT /F1 12 Tf 72 720 Td <01> Tj ET',unicode:true,xrefStream:true,compress:true});
  const before = await Promise.all([parsePDFAdvanced(embedded), parsePDFAdvanced(unicode)]);
  await parsePDFAdvanced(pdf());
  const after = await Promise.all([parsePDFAdvanced(embedded), parsePDFAdvanced(unicode)]);
  assert.deepEqual(after, before);
});

test('stable PDF extraction produces a repeatable reviewed reindex no-op', async () => {
  const { parseFile } = require('../js/parsers.js');
  require('../js/artifacts.js');
  const { reindexSources } = require('../js/reindex.js');
  const source = await parseFile(new File([pdf()], 'synthetic-reindex-stability.pdf'));
  const c = {schemaVersion:1,id:'pdf-reindex-stability',name:'Synthetic PDF reindex stability',createdAt:'2026-10-28T00:00:00.000Z',sources:[source],graph:{nodes:[],edges:[]},rules:[],calculations:[]};
  const preview = await reindexSources(c, [source.id]);
  assert.equal(preview.status, 'unchanged');
  const result = await reindexSources(c, [source.id], {apply:true,reviewed:true,expectedCaseHash:preview.caseHash,expectedPlanHash:preview.planHash});
  assert.equal(result.status, 'unchanged');
  assert.equal(result.applied, false);
  assert.deepEqual(result.candidateCase, c);
});
