'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),pdfBytes=new TextEncoder().encode('%PDF-1.4\nsynthetic header for protocol tests only');
function fixture({pages=3,nativePages=[1,3],confidence=92}={}){
 const native=nativePages.map(page=>({text:'Synthetic native header '+page,locator:{type:'pdf-text-item',page,item:1},textLayer:{origin:'native-or-external-OCR-unknown',verification:'unverified-source-text-layer'}})),requests=[];
 class Worker{
  postMessage(request){requests.push(request);const result=request.action==='inspect'?{pages}:{width:40,height:30,data:new Uint8ClampedArray(40*30*4),pageView:[0,0,40,30],rotation:0,transform:[1,0,0,1,0,0]};queueMicrotask(()=>{if(!this.stopped)this.onmessage({data:{ok:true,result}});});}
  terminate(){this.stopped=true;}
 }
 const sandbox={module:{exports:{}},Uint8Array,Uint8ClampedArray,ArrayBuffer,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,crypto:webcrypto,Blob,Worker,URL:{createObjectURL:()=> 'blob:synthetic-protocol-worker',revokeObjectURL(){}},PBGCRag:{OCR_ENGINE:{id:'synthetic-engine'},parsePdfBytes:async()=>({parserVersion:'synthetic-native-v1',format:'pdf',records:native,warnings:[],pageCoverage:Array.from({length:pages},(_,index)=>({page:index+1,nativeText:nativePages.includes(index+1)?'extracted':'none',nativeRecords:nativePages.includes(index+1)?1:0,nativeCharacters:nativePages.includes(index+1)?25:0,nativeTextOrigin:'native-or-external-OCR-unknown'})),extractionCoverage:{schemaVersion:1,kind:'native-text',totalPages:pages,complete:true,skippedPages:[]}}),recognizeImage:async()=>({engine:{id:'synthetic-engine'},lines:[{text:'Synthetic recognized body.',confidence,bbox:{x:1,y:2,width:30,height:15}}]})}};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'vendor/pdfjs/ocr-render-worker-source.js'),'utf8'),sandbox);
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/pdf-ocr.js'),'utf8'),sandbox);
 return{api:sandbox.module.exports,sandbox,native,requests};
}
test('partial automatic OCR explicitly reports native pages with unprocessed image areas',async()=>{
 const {api,native}=fixture(),before=JSON.stringify(native),parsed=await api.parsePdfWithOcr(pdfBytes);
 assert.equal(JSON.stringify(native),before);assert.equal(parsed.sourceProcessing.schemaVersion,1);
 assert.deepEqual(Array.from(parsed.pageCoverage,page=>page.coverage),['native-only','ocr-only','native-only']);
 assert.ok(parsed.warnings.some(warning=>/native text but image areas not OCR-processed: 1, 3/.test(warning)));
 assert.ok(parsed.warnings.some(warning=>/Adobe OCR text layer/.test(warning)));
 assert.deepEqual(Array.from(parsed.extractionCoverage.nativeOnlyPages),[1,3]);assert.equal(parsed.extractionCoverage.imageContentFullyProcessed,false);
 assert.equal(parsed.pageCoverage[0].nativeTextOrigin,'native-or-external-OCR-unknown');assert.equal(parsed.pageCoverage[1].ocrRecords,1);
});
test('new bounded OCR profile retains a deterministic subset and reports every omitted page; legacy remains strict',async()=>{
 const {api,requests}=fixture({pages:25,nativePages:[]});
 await assert.rejects(api.parsePdfWithOcr(pdfBytes),/20 pages/);
 const parsed=await api.parsePdfWithOcr(pdfBytes,{mode:'bounded-missing-text'}),again=await api.parsePdfWithOcr(pdfBytes,{mode:'bounded-missing-text'});
 assert.equal(parsed.sourceProcessing.schemaVersion,3);assert.equal(parsed.sourceProcessing.maxPages,20);assert.equal(parsed.records.length,20);
 assert.deepEqual(Array.from(parsed.records,record=>record.locator.page),Array.from({length:20},(_,index)=>index+1));
 assert.deepEqual(Array.from(parsed.extractionCoverage.unprocessedPages),[21,22,23,24,25]);assert.equal(parsed.extractionCoverage.complete,false);
 assert.ok(parsed.warnings.some(warning=>/Pages not OCR-processed: 21, 22, 23, 24, 25/.test(warning)));
 assert.equal(JSON.stringify(parsed.records),JSON.stringify(again.records));assert.equal(parsed.parserVersion,again.parserVersion);assert.match(parsed.parserVersion,/^pdf-ocr-bounded-v3:[a-f0-9]{64}$/);
 assert.equal(api.validatePdfOcrProfile(parsed.sourceProcessing).schemaVersion,3);
 await assert.rejects(api.parsePdfWithOcr(pdfBytes,{mode:'bounded-missing-text',maxPages:0}),/Unsupported/);
 assert.ok(requests.filter(request=>request.action==='render').every(request=>request.pageNumber<=20));
});
test('selected-page OCR preserves the exact native prefix and low-confidence lines stay explicitly unverified',async()=>{
 const {api,native}=fixture({pages:2,nativePages:[1],confidence:12}),parsed=await api.parsePdfWithOcr(pdfBytes,{mode:'selected-pages',pages:[1],base:'native'});
 assert.equal(JSON.stringify(parsed.records.slice(0,native.length)),JSON.stringify(native));assert.equal(parsed.sourceProcessing.schemaVersion,2);assert.equal(parsed.records[1].ocr.confidence,12);assert.equal(parsed.records[1].ocr.lowConfidence,true);assert.equal(parsed.records[1].ocr.verification,'unverified-machine-text');
 assert.equal(parsed.pageCoverage[0].coverage,'native-and-ocr');assert.equal(parsed.pageCoverage[1].coverage,'unprocessed');assert.ok(parsed.warnings.some(warning=>/confidence below 30/.test(warning)));
});
test('PDF raster workers are integrity checked before executing changed sources',async()=>{
 const {api,sandbox,requests}=fixture();await api.inspectPdfPages(pdfBytes);const count=requests.length;sandbox.PBGCRag.pdfOcrRenderWorkerSource+='\nself.evil=true;';
 await assert.rejects(api.inspectPdfPages(pdfBytes),/integrity check failed/);assert.equal(requests.length,count);
});
test('trusted OCR raster budgets are explicit and cannot exceed 64 MiB or 10,000 pages',async()=>{
 const {api,requests}=fixture({pages:250,nativePages:[]});await assert.rejects(api.inspectPdfPages(pdfBytes),/page count/);
 assert.equal((await api.inspectPdfPages(pdfBytes,{maxDocumentPages:10000,maxInputBytes:64*1024*1024})).pages,250);
 assert.equal(requests.at(-1).maxInputBytes,64*1024*1024);assert.equal(requests.at(-1).maxDocumentPages,10000);
 await assert.rejects(api.inspectPdfPages(pdfBytes,{maxInputBytes:64*1024*1024+1}),/64 MB/);await assert.rejects(api.inspectPdfPages(pdfBytes,{maxDocumentPages:10001}),/10,000/);
});
test('bounded OCR window profiles are immutable restore instructions; native handoffs cannot enter persisted profiles',async()=>{
 const {api}=fixture(),profile=Object.assign(Object.create(null),{schemaVersion:3,pdfOcr:'bounded-missing-text',engineId:'synthetic-engine',maxPages:2,selectedRange:{start:201,end:400}}),valid=api.validatePdfOcrProfile(profile);
 assert.equal(Object.isFrozen(valid),true);assert.equal(Object.isFrozen(valid.selectedRange),true);assert.equal(valid.selectedRange.start,201);
 for(const candidate of[{...profile,nativeExtraction:{}},{...profile,selectedRange:{start:1,end:201}},{...profile,selectedRange:{start:9999,end:10001}},{...profile,maxPages:0},{...profile,maxPages:21}])assert.throws(()=>api.validatePdfOcrProfile(Object.assign(Object.create(null),candidate)),/profile|window/);
 await assert.rejects(api.parsePdfWithOcr(pdfBytes,{mode:'missing-text',nativeExtraction:{}}),/v3/);
 await assert.rejects(api.parsePdfWithOcr(pdfBytes,{mode:'selected-pages',pages:[1],selectedRange:{start:1,end:2}}),/v3/);
});
test('static image headers enforce pixel limits before native decoding',async()=>{
 require('../assets/ocr.js');const {inspectImageHeader,parseImageBytes,IMAGE_SOURCE_LIMITS}=require('../assets/image-source.js');
 const png=new Uint8Array(33),view=new DataView(png.buffer);png.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);png.set([73,72,68,82],12);view.setUint32(16,100);view.setUint32(20,80);
 assert.deepEqual(inspectImageHeader('synthetic.PNG',png),{width:100,height:80,mime:'image/png',format:'png'});
 view.setUint32(16,4097);assert.throws(()=>inspectImageHeader('synthetic.png',png),/pixel/);await assert.rejects(parseImageBytes('synthetic.png',png),/pixel/);
 assert.throws(()=>inspectImageHeader('synthetic.svg',new Uint8Array([1,2,3])),/Supported/);
 await assert.rejects(parseImageBytes('synthetic.png',new Uint8Array(IMAGE_SOURCE_LIMITS.bytes+1)),/byte budget/);
 await assert.rejects(parseImageBytes('synthetic.png',png,{maxInputBytes:IMAGE_SOURCE_LIMITS.largeBytes+1}),/64 MB/);
 const controller=new AbortController();controller.abort();await assert.rejects(parseImageBytes('synthetic.png',png,{signal:controller.signal}),{name:'AbortError'});
 const jpeg=new Uint8Array([255,216,255,192,0,8,8,0,80,0,100,1]);assert.equal(inspectImageHeader('synthetic.jpg',jpeg).width,100);
 const webp=new Uint8Array(30),wv=new DataView(webp.buffer);webp.set(new TextEncoder().encode('RIFF'));wv.setUint32(4,22,true);webp.set(new TextEncoder().encode('WEBPVP8X'),8);wv.setUint32(16,10,true);webp[24]=99;webp[27]=79;assert.equal(inspectImageHeader('synthetic.webp',webp).height,80);webp[20]=2;assert.throws(()=>inspectImageHeader('synthetic.webp',webp),/Animated/);
});
