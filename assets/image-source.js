/* Standalone PNG/JPEG/WebP OCR. Original bytes are never executed or changed. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const IMAGE_SOURCE_LIMITS=Object.freeze({bytes:5*1024*1024,largeBytes:64*1024*1024,pixels:8000000,edge:4096,headerBytes:1024*1024,decodeTimeoutMs:15000,totalTimeoutMs:75000,records:5000,characters:100000,lowConfidence:30});
const abortError=()=>{const error=Error('Image reading cancelled. No new source was accepted.');error.name='AbortError';return error;};
function check(signal){if(signal?.aborted)throw abortError();}
function dimensions(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>IMAGE_SOURCE_LIMITS.edge||height>IMAGE_SOURCE_LIMITS.edge||width*height>IMAGE_SOURCE_LIMITS.pixels)throw Error('Image exceeds the 8,000,000 pixel or 4096-pixel edge budget.');return{width,height};}
function imageHeader(name,bytes){
 if(typeof name!=='string'||!name.trim()||name.length>255||!(bytes instanceof Uint8Array))throw Error('Provide a named PNG, JPEG or WebP image.');
 const ext=name.toLowerCase().split('.').pop(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(offset,length)=>new TextDecoder('ascii').decode(bytes.subarray(offset,offset+length));
 if(ext==='png'){
  if(bytes.length<33||!bytes.subarray(0,8).every((value,index)=>value===[137,80,78,71,13,10,26,10][index])||view.getUint32(8)!==13||ascii(12,4)!=='IHDR')throw Error('Invalid PNG header.');
  const size=dimensions(view.getUint32(16),view.getUint32(20));
  for(let at=8;at+12<=bytes.length;){const length=view.getUint32(at),end=at+12+length;if(!Number.isSafeInteger(end)||end>bytes.length)throw Error('Invalid PNG chunk size.');const type=ascii(at+4,4);if(type==='acTL')throw Error('Animated PNG is unsupported. Select a static image or PDF.');if(type==='IDAT'||type==='IEND')break;if(end>IMAGE_SOURCE_LIMITS.headerBytes)throw Error('PNG header exceeds the bounded image-header budget.');at=end;}
  return{...size,mime:'image/png',format:'png'};
 }
 if(ext==='jpg'||ext==='jpeg'){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG header.');
  let at=2;
  while(at+3<bytes.length&&at<IMAGE_SOURCE_LIMITS.headerBytes){
   if(bytes[at++]!==255)throw Error('Invalid JPEG marker.');while(at<bytes.length&&bytes[at]===255)at++;const marker=bytes[at++];
   if(marker===0||marker===216)continue;if(marker===218||marker===217)break;if(marker>=208&&marker<=215||marker===1)continue;
   if(at+2>bytes.length)break;const length=view.getUint16(at);if(length<2||at+length>bytes.length)throw Error('Invalid JPEG segment size.');
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)throw Error('Invalid JPEG frame header.');return{...dimensions(view.getUint16(at+5),view.getUint16(at+3)),mime:'image/jpeg',format:'jpeg'};}
   at+=length;
  }
  throw Error('JPEG dimensions are unavailable within the bounded image header.');
 }
 if(ext==='webp'){
  if(bytes.length<20||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8)throw Error('Invalid WebP header.');
  for(let at=12;at+8<=bytes.length&&at<IMAGE_SOURCE_LIMITS.headerBytes;){
   const type=ascii(at,4),length=view.getUint32(at+4,true),start=at+8,end=start+length;if(end>bytes.length)throw Error('Invalid WebP chunk size.');
   if(type==='ANIM'||type==='ANMF')throw Error('Animated WebP is unsupported. Select a static image or PDF.');
   if(type==='VP8X'){if(length<10)throw Error('Invalid extended WebP header.');if(bytes[start]&2)throw Error('Animated WebP is unsupported. Select a static image or PDF.');const u24=offset=>bytes[offset]|bytes[offset+1]<<8|bytes[offset+2]<<16;return{...dimensions(u24(start+4)+1,u24(start+7)+1),mime:'image/webp',format:'webp'};}
   if(type==='VP8L'){if(length<5||bytes[start]!==47)throw Error('Invalid lossless WebP header.');const bits=view.getUint32(start+1,true);return{...dimensions((bits&16383)+1,((bits>>>14)&16383)+1),mime:'image/webp',format:'webp'};}
   if(type==='VP8 '){if(length<10||bytes[start+3]!==157||bytes[start+4]!==1||bytes[start+5]!==42)throw Error('Invalid WebP frame header.');return{...dimensions(view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383),mime:'image/webp',format:'webp'};}
   at=end+(length%2);
  }
  throw Error('WebP dimensions are unavailable within the bounded image header.');
 }
 throw Error('Supported standalone image sources are static PNG, JPEG and WebP.');
}
// Fixed worker code. No uploaded image bytes or document text become program text.
function imageDecodeWorker(){
 'use strict';self.fetch=undefined;self.XMLHttpRequest=undefined;self.WebSocket=undefined;self.EventSource=undefined;self.importScripts=undefined;
 self.onmessage=async event=>{let bitmap,canvas;try{
  const input=event.data;if(!input||!(input.bytes instanceof ArrayBuffer)||input.bytes.byteLength>64*1024*1024||!['image/png','image/jpeg','image/webp'].includes(input.mime))throw Error('Invalid isolated image input.');
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')throw Error('This browser cannot decode images in isolated local workers.');
  bitmap=await createImageBitmap(new Blob([input.bytes],{type:input.mime}));const width=bitmap.width,height=bitmap.height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8000000||!(width===input.width&&height===input.height||width===input.height&&height===input.width))throw Error('Decoded image dimensions exceed or differ from the validated header.');
  canvas=new OffscreenCanvas(width,height);const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Isolated image canvas is unavailable.');context.fillStyle='white';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,width,height).data;
  self.postMessage({ok:true,result:{width,height,data:pixels}},[pixels.buffer]);
 }catch(error){self.postMessage({ok:false,error:String(error?.message||error).slice(0,500)});}finally{bitmap?.close();if(canvas){canvas.width=1;canvas.height=1;}self.close();}};
}
async function decodeImage(bytes,header,{signal,timeoutMs}){
 check(signal);if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function')throw Error('Image reading needs isolated Blob workers.');
 return new Promise((resolve,reject)=>{let worker,url,timer,settled=false;const abort=()=>finish(abortError());function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(url)root.URL.revokeObjectURL(url);if(error)reject(error);else resolve(result);}
  try{url=root.URL.createObjectURL(new Blob(['(',imageDecodeWorker.toString(),')();'],{type:'text/javascript'}));worker=new root.Worker(url,{name:'pbgc-image-decode'});worker.onmessage=event=>{const result=event.data?.result;if(event.data?.ok!==true){finish(Error(event.data?.error||'Image decoder failed.'));return;}try{dimensions(result?.width,result?.height);if(!(result.data instanceof Uint8ClampedArray)||result.data.length!==result.width*result.height*4)throw Error('Image decoder returned invalid pixels.');finish(null,result);}catch(error){finish(error);}};worker.onerror=event=>{event.preventDefault();finish(Error('Image decoding worker failed or was blocked.'));};worker.onmessageerror=()=>finish(Error('Image decoding output was unreadable.'));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('Image decoding reached its hard time limit.')),timeoutMs);worker.postMessage({bytes:bytes.buffer,mime:header.mime,width:header.width,height:header.height},[bytes.buffer]);}catch(error){finish(error);}
 });
}
function validateImageOcrProfile(value){const engineId=root.PBGCRag?.OCR_ENGINE?.id;if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||value.schemaVersion!==1||value.imageOcr!=='full-image'||typeof engineId!=='string'||value.engineId!==engineId||Object.keys(value).some(key=>!['schemaVersion','imageOcr','engineId'].includes(key)))throw Error('Unsupported or changed image OCR processing profile.');return Object.freeze({schemaVersion:1,imageOcr:'full-image',engineId});}
async function parseImageBytes(name,bytes,options={}){
 const maximum=options.maxInputBytes??IMAGE_SOURCE_LIMITS.bytes;if(!Number.isSafeInteger(maximum)||maximum<1||maximum>IMAGE_SOURCE_LIMITS.largeBytes)throw Error('Image input budget must be from 1 byte to 64 MB.');if(!(bytes instanceof Uint8Array)||bytes.length>maximum)throw Error('Image exceeds its configured source byte budget.');check(options.signal);
 const timeoutMs=options.timeoutMs??IMAGE_SOURCE_LIMITS.totalTimeoutMs;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>IMAGE_SOURCE_LIMITS.totalTimeoutMs)throw Error('Image reading timeout must be from 1 to 75,000 milliseconds.');if(options.onProgress!==undefined&&typeof options.onProgress!=='function')throw Error('Invalid image reading progress callback.');
 if(typeof root.PBGCRag?.recognizeImage!=='function'||typeof root.PBGCRag?.OCR_ENGINE?.id!=='string')throw Error('Bundled local image OCR is unavailable.');
 const input=bytes.slice(),header=imageHeader(name,input),controller=new AbortController(),onAbort=()=>controller.abort();options.signal?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();let expired=false;
 const remaining=()=>{const left=timeoutMs-(Date.now()-started);if(left<=0){expired=true;controller.abort();throw Error('Image reading reached its total time limit.');}return left;};
 try{
  const sourceProcessing=validateImageOcrProfile({schemaVersion:1,imageOcr:'full-image',engineId:root.PBGCRag.OCR_ENGINE.id});options.onProgress?.({phase:'decode'});
  const raster=await decodeImage(input,header,{signal:controller.signal,timeoutMs:Math.min(IMAGE_SOURCE_LIMITS.decodeTimeoutMs,remaining())});check(controller.signal);options.onProgress?.({phase:'recognize'});
  const result=await root.PBGCRag.recognizeImage(raster,{signal:controller.signal,timeoutMs:Math.min(60000,remaining()),onProgress:options.onProgress});check(controller.signal);remaining();
  if(result?.engine?.id!==sourceProcessing.engineId||!Array.isArray(result.lines)||result.lines.length>IMAGE_SOURCE_LIMITS.records)throw Error('Image OCR returned an invalid engine or line list.');
  const records=[];let characters=0,lowConfidenceLines=0;
  for(let index=0;index<result.lines.length;index++){
   const line=result.lines[index];if(typeof line?.text!=='string'||!line.text.trim())continue;const box=line.bbox;if((characters+=line.text.length)>IMAGE_SOURCE_LIMITS.characters||!Number.isFinite(line.confidence)||line.confidence<0||line.confidence>100||!box||!['x','y','width','height'].every(key=>Number.isInteger(box[key])&&box[key]>=0)||!box.width||!box.height||box.x+box.width>raster.width||box.y+box.height>raster.height)throw Error('Image OCR returned invalid line text, confidence or geometry.');
   const lowConfidence=line.confidence<IMAGE_SOURCE_LIMITS.lowConfidence;if(lowConfidence)lowConfidenceLines++;
   records.push({text:line.text,locator:{type:'image-ocr-line',line:index+1,bbox:{...box},imageWidth:raster.width,imageHeight:raster.height,coordinateSystem:'decoded image pixels',regionPrecision:'machine-estimated OCR line region',background:'white'},ocr:{engineId:sourceProcessing.engineId,confidence:line.confidence,verification:'unverified-machine-text',...(lowConfidence?{lowConfidence:true}:{})}});
  }
  const warnings=['Machine OCR text and image line regions are estimates. Check words, numbers and negation against the original image.','Image coordinates refer to the browser-decoded static image, rendered over a white background.'];
  if(lowConfidenceLines)warnings.push(`${lowConfidenceLines} OCR lines have confidence below ${IMAGE_SOURCE_LIMITS.lowConfidence}. Their text is retained as low-confidence, unverified machine text.`);
  if(!records.length)warnings.push('No located OCR text was extracted. Empty recognition does not prove a blank image.');
  if(!records.length&&typeof result.text==='string'&&result.text.trim())warnings.push('The engine returned text without usable line locations. It was not indexed; inspect the original image.');
  options.onProgress?.({phase:'complete'});return{format:'image',parserVersion:'image-ocr-v1:'+sourceProcessing.engineId,records,warnings,sourceProcessing,imageCoverage:{schemaVersion:1,format:header.format,width:raster.width,height:raster.height,ocr:'processed',ocrRecords:records.length,lowConfidenceLines,verification:'unverified-machine-text'}};
 }catch(error){if(options.signal?.aborted)throw abortError();if(expired||controller.signal.aborted)throw Error('Image reading reached its total time limit; active workers were cancelled.');throw error;}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',onAbort);controller.abort();}
}
return{parseImageBytes,validateImageOcrProfile,IMAGE_SOURCE_LIMITS,inspectImageHeader:imageHeader};
});
