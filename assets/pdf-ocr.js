/* Opt-in, bounded PDF raster OCR. Original PDF bytes and native text stay separate. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_OCR_LIMITS=Object.freeze({bytes:5242880,largeBytes:64*1024*1024,documentPages:200,largeDocumentPages:10000,ocrPages:20,pixels:8000000,edge:4096,renderTimeoutMs:15000,totalTimeoutMs:180000,records:50000,characters:2000000,lowConfidence:30});
const PDF_OCR_RENDER_SHA256='53c60d08063ddccea881b88a06b776fc3df779ea560fa66c3433ac53970e71a5';
let sourcePromise,verifiedRenderSource;
const abortError=()=>{const error=Error('PDF OCR cancelled. No new source was accepted.');error.name='AbortError';return error;};
function byteBudget(options={}){const value=options.maxInputBytes??PDF_OCR_LIMITS.bytes;if(!Number.isSafeInteger(value)||value<1||value>PDF_OCR_LIMITS.largeBytes)throw Error('PDF OCR input budget must be from 1 byte to 64 MB.');return value;}
function pageBudget(options={}){const value=options.maxDocumentPages??PDF_OCR_LIMITS.documentPages;if(!Number.isInteger(value)||value<1||value>PDF_OCR_LIMITS.largeDocumentPages)throw Error('PDF OCR document page budget must be from 1 to 10,000 pages.');return value;}
function checkBytes(bytes,options={}){const maximum=byteBudget(options);if(!(bytes instanceof Uint8Array)||bytes.length>maximum||new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error(maximum===PDF_OCR_LIMITS.bytes?'PDF OCR needs a valid PDF no larger than 5 MB.':'PDF OCR needs valid PDF bytes within its configured input budget.');}
function checkAbort(signal){if(signal?.aborted)throw abortError();}
function waitForAsset(promise,signal,timeout){return new Promise((resolve,reject)=>{let settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);},abort=()=>finish(abortError());if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('PDF OCR local asset loading reached its hard time limit.')),timeout);promise.then(value=>finish(null,value),error=>finish(error));});}
async function verifiedSource(source,signal,timeout){
 checkAbort(signal);if(source===verifiedRenderSource)return source;
 if(typeof source!=='string'||!source.length||source.length>16*1024*1024||typeof root.crypto?.subtle?.digest!=='function')throw Error('Local PDF OCR worker integrity verification is unavailable.');
 const digest=await waitForAsset(root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)),signal,timeout);checkAbort(signal);
 if(Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')!==PDF_OCR_RENDER_SHA256)throw Error('Local PDF OCR worker integrity check failed.');
 verifiedRenderSource=source;return source;
}
async function renderSource(signal,timeout){
 checkAbort(signal);const started=Date.now();
 if(typeof root.PBGCRag?.pdfOcrRenderWorkerSource==='string')return verifiedSource(root.PBGCRag.pdfOcrRenderWorkerSource,signal,timeout);
 if(!root.document)throw Error('Local PDF OCR rendering assets are unavailable.');
 if(!sourcePromise)sourcePromise=new Promise((resolve,reject)=>{const script=root.document.createElement('script');script.src='vendor/pdfjs/ocr-render-worker-source.js';script.onload=()=>{if(typeof root.PBGCRag?.pdfOcrRenderWorkerSource==='string')resolve(root.PBGCRag.pdfOcrRenderWorkerSource);else{sourcePromise=null;reject(Error('Local PDF OCR rendering pack is invalid.'));}};script.onerror=()=>{sourcePromise=null;script.remove();reject(Error('The bundled PDF OCR rendering pack could not load.'));};root.document.head.append(script);});
 const source=await waitForAsset(sourcePromise,signal,timeout),remaining=timeout-(Date.now()-started);checkAbort(signal);if(remaining<=0)throw Error('PDF OCR local asset loading reached its hard time limit.');return verifiedSource(source,signal,remaining);
}
async function workerRequest(bytes,request,options={}){checkBytes(bytes,options);pageBudget(options);checkAbort(options.signal);const timeout=options.timeoutMs??PDF_OCR_LIMITS.renderTimeoutMs;if(!Number.isInteger(timeout)||timeout<1||timeout>PDF_OCR_LIMITS.renderTimeoutMs)throw Error('PDF OCR render timeout must be 1–15000 milliseconds.');if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function')throw Error('PDF OCR needs isolated Blob workers.');const started=Date.now(),source=await renderSource(options.signal,timeout);checkAbort(options.signal);const remaining=timeout-(Date.now()-started);if(remaining<=0)throw Error('PDF OCR rendering reached its hard time limit.');return new Promise((resolve,reject)=>{let worker,url,timer,settled=false;const abort=()=>finish(abortError());function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(worker)worker.terminate();if(url)root.URL.revokeObjectURL(url);if(error)reject(error);else resolve(result);}try{url=root.URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new root.Worker(url,{name:'pbgc-pdf-ocr-raster'});worker.onmessage=event=>event.data?.ok===true?finish(null,event.data.result):finish(Error(event.data?.error||'PDF OCR render worker returned invalid output.'));worker.onerror=event=>{event.preventDefault();finish(Error('PDF OCR rendering worker failed or was blocked.'));};worker.onmessageerror=()=>finish(Error('PDF OCR worker output was unreadable.'));options.signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('PDF OCR rendering reached its hard time limit; worker terminated.')),remaining);const copied=bytes.slice();worker.postMessage({...request,maxInputBytes:byteBudget(options),maxDocumentPages:pageBudget(options),bytes:copied.buffer},[copied.buffer]);}catch(error){finish(error);}});}
async function inspectPdfPages(bytes,options={}){const result=await workerRequest(bytes,{action:'inspect'},options);if(!Number.isInteger(result?.pages)||result.pages<1||result.pages>pageBudget(options))throw Error('PDF OCR inspection returned invalid page count.');return result;}
async function renderPdfPage(bytes,pageNumber,options={}){if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pageBudget(options))throw Error('PDF OCR page number is invalid.');const scale=options.scale??150/72,maxPixels=options.maxPixels??PDF_OCR_LIMITS.pixels;if(typeof scale!=='number'||!Number.isFinite(scale)||scale<0.25||scale>4||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>PDF_OCR_LIMITS.pixels)throw Error('PDF OCR scale or pixel budget is invalid.');const result=await workerRequest(bytes,{action:'render',pageNumber,scale,maxPixels},options);if(!Number.isInteger(result?.width)||!Number.isInteger(result.height)||result.width<1||result.height<1||result.width>PDF_OCR_LIMITS.edge||result.height>PDF_OCR_LIMITS.edge||result.width*result.height>maxPixels||!(result.data instanceof Uint8ClampedArray)||result.data.length!==result.width*result.height*4||!Array.isArray(result.pageView)||result.pageView.length!==4||!result.pageView.every(Number.isFinite)||!Array.isArray(result.transform)||result.transform.length!==6||!result.transform.every(Number.isFinite)||!Number.isFinite(result.rotation))throw Error('PDF OCR rendering returned invalid raster or geometry.');return result;}
function integerBox(value,width,height){if(!value||!['x','y','width','height'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])))throw Error('OCR line has invalid image geometry.');const left=Math.max(0,Math.floor(value.x)),top=Math.max(0,Math.floor(value.y)),right=Math.min(width,Math.ceil(value.x+value.width)),bottom=Math.min(height,Math.ceil(value.y+value.height));if(left>=right||top>=bottom||left>=width||top>=height)throw Error('OCR line lies outside its rendered page.');return{x:left,y:top,width:right-left,height:bottom-top};}
function selectedRange(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['start','end'].includes(key))||!Number.isInteger(value.start)||!Number.isInteger(value.end)||value.start<1||value.end<value.start||value.end>PDF_OCR_LIMITS.largeDocumentPages||value.end-value.start+1>PDF_OCR_LIMITS.documentPages)throw Error('Bounded OCR needs a native page window of at most 200 pages within pages 1–10,000.');return Object.freeze({start:value.start,end:value.end});}
function validatePdfOcrProfile(value){
 const plain=value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const engineId=root.PBGCRag?.OCR_ENGINE?.id;
 if(!plain||typeof engineId!=='string'||value.engineId!==engineId)throw Error('Unsupported or changed OCR processing profile. Keep the original package and engine version.');
 if(value.schemaVersion===1&&value.pdfOcr==='missing-text'&&Object.keys(value).every(key=>['schemaVersion','pdfOcr','engineId'].includes(key)))return Object.freeze({schemaVersion:1,pdfOcr:'missing-text',engineId});
 if(value.schemaVersion===3&&value.pdfOcr==='bounded-missing-text'&&Object.keys(value).every(key=>['schemaVersion','pdfOcr','engineId','maxPages','selectedRange'].includes(key))&&Number.isInteger(value.maxPages)&&value.maxPages>=1&&value.maxPages<=PDF_OCR_LIMITS.ocrPages)return Object.freeze({schemaVersion:3,pdfOcr:'bounded-missing-text',engineId,maxPages:value.maxPages,...(value.selectedRange!==undefined?{selectedRange:selectedRange(value.selectedRange)}:{})});
 if(value.schemaVersion!==2||value.pdfOcr!=='selected-pages'||!['native','missing-text'].includes(value.base)||Object.keys(value).some(key=>!['schemaVersion','pdfOcr','engineId','base','pages'].includes(key))||!Array.isArray(value.pages)||value.pages.length<1||value.pages.length>PDF_OCR_LIMITS.ocrPages)throw Error('Unsupported or changed OCR processing profile. Keep the original package and engine version.');
 const pages=[],seen=new Set();
 for(let index=0;index<value.pages.length;index++){const page=value.pages[index];if(!Object.hasOwn(value.pages,index)||!Number.isInteger(page)||page<1||page>PDF_OCR_LIMITS.documentPages||seen.has(page))throw Error('Selected PDF pages must be distinct whole page numbers from 1 to 200.');seen.add(page);pages.push(page);}
 return Object.freeze({schemaVersion:2,pdfOcr:'selected-pages',engineId,base:value.base,pages:Object.freeze(pages)});
}
function normalizedNativeText(text){return text.normalize('NFC').trim().replace(/\s+/gu,' ');}
function projectedNativeRegions(nativeRecords,page,raster){
 const byText=new Map(),transform=raster.transform;
 for(const record of nativeRecords){
  const box=record.locator?.advanceBox;
  if(record.locator?.type!=='pdf-text-item'||record.locator.page!==page||typeof record.text!=='string'||!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1])continue;
  const points=[[box[0],box[1]],[box[2],box[1]],[box[0],box[3]],[box[2],box[3]]].map(([x,y])=>[transform[0]*x+transform[2]*y+transform[4],transform[1]*x+transform[3]*y+transform[5]]);
  const x=Math.max(0,Math.min(...points.map(point=>point[0]))),y=Math.max(0,Math.min(...points.map(point=>point[1]))),right=Math.min(raster.width,Math.max(...points.map(point=>point[0]))),bottom=Math.min(raster.height,Math.max(...points.map(point=>point[1])));
  if(!(right>x&&bottom>y))continue;
  const text=normalizedNativeText(record.text);if(!text)continue;
  const regions=byText.get(text)||[];regions.push({x,y,width:right-x,height:bottom-y});byText.set(text,regions);
 }
 return byText;
}
function duplicatesNativeText(line,bbox,regions){
 const candidates=regions.get(normalizedNativeText(line.text));if(!candidates)return false;
 for(const native of candidates){const width=Math.max(0,Math.min(native.x+native.width,bbox.x+bbox.width)-Math.max(native.x,bbox.x)),height=Math.max(0,Math.min(native.y+native.height,bbox.y+bbox.height)-Math.max(native.y,bbox.y));const denominator=Math.min(native.width*native.height,bbox.width*bbox.height);if(denominator>0&&width*height/denominator>=.6)return true;}
 return false;
}
async function parsePdfWithOcr(bytes,options={}){
 checkBytes(bytes,options);checkAbort(options.signal);
 const mode=options.mode??'missing-text';
 if(!['missing-text','selected-pages','bounded-missing-text'].includes(mode))throw Error('Only missing-text, selected-pages or bounded-missing-text PDF OCR is supported.');
 if(mode!=='selected-pages'&&options.pages!==undefined)throw Error('Explicit PDF OCR page subsets need selected-pages mode; missing-text processes pages with no native text.');
 if(mode!=='selected-pages'&&options.base!==undefined)throw Error('The missing-text OCR profile does not accept a base override.');
 if(mode!=='bounded-missing-text'&&(options.nativeExtraction!==undefined||options.selectedRange!==undefined||options.maxPages!==undefined))throw Error('Native extraction windows and bounded page budgets require the v3 bounded-missing-text profile.');
 if(typeof root.PBGCRag?.parsePdfBytes!=='function'||typeof root.PBGCRag?.recognizeImage!=='function'||typeof root.PBGCRag?.OCR_ENGINE?.id!=='string')throw Error('Bundled PDF and OCR adapters are unavailable.');
 if(options.onProgress!==undefined&&typeof options.onProgress!=='function')throw Error('Invalid PDF OCR progress callback.');
 const range=options.selectedRange!==undefined?selectedRange(options.selectedRange):options.nativeExtraction!==undefined?selectedRange(options.nativeExtraction?.extractionCoverage?.selectedRange):undefined;
 const engineId=root.PBGCRag.OCR_ENGINE.id,profile=validatePdfOcrProfile(mode==='missing-text'?{schemaVersion:1,pdfOcr:mode,engineId}:mode==='bounded-missing-text'?{schemaVersion:3,pdfOcr:mode,engineId,maxPages:options.maxPages??PDF_OCR_LIMITS.ocrPages,...(range?{selectedRange:range}:{})}:{schemaVersion:2,pdfOcr:mode,engineId,base:options.base??'native',pages:options.pages});
 const totalTimeout=options.timeoutMs??PDF_OCR_LIMITS.totalTimeoutMs;
 if(!Number.isInteger(totalTimeout)||totalTimeout<1||totalTimeout>PDF_OCR_LIMITS.totalTimeoutMs)throw Error('PDF OCR total timeout must be 1–180000 milliseconds.');
 const controller=new AbortController(),onAbort=()=>controller.abort();options.signal?.addEventListener('abort',onAbort,{once:true});let expired=false;
 const timer=setTimeout(()=>{expired=true;controller.abort();},totalTimeout),signal=controller.signal,started=Date.now();
 const remaining=()=>{const value=totalTimeout-(Date.now()-started);if(value<=0){expired=true;controller.abort();throw Error('PDF OCR exceeded its total time budget.');}return value;};
 try{
  const budgets={maxInputBytes:byteBudget(options),maxDocumentPages:pageBudget(options)};
  const nativeOptions={signal,timeoutMs:Math.min(15000,remaining()),maxInputBytes:budgets.maxInputBytes,...(range?{pages:range,allowPartial:true}:{})};
  // nativeExtraction is a runtime controller handoff, never a persisted processing-profile field.
  let native;if(options.nativeExtraction!==undefined){if(typeof root.PBGCRag.validatePdfExtraction!=='function')throw Error('Native PDF window validation is unavailable.');native=root.PBGCRag.validatePdfExtraction(options.nativeExtraction,nativeOptions);}else native=await root.PBGCRag.parsePdfBytes(bytes,nativeOptions);checkAbort(signal);
  const info=await inspectPdfPages(bytes,{...budgets,signal,timeoutMs:Math.min(15000,remaining())}),nativePages=new Set(native.records.map(record=>record.locator?.page));
  if(native.extractionCoverage?.totalPages!==undefined&&native.extractionCoverage.totalPages!==info.pages)throw Error('Native PDF page coverage does not match this source.');
  const windowStart=range?.start??1,windowEnd=Math.min(range?.end??info.pages,info.pages),missing=Array.from({length:windowEnd-windowStart+1},(_,index)=>index+windowStart).filter(page=>!nativePages.has(page));
  const base=mode==='bounded-missing-text'?missing.slice(0,profile.maxPages):mode==='missing-text'||profile.base==='missing-text'?missing:[],selected=mode==='selected-pages'?profile.pages:[],boundedSkipped=mode==='bounded-missing-text'?missing.slice(profile.maxPages):[];
  if(selected.some(page=>page>info.pages))throw Error('A selected OCR page is outside this PDF.');
  if(selected.some(page=>base.includes(page)))throw Error('A selected OCR page already belongs to the automatic missing-text base.');
  if(base.length+selected.length>PDF_OCR_LIMITS.ocrPages)throw Error('PDF OCR is limited to 20 pages per source. No partial OCR source was imported.');
  const records=native.records.slice(),attemptedPages=new Set();let characters=records.reduce((sum,record)=>sum+record.text.length,0),recognized=0,suppressed=0,lowConfidenceLines=0;
  async function recognizePage(page,deduplicate){
   checkAbort(signal);remaining();options.onProgress?.({phase:'render',page,pages:info.pages,completed:recognized,total:base.length+selected.length});
   const raster=await renderPdfPage(bytes,page,{...budgets,signal,timeoutMs:Math.min(15000,remaining())});
   options.onProgress?.({phase:'recognize',page,pages:info.pages,completed:recognized,total:base.length+selected.length});
   const result=await root.PBGCRag.recognizeImage({width:raster.width,height:raster.height,data:raster.data},{signal,timeoutMs:Math.min(60000,remaining()),onProgress:progress=>options.onProgress?.({...progress,phase:'recognize',page,pages:info.pages,completed:recognized,total:base.length+selected.length})});
   checkAbort(signal);remaining();
   if(result?.engine?.id!==engineId||!Array.isArray(result.lines))throw Error('PDF OCR engine identity or line output is invalid.');
   const nativeRegions=deduplicate?projectedNativeRegions(native.records,page,raster):null;
   for(let index=0;index<result.lines.length;index++){
    checkAbort(signal);remaining();const line=result.lines[index];if(typeof line.text!=='string'||!line.text.trim())continue;
    if(!Number.isFinite(line.confidence)||line.confidence<0||line.confidence>100)throw Error('OCR line confidence is invalid.');
    const bbox=integerBox(line.bbox,raster.width,raster.height);
    if(nativeRegions&&duplicatesNativeText(line,bbox,nativeRegions)){suppressed++;continue;}
    characters+=line.text.length;if(characters>PDF_OCR_LIMITS.characters||records.length>=PDF_OCR_LIMITS.records)throw Error('PDF OCR text exceeds the source extraction budget.');
    const lowConfidence=line.confidence<PDF_OCR_LIMITS.lowConfidence;if(lowConfidence)lowConfidenceLines++;
    records.push({text:line.text,locator:{type:'pdf-ocr-line',page,line:index+1,bbox,imageWidth:raster.width,imageHeight:raster.height,pageView:raster.pageView.slice(),pageRotation:raster.rotation,renderTransform:raster.transform.slice(),coordinateSystem:'rendered page pixels',regionPrecision:'machine-estimated OCR line region; not native PDF text or glyph bounds'},ocr:{engineId,confidence:line.confidence,verification:'unverified-machine-text',...(lowConfidence?{lowConfidence:true}:{})}});
   }
   attemptedPages.add(page);recognized++;options.onProgress?.({phase:'complete-page',page,pages:info.pages,completed:recognized,total:base.length+selected.length});
  }
  for(const page of base)await recognizePage(page,false);
  // Legacy ordering is intentionally preserved as the complete immutable prefix.
  if(mode==='missing-text'||mode==='bounded-missing-text'||profile.base==='missing-text')records.sort((a,b)=>a.locator.page-b.locator.page);
  for(const page of selected)await recognizePage(page,true);
  const warnings=(native.warnings||[]).filter(warning=>!/^PDF text extraction only\./.test(warning)&&!/^\d+ pages have no extracted text\. No OCR was performed\.$/.test(warning));
  warnings.push('PDF text item order is parser order, not a guaranteed reading order.','Machine OCR text and line regions are estimates. Verify every OCR value, especially numbers, dates and negation, against the original page image.');
  if(mode!=='selected-pages'){
   if(base.length)warnings.push(`OCR attempted ${base.length} pages with no native text. Empty recognition does not prove a blank page.`);
   else warnings.push(range?'All pages in the selected window have native text. Image content on those pages was not OCR-processed.':'All pages have native text. Image content on those pages was not OCR-processed.');
   if(boundedSkipped.length)warnings.push(`OCR page budget reached. Pages not OCR-processed: ${boundedSkipped.join(', ')}. Their image content is not searchable; read these original pages or choose a separate bounded subset.`);
  }else{
   warnings.push(`OCR explicitly read selected pages in acquisition order: ${selected.join(', ')}. Existing source records remain the unchanged prefix.`);
   if(profile.base==='native'&&missing.some(page=>!selected.includes(page)))warnings.push('Other image-only pages may still have no extracted text. Read additional original pages when needed.');
   warnings.push('Image areas on other native-text pages were not OCR-processed.');
   if(suppressed)warnings.push(`Kept native text instead of ${suppressed} duplicate OCR lines at matching positions.`);
  }
  const nativeOnlyPages=[...nativePages].filter(page=>!attemptedPages.has(page)).sort((a,b)=>a-b);
  if(nativeOnlyPages.length)warnings.push(`Pages with native text but image areas not OCR-processed: ${nativeOnlyPages.join(', ')}. A stamp, header or Adobe OCR text layer does not prove that all image content was extracted. Native text-layer origin is unknown.`);
  if(lowConfidenceLines)warnings.push(`${lowConfidenceLines} OCR lines have confidence below ${PDF_OCR_LIMITS.lowConfidence}. Their text is retained as low-confidence, unverified machine text. Check the original page before using it.`);
  const nativeCoverage=new Map((native.pageCoverage||[]).map(item=>[item.page,item])),nativeCounts=new Map(),nativeCharacters=new Map(),ocrCounts=new Map();
  for(const record of records){const page=record.locator?.page;if(record.locator?.type==='pdf-ocr-line')ocrCounts.set(page,(ocrCounts.get(page)||0)+1);else{nativeCounts.set(page,(nativeCounts.get(page)||0)+1);nativeCharacters.set(page,(nativeCharacters.get(page)||0)+record.text.length);}}
  const pageCoverage=Array.from({length:info.pages},(_,index)=>{const page=index+1,prior=nativeCoverage.get(page),nativeRecords=nativeCounts.get(page)||0,ocrRecords=ocrCounts.get(page)||0,ocr=attemptedPages.has(page);return{...prior,page,nativeText:prior?.nativeText??(nativeRecords?'extracted':'none'),nativeRecords,nativeCharacters:prior?.nativeCharacters??nativeCharacters.get(page)??0,nativeTextOrigin:'native-or-external-OCR-unknown',ocr:ocr?'processed':'not-processed',ocrRecords,coverage:ocr?(nativeRecords?'native-and-ocr':'ocr-only'):(nativeRecords?'native-only':'unprocessed'),imageContent:ocr?'ocr-attempted':'not-ocr-processed',textFound:!!(nativeRecords||ocrRecords)};});
  const skippedPages=[...(native.extractionCoverage?.skippedPages||[]),...boundedSkipped.map(page=>({page,reason:'ocr-page-budget'}))];
  const extractionCoverage={schemaVersion:1,kind:'native-and-ocr-text',totalPages:info.pages,complete:native.extractionCoverage?.complete!==false&&!pageCoverage.some(page=>page.coverage==='unprocessed'),skippedPages,nativeOnlyPages,imageContentFullyProcessed:attemptedPages.size===info.pages,ocrPages:[...attemptedPages],unprocessedPages:pageCoverage.filter(page=>page.coverage==='unprocessed').map(page=>page.page),...(range?{selectedRange:{start:windowStart,end:windowEnd}}:{})};
  let parserVersion=native.parserVersion+'+ocr-'+engineId;
  if(mode==='selected-pages'||mode==='bounded-missing-text'){
   checkAbort(signal);remaining();
   if(typeof root.crypto?.subtle?.digest!=='function')throw Error('Local SHA-256 is unavailable for the selected-page OCR identity.');
   const identity=new TextEncoder().encode(JSON.stringify([native.parserVersion,profile]));
   const digest=await root.crypto.subtle.digest('SHA-256',identity);
   checkAbort(signal);remaining();
   parserVersion=(mode==='selected-pages'?'pdf-ocr-selected-v2:':'pdf-ocr-bounded-v3:')+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  }
  return{format:'pdf',parserVersion,records,warnings,sourceProcessing:profile,pageCoverage,extractionCoverage};
 }catch(error){
  if(options.signal?.aborted)throw abortError();
  if(expired||signal.aborted&&Date.now()-started>=totalTimeout)throw Error('PDF OCR reached its total time limit; active workers were cancelled.');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',onAbort);controller.abort();}
}
return{renderPdfPage,inspectPdfPages,parsePdfWithOcr,validatePdfOcrProfile,PDF_OCR_LIMITS,PDF_OCR_RENDER_SHA256};
});
