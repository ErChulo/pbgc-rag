/* Original bounded CFB/DOC/BIFF8 extraction. Never executes document code. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({input:5*1024*1024,characters:2000000,records:50000,depth:64,sheets:1000});
  const FREE=0xffffffff, END=0xfffffffe, FAT=0xfffffffd, DIF=0xfffffffc;
  const fail = message => { throw Error('Legacy parser: '+message); };
  function view(bytes) { return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); }
  function utf16(bytes) { try { return new TextDecoder('utf-16le',{fatal:true,ignoreBOM:true}).decode(bytes); } catch (_) { fail('Invalid UTF-16 text.'); } }
  function span(bytes,offset,length) { if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>bytes.length)fail('Truncated or out-of-range document data.');return bytes.subarray(offset,offset+length); }
  function compound(bytes) {
    if(bytes.length<512||![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v,i)=>bytes[i]===v))fail('Expected an OLE Compound File.');
    const h=view(bytes),major=h.getUint16(26,true),shift=h.getUint16(30,true);
    if(h.getUint16(28,true)!==0xfffe||!((major===3&&shift===9)||(major===4&&shift===12))||h.getUint16(32,true)!==6||h.getUint32(56,true)!==4096)fail('Unsupported CFB version, sector order or mini-stream size.');
    const sectorSize=2**shift,sectorCount=bytes.length/sectorSize-1;
    if(!Number.isInteger(sectorCount)||sectorCount<1)fail('CFB file is not sector aligned.');
    const nFAT=h.getUint32(44,true),nDIF=h.getUint32(72,true),nMini=h.getUint32(64,true),nDir=h.getUint32(40,true);
    if(!nFAT||nFAT>sectorCount||nDIF>sectorCount||nMini>sectorCount||major===3&&nDir!==0||major===4&&(!nDir||nDir>sectorCount))fail('Invalid CFB allocation counts.');
    const sector=id=>{if(!Number.isInteger(id)||id<0||id>=sectorCount)fail('CFB sector is out of range.');return bytes.subarray((id+1)*sectorSize,(id+2)*sectorSize);};
    const owners=new Map(),miniOwners=new Map();
    function claim(id,owner){sector(id);if(owners.has(id))fail('CFB sectors overlap or form a cycle.');owners.set(id,owner);}
    const fatIds=[],difIds=[];
    function fatId(id){if(id===FREE)return;if(fatIds.length>=nFAT)fail('Too many FAT sectors.');claim(id,'FAT');fatIds.push(id);}
    for(let i=0;i<109;i++)fatId(h.getUint32(76+i*4,true));
    let dif=h.getUint32(68,true);
    for(let i=0;i<nDIF;i++){claim(dif,'DIFAT');difIds.push(dif);const d=view(sector(dif));for(let j=0;j<sectorSize/4-1;j++)fatId(d.getUint32(j*4,true));dif=d.getUint32(sectorSize-4,true);}
    if(dif!==END||fatIds.length!==nFAT)fail('Invalid DIFAT termination or FAT count.');
    const allocation=[];for(const id of fatIds){const d=view(sector(id));for(let i=0;i<sectorSize/4;i++)allocation.push(d.getUint32(i*4,true));}
    if(allocation.length<sectorCount||fatIds.some(id=>allocation[id]!==FAT)||difIds.some(id=>allocation[id]!==DIF))fail('Invalid FAT sector markers.');
    function chain(start,size,owner) {
      if(size===0){if(start!==END&&start!==FREE)fail('Nonempty allocation for an empty stream.');return new Uint8Array();}
      const ids=[];let id=start;
      while(id!==END){if(ids.length>=sectorCount)fail('CFB chain exceeds sector count.');claim(id,owner);ids.push(id);id=allocation[id];}
      if(size!==null&&ids.length!==Math.ceil(size/sectorSize))fail('CFB stream allocation length does not match its size.');
      const total=size===null?ids.length*sectorSize:size;
      if(total>LIMITS.input)fail('CFB stream exceeds the input budget.');
      const out=new Uint8Array(total);for(let i=0;i<ids.length;i++)out.set(sector(ids[i]).subarray(0,Math.min(sectorSize,total-i*sectorSize)),i*sectorSize);
      return out;
    }
    const directory=chain(h.getUint32(48,true),major===4?nDir*sectorSize:null,'directory');
    if(!directory.length||directory.length/128>LIMITS.records)fail('Directory size is invalid.');
    const entries=[];
    for(let offset=0;offset<directory.length;offset+=128){const raw=directory.subarray(offset,offset+128),d=view(raw),type=raw[66];if(type===0){entries.push(null);continue;}const length=d.getUint16(64,true);if(![1,2,5].includes(type)||length<2||length>64||length%2||d.getUint16(length-2,true)!==0)fail('Invalid CFB directory entry.');const high=d.getUint32(124,true),low=d.getUint32(120,true);if(high)fail('CFB streams larger than the input budget are unsupported.');const name=utf16(raw.subarray(0,length-2));if(!name||/[\0/\\:]/.test(name))fail('Invalid CFB stream name.');entries.push({name,type,left:d.getUint32(68,true),right:d.getUint32(72,true),child:d.getUint32(76,true),start:d.getUint32(116,true),size:low});}
    const root=entries[0];if(!root||root.type!==5||root.left!==FREE||root.right!==FREE||entries.slice(1).some(e=>e?.type===5))fail('Invalid CFB root entry.');
    const reachable=new Set([0]),paths=[],names=new Set();const stack=[{id:root.child,parent:'',depth:0}];
    while(stack.length){const item=stack.pop();if(item.id===FREE)continue;if(item.depth>LIMITS.depth||item.id>=entries.length||!entries[item.id]||reachable.has(item.id))fail('Directory tree is cyclic, out of range or too deep.');reachable.add(item.id);const entry=entries[item.id],path=item.parent+entry.name,key=path.toUpperCase();if(names.has(key))fail('Duplicate CFB stream path.');names.add(key);stack.push({id:entry.right,parent:item.parent,depth:item.depth+1},{id:entry.left,parent:item.parent,depth:item.depth+1});if(entry.type===1){if(entry.size!==0)fail('Non-root storage has a stream size.');stack.push({id:entry.child,parent:path+'/',depth:item.depth+1});}else{if(entry.child!==FREE)fail('Stream has directory children.');paths.push({entry,path});}}
    if(entries.some((e,i)=>e&&!reachable.has(i)))fail('CFB contains unreachable active directory entries.');
    const miniData=chain(root.start,root.size,'root mini-stream');
    const miniRaw=chain(h.getUint32(60,true),nMini*sectorSize,'MiniFAT'),miniAllocation=[];const md=view(miniRaw);for(let i=0;i<miniRaw.length;i+=4)miniAllocation.push(md.getUint32(i,true));
    function miniChain(entry,path){if(!entry.size){if(entry.start!==END&&entry.start!==FREE)fail('Invalid empty mini-stream.');return new Uint8Array();}const out=new Uint8Array(entry.size);let id=entry.start,count=0;while(id!==END){if(id>=miniAllocation.length||id*64+64>miniData.length||miniOwners.has(id)||count>=Math.ceil(entry.size/64))fail('Mini-stream overlaps, cycles or exceeds its declared size.');miniOwners.set(id,path);out.set(miniData.subarray(id*64,id*64+Math.min(64,entry.size-count*64)),count*64);count++;id=miniAllocation[id];}if(count!==Math.ceil(entry.size/64))fail('Mini-stream is truncated.');return out;}
    const streams=new Map();for(const {entry,path} of paths){if(entry.size>LIMITS.input)fail('Stream exceeds input budget.');streams.set(path.toUpperCase(),entry.size<4096?miniChain(entry,path):chain(entry.start,entry.size,path));}
    return streams;
  }
  function output(){let characters=0;const records=[];return {records,add(text,locator,extra){if(typeof text!=='string'||records.length>=LIMITS.records||(characters+=text.length)>LIMITS.characters)fail('Extraction record or character budget exceeded.');records.push({text,locator,...extra});}};}
  function word(streams){
    const bytes=streams.get('WORDDOCUMENT');if(!bytes)fail('WordDocument stream is missing.');const d=view(bytes);span(bytes,0,34);
    const version=d.getUint16(2,true),flags=d.getUint16(10,true);if(d.getUint16(0,true)!==0xa5ec||![0x00c1,0x00d9,0x0101,0x010c,0x0112].includes(version))fail('Only Word 97–2007 binary document text is supported.');if(flags&0x8100)fail('Encrypted or obfuscated Word documents are unsupported.');
    const csw=d.getUint16(32,true);let pos=34+csw*2;span(bytes,pos,2);const cslw=d.getUint16(pos,true);pos+=2;span(bytes,pos,cslw*4+2);if(cslw<4)fail('Word FIB lacks main-text length.');const mainLength=d.getUint32(pos+12,true);pos+=cslw*4;const pairs=d.getUint16(pos,true);pos+=2;if(pairs<34)fail('Word FIB lacks a piece-table reference.');span(bytes,pos,pairs*8);const clxOffset=d.getUint32(pos+33*8,true),clxLength=d.getUint32(pos+33*8+4,true);
    if(mainLength>LIMITS.characters)fail('Word main text exceeds the character budget.');const tableName=flags&0x0200?'1TABLE':'0TABLE',table=streams.get(tableName);if(!table)fail('Selected Word table stream is missing.');const clx=span(table,clxOffset,clxLength),cv=view(clx);let offset=0;
    while(clx[offset]===1){span(clx,offset,3);const size=cv.getUint16(offset+1,true);span(clx,offset+3,size);offset+=size+3;}
    if(clx[offset]!==2)fail('A valid Word CLX piece table is required.');span(clx,offset,5);const size=cv.getUint32(offset+1,true);offset+=5;const plc=span(clx,offset,size);if(offset+size!==clx.length||size<4||(size-4)%12)fail('Invalid Word piece-table size.');const pd=view(plc),count=(size-4)/12;if(count>LIMITS.records)fail('Too many Word pieces.');const cp=[];for(let i=0;i<=count;i++)cp.push(pd.getUint32(i*4,true));if(cp[0]!==0||cp.at(-1)<mainLength||cp.at(-1)>LIMITS.characters||cp.some((n,i)=>i&&n<cp[i-1]))fail('Word text positions are inconsistent.');
    const pieces=[];let text='';for(let i=0;i<count&&cp[i]<mainLength;i++){const length=Math.min(cp[i+1],mainLength)-cp[i],descriptor=(count+1)*4+i*8,encoded=pd.getUint32(descriptor+2,true);if(encoded&0x80000000)fail('Unsupported Word piece flags.');const compressed=!!(encoded&0x40000000),fc=encoded&0x3fffffff;if(compressed&&fc%2)fail('Invalid compressed Word text offset.');const streamOffset=compressed?fc/2:fc,raw=span(bytes,streamOffset,length*(compressed?1:2));let value;if(compressed){try{value=new TextDecoder('windows-1252',{fatal:true}).decode(raw);}catch(_){fail('Unsupported Word compressed text encoding.');}}else value=utf16(raw);if(value.length!==length)fail('Word piece character positions do not match decoded text.');pieces.push({start:cp[i],end:cp[i]+length,streamOffset,bytesPerCharacter:compressed?1:2});text+=value;}
    if(text.length!==mainLength)fail('Word text length does not match the main-document count.');const out=output();let start=0,paragraph=1,pieceCursor=0;
    while(start<text.length){const cr=text.indexOf('\r',start),end=cr<0?text.length:cr;while(pieceCursor<pieces.length&&pieces[pieceCursor].end<=start)pieceCursor++;const sourceSpans=[];for(let i=pieceCursor;i<pieces.length&&pieces[i].start<end;i++){const p=pieces[i];if(p.end>start)sourceSpans.push({stream:'WordDocument',offset:p.streamOffset+(Math.max(start,p.start)-p.start)*p.bytesPerCharacter,length:(Math.min(end,p.end)-Math.max(start,p.start))*p.bytesPerCharacter,offsetUnit:'bytes'});}out.add(text.slice(start,end),{type:'word-binary-paragraph',paragraph:paragraph++,characterStart:start,characterEnd:end,characterUnit:'Word main-text UTF-16 code units',sourceSpans});start=end+1;}
    return {parserVersion:'legacy-doc-1',records:out.records,warnings:['Extracts main-document text only. Headers, notes, text boxes, formatting, tables, page layout and revisions are not resolved. Word field and cell control characters remain literal; no field, macro or embedded object executes. Paragraphs and source-stream byte spans are not page or table positions.']};
  }
  function biffString(bytes,offset,short){const d=view(bytes);span(bytes,offset,short?2:3);const count=short?bytes[offset]:d.getUint16(offset,true);offset+=short?1:2;const flags=bytes[offset++];if(flags&~(short?1:0x0d))fail('Unsupported BIFF string flags.');let runs=0,extension=0;if(flags&8){span(bytes,offset,2);runs=d.getUint16(offset,true);offset+=2;}if(flags&4){span(bytes,offset,4);extension=d.getUint32(offset,true);offset+=4;}const length=count*(flags&1?2:1),raw=span(bytes,offset,length);let text='';if(flags&1)text=utf16(raw);else for(const code of raw)text+=String.fromCharCode(code);offset+=length;span(bytes,offset,runs*4+extension);return {text,end:offset+runs*4+extension};}
  function sstStrings(segments){if(segments.some(s=>!s.length))fail('Empty SST continuation.');let segment=0,offset=0,totalCharacters=0;const strings=[];
    function boundary(){while(segment<segments.length&&offset===segments[segment].length){segment++;offset=0;}if(segment>=segments.length)fail('Truncated SST continuation.');}
    function readByte(){boundary();return segments[segment][offset++];}
    function integer(n){let value=0;for(let i=0;i<n;i++)value+=readByte()*2**(i*8);return value;}
    function skip(n){for(let i=0;i<n;){boundary();const size=Math.min(n-i,segments[segment].length-offset);offset+=size;i+=size;}}
    const total=integer(4),unique=integer(4);if(unique>LIMITS.records||total<unique)fail('Invalid SST string counts.');
    for(let i=0;i<unique;i++){const count=integer(2),flags=integer(1);if(flags&~0x0d||(totalCharacters+=count)>LIMITS.characters)fail('SST character budget or flags are unsupported.');const runs=flags&8?integer(2):0,extension=flags&4?integer(4):0;let wide=!!(flags&1),text='';for(let j=0;j<count;j++){if(offset===segments[segment].length){segment++;offset=0;if(segment>=segments.length)fail('Truncated SST character data.');const continuation=segments[segment][offset++];if(continuation>1)fail('Invalid SST character continuation flag.');wide=!!continuation;}if(wide){if(offset+2>segments[segment].length)fail('SST splits a UTF-16 code unit.');text+=String.fromCharCode(segments[segment][offset]|segments[segment][offset+1]<<8);offset+=2;}else text+=String.fromCharCode(segments[segment][offset++]);}for(let k=0;k<text.length;k++){const code=text.charCodeAt(k);if(code>=0xd800&&code<=0xdbff){const low=text.charCodeAt(++k);if(!(low>=0xdc00&&low<=0xdfff))fail('Invalid SST Unicode text.');}else if(code>=0xdc00&&code<=0xdfff)fail('Invalid SST Unicode text.');}skip(runs*4+extension);strings.push(text);}
    // Trailing bytes would hide an unparsed string or malformed continuation.
    while(segment<segments.length&&offset===segments[segment].length){segment++;offset=0;}if(segment<segments.length)fail('Unexpected trailing SST data.');return strings;
  }
  function excel(streams){
    const bytes=streams.get('WORKBOOK')||streams.get('BOOK');if(!bytes)fail('Workbook stream is missing.');const d=view(bytes),records=[],recordOffsets=new Map();let position=0;
    while(position<bytes.length){span(bytes,position,4);const id=d.getUint16(position,true),size=d.getUint16(position+2,true);if(size>8224)fail('BIFF record exceeds the BIFF8 limit.');const data=span(bytes,position+4,size);recordOffsets.set(position,records.length);records.push({id,data,offset:position});position+=4+size;if(records.length>LIMITS.records*4)fail('Too many BIFF records.');}
    if(records[0]?.id!==0x0809||records[0].data.length<4||view(records[0].data).getUint16(0,true)!==0x0600||view(records[0].data).getUint16(2,true)!==5)fail('Only BIFF8 Excel 97–2003 workbook streams are supported.');if(records.some(r=>r.id===0x002f))fail('Encrypted Excel workbooks are unsupported.');
    const sheetDefs=[],strings=[];let globalsEnd=-1,sstSeen=false;const warnings=['Cached cell values are raw stored values. Number formats, date serials and formula results are not recalculated. Formula metadata preserves BIFF token bytes, not an invented formula expression. Macros, external links, charts and embedded objects do not execute.'];
    for(let i=1;i<records.length;i++){const r=records[i];if(r.id===0x000a){globalsEnd=i;break;}if(r.id===0x0085){span(r.data,0,8);const x=view(r.data),name=biffString(r.data,6,true);if(r.data[4]>2||![0,1,2,6].includes(r.data[5]))fail('Unsupported sheet visibility or type.');if(name.end!==r.data.length)fail('Invalid worksheet name record.');sheetDefs.push({offset:x.getUint32(0,true),kind:r.data[5],name:name.text});if(sheetDefs.length>LIMITS.sheets)fail('Too many workbook sheets.');}if(r.id===0x00fc){if(sstSeen)fail('Duplicate SST record.');sstSeen=true;const parts=[r.data];while(records[i+1]?.id===0x003c)parts.push(records[++i].data);strings.push(...sstStrings(parts));}}
    if(globalsEnd<0||!sheetDefs.length)fail('Workbook globals or sheet directory are missing.');
    const out=output(),sheetNames=new Set(),sheetOffsets=new Set();let pending=null;
    function add(name,row,col,text,r,extra){if(row>65535||col>255)fail('Cell lies outside the BIFF8 worksheet grid.');let address='',c=col+1;while(c){c--;address=String.fromCharCode(65+c%26)+address;c=Math.floor(c/26);}address+=row+1;out.add(text,{type:'excel-cell',sheet:name,cell:address,stream:streams.has('WORKBOOK')?'Workbook':'Book',streamOffset:r.offset,offsetUnit:'bytes'},extra);}
    function numeric(value){if(!Number.isFinite(value))fail('Nonfinite numeric cell value.');return String(value);}
    function rk(raw){const v=view(new Uint8Array(8));let value;if(raw&2)value=(raw|0)>>2;else{v.setUint32(4,raw&0xfffffffc,true);value=v.getFloat64(0,true);}return raw&1?value/100:value;}
    const errors={0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A',43:'#GETTING_DATA'};
    for(const sheet of sheetDefs){if(!sheet.name||sheet.name.length>31||/[\[\]:*?\/\\]/.test(sheet.name)||sheetNames.has(sheet.name.toUpperCase())||sheetOffsets.has(sheet.offset))fail('Duplicate or invalid sheet directory entry.');sheetNames.add(sheet.name.toUpperCase());sheetOffsets.add(sheet.offset);if(sheet.kind!==0){warnings.push('Skipped non-worksheet sheet: '+sheet.name);continue;}let index=recordOffsets.get(sheet.offset)??-1;const first=records[index];if(index<=globalsEnd||first?.id!==0x0809||first.data.length<4||view(first.data).getUint16(0,true)!==0x0600||view(first.data).getUint16(2,true)!==0x0010)fail('Worksheet directory offset does not reference a BIFF8 worksheet.');const cells=new Set();let ended=false;
      function cell(r,text,extra){span(r.data,0,6);const x=view(r.data),row=x.getUint16(0,true),col=x.getUint16(2,true),key=row+':'+col;if(cells.has(key))fail('Duplicate worksheet cell records.');cells.add(key);add(sheet.name,row,col,text,r,extra);}
      for(index++;index<records.length;index++){const r=records[index],x=view(r.data);if(pending&&r.id!==0x0207)fail('Formula cached string is missing or uses unsupported record routing.');if(r.id===0x000a){ended=true;break;}if(r.id===0x0809)fail('Unexpected nested worksheet stream.');if(r.id===0x0203){span(r.data,0,14);cell(r,numeric(x.getFloat64(6,true)));}
        else if(r.id===0x027e){span(r.data,0,10);cell(r,numeric(rk(x.getUint32(6,true))));}
        else if(r.id===0x00fd){span(r.data,0,10);const id=x.getUint32(6,true);if(id>=strings.length)fail('Cell references a missing shared string.');cell(r,strings[id]);}
        else if(r.id===0x0204){span(r.data,0,9);const value=biffString(r.data,6,false);if(value.end!==r.data.length)fail('Unsupported LABEL continuation.');cell(r,value.text);}
        else if(r.id===0x0205){span(r.data,0,8);if(r.data[7]>1)fail('Invalid Boolean/error flag.');const value=r.data[7]?errors[r.data[6]]:r.data[6]===0?'FALSE':r.data[6]===1?'TRUE':null;if(value===undefined||value===null)fail('Invalid Boolean or error cell.');cell(r,value);}
        else if(r.id===0x0201){span(r.data,0,6);cell(r,'');}
        else if(r.id===0x00bd||r.id===0x00be){span(r.data,0,6);const row=x.getUint16(0,true),firstCol=x.getUint16(2,true),lastCol=x.getUint16(r.data.length-2,true),step=r.id===0x00bd?6:2;if(lastCol<firstCol||r.data.length!==6+(lastCol-firstCol+1)*step)fail('Invalid multiple-cell record.');for(let col=firstCol;col<=lastCol;col++){const key=row+':'+col;if(cells.has(key))fail('Duplicate worksheet cell records.');cells.add(key);add(sheet.name,row,col,r.id===0x00bd?numeric(rk(x.getUint32(6+(col-firstCol)*6,true))):'',r);}}
        else if(r.id===0x0006){span(r.data,0,22);const tokenLength=x.getUint16(20,true),tokens=span(r.data,22,tokenLength);if(22+tokenLength!==r.data.length)fail('Unsupported formula record extension.');const hex=Array.from(tokens,n=>n.toString(16).padStart(2,'0')).join(''),extra={formula:'BIFF8 token bytes (hex): '+hex,formulaEncoding:'BIFF8-RPN',formulaTokensHex:hex};if(x.getUint16(12,true)===0xffff){const type=r.data[6];if(type===0){pending={r,extra};continue;}if(type===1&&r.data[8]<=1)extra.cachedValue=r.data[8]?'TRUE':'FALSE';else if(type===2&&errors[r.data[8]])extra.cachedValue=errors[r.data[8]];else if(type===3)extra.cachedValue='';else fail('Unsupported formula cached value.');}else extra.cachedValue=numeric(x.getFloat64(6,true));cell(r,extra.cachedValue,extra);}
        else if([0x00d6,0x0002,0x0003,0x0004,0x0005].includes(r.id))fail('Unsupported legacy cell record encoding.');
        else if(r.id===0x0207){if(!pending)fail('Unexpected cached formula string.');const value=biffString(r.data,0,false);if(value.end!==r.data.length)fail('Cached formula string continuation is unsupported.');pending.extra.cachedValue=value.text;cell(pending.r,value.text,pending.extra);pending=null;}
      }
      if(!ended||pending)fail('Worksheet EOF or formula cached string is missing.');
    }
    return {parserVersion:'legacy-xls-1',records:out.records,warnings};
  }
  async function parseLegacyBytes(name,bytes){if(typeof name!=='string'||!(bytes instanceof Uint8Array))fail('Provide a file name and Uint8Array.');if(bytes.length>LIMITS.input)fail('Source exceeds the 5 MB input limit.');const ext=name.toLowerCase().split('.').pop();if(!['doc','xls'].includes(ext))fail('Only legacy DOC and XLS are supported.');const streams=compound(bytes);return ext==='doc'?word(streams):excel(streams);}
  return {parseLegacyBytes,LEGACY_LIMITS:LIMITS};
});
