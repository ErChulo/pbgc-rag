'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createCaseCollectionArchive,parseCaseCollectionArchive,CASE_ARCHIVE_LIMITS}=require('../assets/case-archive.js');

const MiB=1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;}return(value^0xffffffff)>>>0;}
function zip(parts){
  const local=[],central=[];let offset=0;
  for(const [name,input]of parts){const filename=Buffer.from(name),data=Buffer.from(input),checksum=crc(data),header=Buffer.alloc(30),entry=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt32LE(checksum,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
    entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
    local.push(header,filename,data);central.push(entry,filename);offset+=header.length+filename.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
function smallParts(changeManifest,extra=[]){
  const bytes=Buffer.from('Normal retirement age is 65.\n'),source={id:'source-01',name:'Synthetic plan.txt',hash:sha(bytes),bytes:bytes.length,sourceVersion:3,parserVersion:'synthetic-parser-v1',path:'documents/source-01.source',headerRow:2};
  const manifest={schemaVersion:1,kind:'pbgc-case-collection-archive',caseId:'case-01',caseName:'Synthetic case',caseRevision:7,sourceCount:1,originalBytes:bytes.length,sources:[source]};
  changeManifest?.(manifest);return[['manifest.json',JSON.stringify(manifest)],['documents/source-01.source',bytes],...extra];
}
async function fixtureVault(inputs){
  const originals=[];
  for(const [index,input]of inputs.entries()){const blob=input.blob||new Blob([input.text??'Synthetic fact '+index]),bytes=Buffer.from(await blob.arrayBuffer()),id=input.id||'source-'+String(index).padStart(4,'0');originals.push({id,name:input.name||id+'.txt',hash:sha(bytes),bytes:blob.size,revision:input.revision||index+1,parserVersion:'synthetic-parser-v1',caseId:'case-01',blob,headerRow:input.headerRow,tableHeaders:input.tableHeaders});}
  originals.sort((a,b)=>a.id.localeCompare(b.id));
  const control={revision:7,gets:0,pageSizes:[],afterIds:[],onGet:null};
  const metadata=original=>{const {blob,headerRow,tableHeaders,...rest}=original;return structuredClone(rest);};
  return{control,originals,
    async getCase(id,{signal}={}){if(signal?.aborted)throw signal.reason;return{id:'case-01',name:'Synthetic café case',revision:control.revision,sourceCount:originals.length,originalBytes:originals.reduce((sum,item)=>sum+item.bytes,0)};},
    async listSources(id,{afterId,limit=200}={}){control.pageSizes.push(limit);control.afterIds.push(afterId);return originals.filter(source=>afterId===undefined||source.id>afterId).slice(0,limit).map(metadata);},
    async getSource(id,sourceId){const source=originals.find(item=>item.id===sourceId);control.gets++;control.onGet?.(source);return source?{...metadata(source),blob:source.blob}:null;},
    async getShard(id,sourceId){const source=originals.find(item=>item.id===sourceId);return source?.headerRow===undefined&&source?.tableHeaders===undefined?null:{sourceHash:source.hash,sourceRevision:source.revision,verification:'authenticated-local-derived-v1',payload:{profile:'large-case-corpus-v1',ready:true,...(source.headerRow===undefined?{}:{headerRow:source.headerRow}),...(source.tableHeaders===undefined?{}:{tableHeaders:source.tableHeaders})}};}
  };
}

test('two MiB native Blob backup round-trips exact originals, filenames, headers and source versions with bounded reads',async()=>{
  const text='Synthetic large original\n'+'x'.repeat(2*MiB),vault=await fixtureVault([{name:'Plan é.txt',text,revision:9},{name:'Factors.xlsx',text:'Age,Factor\n60,0.75',revision:13,headerRow:2}]);
  const events=[],arrayBuffer=Blob.prototype.arrayBuffer;let largestRead=0;
  try{
    Blob.prototype.arrayBuffer=function(){largestRead=Math.max(largestRead,this.size);assert.ok(this.size<=CASE_ARCHIVE_LIMITS.manifestBytes,'No case-sized ArrayBuffer is permitted');return arrayBuffer.call(this);};
    const archive=await createCaseCollectionArchive(vault,'case-01',{onProgress:event=>events.push(event)});
    assert.ok(archive instanceof Blob);assert.equal(archive.type,'application/zip');assert.ok(archive.size>text.length);
    const restored=await parseCaseCollectionArchive(archive);assert.equal(restored.manifest.schemaVersion,1);assert.equal(restored.manifest.caseName,'Synthetic café case');assert.equal(restored.entries.length,2);
    for(let i=0;i<restored.entries.length;i++){const {file,source}=restored.entries[i],original=vault.originals[i];assert.ok(file instanceof File);assert.equal(file.name,original.name);assert.equal(file.size,original.bytes);assert.equal(source.sourceVersion,original.revision);assert.equal(source.parserVersion,original.parserVersion);assert.equal(source.hash,original.hash);
      // Read the restored fixture only after checking codec read bounds.
      assert.equal(sha(Buffer.from(await arrayBuffer.call(file))),original.hash);
    }
    assert.equal(restored.entries[1].source.headerRow,2);assert.equal(Object.hasOwn(restored.entries[0].source,'headerRow'),false);
    assert.ok(largestRead<=MiB);assert.ok(events.some(event=>event.phase==='backup'&&event.sourceBytesRead>=MiB));assert.equal(events.at(-1).phase,'complete');
    assert.ok(vault.control.pageSizes.every(size=>size<=200));
  }finally{Blob.prototype.arrayBuffer=arrayBuffer;}
});

test('empty cases use one bounded manifest entry and zero original files',async()=>{
  const vault=await fixtureVault([]),archive=await createCaseCollectionArchive(vault,'case-01'),parsed=await parseCaseCollectionArchive(archive);assert.equal(parsed.manifest.originalBytes,0);assert.deepEqual(parsed.entries,[]);
});

test('separate spreadsheet sheet choices round-trip without derived cells or an inferred common row',async()=>{
  const tableHeaders=[{tableName:'Benefits',headerRow:2},{tableName:'Factors',headerRow:4}],vault=await fixtureVault([{name:'Synthetic workbook.xlsx',text:'Synthetic original workbook bytes',tableHeaders}]);
  const parsed=await parseCaseCollectionArchive(await createCaseCollectionArchive(vault,'case-01'));
  assert.deepEqual(parsed.entries[0].source.tableHeaders,tableHeaders);assert.equal(Object.hasOwn(parsed.entries[0].source,'headerRow'),false);
  assert.deepEqual(Object.keys(parsed.entries[0].source).sort(),['bytes','hash','id','name','parserVersion','sourceVersion','tableHeaders'].sort());
});

test('table column choices reject duplicates, hidden derived data, invalid names, conflicting rows and excessive counts',async()=>{
  const choices=[null,{},[{tableName:'Benefits',headerRow:0}],[{tableName:'Benefits',headerRow:50001}],[{tableName:'',headerRow:1}],[{tableName:'Sheet\nInjected',headerRow:1}],[{tableName:'Benefits',headerRow:2,records:['forged']}],[{tableName:'Benefits',headerRow:2},{tableName:'Benefits',headerRow:3}],Array.from({length:1001},(_,i)=>({tableName:'S'+i,headerRow:1})),[{tableName:'Synthetic plan.txt',headerRow:3}]];
  for(const tableHeaders of choices){const parts=smallParts(manifest=>{manifest.sources[0].tableHeaders=tableHeaders;});await assert.rejects(parseCaseCollectionArchive(new Blob([zip(parts)])),{code:'INVALID_MANIFEST'});}
});

test('source listing advances through bounded pages rather than a case-sized getAll',async()=>{
  const vault=await fixtureVault(Array.from({length:201},(_,i)=>({text:'Synthetic '+i}))),archive=await createCaseCollectionArchive(vault,'case-01'),parsed=await parseCaseCollectionArchive(archive);assert.equal(parsed.entries.length,201);assert.deepEqual(vault.control.pageSizes,[200,200]);assert.equal(vault.control.afterIds[1],'source-0199');
});

test('CRC corruption in a body or manifest is rejected before returning originals',async()=>{
  const bytes=zip(smallParts()),body=Buffer.from(bytes),manifest=Buffer.from(bytes);body[body.indexOf('Normal retirement')+3]^=1;manifest[manifest.indexOf('Synthetic case')+3]^=1;
  await assert.rejects(parseCaseCollectionArchive(new Blob([body])),{code:'INTEGRITY'});await assert.rejects(parseCaseCollectionArchive(new Blob([manifest])),{code:'INTEGRITY'});
});

test('local CRC, size and filename metadata must match the central directory',async()=>{
  const bytes=zip(smallParts());for(const offset of [14,18,22,30]){const corrupt=Buffer.from(bytes);corrupt[offset]^=1;await assert.rejects(parseCaseCollectionArchive(new Blob([corrupt])),{code:'INVALID_ARCHIVE'});}
});

test('unsafe paths, duplicate entries and unlisted originals are rejected',async()=>{
  for(const name of ['../escape.source','documents/../escape.source','documents/a\\b.source','documents/x:evil.source','/absolute.source'])await assert.rejects(parseCaseCollectionArchive(new Blob([zip(smallParts(null,[[name,'x']]))])),{code:'INVALID_ARCHIVE'});
  await assert.rejects(parseCaseCollectionArchive(new Blob([zip(smallParts(null,[['documents/source-01.source','duplicate']]))])),{code:'INVALID_ARCHIVE'});
  await assert.rejects(parseCaseCollectionArchive(new Blob([zip(smallParts(null,[['documents/unlisted.source','hidden']]))])),{code:'INVALID_MANIFEST'});
});

test('overlap, truncation, hidden padding and a missing ZIP end record are rejected',async()=>{
  const bytes=zip(smallParts()),end=bytes.length-22,directory=bytes.readUInt32LE(end+16),firstNameLength=bytes.readUInt16LE(directory+28),second=directory+46+firstNameLength;
  const overlap=Buffer.from(bytes);overlap.writeUInt32LE(0,second+42);await assert.rejects(parseCaseCollectionArchive(new Blob([overlap])),{code:'INVALID_ARCHIVE'});
  const padding=Buffer.concat([bytes.subarray(0,directory),Buffer.from([0]),bytes.subarray(directory)]);padding.writeUInt32LE(directory+1,padding.length-22+16);await assert.rejects(parseCaseCollectionArchive(new Blob([padding])),{code:'INVALID_ARCHIVE'});
  for(const short of [bytes.subarray(0,-1),bytes.subarray(0,-22),Buffer.from('not a zip')])await assert.rejects(parseCaseCollectionArchive(new Blob([short])));
});

test('compressed, encrypted, data-descriptor, ZIP64 and expansion-bomb declarations are rejected',async()=>{
  const bytes=zip(smallParts()),directory=bytes.readUInt32LE(bytes.length-22+16);
  for(const [offset,width,value]of [[directory+10,2,8],[directory+8,2,0x801],[directory+8,2,0x808],[directory+24,4,0xffffffff],[directory+20,4,0xffffffff],[directory+42,4,0xffffffff],[directory+30,2,4],[bytes.length-22+10,2,65535],[bytes.length-22+12,4,2*MiB]]){const corrupt=Buffer.from(bytes);corrupt[width===2?'writeUInt16LE':'writeUInt32LE'](value,offset);await assert.rejects(parseCaseCollectionArchive(new Blob([corrupt])));}
});

test('manifest source counts, bytes, names, versions, paths, hashes and header rows are strict',async()=>{
  const changes=[manifest=>manifest.schemaVersion=2,manifest=>manifest.sourceCount=2001,manifest=>manifest.originalBytes++,manifest=>manifest.sources[0].bytes++,manifest=>manifest.sources[0].name='../plan.txt',manifest=>manifest.sources[0].hash='false',manifest=>manifest.sources[0].sourceVersion=0,manifest=>manifest.sources[0].headerRow=0,manifest=>manifest.sources[0].path='documents/other.source',manifest=>{delete manifest.sources[0].id;},manifest=>manifest.extra={records:['must not import derived text']}];
  for(const change of changes)await assert.rejects(parseCaseCollectionArchive(new Blob([zip(smallParts(change))])),{code:'INVALID_MANIFEST'});
});

test('backup refuses unauthenticated settings, a stale source and a case changed during export',async()=>{
  const unauthenticated=await fixtureVault([{text:'Synthetic factor',headerRow:2}]),original=unauthenticated.getShard;unauthenticated.getShard=async(...args)=>({...await original(...args),verification:'not-authenticated'});await assert.rejects(createCaseCollectionArchive(unauthenticated,'case-01'),{code:'INTEGRITY'});
  const stale=await fixtureVault([{text:'Synthetic source'}]),read=stale.getSource;stale.getSource=async(...args)=>({...await read(...args),revision:99});await assert.rejects(createCaseCollectionArchive(stale,'case-01'),{code:'CONFLICT'});
  const changed=await fixtureVault([{text:'Synthetic source'}]);changed.control.onGet=()=>{changed.control.revision++;};await assert.rejects(createCaseCollectionArchive(changed,'case-01'),{code:'CONFLICT'});
});

test('cancellation before work and between bounded CRC reads returns no partial archive or entries',async()=>{
  const vault=await fixtureVault([{text:'x'.repeat(2*MiB)}]),early=new AbortController();early.abort();await assert.rejects(createCaseCollectionArchive(vault,'case-01',{signal:early.signal}),{name:'AbortError',code:'ABORTED'});
  const exporting=new AbortController();await assert.rejects(createCaseCollectionArchive(vault,'case-01',{signal:exporting.signal,onProgress:()=>exporting.abort()}),{name:'AbortError',code:'ABORTED'});
  const archive=await createCaseCollectionArchive(vault,'case-01'),opening=new AbortController();await assert.rejects(parseCaseCollectionArchive(archive,{signal:opening.signal,onProgress:()=>opening.abort()}),{name:'AbortError',code:'ABORTED'});
  await assert.rejects(parseCaseCollectionArchive(archive,{signal:early.signal}),{name:'AbortError',code:'ABORTED'});
});

test('input validation and source byte budgets fail before case-sized allocation',async()=>{
  await assert.rejects(createCaseCollectionArchive(null,'case-01'),{code:'INVALID_INPUT'});await assert.rejects(parseCaseCollectionArchive(new Uint8Array([1,2,3])),{code:'INVALID_INPUT'});await assert.rejects(parseCaseCollectionArchive(new Blob(['x']),{onProgress:true}),{code:'INVALID_INPUT'});
  const vault=await fixtureVault([{text:'tiny'}]);vault.originals[0].bytes=64*MiB+1;await assert.rejects(createCaseCollectionArchive(vault,'case-01'),{code:'INVALID_MANIFEST'});assert.equal(vault.control.gets,0);
});
