/* Opt-in, bounded PDF raster OCR. Original PDF bytes and native text stay separate. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_OCR_LIMITS=Object.freeze({bytes:5242880,documentPages:200,ocrPages:20,pixels:8000000,edge:4096,renderTimeoutMs:15000,totalTimeoutMs:180000,records:50000,characters:2000000});
let sourcePromise;
const abortError=()=>{const error=Error('PDF OCR cancelled. No new source was accepted.');error.name='AbortError';return error;};
function checkBytes(bytes){if(!(bytes instanceof Uint8Array)||bytes.length>PDF_OCR_LIMITS.bytes||new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error('PDF OCR needs a valid PDF no larger than 5 MB.');}
function checkAbort(signal){if(signal?.aborted)throw abortError();}
function waitForAsset(promise,signal,timeout){return new Promise((resolve,reject)=>{let settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);},abort=()=>finish(abortError());if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('PDF OCR local asset loading reached its hard time limit.')),timeout);promise.then(value=>finish(null,value),error=>finish(error));});}
async function renderSource(signal,timeout){checkAbort(signal);if(typeof root.PBGCRag?.pdfOcrRenderWorkerSource==='string')return root.PBGCRag.pdfOcrRenderWorkerSource;if(!root.document)throw Error('Local PDF OCR rendering assets are unavailable.');if(!sourcePromise)sourcePromise=new Promise((resolve,reject)=>{const script=root.document.createElement('script');script.src='vendor/pdfjs/ocr-render-worker-source.js';script.onload=()=>{if(typeof root.PBGCRag?.pdfOcrRenderWorkerSource==='string')resolve(root.PBGCRag.pdfOcrRenderWorkerSource);else{sourcePromise=null;reject(Error('Local PDF OCR rendering pack is invalid.'));}};script.onerror=()=>{sourcePromise=null;script.remove();reject(Error('The bundled PDF OCR rendering pack could not load.'));};root.document.head.append(script);});const source=await waitForAsset(sourcePromise,signal,timeout);checkAbort(signal);return source;}
async function workerRequest(bytes,request,options={}){checkBytes(bytes);checkAbort(options.signal);const timeout=options.timeoutMs??PDF_OCR_LIMITS.renderTimeoutMs;if(!Number.isInteger(timeout)||timeout<1||timeout>PDF_OCR_LIMITS.renderTimeoutMs)throw Error('PDF OCR render timeout must be 1–15000 milliseconds.');if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function')throw Error('PDF OCR needs isolated Blob workers.');const started=Date.now(),source=await renderSource(options.signal,timeout);checkAbort(options.signal);const remaining=timeout-(Date.now()-started);if(remaining<=0)throw Error('PDF OCR rendering reached its hard time limit.');return new Promise((resolve,reject)=>{let worker,url,timer,settled=false;const abort=()=>finish(abortError());function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(worker)worker.terminate();if(url)root.URL.revokeObjectURL(url);if(error)reject(error);else resolve(result);}try{url=root.URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new root.Worker(url,{name:'pbgc-pdf-ocr-raster'});worker.onmessage=event=>event.data?.ok===true?finish(null,event.data.result):finish(Error(event.data?.error||'PDF OCR render worker returned invalid output.'));worker.onerror=event=>{event.preventDefault();finish(Error('PDF OCR rendering worker failed or was blocked.'));};worker.onmessageerror=()=>finish(Error('PDF OCR worker output was unreadable.'));options.signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('PDF OCR rendering reached its hard time limit; worker terminated.')),remaining);const copied=bytes.slice();worker.postMessage({...request,bytes:copied.buffer},[copied.buffer]);}catch(error){finish(error);}});}
async function inspectPdfPages(bytes,options={}){const result=await workerRequest(bytes,{action:'inspect'},options);if(!Number.isInteger(result?.pages)||result.pages<1||result.pages>PDF_OCR_LIMITS.documentPages)throw Error('PDF OCR inspection returned invalid page count.');return result;}
async function renderPdfPage(bytes,pageNumber,options={}){if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>PDF_OCR_LIMITS.documentPages)throw Error('PDF OCR page number is invalid.');const scale=options.scale??150/72,maxPixels=options.maxPixels??PDF_OCR_LIMITS.pixels;if(typeof scale!=='number'||!Number.isFinite(scale)||scale<0.25||scale>4||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>PDF_OCR_LIMITS.pixels)throw Error('PDF OCR scale or pixel budget is invalid.');const result=await workerRequest(bytes,{action:'render',pageNumber,scale,maxPixels},options);if(!Number.isInteger(result?.width)||!Number.isInteger(result.height)||result.width<1||result.height<1||result.width>PDF_OCR_LIMITS.edge||result.height>PDF_OCR_LIMITS.edge||result.width*result.height>maxPixels||!(result.data instanceof Uint8ClampedArray)||result.data.length!==result.width*result.height*4||!Array.isArray(result.pageView)||result.pageView.length!==4||!result.pageView.every(Number.isFinite)||!Array.isArray(result.transform)||result.transform.length!==6||!result.transform.every(Number.isFinite)||!Number.isFinite(result.rotation))throw Error('PDF OCR rendering returned invalid raster or geometry.');return result;}
function integerBox(value,width,height){if(!value||!['x','y','width','height'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])))throw Error('OCR line has invalid image geometry.');const left=Math.max(0,Math.floor(value.x)),top=Math.max(0,Math.floor(value.y)),right=Math.min(width,Math.ceil(value.x+value.width)),bottom=Math.min(height,Math.ceil(value.y+value.height));if(left>=right||top>=bottom||left>=width||top>=height)throw Error('OCR line lies outside its rendered page.');return{x:left,y:top,width:right-left,height:bottom-top};}
function validatePdfOcrProfile(value){
 const plain=value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const engineId=root.PBGCRag?.OCR_ENGINE?.id;
 if(!plain||typeof engineId!=='string'||value.engineId!==engineId)throw Error('Unsupported or changed OCR processing profile. Keep the original package and engine version.');
 if(value.schemaVersion===1&&value.pdfOcr==='missing-text'&&Object.keys(value).every(key=>['schemaVersion','pdfOcr','engineId'].includes(key)))return Object.freeze({schemaVersion:1,pdfOcr:'missing-text',engineId});
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
 checkBytes(bytes);checkAbort(options.signal);
 const mode=options.mode??'missing-text';
 if(!['missing-text','selected-pages'].includes(mode))throw Error('Only missing-text or selected-pages PDF OCR is supported.');
 if(mode==='missing-text'&&options.pages!==undefined)throw Error('Explicit PDF OCR page subsets need selected-pages mode; missing-text processes all pages with no native text.');
 if(mode==='missing-text'&&options.base!==undefined)throw Error('The missing-text OCR profile does not accept a base override.');
 if(typeof root.PBGCRag?.parsePdfBytes!=='function'||typeof root.PBGCRag?.recognizeImage!=='function'||typeof root.PBGCRag?.OCR_ENGINE?.id!=='string')throw Error('Bundled PDF and OCR adapters are unavailable.');
 if(options.onProgress!==undefined&&typeof options.onProgress!=='function')throw Error('Invalid PDF OCR progress callback.');
 const engineId=root.PBGCRag.OCR_ENGINE.id,profile=validatePdfOcrProfile(mode==='missing-text'?{schemaVersion:1,pdfOcr:mode,engineId}:{schemaVersion:2,pdfOcr:mode,engineId,base:options.base??'native',pages:options.pages});
 const totalTimeout=options.timeoutMs??PDF_OCR_LIMITS.totalTimeoutMs;
 if(!Number.isInteger(totalTimeout)||totalTimeout<1||totalTimeout>PDF_OCR_LIMITS.totalTimeoutMs)throw Error('PDF OCR total timeout must be 1–180000 milliseconds.');
 const controller=new AbortController(),onAbort=()=>controller.abort();options.signal?.addEventListener('abort',onAbort,{once:true});let expired=false;
 const timer=setTimeout(()=>{expired=true;controller.abort();},totalTimeout),signal=controller.signal,started=Date.now();
 const remaining=()=>{const value=totalTimeout-(Date.now()-started);if(value<=0){expired=true;controller.abort();throw Error('PDF OCR exceeded its total time budget.');}return value;};
 try{
  const native=await root.PBGCRag.parsePdfBytes(bytes,{signal,timeoutMs:Math.min(15000,remaining())});checkAbort(signal);
  const info=await inspectPdfPages(bytes,{signal,timeoutMs:Math.min(15000,remaining())}),nativePages=new Set(native.records.map(record=>record.locator?.page)),missing=Array.from({length:info.pages},(_,index)=>index+1).filter(page=>!nativePages.has(page));
  const base=mode==='missing-text'||profile.base==='missing-text'?missing:[],selected=mode==='selected-pages'?profile.pages:[];
  if(selected.some(page=>page>info.pages))throw Error('A selected OCR page is outside this PDF.');
  if(selected.some(page=>base.includes(page)))throw Error('A selected OCR page already belongs to the automatic missing-text base.');
  if(base.length+selected.length>PDF_OCR_LIMITS.ocrPages)throw Error('PDF OCR is limited to 20 pages per source. No partial OCR source was imported.');
  const records=native.records.slice();let characters=records.reduce((sum,record)=>sum+record.text.length,0),recognized=0,suppressed=0;
  async function recognizePage(page,deduplicate){
   checkAbort(signal);remaining();options.onProgress?.({phase:'render',page,pages:info.pages,completed:recognized,total:base.length+selected.length});
   const raster=await renderPdfPage(bytes,page,{signal,timeoutMs:Math.min(15000,remaining())});
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
    records.push({text:line.text,locator:{type:'pdf-ocr-line',page,line:index+1,bbox,imageWidth:raster.width,imageHeight:raster.height,pageView:raster.pageView.slice(),pageRotation:raster.rotation,renderTransform:raster.transform.slice(),coordinateSystem:'rendered page pixels',regionPrecision:'machine-estimated OCR line region; not native PDF text or glyph bounds'},ocr:{engineId,confidence:line.confidence,verification:'unverified-machine-text'}});
   }
   recognized++;options.onProgress?.({phase:'complete-page',page,pages:info.pages,completed:recognized,total:base.length+selected.length});
  }
  for(const page of base)await recognizePage(page,false);
  // Legacy ordering is intentionally preserved as the complete immutable prefix.
  if(mode==='missing-text'||profile.base==='missing-text')records.sort((a,b)=>a.locator.page-b.locator.page);
  for(const page of selected)await recognizePage(page,true);
  const warnings=(native.warnings||[]).filter(warning=>!/^PDF text extraction only\./.test(warning)&&!/^\d+ pages have no extracted text\. No OCR was performed\.$/.test(warning));
  warnings.push('PDF text item order is parser order, not a guaranteed reading order.','Machine OCR text and line regions are estimates. Verify every OCR value, especially numbers, dates and negation, against the original page image.');
  if(mode==='missing-text'){
   if(missing.length)warnings.push(`OCR attempted ${missing.length} pages with no native text. Empty recognition does not prove a blank page.`);
   else warnings.push('All pages have native text. Image content on those pages was not OCR-processed.');
  }else{
   warnings.push(`OCR explicitly read selected pages in acquisition order: ${selected.join(', ')}. Existing source records remain the unchanged prefix.`);
   if(profile.base==='native'&&missing.some(page=>!selected.includes(page)))warnings.push('Other image-only pages may still have no extracted text. Read additional original pages when needed.');
   warnings.push('Image areas on other native-text pages were not OCR-processed.');
   if(suppressed)warnings.push(`Kept native text instead of ${suppressed} duplicate OCR lines at matching positions.`);
  }
  let parserVersion=native.parserVersion+'+ocr-'+engineId;
  if(mode==='selected-pages'){
   checkAbort(signal);remaining();
   if(typeof root.crypto?.subtle?.digest!=='function')throw Error('Local SHA-256 is unavailable for the selected-page OCR identity.');
   const identity=new TextEncoder().encode(JSON.stringify([native.parserVersion,profile]));
   const digest=await root.crypto.subtle.digest('SHA-256',identity);
   checkAbort(signal);remaining();
   parserVersion='pdf-ocr-selected-v2:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  }
  return{format:'pdf',parserVersion,records,warnings,sourceProcessing:profile};
 }catch(error){
  if(options.signal?.aborted)throw abortError();
  if(expired||signal.aborted&&Date.now()-started>=totalTimeout)throw Error('PDF OCR reached its total time limit; active workers were cancelled.');
  throw error;
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',onAbort);controller.abort();}
}
return{renderPdfPage,inspectPdfPages,parsePdfWithOcr,validatePdfOcrProfile,PDF_OCR_LIMITS};
});
