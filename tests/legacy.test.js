'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseLegacyBytes}=require('../assets/legacy.js');
const FREE=0xffffffff,END=0xfffffffe,FAT=0xfffffffd;
const u16=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setUint16(offset,value,true);
const u32=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setUint32(offset,value>>>0,true);
const f64=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setFloat64(offset,value,true);
function utf16(text){const bytes=new Uint8Array(text.length*2);for(let i=0;i<text.length;i++)u16(bytes,i*2,text.charCodeAt(i));return bytes;}
function concat(...parts){const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
function compound(streams,sectorSize=512){
  const names=Object.keys(streams);assert.ok(names.length<=3,'fixture builder uses one directory sector');
  const sectors=[new Uint8Array(sectorSize)],allocation=[END],entries=[];let miniCount=0;const miniParts=[];
  function normal(data){const start=sectors.length,count=Math.ceil(data.length/sectorSize);for(let i=0;i<count;i++){const sector=new Uint8Array(sectorSize);sector.set(data.subarray(i*sectorSize,(i+1)*sectorSize));sectors.push(sector);allocation.push(i===count-1?END:start+i+1);}return count?start:END;}
  for(const name of names){const data=streams[name];if(data.length>=4096){entries.push({name,start:normal(data),size:data.length});}else{const start=data.length?miniCount:END,count=Math.ceil(data.length/64);const part=new Uint8Array(count*64);part.set(data);miniParts.push(part);entries.push({name,start,size:data.length,mini:true});miniCount+=count;}}
  const rootBytes=concat(...miniParts),rootStart=normal(rootBytes);const miniFat=new Uint8Array(miniCount?sectorSize:0);miniFat.fill(255);let miniIndex=0;for(const entry of entries){if(!entry.mini)continue;const count=Math.ceil(entry.size/64);for(let i=0;i<count;i++)u32(miniFat,(miniIndex+i)*4,i===count-1?END:miniIndex+i+1);miniIndex+=count;}
  const miniStart=normal(miniFat),fatId=sectors.length;sectors.push(new Uint8Array(sectorSize));allocation.push(FAT);assert.ok(sectors.length<sectorSize/4);
  const fat=sectors[fatId];fat.fill(255);allocation.forEach((value,index)=>u32(fat,index*4,value));
  const dir=sectors[0];function directory(index,name,type,start,size,right,child){const offset=index*128;const raw=utf16(name+'\0');dir.set(raw,offset);u16(dir,offset+64,raw.length);dir[offset+66]=type;dir[offset+67]=1;u32(dir,offset+68,FREE);u32(dir,offset+72,right);u32(dir,offset+76,child);u32(dir,offset+116,start);u32(dir,offset+120,size);}
  directory(0,'Root Entry',5,rootStart,rootBytes.length,FREE,names.length?1:FREE);entries.forEach((entry,index)=>directory(index+1,entry.name,2,entry.start,entry.size,index===entries.length-1?FREE:index+2,FREE));
  const header=new Uint8Array(sectorSize);header.set([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);u16(header,24,0x003e);u16(header,26,sectorSize===512?3:4);u16(header,28,0xfffe);u16(header,30,sectorSize===512?9:12);u16(header,32,6);u32(header,40,sectorSize===512?0:1);u32(header,44,1);u32(header,48,0);u32(header,56,4096);u32(header,60,miniStart);u32(header,64,miniCount?1:0);u32(header,68,END);for(let i=0;i<109;i++)u32(header,76+i*4,FREE);u32(header,76,fatId);return concat(header,...sectors);
}
function wordFixture(text,{compressed=false,split=null,encrypted=false,large=false}={}){
  const word=new Uint8Array(large?4096:1024);u16(word,0,0xa5ec);u16(word,2,0x00c1);u16(word,10,0x0200|(encrypted?0x0100:0));u16(word,32,14);u16(word,62,22);u32(word,76,text.length);u16(word,152,34);
  const pieces=split===null?[text]:[text.slice(0,split),text.slice(split)];const plc=new Uint8Array(4+pieces.length*12);let cp=0,fc=700;u32(plc,0,0);for(let i=0;i<pieces.length;i++){const bytes=compressed?Uint8Array.from(pieces[i],c=>c.charCodeAt(0)):utf16(pieces[i]);word.set(bytes,fc);cp+=pieces[i].length;u32(plc,(i+1)*4,cp);u32(plc,(pieces.length+1)*4+i*8+2,compressed?(fc*2)|0x40000000:fc);fc+=bytes.length+4;}
  const clx=new Uint8Array(5+plc.length);clx[0]=2;u32(clx,1,plc.length);clx.set(plc,5);u32(word,154+33*8,0);u32(word,154+33*8+4,clx.length);return compound({WordDocument:word,'1Table':clx});
}
function record(id,data=new Uint8Array()){const out=new Uint8Array(data.length+4);u16(out,0,id);u16(out,2,data.length);out.set(data,4);return out;}
function unicode(text,{short=false,wide=true}={}){const bytes=new Uint8Array((short?2:3)+text.length*(wide?2:1));if(short)bytes[0]=text.length;else u16(bytes,0,text.length);bytes[short?1:2]=wide?1:0;bytes.set(wide?utf16(text):Uint8Array.from(text,c=>c.charCodeAt(0)),short?2:3);return bytes;}
function cellPrefix(row,col,size){const bytes=new Uint8Array(size);u16(bytes,0,row);u16(bytes,2,col);return bytes;}
function workbookFixture({encrypt=false,badSst=false,sstContinue=false,formulaString=false,raw=false}={}){
  const bof=type=>{const bytes=new Uint8Array(16);u16(bytes,0,0x0600);u16(bytes,2,type);return record(0x0809,bytes);};
  const sheetName=unicode('Synthetic',{short:true});const boundsheet=new Uint8Array(6+sheetName.length);boundsheet.set(sheetName,6);
  const count=new Uint8Array(8);u32(count,0,1);u32(count,4,1);const shared=unicode('Pension 😀',{wide:true});
  const sst=sstContinue?[record(0x00fc,concat(count,shared.subarray(0,7))),record(0x003c,concat(Uint8Array.of(1),shared.subarray(7)))]:[record(0x00fc,concat(count,shared))];
  const globalParts=[bof(5),record(0x0085,boundsheet),...sst,...(encrypt?[record(0x002f,Uint8Array.of(1,2))]:[]),record(0x000a)];
  const number=cellPrefix(0,0,14);f64(number,6,123.5);const label=cellPrefix(1,0,10);u32(label,6,badSst?100:0);const rk=cellPrefix(2,1,10);u32(rk,6,(250<<2)|2|1);
  const formula=cellPrefix(3,2,25);if(formulaString){formula[6]=0;u16(formula,12,0xffff);}else f64(formula,6,7);u16(formula,20,3);formula.set([0x1e,7,0],22);
  const bool=cellPrefix(4,3,8);bool[6]=1;
  const sheet=concat(bof(0x10),record(0x0203,number),record(0x00fd,label),record(0x027e,rk),record(0x0006,formula),...(formulaString?[record(0x0207,unicode('Cached text'))]:[]),record(0x0205,bool),record(0x000a));
  const globals=concat(...globalParts);u32(globals,24,globals.length); // BOF is 20 bytes; BOUNDSHEET payload begins at 24.
  const stream=concat(globals,sheet);return raw?stream:compound({Workbook:stream});
}
test('DOC Unicode piece-table paragraphs preserve exact CP and stream byte spans',async()=>{
  const result=await parseLegacyBytes('synthetic.doc',wordFixture('Normal retirement\rAge 65\r',{split:10}));
  assert.equal(result.parserVersion,'legacy-doc-1');assert.deepEqual(result.records.map(r=>r.text),['Normal retirement','Age 65']);
  assert.equal(result.records[0].locator.paragraph,1);assert.equal(result.records[1].locator.characterStart,18);assert.equal(result.records[0].locator.sourceSpans.length,2);
  assert.equal(result.records[0].locator.sourceSpans[0].offset,700);assert.equal(result.records[0].locator.sourceSpans[0].length,20);assert.match(result.warnings.join(' '),/main-document text only/i);
});
test('DOC compressed text, literal controls and normal FAT streams are supported',async()=>{
  const result=await parseLegacyBytes('synthetic.DOC',wordFixture('Amount\x13FIELD\x14value\x15\r',{compressed:true,large:true}));
  assert.equal(result.records[0].text,'Amount\x13FIELD\x14value\x15');assert.equal(result.records[0].locator.sourceSpans[0].length,19);
});
test('DOC encryption, corrupt signature and truncated files reject explicitly',async()=>{
  await assert.rejects(parseLegacyBytes('bad.doc',wordFixture('Text\r',{encrypted:true})),/Encrypted/);
  await assert.rejects(parseLegacyBytes('bad.doc',new Uint8Array(512)),/Compound File/);
  const bytes=wordFixture('Text\r');await assert.rejects(parseLegacyBytes('bad.doc',bytes.subarray(0,bytes.length-1)),/aligned/);
  await assert.rejects(parseLegacyBytes('bad.doc',new Uint8Array(5*1024*1024+1)),/5 MB/);
});
test('CFB FAT and MiniFAT cycles, stream overlap and malformed directories reject',async()=>{
  const fatCycle=wordFixture('Text\r');const fatId=new DataView(fatCycle.buffer).getUint32(76,true);u32(fatCycle,(fatId+1)*512,0);await assert.rejects(parseLegacyBytes('bad.doc',fatCycle),/overlap|cycle/);
  const miniCycle=wordFixture('Text\r');const miniFatId=new DataView(miniCycle.buffer).getUint32(60,true);u32(miniCycle,(miniFatId+1)*512,0);await assert.rejects(parseLegacyBytes('bad.doc',miniCycle),/overlap|cycle|size/);
  const duplicate=wordFixture('Text\r');u32(duplicate,512+128+72,1);await assert.rejects(parseLegacyBytes('bad.doc',duplicate),/cyclic/);
  const overlap=wordFixture('Text\r');u32(overlap,512+256+116,0);await assert.rejects(parseLegacyBytes('bad.doc',overlap),/overlap/);
});
test('XLS BIFF8 shared strings, RK, cached formula, Boolean and sheet/cell provenance',async()=>{
  const result=await parseLegacyBytes('synthetic.xls',workbookFixture());
  assert.equal(result.parserVersion,'legacy-xls-1');assert.deepEqual(result.records.map(r=>r.text),['123.5','Pension 😀','2.5','7','TRUE']);
  assert.deepEqual(result.records.map(r=>r.locator.cell),['A1','A2','B3','C4','D5']);assert.ok(result.records.every(r=>r.locator.sheet==='Synthetic'));
  assert.equal(result.records[3].cachedValue,'7');assert.equal(result.records[3].formulaTokensHex,'1e0700');assert.match(result.records[3].formula,/token bytes/);
});
test('XLS SST continuation and formula cached STRING remain inert text',async()=>{
  const result=await parseLegacyBytes('synthetic.xls',workbookFixture({sstContinue:true,formulaString:true}));
  assert.equal(result.records[1].text,'Pension 😀');assert.equal(result.records[3].text,'Cached text');assert.equal(result.records[3].cachedValue,'Cached text');
});
test('XLS rejects encryption, missing SST references and unsupported file types',async()=>{
  await assert.rejects(parseLegacyBytes('bad.xls',workbookFixture({encrypt:true})),/Encrypted/);
  await assert.rejects(parseLegacyBytes('bad.xls',workbookFixture({badSst:true})),/missing shared string/);
  await assert.rejects(parseLegacyBytes('bad.docx',wordFixture('Text\r')),/Only legacy/);
  await assert.rejects(parseLegacyBytes('bad.xls',new ArrayBuffer(512)),/Uint8Array/);
});
function findRecord(bytes,id){let offset=0;const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);while(offset<bytes.length){const found=d.getUint16(offset,true),size=d.getUint16(offset+2,true);if(found===id)return {offset,data:offset+4,size};offset+=4+size;}throw Error('Test record not found');}
test('CFB version 4 uses 4096-byte sectors and bounded mini-stream allocation',async()=>{
  const stream=workbookFixture({raw:true});const bytes=compound({Workbook:stream},4096);const result=await parseLegacyBytes('synthetic.xls',bytes);
  assert.equal(result.records[0].text,'123.5');assert.equal(result.records[1].text,'Pension 😀');
  const bad=bytes.slice();u32(bad,40,0);await assert.rejects(parseLegacyBytes('bad.xls',bad),/allocation counts/);
});
test('CFB invalid mini cutoff, FAT marker and oversized stream reject before extraction',async()=>{
  const cutoff=wordFixture('A\r');u32(cutoff,56,2048);await assert.rejects(parseLegacyBytes('bad.doc',cutoff),/mini-stream size/);
  const marker=wordFixture('A\r'),fatId=new DataView(marker.buffer).getUint32(76,true);u32(marker,(fatId+1)*512+fatId*4,END);await assert.rejects(parseLegacyBytes('bad.doc',marker),/FAT sector markers/);
  const oversized=wordFixture('A\r');u32(oversized,512+128+124,1);await assert.rejects(parseLegacyBytes('bad.doc',oversized),/larger than/);
});
test('XLS invalid Unicode, numeric NaN, unsupported old cell records and repeated cells reject',async()=>{
  const invalid=workbookFixture({raw:true}),sst=findRecord(invalid,0x00fc);u16(invalid,sst.data+8+3,0xdc00);await assert.rejects(parseLegacyBytes('bad.xls',compound({Workbook:invalid})),/Unicode/);
  const nan=workbookFixture({raw:true}),number=findRecord(nan,0x0203);f64(nan,number.data+6,NaN);await assert.rejects(parseLegacyBytes('bad.xls',compound({Workbook:nan})),/Nonfinite/);
  const old=workbookFixture({raw:true}),label=findRecord(old,0x00fd);u16(old,label.offset,0x00d6);await assert.rejects(parseLegacyBytes('bad.xls',compound({Workbook:old})),/Unsupported legacy cell/);
  const duplicate=workbookFixture({raw:true}),cell=findRecord(duplicate,0x00fd);u16(duplicate,cell.data,0);await assert.rejects(parseLegacyBytes('bad.xls',compound({Workbook:duplicate})),/Duplicate worksheet cell/);
});
test('XLS negative RK and MULRK coordinates retain cached numbers without recalculation',async()=>{
  const original=workbookFixture({raw:true}),rk=findRecord(original,0x027e);u32(original,rk.data+6,(-17<<2)|2);
  const multiple=new Uint8Array(18);u16(multiple,0,8);u16(multiple,2,2);u32(multiple,6,(1000<<2)|3);u32(multiple,12,(-8<<2)|2);u16(multiple,16,3);
  const bytes=concat(original.subarray(0,original.length-4),record(0x00bd,multiple),record(0x000a));const result=await parseLegacyBytes('synthetic.xls',compound({Workbook:bytes}));
  assert.equal(result.records[2].text,'-17');assert.deepEqual(result.records.slice(-2).map(r=>[r.locator.cell,r.text]),[['C9','10'],['D9','-8']]);
});
