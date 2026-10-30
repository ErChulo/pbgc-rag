(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_LIMITS=Object.freeze({bytes:5242880,pages:200,records:50000,characters:2000000,pageItems:10000,timeout:15000});
// PDF.js 6.4.299 is preloaded as classic local IIFEs (worker first). No rendering,
// actions, annotations, attachments, JavaScript or forms are requested. Fake
// worker is intentional: no module import or worker asset request under file://.
async function extractPdfBytes(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>PDF_LIMITS.bytes)throw Error('PDF exceeds the 5 MB byte limit or has invalid bytes.');
 if(new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error('Invalid PDF header.');
 if(!root.pdfjsLib?.getDocument||!root.pdfjsWorker?.WorkerMessageHandler)throw Error('Local PDF parser assets are unavailable.');
 const warnings=['PDF text extraction only. Scanned image pages need OCR, which is unavailable. Text item order is the parser order, not a guaranteed reading order.','Text transforms and widths are source-derived PDF.js metrics. Advance boxes are approximate text regions, not exact glyph outlines.'];
 const missingAssets=new Set();
 class NoExternalData {async fetch(request){missingAssets.add(String(request.kind)+': '+String(request.filename));throw Error('External PDF font, CMap and WASM assets are disabled.');}}
 const task=root.pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,useWasm:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,disableAutoFetch:true,disableStream:true,disableRange:true,stopAtErrors:true,maxImageSize:0,canvasMaxAreaInBytes:0,BinaryDataFactory:NoExternalData,verbosity:0});
 let timer,expired=false;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;task.destroy().catch(()=>{});reject(Error('PDF extraction exceeded the 15-second inner extraction time limit.'));},PDF_LIMITS.timeout);});
 const work=(async()=>{const doc=await task.promise;if(doc.numPages>PDF_LIMITS.pages)throw Error('PDF exceeds the 200-page limit.');const records=[];let chars=0;let empty=0;
  for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){if(expired)throw Error('PDF extraction cancelled.');const page=await doc.getPage(pageNumber);try{const content=await page.getTextContent({disableNormalization:true,includeMarkedContent:false});if(content.items.length>PDF_LIMITS.pageItems)throw Error('PDF page exceeds the 10,000 text-item limit.');let count=0;
   for(let index=0;index<content.items.length;index++){const item=content.items[index];if(typeof item.str!=='string'||!item.str.trim())continue;chars+=item.str.length;if(chars>PDF_LIMITS.characters||records.length>=PDF_LIMITS.records)throw Error('PDF text exceeds the extraction budget.');if(!Array.isArray(item.transform)||item.transform.length!==6||!item.transform.every(Number.isFinite)||!Number.isFinite(item.width)||!Number.isFinite(item.height))throw Error('PDF text contains invalid geometry.');
    const [a,b,,,x,y]=item.transform,angle=Math.atan2(b,a),ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;const corners=[[x,y],[x+ux*item.width,y+uy*item.width],[x+vx*item.height,y+vy*item.height],[x+ux*item.width+vx*item.height,y+uy*item.width+vy*item.height]];const xs=corners.map(c=>c[0]),ys=corners.map(c=>c[1]);
    records.push({text:item.str,locator:{type:'pdf-text-item',page:pageNumber,item:index+1,transform:item.transform.slice(),width:item.width,height:item.height,pageView:page.view.slice(),pageRotation:page.rotate,coordinateSystem:'PDF user space',advanceBox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],regionPrecision:'approximate text advance box; not glyph bounds'}});count++;}
   if(!count)empty++;
  }finally{page.cleanup();}}
  if(missingAssets.size)warnings.push('Unavailable optional local PDF assets: '+Array.from(missingAssets).join(', ')+'. Extraction may be incomplete.');
  if(empty)warnings.push(`${empty} pages have no extracted text. No OCR was performed.`);return {format:'pdf',parserVersion:'pdfjs-6.4.299-adapter-1',records,warnings};})();
 try{return await Promise.race([work,timeout]);}catch(error){if(error?.name==='PasswordException')throw Error('Encrypted PDF requires a password and is unsupported.');throw error;}finally{clearTimeout(timer);await task.destroy().catch(()=>{});}
}
return {extractPdfBytes,PDF_LIMITS};
});
