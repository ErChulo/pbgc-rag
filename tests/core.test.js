'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseText, search } = require('../assets/core.js');
test('text locators preserve original CRLF, blank lines and UTF-16 offsets', () => {
  const text = 'A😀\r\n\r\nbenefit\rend';
  const records = parseText('case.TXT', text).records;
  assert.deepEqual(records.map(r => [r.text, r.locator.line, r.locator.offset]), [['A😀',1,0],['',2,5],['benefit',3,7],['end',4,15]]);
  for (const r of records) assert.equal(text.slice(r.locator.offset, r.locator.offset+r.locator.length), r.text);
});
test('CSV quoted delimiters, multiline, escaping and trailing empty field', () => {
  const text = 'name,provision\r\n"Synthetic, plan","line one\r\nline ""two""",';
  const records = parseText('synthetic.csv',text).records;
  assert.deepEqual(records.map(r=>r.text),['name','provision','Synthetic, plan','line one\r\nline "two"','']);
  assert.deepEqual(records.map(r=>[r.locator.row,r.locator.column,r.locator.line]),[[1,1,1],[1,2,1],[2,1,2],[2,2,2],[2,3,3]]);
});
test('TSV does not interpret formulas', () => {
  assert.deepEqual(parseText('case.tsv','=1+1\t<script>\n3\t4').records.map(r=>r.text),['=1+1','<script>','3','4']);
});
test('malformed CSV and invalid JSON fail atomically', () => {
  for (const text of ['"unclosed','a"b','"a"x']) assert.throws(()=>parseText('case.csv',text));
  assert.throws(()=>parseText('case.json','{"x":}'), /Invalid JSON/);
});
test('JSON pointer escapes keys and preserves primitives without trusting prototype names', () => {
  const records = parseText('case.json','{"a/b":{"~x":[null,true,4]},"__proto__":"evidence"}').records;
  assert.deepEqual(records.map(r=>[r.text,r.locator.pointer]),[['null','/a~1b/~0x/0'],['true','/a~1b/~0x/1'],['4','/a~1b/~0x/2'],['evidence','/__proto__']]);
  assert.equal({}.evidence, undefined);
});
test('limits reject unsupported, binary, oversized, overly nested and too many records', () => {
  assert.throws(()=>parseText('case.pdf','text'), /Unsupported/);
  assert.throws(()=>parseText('case.txt','a\0b'), /Binary/);
  assert.throws(()=>parseText('case.txt','a'.repeat(2000001)), /character limit/);
  assert.throws(()=>parseText('case.json','['.repeat(66)+'0'+']'.repeat(66)), /depth/);
  assert.throws(()=>parseText('case.txt','x\n'.repeat(50001)), /record limit/);
});
test('keyword requires all terms and ranks by occurrence; exact preserves phrase order', () => {
  const records = [{text:'Benefit pension benefit',sourceHash:'a',locator:{line:1}},{text:'Pension benefit',sourceHash:'b'},{text:'Benefit only'}];
  assert.deepEqual(search(records,'benefit pension','keyword').map(r=>r.sourceHash),['a','b']);
  assert.equal(search(records,'pension benefit','exact').length,2);
  assert.equal(search(records,'benefit pension','exact').length,1);
  assert.equal(search(records,'  ').length,0);
  assert.deepEqual(search(records,'benefit pension')[0].locator,{line:1});
  assert.equal(records[0].score,undefined);
});
test('search rejects unsafe unsupported regex and bounded query overload', () => {
  assert.throws(()=>search([],'(a+)+$','regex'), /Unsupported/);
  assert.throws(()=>search([],'x'.repeat(501)), /500/);
  assert.throws(()=>search([],Array.from({length:33},(_,i)=>'t'+i).join(' ')), /32/);
});
test('empty input and BOM handling', () => {
  assert.deepEqual(parseText('case.txt','').records,[]);
  assert.equal(parseText('case.json','\uFEFF{"x":1}').records[0].text,'1');
  const cell = parseText('case.csv','\uFEFF"x"').records[0];
  assert.equal(cell.text,'x'); assert.equal(cell.locator.offset,1);
});
