(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_LIMITS=Object.freeze({bytes:5242880,maxInputBytes:64*1024*1024,pages:200,documentPages:10000,records:50000,characters:2000000,pageItems:10000,workerBytes:8*1024*1024,timeout:15000});
const PDF_NATIVE_WORKER_SHA256='9cada584705d8fa458f14889acb681300fad6a9a48cc63e29976afdfbbeb922e';
const reasons=new Set(['outside-selected-range','dense-page-item-limit','page-character-budget','window-character-budget','window-record-budget']);
const array=(value,length)=>Array.isArray(value)&&value.length===length&&value.every(Number.isFinite);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function requestOptions(options){
 if(!plain(options))throw Error('Invalid PDF extraction options.');
 const maxInputBytes=options.maxInputBytes??PDF_LIMITS.bytes,timeoutMs=options.timeoutMs??PDF_LIMITS.timeout;
 if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<PDF_LIMITS.bytes||maxInputBytes>PDF_LIMITS.maxInputBytes)throw Error('PDF input budget must be between 5 and 64 MiB.');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>PDF_LIMITS.timeout)throw Error('PDF timeout must be between 1 and 15,000 milliseconds.');
 if(options.allowPartial!==undefined&&typeof options.allowPartial!=='boolean')throw Error('PDF partial extraction choice must be explicit.');
 let pages;
 if(options.pages!==undefined){const p=options.pages;if(!plain(p)||Object.keys(p).some(k=>!['start','end'].includes(k))||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<1||p.end<p.start||p.end>PDF_LIMITS.documentPages||p.end-p.start+1>PDF_LIMITS.pages)throw Error('Select a native PDF window of at most 200 pages within pages 1–10,000.');pages={start:p.start,end:p.end};}
 const signal=options.signal;if(signal&&(!plain(signal)||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw Error('Invalid PDF cancellation signal.');
 return{maxInputBytes,timeoutMs,pages,allowPartial:options.allowPartial===true};
}
function validateResult(result,config){
 if(!plain(result)||result.format!=='pdf'||!Array.isArray(result.records)||result.records.length>PDF_LIMITS.records||!Array.isArray(result.warnings)||result.warnings.length>256)throw Error('PDF worker returned invalid output.');
 if(result.warnings.some(w=>typeof w!=='string'||w.length>16384)||result.warnings.reduce((n,w)=>n+w.length,0)>65536)throw Error('PDF worker returned invalid warnings.');
 const c=result.extractionCoverage,rows=result.pageCoverage;
 if(!plain(c)||c.schemaVersion!==1||c.kind!=='native-text'||!Number.isInteger(c.totalPages)||c.totalPages<1||c.totalPages>PDF_LIMITS.documentPages||typeof c.complete!=='boolean'||!Array.isArray(c.skippedPages)||!Array.isArray(rows)||rows.length!==c.totalPages)throw Error('PDF worker returned invalid page coverage.');
 const start=config.pages?.start??1,end=Math.min(config.pages?.end??c.totalPages,c.totalPages);
 if(start>c.totalPages||(!config.pages&&c.totalPages>PDF_LIMITS.pages)||(!config.allowPartial&&(start!==1||end!==c.totalPages))||!plain(c.selectedRange)||c.selectedRange.start!==start||c.selectedRange.end!==end)throw Error('PDF worker returned a different page window.');
 const version='pdfjs-6.4.299-adapter-2'+(config.pages?`:pages-${start}-${end}`:'');if(result.parserVersion!==version)throw Error('PDF worker returned an unsupported parser identity.');
 const counts=Array(c.totalPages).fill(0),characters=Array(c.totalPages).fill(0),skipped=[];
 for(let index=0;index<rows.length;index++){
  const p=rows[index];if(!plain(p)||p.page!==index+1||!['extracted','none','skipped'].includes(p.nativeText)||p.nativeTextOrigin!=='native-or-external-OCR-unknown'||!Number.isInteger(p.nativeRecords)||p.nativeRecords<0||p.nativeRecords>PDF_LIMITS.pageItems||!Number.isInteger(p.nativeCharacters)||p.nativeCharacters<0||p.nativeCharacters>PDF_LIMITS.characters)throw Error('PDF worker returned invalid per-page counts.');
  const outside=p.page<start||p.page>end;
  if(p.nativeText==='skipped'){if(!reasons.has(p.reason)||p.nativeRecords!==0||p.nativeCharacters!==0||outside!==(p.reason==='outside-selected-range'))throw Error('PDF worker returned invalid skipped-page coverage.');skipped.push({page:p.page,reason:p.reason});}
  else if(outside||p.reason!==undefined||(p.nativeText==='none'&&(p.nativeRecords||p.nativeCharacters))||(p.nativeText==='extracted'&&(!p.nativeRecords||!p.nativeCharacters)))throw Error('PDF worker returned inconsistent native-page coverage.');
 }
 if(c.complete!==(skipped.length===0)||c.skippedPages.length!==skipped.length||c.skippedPages.some((p,i)=>!plain(p)||p.page!==skipped[i].page||p.reason!==skipped[i].reason))throw Error('PDF worker returned inconsistent extraction coverage.');
 const ids=new Set();let total=0;const records=[];
 for(const record of result.records){
  const l=record?.locator;if(!plain(record)||typeof record.text!=='string'||!record.text.trim()||!plain(l)||l.type!=='pdf-text-item'||!Number.isInteger(l.page)||l.page<start||l.page>end||rows[l.page-1].nativeText!=='extracted'||!Number.isInteger(l.item)||l.item<1||l.item>PDF_LIMITS.pageItems||!array(l.transform,6)||!Number.isFinite(l.width)||!Number.isFinite(l.height)||!array(l.pageView,4)||!Number.isFinite(l.pageRotation)||!array(l.advanceBox,4)||l.advanceBox[0]>l.advanceBox[2]||l.advanceBox[1]>l.advanceBox[3]||l.coordinateSystem!=='PDF user space'||l.regionPrecision!=='approximate text advance box; not glyph bounds'||record.textLayer?.origin!=='native-or-external-OCR-unknown'||record.textLayer?.verification!=='unverified-source-text-layer')throw Error('PDF worker returned an invalid source record or locator.');
  const id=l.page+':'+l.item;if(ids.has(id))throw Error('PDF worker returned a duplicate text item.');ids.add(id);counts[l.page-1]++;characters[l.page-1]+=record.text.length;total+=record.text.length;if(total>PDF_LIMITS.characters)throw Error('PDF worker output exceeds its text budget.');
  records.push({text:record.text,locator:{type:l.type,page:l.page,item:l.item,transform:l.transform.slice(),width:l.width,height:l.height,pageView:l.pageView.slice(),pageRotation:l.pageRotation,coordinateSystem:l.coordinateSystem,advanceBox:l.advanceBox.slice(),regionPrecision:l.regionPrecision},textLayer:{origin:'native-or-external-OCR-unknown',verification:'unverified-source-text-layer'}});
 }
 for(let i=0;i<rows.length;i++)if(counts[i]!==rows[i].nativeRecords||characters[i]!==rows[i].nativeCharacters)throw Error('PDF worker page counts do not match its returned source text.');
 return{format:'pdf',parserVersion:version,records,warnings:result.warnings.slice(),pageCoverage:rows.map(p=>({page:p.page,nativeText:p.nativeText,nativeRecords:p.nativeRecords,nativeCharacters:p.nativeCharacters,nativeTextOrigin:p.nativeTextOrigin,...(p.reason?{reason:p.reason}:{})})),extractionCoverage:{schemaVersion:1,kind:'native-text',totalPages:c.totalPages,complete:c.complete,skippedPages:skipped,selectedRange:{start,end}}};
}
// Dedicated classic Blob worker only. No synchronous/main-thread fallback.
async function parsePdfBytes(bytes,options={}){
 const config=requestOptions(options),started=Date.now();
 if(!(bytes instanceof Uint8Array)||bytes.length>config.maxInputBytes)throw Error(options.maxInputBytes===undefined?'PDF exceeds the 5 MB byte limit or has invalid bytes.':'PDF exceeds its configured input byte budget or has invalid bytes.');
 if(new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error('Invalid PDF header.');
 const source=root.PBGCRag?.pdfWorkerSource,manifest=root.PBGCRag?.pdfWorkerManifest;
 if(typeof source!=='string'||!source)throw Error('Local PDF parser assets are unavailable.');
 if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function')throw Error('PDF parsing is unavailable because isolated workers are blocked or unsupported.');
 if(options.signal?.aborted)throw Error('PDF extraction cancelled.');
 if(!plain(manifest)||manifest.schemaVersion!==1||manifest.kind!=='pdf-native-parser-worker'||!Number.isInteger(manifest.worker?.bytes)||manifest.worker.bytes<1||manifest.worker.bytes>PDF_LIMITS.workerBytes||manifest.worker.sha256!==PDF_NATIVE_WORKER_SHA256||source.length>PDF_LIMITS.workerBytes)throw Error('Local PDF worker integrity metadata is unavailable or invalid.');
 if(typeof root.crypto?.subtle?.digest!=='function')throw Error('Local SHA-256 is required to verify the PDF worker.');
 const expectedHash=manifest.worker.sha256,expectedBytes=manifest.worker.bytes,encoded=new TextEncoder().encode(source);if(encoded.length!==expectedBytes)throw Error('Local PDF worker failed its byte-length integrity check.');
 const digest=await root.crypto.subtle.digest('SHA-256',encoded),sha=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(sha!==expectedHash)throw Error('Local PDF worker failed its SHA-256 integrity check.');
 if(options.signal?.aborted)throw Error('PDF extraction cancelled.');
 const timeout=config.timeoutMs-(Date.now()-started);if(timeout<1)throw Error('PDF extraction exceeded its hard time limit before worker startup.');
 return new Promise((resolve,reject)=>{
  let worker,url,timer,settled=false;
  const abort=()=>finish(Error('PDF extraction cancelled.'));
  function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(worker)worker.terminate();if(url)root.URL.revokeObjectURL(url);if(error)reject(error);else resolve(result);}
  try{
   url=root.URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new root.Worker(url,{name:'pbgc-pdf-parser'});
   worker.onmessage=event=>{if(event.data?.ok!==true){finish(Error(event.data?.error||'PDF worker returned invalid output.'));return;}try{finish(null,validateResult(event.data.result,config));}catch(error){finish(error);}};
   worker.onerror=event=>{event.preventDefault();finish(Error('Isolated PDF worker failed or was blocked by browser policy.'));};
   worker.onmessageerror=()=>finish(Error('PDF worker returned unreadable output.'));
   options.signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('PDF extraction exceeded its hard time limit. The isolated worker was terminated.')),timeout);
   const copied=bytes.slice();worker.postMessage({bytes:copied.buffer,options:{...config,timeoutMs:timeout}},[copied.buffer]);
  }catch(error){finish(Error('Isolated PDF parsing is unavailable: '+String(error.message||error)));}
 });
}
// Revalidate a fresh controller-held window before another bounded operation uses it.
// This validates data; it does not authorize imported JSON as a source document.
function validatePdfExtraction(result,options={}){return validateResult(result,requestOptions(options));}
return{parsePdfBytes,validatePdfExtraction,PDF_LIMITS};
});
