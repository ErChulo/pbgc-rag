/* Portable large-case backups. Stored ZIP entries retain native Blob parts.
 * CRC reads use bounded slices; no case-sized ArrayBuffer or base64 is made.
 * CRC protects transport integrity. Restore must SHA-256-check and reparse each
 * original; this format contains no trusted imported records or model vectors. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const MiB=1024*1024,GiB=1024*MiB;
  const CASE_ARCHIVE_LIMITS=Object.freeze({originalBytes:GiB,sourceBytes:64*MiB,sources:2000,manifestBytes:8*MiB,directoryBytes:MiB,archiveBytes:GiB+10*MiB,readBytes:MiB});
  const KIND='pbgc-case-collection-archive',AUTH='authenticated-local-derived-v1',COLLECTION='large-case-corpus-v1';
  const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/,HASH=/^[a-f0-9]{64}$/;
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const crcTable=new Uint32Array(256);
  for(let i=0;i<256;i++){let value=i;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;crcTable[i]=value>>>0;}
  class CaseArchiveError extends Error{constructor(code,message){super(message);this.name=code==='ABORTED'?'AbortError':'CaseArchiveError';this.code=code;}}
  const fail=(code,message)=>{throw new CaseArchiveError(code,message);};
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const boundedName=value=>typeof value==='string'&&value.trim()&&value.length<=255&&!/[\x00-\x1f\x7f]/.test(value);
  const sourceName=value=>boundedName(value)&&!/[\\/]/.test(value)&&!['.','..'].includes(value);
  const positive=value=>Number.isSafeInteger(value)&&value>0;
  function abort(signal){if(signal?.aborted)fail('ABORTED','Case backup operation was cancelled.');}
  function settings(options){
    if(!plain(options)||options.signal!==undefined&&(!options.signal||typeof options.signal.aborted!=='boolean'||typeof options.signal.addEventListener!=='function')||options.onProgress!==undefined&&typeof options.onProgress!=='function')fail('INVALID_INPUT','Use valid backup options.');
    abort(options.signal);return{signal:options.signal,onProgress:options.onProgress};
  }
  function progress(options,event){abort(options.signal);options.onProgress?.(event);abort(options.signal);}
  function nativeBlob(blob){if(typeof root.Blob!=='function'||!(blob instanceof root.Blob))fail('INVALID_INPUT','Use a native Blob for the case backup.');return blob;}
  function slice(blob,start,end){return root.Blob.prototype.slice.call(blob,start,end);}
  async function read(blob,start,length,signal){
    abort(signal);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>blob.size)fail('INVALID_ARCHIVE','Backup entry bounds are invalid.');
    const part=slice(blob,start,start+length),bytes=new Uint8Array(await root.Blob.prototype.arrayBuffer.call(part));abort(signal);if(bytes.length!==length)fail('INVALID_ARCHIVE','The backup is truncated.');return bytes;
  }
  const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function crcUpdate(value,bytes){for(let i=0;i<bytes.length;i++)value=crcTable[(value^bytes[i])&255]^(value>>>8);return value;}
  async function crcBlob(blob,options,event){
    let value=0xffffffff,at=0;
    do{const length=Math.min(CASE_ARCHIVE_LIMITS.readBytes,blob.size-at),bytes=await read(blob,at,length,options.signal);value=crcUpdate(value,bytes);at+=length;progress(options,{...event,sourceBytesRead:at,sourceBytes:blob.size});await pause();abort(options.signal);}while(at<blob.size);
    return(value^0xffffffff)>>>0;
  }
  function safeKeys(object,keys,label){if(!plain(object)||Object.keys(object).some(key=>!keys.includes(key)))fail('INVALID_MANIFEST','The backup '+label+' has unsupported fields.');}
  function checkedHeaders(input){if(!Array.isArray(input)||input.length>1000)fail('INVALID_MANIFEST','The backup has too many table column-name choices.');const names=new Set();return input.map(choice=>{safeKeys(choice,['tableName','headerRow'],'table column-name choice');if(!boundedName(choice.tableName)||!Number.isInteger(choice.headerRow)||choice.headerRow<1||choice.headerRow>50000||names.has(choice.tableName))fail('INVALID_MANIFEST','The backup table column-name choice is invalid or duplicated.');names.add(choice.tableName);return{tableName:choice.tableName,headerRow:choice.headerRow};});}
  function checkedSource(input){
    safeKeys(input,['id','name','hash','bytes','sourceVersion','parserVersion','path','headerRow','tableHeaders'],'source');
    if(typeof input.id!=='string'||!ID.test(input.id)||!sourceName(input.name)||!HASH.test(input.hash)||!Number.isSafeInteger(input.bytes)||input.bytes<0||input.bytes>CASE_ARCHIVE_LIMITS.sourceBytes||!positive(input.sourceVersion)||typeof input.parserVersion!=='string'||!input.parserVersion||input.parserVersion.length>160||/[\x00-\x1f\x7f]/.test(input.parserVersion)||input.path!=='documents/'+input.id+'.source'||input.headerRow!==undefined&&(!Number.isInteger(input.headerRow)||input.headerRow<1||input.headerRow>50000))fail('INVALID_MANIFEST','The backup source metadata is invalid.');
    const tableHeaders=input.tableHeaders===undefined?undefined:checkedHeaders(input.tableHeaders),matching=tableHeaders?.find(choice=>choice.tableName===input.name);if(matching&&input.headerRow!==undefined&&matching.headerRow!==input.headerRow)fail('INVALID_MANIFEST','The backup has conflicting column-name rows for the same table.');
    return{id:input.id,name:input.name,hash:input.hash,bytes:input.bytes,sourceVersion:input.sourceVersion,parserVersion:input.parserVersion,path:input.path,...(input.headerRow===undefined?{}:{headerRow:input.headerRow}),...(tableHeaders===undefined?{}:{tableHeaders})};
  }
  function checkedManifest(input){
    safeKeys(input,['schemaVersion','kind','caseId','caseName','caseRevision','sourceCount','originalBytes','sources'],'manifest');
    if(input.schemaVersion!==1||input.kind!==KIND||typeof input.caseId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(input.caseId)||!boundedName(input.caseName)||!positive(input.caseRevision)||!Number.isInteger(input.sourceCount)||input.sourceCount<0||input.sourceCount>CASE_ARCHIVE_LIMITS.sources||!Number.isSafeInteger(input.originalBytes)||input.originalBytes<0||input.originalBytes>CASE_ARCHIVE_LIMITS.originalBytes||!Array.isArray(input.sources)||input.sources.length!==input.sourceCount)fail('INVALID_MANIFEST','The backup manifest is invalid or exceeds the case budget.');
    const sources=input.sources.map(checkedSource),ids=new Set();let total=0;
    for(const source of sources){if(ids.has(source.id))fail('INVALID_MANIFEST','The backup contains duplicate source IDs.');ids.add(source.id);total+=source.bytes;}
    if(total!==input.originalBytes)fail('INVALID_MANIFEST','The backup original-byte total is inconsistent.');
    return{schemaVersion:1,kind:KIND,caseId:input.caseId,caseName:input.caseName,caseRevision:input.caseRevision,sourceCount:sources.length,originalBytes:total,sources};
  }
  function header(path,size,crc,offset){
    const name=encoder.encode(path),local=new Uint8Array(30+name.length),central=new Uint8Array(46+name.length),lv=view(local),cv=view(central);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,0x21,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);local.set(name,30);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
    return{local,central};
  }
  async function createCaseCollectionArchive(vault,caseId,options={}){
    const config=settings(options);if(!vault||!['getCase','listSources','getSource','getShard'].every(key=>typeof vault[key]==='function'))fail('INVALID_INPUT','A large-case vault is required for backup.');
    const before=await vault.getCase(caseId,{signal:config.signal});if(!before)fail('NOT_FOUND','The large case was not found.');
    const metadata=[];let afterId;
    while(true){abort(config.signal);const page=await vault.listSources(caseId,{afterId,limit:200,signal:config.signal});if(!Array.isArray(page)||page.length>200)fail('INVALID_INPUT','The source list is not a bounded metadata page.');
      for(const item of page){if(!item||typeof item.id!=='string'||afterId!==undefined&&item.id<=afterId)fail('INVALID_INPUT','The source-list cursor did not advance.');metadata.push(item);afterId=item.id;}
      if(metadata.length>CASE_ARCHIVE_LIMITS.sources)fail('SIZE_LIMIT','A case backup supports at most 2,000 sources.');if(page.length<200)break;
    }
    const originals=[],sources=[];let total=0;
    for(let index=0;index<metadata.length;index++){
      const meta=metadata[index],source=checkedSource({id:meta.id,name:meta.name,hash:meta.hash,bytes:meta.bytes,sourceVersion:meta.revision,parserVersion:meta.parserVersion,path:'documents/'+meta.id+'.source'});
      const verified=await vault.getSource(caseId,source.id,{includeBlob:true,signal:config.signal});abort(config.signal);
      if(!verified||verified.id!==source.id||verified.hash!==source.hash||verified.revision!==source.sourceVersion||verified.parserVersion!==source.parserVersion||verified.name!==source.name||verified.bytes!==source.bytes)fail('CONFLICT','A source changed while its backup was being prepared.');
      const blob=nativeBlob(verified.blob);if(blob.size!==source.bytes)fail('INTEGRITY','Verified original size does not match its metadata.');
      const summary=await vault.getShard(caseId,source.id,'records','summary',{signal:config.signal});
      if(summary){if(summary.verification!==AUTH||summary.sourceHash!==source.hash||summary.sourceRevision!==source.sourceVersion||summary.payload?.profile!==COLLECTION)fail('INTEGRITY','The source settings failed local authentication. Rebuild the source before backup.');
        if(summary.payload.headerRow!==undefined&&summary.payload.headerRow!==null){source.headerRow=summary.payload.headerRow;checkedSource(source);}
        if(summary.payload.tableHeaders!==undefined){source.tableHeaders=checkedHeaders(summary.payload.tableHeaders);checkedSource(source);}
      }
      total+=source.bytes;if(total>CASE_ARCHIVE_LIMITS.originalBytes)fail('SIZE_LIMIT','The case backup exceeds one GiB of original files.');
      const crc=await crcBlob(blob,config,{phase:'backup',sourceId:source.id,sourceIndex:index,sourceCount:metadata.length,totalBytes:before.originalBytes});
      originals.push({source,blob,crc});sources.push(source);
    }
    const manifest=checkedManifest({schemaVersion:1,kind:KIND,caseId:before.id,caseName:before.name,caseRevision:before.revision,sourceCount:before.sourceCount,originalBytes:before.originalBytes,sources});
    const manifestBytes=encoder.encode(JSON.stringify(manifest));if(manifestBytes.length>CASE_ARCHIVE_LIMITS.manifestBytes)fail('SIZE_LIMIT','The case manifest exceeds its metadata budget.');
    const parts=[],directory=[];let offset=0;
    const append=(path,blob,crc)=>{const headers=header(path,blob.size,crc,offset);parts.push(headers.local,blob);directory.push(headers.central);offset+=headers.local.length+blob.size;};
    append('manifest.json',new root.Blob([manifestBytes]),(crcUpdate(0xffffffff,manifestBytes)^0xffffffff)>>>0);
    for(const entry of originals)append(entry.source.path,entry.blob,entry.crc);
    const directorySize=directory.reduce((sum,part)=>sum+part.length,0);if(directorySize>CASE_ARCHIVE_LIMITS.directoryBytes)fail('SIZE_LIMIT','The backup directory exceeds its metadata budget.');
    const end=new Uint8Array(22),ev=view(end);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,directory.length,true);ev.setUint16(10,directory.length,true);ev.setUint32(12,directorySize,true);ev.setUint32(16,offset,true);
    const after=await vault.getCase(caseId,{signal:config.signal});if(!after||after.revision!==before.revision)fail('CONFLICT','The case changed while its backup was being prepared. Try again.');
    abort(config.signal);const output=new root.Blob([...parts,...directory,end],{type:'application/zip'});if(output.size>CASE_ARCHIVE_LIMITS.archiveBytes)fail('SIZE_LIMIT','The backup exceeds its file budget.');
    progress(config,{phase:'complete',sourceCount:sources.length,originalBytes:total,archiveBytes:output.size});return output;
  }
  async function parseCaseCollectionArchive(blob,options={}){
    const config=settings(options);nativeBlob(blob);if(blob.size<22||blob.size>CASE_ARCHIVE_LIMITS.archiveBytes)fail('SIZE_LIMIT','The backup is truncated or exceeds its file budget.');
    if(typeof root.File!=='function')fail('UNAVAILABLE','This browser needs native File support to open a case backup.');
    const end=await read(blob,blob.size-22,22,config.signal),ev=view(end);
    if(ev.getUint32(0,true)!==0x06054b50||ev.getUint16(20,true)!==0)fail('INVALID_ARCHIVE','The backup needs a complete ZIP end record without a comment.');
    const count=ev.getUint16(10,true),directorySize=ev.getUint32(12,true),directoryOffset=ev.getUint32(16,true);
    if(ev.getUint16(4,true)||ev.getUint16(6,true)||ev.getUint16(8,true)!==count||count<1||count>CASE_ARCHIVE_LIMITS.sources+1||directorySize>CASE_ARCHIVE_LIMITS.directoryBytes||directoryOffset+directorySize!==blob.size-22||directoryOffset<30)fail('INVALID_ARCHIVE','Multi-disk, ZIP64 or oversized backup directories are unsupported.');
    const directory=await read(blob,directoryOffset,directorySize,config.signal),dv=view(directory),entries=[],paths=new Set();let at=0,total=0;
    for(let index=0;index<count;index++){
      abort(config.signal);if(at+46>directory.length||dv.getUint32(at,true)!==0x02014b50)fail('INVALID_ARCHIVE','The backup central directory is truncated.');
      const needed=dv.getUint16(at+6,true),flags=dv.getUint16(at+8,true),method=dv.getUint16(at+10,true),crc=dv.getUint32(at+16,true),compressed=dv.getUint32(at+20,true),size=dv.getUint32(at+24,true),nameLength=dv.getUint16(at+28,true),extraLength=dv.getUint16(at+30,true),commentLength=dv.getUint16(at+32,true),start=dv.getUint32(at+42,true),stop=at+46+nameLength+extraLength+commentLength;
      if(needed<10||needed>20||![0,0x800].includes(flags)||method!==0||compressed!==size||size===0xffffffff||start===0xffffffff||dv.getUint16(at+34,true)||extraLength||commentLength||!nameLength||nameLength>255||stop>directory.length)fail('INVALID_ARCHIVE','Only bounded, unencrypted stored ZIP entries are supported.');
      let path;try{path=decoder.decode(directory.subarray(at+46,at+46+nameLength));}catch(_){fail('INVALID_ARCHIVE','A backup path is not valid UTF-8.');}
      if(path!=='manifest.json'&&!/^documents\/[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.source$/.test(path)||paths.has(path))fail('INVALID_ARCHIVE','Unsafe, duplicate or unsupported backup paths are forbidden.');paths.add(path);
      if(path==='manifest.json'){if(size>CASE_ARCHIVE_LIMITS.manifestBytes)fail('SIZE_LIMIT','The backup manifest exceeds its metadata budget.');}
      else{if(size>CASE_ARCHIVE_LIMITS.sourceBytes)fail('SIZE_LIMIT','A backup source exceeds 64 MiB.');total+=size;if(total>CASE_ARCHIVE_LIMITS.originalBytes)fail('SIZE_LIMIT','The backup originals exceed one GiB.');}
      if(start+30+nameLength+size>directoryOffset)fail('INVALID_ARCHIVE','A backup entry crosses the central directory.');
      const local=await read(blob,start,30+nameLength,config.signal),lv=view(local);
      if(lv.getUint32(0,true)!==0x04034b50||lv.getUint16(4,true)!==needed||lv.getUint16(6,true)!==flags||lv.getUint16(8,true)!==method||lv.getUint16(10,true)!==dv.getUint16(at+12,true)||lv.getUint16(12,true)!==dv.getUint16(at+14,true)||lv.getUint32(14,true)!==crc||lv.getUint32(18,true)!==size||lv.getUint32(22,true)!==size||lv.getUint16(26,true)!==nameLength||lv.getUint16(28,true)!==0||local.subarray(30).some((byte,i)=>byte!==directory[at+46+i]))fail('INVALID_ARCHIVE','A backup local header, CRC, size or path differs from its directory.');
      entries.push({path,start,dataStart:start+local.length,size,crc});at=stop;
    }
    if(at!==directory.length||!paths.has('manifest.json'))fail('INVALID_ARCHIVE','The backup directory length or manifest is invalid.');
    const ordered=[...entries].sort((a,b)=>a.start-b.start);let next=0;
    for(const entry of ordered){if(entry.start!==next)fail('INVALID_ARCHIVE','Overlapping, prefixed, hidden or padded backup entries are forbidden.');next=entry.dataStart+entry.size;}
    if(next!==directoryOffset)fail('INVALID_ARCHIVE','Unlisted entry data before the backup directory is forbidden.');
    const manifestEntry=entries.find(entry=>entry.path==='manifest.json'),manifestBytes=await read(blob,manifestEntry.dataStart,manifestEntry.size,config.signal);
    if(((crcUpdate(0xffffffff,manifestBytes)^0xffffffff)>>>0)!==manifestEntry.crc)fail('INTEGRITY','The backup manifest CRC check failed.');
    let manifest;try{manifest=JSON.parse(decoder.decode(manifestBytes));}catch(_){fail('INVALID_MANIFEST','The backup manifest is not valid UTF-8 JSON.');}manifest=checkedManifest(manifest);
    if(manifest.sourceCount+1!==entries.length||manifest.originalBytes!==total)fail('INVALID_MANIFEST','The backup has unlisted or missing source entries.');
    const byPath=new Map(entries.map(entry=>[entry.path,entry])),restored=[];
    for(let index=0;index<manifest.sources.length;index++){
      const source=manifest.sources[index],entry=byPath.get(source.path);if(!entry||entry.size!==source.bytes)fail('INVALID_MANIFEST','A backup source size or path differs from its manifest.');
      const original=slice(blob,entry.dataStart,entry.dataStart+entry.size),crc=await crcBlob(original,config,{phase:'verify-backup',sourceId:source.id,sourceIndex:index,sourceCount:manifest.sources.length,totalBytes:total});
      if(crc!==entry.crc)fail('INTEGRITY','A backup source CRC check failed.');
      const {path:unused,...metadata}=source;restored.push({file:new root.File([original],source.name,{type:'application/octet-stream',lastModified:0}),source:metadata});
    }
    progress(config,{phase:'complete',sourceCount:restored.length,originalBytes:total,archiveBytes:blob.size});return{manifest,entries:restored};
  }
  return{createCaseCollectionArchive,parseCaseCollectionArchive,CaseArchiveError,CASE_ARCHIVE_LIMITS};
});
