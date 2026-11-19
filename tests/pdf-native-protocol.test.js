'use strict';
// Worker protocol and bounded parser-core tests. Actual PDF.js execution is in pdf.test.js.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),input=new TextEncoder().encode('%PDF-1.4\nsynthetic protocol only'),json=value=>JSON.parse(JSON.stringify(value));
function row(page,nativeText='extracted',reason){return{page,nativeText,nativeRecords:nativeText==='extracted'?1:0,nativeCharacters:nativeText==='extracted'?8:0,nativeTextOrigin:'native-or-external-OCR-unknown',...(reason?{reason}:{})};}
function record(page){return{text:'Evidence',locator:{type:'pdf-text-item',page,item:1,transform:[12,0,0,12,72,720],width:48,height:12,pageView:[0,0,612,792],pageRotation:0,advanceBox:[72,720,120,732],coordinateSystem:'PDF user space',regionPrecision:'approximate text advance box; not glyph bounds'},textLayer:{origin:'native-or-external-OCR-unknown',verification:'unverified-source-text-layer'}};}
function result(){return{format:'pdf',parserVersion:'pdfjs-6.4.299-adapter-2',records:[record(1)],warnings:['Synthetic protocol fixture.'],pageCoverage:[row(1)],extractionCoverage:{schemaVersion:1,kind:'native-text',totalPages:1,complete:true,skippedPages:[],selectedRange:{start:1,end:1}}};}
function fixture(output=result()){
 const workers=[],requests=[],revoked=[];class Worker{constructor(){workers.push(this);}postMessage(request){requests.push(request);queueMicrotask(()=>{if(!this.stopped)this.onmessage({data:{ok:true,result:output}});});}terminate(){this.stopped=true;}}
 const sandbox={module:{exports:{}},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Worker,URL:{createObjectURL:()=> 'blob:native-protocol',revokeObjectURL:value=>revoked.push(value)},setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'vendor/pdfjs/parser-worker-source.js'),'utf8'),sandbox);vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/pdf.js'),'utf8'),sandbox);
 return{api:sandbox.module.exports,sandbox,workers,requests,revoked};
}
test('native PDF adapter returns validated records and exact explicit coverage, then terminates its worker',async()=>{
 const f=fixture(),parsed=await f.api.parsePdfBytes(input);assert.deepEqual(json(parsed),result());assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.maxInputBytes,5*1024*1024);assert.ok(f.workers.every(w=>w.stopped));assert.equal(f.revoked.length,f.workers.length);
 assert.deepEqual(json(f.api.validatePdfExtraction(parsed)),result());
});
test('native PDF adapter rejects malformed worker records, inconsistent coverage and forged identities',async()=>{
 const mutations=[r=>r.records[0].text=null,r=>r.records[0].locator.advanceBox=[NaN,0,1,1],r=>r.records[0].locator.page=2,r=>delete r.records[0].textLayer,r=>r.pageCoverage[0].nativeRecords=2,r=>r.extractionCoverage.complete=false,r=>r.records.push(record(1)),r=>r.parserVersion='forged',r=>r.warnings=[{}],r=>r.extractionCoverage.skippedPages.push({page:1,reason:'outside-selected-range'})];
 for(const mutate of mutations){const output=result();mutate(output);const f=fixture(output);await assert.rejects(f.api.parsePdfBytes(input),/invalid|inconsistent|match|duplicate|unsupported/);assert.ok(f.workers.every(w=>w.stopped));}
});
test('native worker integrity pin rejects source and manifest replacement before creating a worker',async()=>{
 const f=fixture();f.sandbox.PBGCRag.pdfWorkerSource+='\nself.untrusted=true;';await assert.rejects(f.api.parsePdfBytes(input),/integrity/);assert.equal(f.workers.length,0);
 f.sandbox.PBGCRag.pdfWorkerManifest={schemaVersion:1,kind:'pdf-native-parser-worker',worker:{bytes:1,sha256:'0'.repeat(64)}};await assert.rejects(f.api.parsePdfBytes(input),/integrity/);assert.equal(f.workers.length,0);
});
test('native PDF page window and large input budgets are explicit, bounded and clamped to the real document end',async()=>{
 const r=result();r.parserVersion+=':pages-201-250';r.records=[record(201)];r.pageCoverage=Array.from({length:250},(_,i)=>row(i+1,i<200?'skipped':i===200?'extracted':'none',i<200?'outside-selected-range':undefined));r.extractionCoverage={schemaVersion:1,kind:'native-text',totalPages:250,complete:false,skippedPages:r.pageCoverage.filter(p=>p.nativeText==='skipped').map(({page,reason})=>({page,reason})),selectedRange:{start:201,end:250}};
 const f=fixture(r),parsed=await f.api.parsePdfBytes(input,{maxInputBytes:64*1024*1024,pages:{start:201,end:400},allowPartial:true});assert.equal(parsed.records[0].locator.page,201);assert.equal(parsed.extractionCoverage.selectedRange.end,250);assert.equal(parsed.extractionCoverage.skippedPages.length,200);
 for(const options of[{pages:{start:1,end:201}},{pages:{start:10000,end:10001}},{maxInputBytes:64*1024*1024+1},{allowPartial:'yes'}])await assert.rejects(f.api.parsePdfBytes(input,options),/window|MiB|explicit/);
 await assert.rejects(f.api.parsePdfBytes(input,{pages:{start:201,end:400}}),/different page window/);
});
test('native parser omits a whole dense page, retains later pages and states every omission',async()=>{
 const counts=[1,10001,1],calls=[],destroyed=[];const sandbox={module:{exports:{}},TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,pdfjsWorker:{WorkerMessageHandler:{}},pdfjsLib:{getDocument(options){calls.push(options);return{promise:Promise.resolve({numPages:3,async getPage(page){return{view:[0,0,612,792],rotate:0,async getTextContent(){return{items:Array.from({length:counts[page-1]},()=>({str:'Evidence',transform:[12,0,0,12,72,720],width:48,height:12}))};},cleanup(){}};}}),async destroy(){destroyed.push(true);}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'vendor/pdfjs/parser-core.js'),'utf8'),sandbox);const parsed=await sandbox.module.exports.extractPdfBytes(input);
 assert.deepEqual(Array.from(parsed.records,r=>r.locator.page),[1,3]);assert.equal(parsed.pageCoverage[1].nativeText,'skipped');assert.equal(parsed.pageCoverage[1].reason,'dense-page-item-limit');assert.equal(parsed.extractionCoverage.complete,false);assert.match(parsed.warnings.join('\n'),/whole pages: 2 \(dense-page-item-limit\)/);assert.equal(destroyed.length,1);assert.equal(calls[0].useWorkerFetch,false);assert.equal(calls[0].enableXfa,false);
});
