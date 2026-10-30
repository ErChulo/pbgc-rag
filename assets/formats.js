/* Original dependency-free bounded parsers. No document code or references execute. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const BUDGET = Object.freeze({input: 5*1024*1024, expanded: 20*1024*1024, entries: 2000, records: 50000, nodes: 150000, depth: 64, characters: 2000000, ratio: 200});
  const fail = message => { throw Error(message); };
  const utf8 = bytes => { try { return new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes); } catch (_) { fail('This parser requires valid UTF-8 source XML or text.'); } };
  function decode(value) {
    if (/&(?!(?:[^;\s]+);)/.test(value)) fail('Invalid XML entity.');
    return value.replace(/&([^;\s]+);/g, (_, entity) => {
      const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
      if (Object.hasOwn(named, entity)) return named[entity];
      const numeric = /^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity);
      const code = numeric ? Number(entity[1] === 'x' ? '0x'+entity.slice(2) : entity.slice(1)) : NaN;
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || code < 32 && ![9,10,13].includes(code) || code >= 0xd800 && code <= 0xdfff || code === 0xfffe || code === 0xffff) fail('Unsupported or invalid XML entity.');
      return String.fromCodePoint(code);
    });
  }
  const local = name => name.split(':').pop();
  function xml(text) {
    if (text.length > BUDGET.characters || /<!DOCTYPE|<!ENTITY/i.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail('XML exceeds limits or contains prohibited DTD/entities.');
    const document = {name:'#document',attrs:Object.create(null),children:[],offset:0}; const stack=[document]; let offset=0,nodes=0;
    while (offset < text.length) {
      if (++nodes > BUDGET.nodes) fail('XML node limit exceeded.');
      if (text[offset] !== '<') { const end=text.indexOf('<',offset); const next=end<0?text.length:end; const value=text.slice(offset,next); if (/&(?!(?:[^;\s]+);)/.test(value)) fail('Invalid XML entity.'); stack.at(-1).children.push({name:'#text',value:decode(value),offset}); offset=next; continue; }
      if (text.startsWith('<!--',offset)) { const end=text.indexOf('-->',offset+4); if(end<0) fail('Unclosed XML comment.'); offset=end+3; continue; }
      if (text.startsWith('<![CDATA[',offset)) { const end=text.indexOf(']]>',offset+9); if(end<0) fail('Unclosed XML CDATA.'); stack.at(-1).children.push({name:'#text',value:text.slice(offset+9,end),offset:offset+9}); offset=end+3; continue; }
      if (text.startsWith('<?',offset)) { const end=text.indexOf('?>',offset+2); if(end<0) fail('Unclosed XML instruction.'); offset=end+2; continue; }
      const end = (()=>{let quote=''; for(let i=offset+1;i<text.length;i++){const c=text[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')return i;} return -1;})();
      if(end<0) fail('Unclosed XML tag.');
      const tag=text.slice(offset+1,end);
      if(tag.startsWith('/')) { const name=tag.slice(1).trim(); if(stack.length===1||stack.at(-1).name!==name) fail('Mismatched XML closing tag.'); stack.pop(); }
      else {
        const match=/^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(tag); if(!match) fail('Invalid XML tag.');
        const node={name:match[1],attrs:Object.create(null),children:[],offset}; let rest=match[2]; const self=/\/\s*$/.test(rest); if(self)rest=rest.replace(/\/\s*$/,'');
        while(rest.trim()) { const attr=/^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(rest); if(!attr||Object.hasOwn(node.attrs,attr[1])) fail('Invalid or duplicate XML attribute.'); if(attr[3].includes('<')) fail('Invalid XML attribute.'); node.attrs[attr[1]]=decode(attr[3]); rest=rest.slice(attr[0].length); }
        stack.at(-1).children.push(node); if(!self){stack.push(node);if(stack.length>BUDGET.depth+1)fail('XML depth limit exceeded.');}
      }
      offset=end+1;
    }
    if(stack.length!==1)fail('Unclosed XML element.');
    const roots=document.children.filter(n=>n.name!=='#text'); if(roots.length!==1||document.children.some(n=>n.name==='#text'&&n.value.trim()))fail('XML needs one root element.');
    return document;
  }
  function descendants(node, name) { const result=[]; const stack=[node]; while(stack.length){const n=stack.pop();if(local(n.name)===name)result.push(n);for(let i=n.children?.length-1;i>=0;i--)stack.push(n.children[i]);}return result; }
  const children=(node,name)=>(node.children||[]).filter(n=>local(n.name)===name);
  const textOf=node=>node.name==='#text'?node.value:(node.children||[]).map(textOf).join('');
  const attr=(node,name)=>Object.entries(node.attrs).find(([key])=>local(key)===name)?.[1];
  const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  async function archive(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}}
    if(end<0)fail('Invalid ZIP end record.');
    const count=u16(end+10),directorySize=u32(end+12),directoryOffset=u32(end+16);
    if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count===65535||count>BUDGET.entries||directoryOffset+directorySize!==end)fail('Unsupported multi-disk, ZIP64 or oversized archive.');
    const entries=new Map();let offset=directoryOffset,total=0;
    for(let i=0;i<count;i++){
      if(offset+46>end||u32(offset)!==0x02014b50)fail('Invalid ZIP directory.');
      const flags=u16(offset+8),method=u16(offset+10),crc=u32(offset+16),compressed=u32(offset+20),size=u32(offset+24),nameLength=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),start=u32(offset+42);
      if(offset+46+nameLength+extra+comment>end)fail('Invalid ZIP entry bounds.');
      const name=utf8(bytes.subarray(offset+46,offset+46+nameLength));
      if(flags&1||![0,8].includes(method)||size===0xffffffff||compressed===0xffffffff||start===0xffffffff||u16(offset+34))fail('Encrypted or unsupported ZIP entry.');
      if(name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.')||entries.has(name))fail('Unsafe or duplicate archive path.');
      total+=size;if(total>BUDGET.expanded||size>BUDGET.expanded||size>Math.max(1024,compressed*BUDGET.ratio))fail('Archive expansion budget exceeded.');
      if(start+30>directoryOffset||u32(start)!==0x04034b50||u16(start+6)!==flags||u16(start+8)!==method)fail('Invalid ZIP local header.');
      const localNameLength=u16(start+26),localExtra=u16(start+28),dataStart=start+30+localNameLength+localExtra;
      if(utf8(bytes.subarray(start+30,start+30+localNameLength))!==name||dataStart+compressed>directoryOffset)fail('ZIP local entry mismatch.');
      if(!(flags&8)&&(u32(start+14)!==crc||u32(start+18)!==compressed||u32(start+22)!==size))fail('ZIP local size mismatch.');
      entries.set(name,{method,crc,size,data:bytes.subarray(dataStart,dataStart+compressed)});offset+=46+nameLength+extra+comment;
    }
    if(offset!==end)fail('ZIP directory size mismatch.');
    const cache=new Map();
    async function read(name){if(cache.has(name))return cache.get(name);const entry=entries.get(name);if(!entry)fail('Missing Office part: '+name);let data;
      if(entry.method===0)data=entry.data;
      else{if(typeof DecompressionStream==='undefined')fail('This browser cannot decompress Office files.');let stream;try{stream=new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch(_){fail('This browser cannot decompress Office files.');}const reader=stream.getReader(),chunks=[];let size=0;try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>entry.size||size>BUDGET.expanded){await reader.cancel();fail('ZIP decompression exceeds declared size.');}chunks.push(chunk.value);}data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}}catch(error){await reader.cancel().catch(()=>{});throw error;}}
      if(data.length!==entry.size||crc32(data)!==entry.crc)fail('ZIP size or CRC integrity check failed.');const value=utf8(data);cache.set(name,value);return value;}
    return {entries,read};
  }
  function collector(){const records=[];let characters=0;return{records,add(text,locator,extra={}){characters+=text.length;if(records.length>=BUDGET.records||characters>BUDGET.characters)fail('Parsed document exceeds record or text budget.');records.push({text,locator,...extra});}};}
  function resolvePart(base,target){if(!target||target.includes('\\')||target.includes(':')||target.startsWith('/')||target.includes('#')||target.includes('?'))fail('Unsupported Office relationship target.');const parts=base.split('/').slice(0,-1);for(const part of target.split('/')){if(part==='..'){if(!parts.length)fail('Unsafe Office relationship.');parts.pop();}else if(part!=='.')parts.push(part);}return parts.join('/');}
  async function word(zip){const out=collector();const warnings=['Text extraction only. Layout, images, drawing text, equations and tracked-change semantics are not reproduced. Original package remains authoritative.'];
    const parts=[...zip.entries.keys()].filter(n=>/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(n)).sort((a,b)=>a==='word/document.xml'?-1:b==='word/document.xml'?1:a.localeCompare(b));
    if(!parts.includes('word/document.xml'))fail('Missing Word document part.');
    for(const part of parts){const doc=xml(await zip.read(part));let paragraph=0,table=0;
      function walk(node,context={}){if(local(node.name)==='tbl'){const tableNumber=++table;let row=0;for(const tr of children(node,'tr')){row++;let column=0;for(const tc of children(tr,'tc')){column++;walk(tc,{table:tableNumber,row,column});}}return;}
        if(local(node.name)==='p'){paragraph++;const runs=[];function gather(n){if(local(n.name)==='t')runs.push(textOf(n));else if(local(n.name)==='tab')runs.push('\t');else if(['br','cr'].includes(local(n.name)))runs.push('\n');else for(const child of n.children||[])gather(child);}gather(node);const text=runs.join('');out.add(text,{type:'word-paragraph',part,paragraph,...context});return;}for(const child of node.children||[])walk(child,context);}
      walk(doc);
    }return{parserVersion:'office-1',format:'docx',records:out.records,warnings};
  }
  async function excel(zip,macro){const out=collector();const workbook=xml(await zip.read('xl/workbook.xml'));const rels=xml(await zip.read('xl/_rels/workbook.xml.rels'));const map=new Map();for(const rel of descendants(rels,'Relationship')){if(attr(rel,'TargetMode')==='External')continue;const id=attr(rel,'Id');if(map.has(id))fail('Duplicate workbook relationship.');map.set(id,resolvePart('xl/workbook.xml',attr(rel,'Target')));}
    let shared=[];if(zip.entries.has('xl/sharedStrings.xml')){const doc=xml(await zip.read('xl/sharedStrings.xml'));shared=descendants(doc,'si').map(si=>descendants(si,'t').map(textOf).join(''));if(shared.length>BUDGET.records)fail('Shared string limit exceeded.');}
    const sheets=descendants(workbook,'sheet');if(sheets.length>1000)fail('Sheet limit exceeded.');const seenSheets=new Set();
    for(const sheet of sheets){const name=attr(sheet,'name'),part=map.get(attr(sheet,'id'));if(!name||seenSheets.has(name)||!part?.startsWith('xl/worksheets/'))fail('Invalid or unsupported worksheet relationship.');seenSheets.add(name);const doc=xml(await zip.read(part));const seenCells=new Set();
      for(const cell of descendants(doc,'c')){const address=attr(cell,'r');if(!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address||'')||Number(address?.replace(/^[A-Z]+/,''))>1048576||[...(address?.match(/^[A-Z]+/)?.[0]||'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)>16384||seenCells.has(address))fail('Missing or duplicate worksheet cell locator.');seenCells.add(address);const formula=children(cell,'f')[0],value=children(cell,'v')[0],kind=attr(cell,'t');let text=value?textOf(value):'';
        if(kind==='s'){if(!/^[0-9]+$/.test(text)||Number(text)>=shared.length)fail('Invalid shared-string index.');text=shared[Number(text)];}else if(kind==='inlineStr')text=descendants(cell,'t').map(textOf).join('');
        const extra={};if(formula){extra.formula=textOf(formula);extra.formulaAttributes={...formula.attrs};extra.cachedValue=text;}
        out.add(text,{type:'excel-cell',sheet:name,cell:address,part},extra);
      }
    }
    return{parserVersion:'office-1',format:macro?'xlsm':'xlsx',records:out.records,warnings:['Cell text and cached values only. Formulas are preserved as metadata and never calculated. Styles, dates, charts, merged-cell display and external links are not interpreted.',...(macro?['Macros are ignored and never executed.']:[])]};
  }
  function markup(text,html){const out=collector();if(html){if(text.length>BUDGET.characters)fail('HTML text budget exceeded.');let offset=0;const hidden=[];let chunks=0;
      // Inert lexical extraction: never creates DOM or resolves an asset. Locators are exact source offsets, not DOM positions.
      while(offset<text.length){if(++chunks>BUDGET.nodes)fail('HTML token limit exceeded.');if(text.startsWith('<!--',offset)){const end=text.indexOf('-->',offset+4);if(end<0)fail('Unclosed HTML comment.');offset=end+3;continue;}if(text[offset]==='<'){const match=/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/.exec(text.slice(offset));let quote='',end=-1;for(let i=offset+1;i<text.length;i++){const c=text[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>'){end=i;break;}}if(end<0)fail('Unclosed HTML tag.');if(match){const tag=match[2].toLowerCase();if(['script','style','template','noscript'].includes(tag)){if(match[1]){if(hidden.at(-1)===tag)hidden.pop();}else{hidden.push(tag);if(hidden.length>BUDGET.depth)fail('HTML depth limit exceeded.');}}}offset=end+1;continue;}const end=text.indexOf('<',offset),next=end<0?text.length:end;const raw=text.slice(offset,next);if(!hidden.length&&raw.trim()){const value=raw.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/g,token=>token==='&nbsp;'?'\u00a0':decode(token));out.add(value,{type:'html-text-offset',offset,length:raw.length,offsetUnit:'UTF-16 code units'});}offset=next;}
      return{parserVersion:'markup-1',format:'html',records:out.records,warnings:['Inert lexical text extraction only. Source offsets identify text segments, not browser DOM nodes. Scripts, styles, templates and remote resources are not loaded.']};
    }
    const doc=xml(text);function walk(node,path){const counts=new Map();for(const child of node.children||[]){if(child.name==='#text'){if(child.value.trim())out.add(child.value,{type:'xml-text',path,offset:child.offset,offsetUnit:'UTF-16 code units'});}else{const count=(counts.get(child.name)||0)+1;counts.set(child.name,count);walk(child,path+'/'+child.name+'['+count+']');}}}walk(doc,'');return{parserVersion:'markup-1',format:'xml',records:out.records,warnings:['XML paths and original text offsets are preserved. DTD and custom entities are rejected.']};
  }
  async function parseBytes(name,bytes){if(typeof name!=='string'||!(bytes instanceof Uint8Array))fail('Provide a file name and Uint8Array.');if(bytes.length>BUDGET.input)fail('Source exceeds the 5 MB limit.');const ext=name.toLowerCase().split('.').pop();if(['docx','xlsx','xlsm'].includes(ext)){const zip=await archive(bytes);if(!zip.entries.has('[Content_Types].xml'))fail('Not an Office Open XML package.');return ext==='docx'?word(zip):excel(zip,ext==='xlsm');}if(['html','htm','xml'].includes(ext))return markup(utf8(bytes),ext!=='xml');if(['txt','md','csv','tsv','json'].includes(ext)){const core=root.PBGCRag?.parseText?root.PBGCRag:typeof require==='function'?require('./core.js'):null;if(!core)fail('Core text parser is unavailable.');return core.parseText(name,utf8(bytes));}fail('Unsupported format. PDF, legacy DOC/XLS and SQLite require additional audited local parsers.');}
  return {parseBytes,FORMAT_LIMITS:BUDGET};
});
