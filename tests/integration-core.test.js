'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseBytes} = require('../assets/formats.js');
const {queryRecords} = require('../assets/query.js');
const {buildGraph,validateGraph,queryGraph} = require('../assets/graph.js');
const utf8 = value => new TextEncoder().encode(value);
function crc32(bytes) { let crc=0xffffffff; for (const byte of bytes) {crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} return (crc^0xffffffff)>>>0; }
// Independently generated stored ZIP parts; no production archive helper reused.
function storedZip(parts) {
  const locals=[],directories=[];let offset=0;
  for (const [name,text] of parts) {
    const filename=Buffer.from(name),data=Buffer.from(text),checksum=crc32(data);
    const local=Buffer.alloc(30+filename.length+data.length);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);filename.copy(local,30);data.copy(local,30+filename.length);
    const central=Buffer.alloc(46+filename.length);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(checksum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);filename.copy(central,46);
    locals.push(local);directories.push(central);offset+=local.length;
  }
  const directory=Buffer.concat(directories),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return new Uint8Array(Buffer.concat([...locals,directory,end]));
}
function office(body,extra=[]) {return storedZip([['[Content_Types].xml','<Types/>'],['word/document.xml',body],...extra]);}
test('archive rejects traversal, duplicate paths, CRC corruption, encryption and claimed expansion bombs',async()=>{
  await assert.rejects(parseBytes('case.docx',office('<document/>',[['../payload','x']])),/path/);
  await assert.rejects(parseBytes('case.docx',office('<document/>',[['word/document.xml','<document/>']])),/path/);
  const corrupt=office('<document><p><t>evidence</t></p></document>');
  const position=Buffer.from(corrupt).indexOf('evidence');corrupt[position]=0x58;
  await assert.rejects(parseBytes('case.docx',corrupt),/CRC/);
  const encrypted=office('<document/>');new DataView(encrypted.buffer).setUint16(6,1,true);
  await assert.rejects(parseBytes('case.docx',encrypted),/header/);
  const bomb=office('<document/>');const view=new DataView(bomb.buffer);let central=0;while(view.getUint32(central,true)!==0x02014b50)central++;
  view.setUint32(central+24,21*1024*1024,true);
  await assert.rejects(parseBytes('case.docx',bomb),/expansion/);
});
test('DTD/external entities are rejected and inert markup cannot resolve resources',async()=>{
  for (const xml of ['<!DOCTYPE root SYSTEM "https://example.invalid/a"><root/>','<!DOCTYPE root [<!ENTITY x SYSTEM "file:///x">]><root>&x;</root>']) await assert.rejects(parseBytes('case.xml',utf8(xml)),/DTD/);
  const parsed=await parseBytes('case.html',utf8('<p>Evidence &amp; locator</p><img src="https://example.invalid/track"><script>fetch("https://example.invalid")</script>'));
  assert.equal(parsed.records.map(record=>record.text).join(''),'Evidence & locator');
  const record=parsed.records[0];assert.equal('<p>Evidence &amp; locator</p>'.slice(record.locator.offset,record.locator.offset+record.locator.length),'Evidence &amp; locator');
});
test('DOCX nested tables preserve the identity of subsequent outer cells',async()=>{
  const body='<w:document xmlns:w="word"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Outer first</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nested</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc><w:tc><w:p><w:r><w:t>Outer second</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const parsed=await parseBytes('nested.docx',office(body));
  const first=parsed.records.find(record=>record.text==='Outer first'),nested=parsed.records.find(record=>record.text==='Nested'),second=parsed.records.find(record=>record.text==='Outer second');
  assert.equal(first.locator.table,1);assert.equal(nested.locator.table,2);assert.equal(second.locator.table,1);
  assert.equal(second.locator.row,1);assert.equal(second.locator.column,2);
});
test('strict XML rejects bare ampersands and illegal XML control characters in attributes',async()=>{
  for (const text of ['<root note="bad & reference">x</root>','<root note="bad\u0000value">x</root>']) await assert.rejects(parseBytes('case.xml',utf8(text)),/XML/);
});
test('advanced queries reject mutation/extra SQL and preserve exact source locators',()=>{
  const records=[{text:'Synthetic amount 1250',sourceName:'case.txt',sourceId:'case',sourceHash:'c'.repeat(64),locator:{type:'text-line',line:2,offset:10,length:21}}];
  for(const query of ['DELETE FROM records','SELECT * FROM records; DROP TABLE records','SELECT * FROM records WHERE text = \'x\' OR 1 = 1','SELECT * FROM records -- comment','SELECT * FROM records UNION SELECT * FROM records']) assert.throws(()=>queryRecords(records,query,'sql'));
  for(const modeQuery of [['regex','amount\\s+\\d+'],['sql',"SELECT * FROM records WHERE line = 2 AND text CONTAINS 'amount' LIMIT 1"]]) {
    const result=queryRecords(records,modeQuery[1],modeQuery[0]);assert.equal(result.length,1);assert.equal(result[0].sourceHash,records[0].sourceHash);assert.deepEqual(result[0].locator,records[0].locator);
  }
  assert.equal(records[0].score,undefined);
});
test('regex catastrophic native patterns are rejected and valid heavy patterns hit deterministic budget',()=>{
  for(const pattern of ['(a+)+$','(a|aa)+$','(?=a)a','(a)\\1']) assert.throws(()=>queryRecords([{text:'a'.repeat(10000)}],pattern,'regex'));
  assert.throws(()=>queryRecords([{text:'a'.repeat(200000)}],'^'+'a?'.repeat(126)+'b$','regex'),/budget/);
});
test('graph verification binds query results to exact verified parser evidence',async()=>{
  const parsed=await parseBytes('source.xml',utf8('<root><amount>1250</amount></root>'));
  const sources=[{id:'source',name:'source.xml',hash:'f'.repeat(64),records:parsed.records}];
  const graph=buildGraph(sources);assert.equal(validateGraph(graph,sources),true);
  const result=queryGraph(graph,{startId:'document:source',maxDepth:1});
  const record=result.nodes.find(node=>node.type==='record');assert.deepEqual({...record.locator},parsed.records[0].locator);
  graph.nodes.find(node=>node.type==='record').text='9999';
  assert.throws(()=>validateGraph(graph,sources),/verified source/);
});
test('safe regex subset agrees with independently evaluated small reference patterns',()=>{
  const parts=['a','b','.','[ab]','[^a]','a?','b*','a+'];
  const texts=['','a','b','aa','ab','ba','bbb','cab','a\nb'];
  for(let i=0;i<192;i++){
    const pattern=(i%3===0?'^':'')+parts[i%parts.length]+parts[Math.floor(i/parts.length)%parts.length]+(i%4===0?'$':'');
    for(const text of texts)assert.equal(queryRecords([{text}],pattern,'regex').length>0,new RegExp(pattern,'i').test(text),JSON.stringify({pattern,text}));
  }
});
