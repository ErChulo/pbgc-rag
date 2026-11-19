/* Native PDF extraction runs only inside the denied-network parser worker. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_LIMITS=Object.freeze({bytes:5242880,maxInputBytes:64*1024*1024,pages:200,documentPages:10000,records:50000,characters:2000000,pageItems:10000,timeout:15000});
function requestOptions(options){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid PDF extraction options.');
 const maxInputBytes=options.maxInputBytes??PDF_LIMITS.bytes,timeoutMs=options.timeoutMs??PDF_LIMITS.timeout;
 if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<PDF_LIMITS.bytes||maxInputBytes>PDF_LIMITS.maxInputBytes)throw Error('PDF input budget must be between 5 and 64 MiB.');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>PDF_LIMITS.timeout)throw Error('PDF timeout must be between 1 and 15,000 milliseconds.');
 if(options.allowPartial!==undefined&&typeof options.allowPartial!=='boolean')throw Error('PDF partial extraction choice must be explicit.');
 let pages=null;
 if(options.pages!==undefined){const p=options.pages;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['start','end'].includes(k))||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<1||p.end<p.start||p.end>PDF_LIMITS.documentPages||p.end-p.start+1>PDF_LIMITS.pages)throw Error('Select a native PDF window of at most 200 pages within pages 1–10,000.');pages={start:p.start,end:p.end};}
 return{maxInputBytes,timeoutMs,pages,allowPartial:options.allowPartial===true};
}
// No actions, annotations, attachments, JavaScript, forms, remote assets or
// main-thread fallback are requested. Each window has its own hard time cap.
async function extractPdfBytes(bytes,options={}){
 const config=requestOptions(options);
 if(!(bytes instanceof Uint8Array)||bytes.length>config.maxInputBytes)throw Error(options.maxInputBytes===undefined?'PDF exceeds the 5 MB byte limit or has invalid bytes.':'PDF exceeds its configured input byte budget or has invalid bytes.');
 if(new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error('Invalid PDF header.');
 if(!root.pdfjsLib?.getDocument||!root.pdfjsWorker?.WorkerMessageHandler)throw Error('Local PDF parser assets are unavailable.');
 const warnings=['PDF text extraction only. Scanned image pages need a separate OCR step. Text item order is the parser order, not a guaranteed reading order.','Text transforms and widths are source-derived PDF.js metrics. Advance boxes are approximate text regions, not exact glyph outlines.','A PDF text layer may come from external OCR. Its origin and correctness are unverified; inspect the original page, including image areas.'];
 const missingAssets=new Set();
 class NoExternalData{async fetch(request){missingAssets.add(String(request.kind)+': '+String(request.filename));throw Error('External PDF font, CMap and WASM assets are disabled.');}}
 const task=root.pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,useWasm:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,disableAutoFetch:true,disableStream:true,disableRange:true,stopAtErrors:true,maxImageSize:0,canvasMaxAreaInBytes:0,BinaryDataFactory:NoExternalData,verbosity:0});
 let timer,expired=false;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;task.destroy().catch(()=>{});reject(Error('PDF extraction exceeded its bounded inner extraction time limit.'));},config.timeoutMs);});
 const work=(async()=>{
  const doc=await task.promise;
  if(!Number.isInteger(doc.numPages)||doc.numPages<1||doc.numPages>PDF_LIMITS.documentPages)throw Error('PDF exceeds the 10,000-page document limit.');
  if(!config.pages&&doc.numPages>PDF_LIMITS.pages)throw Error('PDF exceeds the 200-page extraction window. Choose an explicit bounded page window.');
  const start=config.pages?.start??1,end=Math.min(config.pages?.end??doc.numPages,doc.numPages);
  if(start>doc.numPages)throw Error('The selected PDF page window is outside this document.');
  if((start!==1||end!==doc.numPages)&&!config.allowPartial)throw Error('A page subset requires allowPartial:true so omitted pages are explicit.');
  const records=[],pageCoverage=Array.from({length:doc.numPages},(_,i)=>({page:i+1,nativeText:'skipped',nativeRecords:0,nativeCharacters:0,nativeTextOrigin:'native-or-external-OCR-unknown',reason:'outside-selected-range'}));
  let chars=0,empty=0;
  for(let pageNumber=start;pageNumber<=end;pageNumber++){
   if(expired)throw Error('PDF extraction cancelled.');
   const page=await doc.getPage(pageNumber);
   try{
    if(!Array.isArray(page.view)||page.view.length!==4||!page.view.every(Number.isFinite)||!Number.isFinite(page.rotate))throw Error('PDF page contains invalid geometry.');
    const content=await page.getTextContent({disableNormalization:true,includeMarkedContent:false});
    if(!Array.isArray(content.items))throw Error('PDF text item output is invalid.');
    let reason=content.items.length>PDF_LIMITS.pageItems?'dense-page-item-limit':null,pageChars=0;const pageRecords=[];
    if(!reason)for(let index=0;index<content.items.length;index++){
     const item=content.items[index];if(typeof item.str!=='string'||!item.str.trim())continue;
     pageChars+=item.str.length;
     if(pageChars>PDF_LIMITS.characters){reason='page-character-budget';break;}
     if(!Array.isArray(item.transform)||item.transform.length!==6||!item.transform.every(Number.isFinite)||!Number.isFinite(item.width)||!Number.isFinite(item.height))throw Error('PDF text contains invalid geometry.');
     const[a,b,,,x,y]=item.transform,angle=Math.atan2(b,a),ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
     const corners=[[x,y],[x+ux*item.width,y+uy*item.width],[x+vx*item.height,y+vy*item.height],[x+ux*item.width+vx*item.height,y+uy*item.width+vy*item.height]],xs=corners.map(c=>c[0]),ys=corners.map(c=>c[1]);
     pageRecords.push({text:item.str,locator:{type:'pdf-text-item',page:pageNumber,item:index+1,transform:item.transform.slice(),width:item.width,height:item.height,pageView:page.view.slice(),pageRotation:page.rotate,coordinateSystem:'PDF user space',advanceBox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],regionPrecision:'approximate text advance box; not glyph bounds'},textLayer:{origin:'native-or-external-OCR-unknown',verification:'unverified-source-text-layer'}});
    }
    if(!reason&&chars+pageChars>PDF_LIMITS.characters)reason='window-character-budget';
    if(!reason&&records.length+pageRecords.length>PDF_LIMITS.records)reason='window-record-budget';
    if(reason){
     // Never retain a prefix of a page that exceeded a native extraction cap.
     // Dense pages are explicitly omitted; other budget partials need consent.
     if(reason!=='dense-page-item-limit'&&!config.allowPartial)throw Error('PDF text exceeds the extraction budget.');
     pageCoverage[pageNumber-1]={...pageCoverage[pageNumber-1],reason};continue;
    }
    records.push(...pageRecords);chars+=pageChars;if(!pageRecords.length)empty++;
    pageCoverage[pageNumber-1]={page:pageNumber,nativeText:pageRecords.length?'extracted':'none',nativeRecords:pageRecords.length,nativeCharacters:pageChars,nativeTextOrigin:'native-or-external-OCR-unknown'};
   }finally{page.cleanup();}
  }
  const skippedPages=pageCoverage.filter(p=>p.nativeText==='skipped').map(p=>({page:p.page,reason:p.reason}));
  const outside=skippedPages.filter(p=>p.reason==='outside-selected-range'),failed=skippedPages.filter(p=>p.reason!=='outside-selected-range');
  if(outside.length)warnings.push(`Native text was extracted only from pages ${start}–${end}. ${outside.length} other pages were not processed in this window.`);
  if(failed.length)warnings.push('Native extraction omitted whole pages: '+failed.slice(0,20).map(p=>p.page+' ('+p.reason+')').join(', ')+(failed.length>20?`; and ${failed.length-20} more pages`:'')+'. Inspect the original pages or use explicit OCR; no truncated page text was retained.');
  if(missingAssets.size)warnings.push('Unavailable optional local PDF assets: '+Array.from(missingAssets).join(', ')+'. Extraction may be incomplete.');
  if(empty)warnings.push(`${empty} pages have no extracted text. No OCR was performed.`);
  const extractionCoverage={schemaVersion:1,kind:'native-text',totalPages:doc.numPages,complete:skippedPages.length===0,skippedPages,selectedRange:{start,end}};
  return{format:'pdf',parserVersion:'pdfjs-6.4.299-adapter-2'+(config.pages?`:pages-${start}-${end}`:''),records,warnings,pageCoverage,extractionCoverage};
 })();
 try{return await Promise.race([work,timeout]);}catch(error){if(error?.name==='PasswordException')throw Error('Encrypted PDF requires a password and is unsupported.');throw error;}finally{clearTimeout(timer);await task.destroy().catch(()=>{});}
}
return{extractPdfBytes,PDF_LIMITS};
});
