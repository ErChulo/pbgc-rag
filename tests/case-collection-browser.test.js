'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const scripts=[
 'vendor/pdfjs/parser-worker-source.js','assets/pdf.js','assets/ocr.js','assets/pdf-ocr.js','assets/image-source.js',
 'assets/core.js','assets/formats.js','vendor/ingest-worker-source.js','assets/ingest.js',
 'assets/ranking.js','assets/table-query.js','assets/table-evidence.js','assets/chunking.js','assets/rag-corpus.js',
 'assets/semantic.js','assets/answer-selection.js','assets/rag.js','assets/case-vault.js','assets/case-term-index.js','assets/case-collection.js','assets/case-archive.js'
];
function multiPagePdf(count,contentForPage){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids=[];
 for(let page=1;page<=count;page++){
  const id=objects.length+1,stream=contentForPage?contentForPage(page):`BT /F1 12 Tf 72 720 Td (Synthetic collection page ${page}) Tj ET`;
  kids.push(id+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
 let text='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(text);text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Array.from(Buffer.from(text));
}
function storedZip(parts){
 const locals=[],directory=[];let offset=0;
 const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return(crc^0xffffffff)>>>0;};
 for(const [name,text]of Object.entries(parts)){
  const filename=Buffer.from(name),bytes=Buffer.from(text),crc=crc32(bytes),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,filename,bytes);directory.push(central,filename);offset+=local.length+filename.length+bytes.length;
 }
 const index=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
 return Array.from(Buffer.concat([...locals,index,end]));
}
function twoSheetWorkbook(){
 const row=(number,values)=>`<row r="${number}">${values.map((value,column)=>`<c r="${String.fromCharCode(65+column)}${number}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`;
 let benefits=row(1,['Participant','ID','Age']),rates=row(1,['Synthetic workbook test only'])+row(2,['Participant','ID','Factor']);
 for(let i=1;i<=400;i++){const suffix=String(i).padStart(4,'0');benefits+=row(i+1,['Plan A '+suffix,'A'+suffix,'65']);rates+=row(i+2,['Plan B '+suffix,'B'+suffix,'0.85']);}
 return storedZip({'[Content_Types].xml':'<Types/>','xl/workbook.xml':'<workbook xmlns:r="relationships"><sheets><sheet name="Benefits" sheetId="1" r:id="rId1"/><sheet name="Rates" sheetId="2" r:id="rId2"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+benefits+'</sheetData></worksheet>','xl/worksheets/sheet2.xml':'<worksheet><sheetData>'+rates+'</sheetData></worksheet>'});
}

test(`${profile} real case collection imports, searches, reparses backups and retains exact evidence`,{timeout:600000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),external=[],errors=[];
 if(target.startsWith('file:'))await context.setOffline(true);
 const base=new URL('.',target).href;
 context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(!target.startsWith('http')||!url.startsWith(base)))external.push(url);});
 if(target.startsWith('http'))await context.route('**/*',route=>{
  const url=route.request().url();
  if(url===target)return route.fulfill({contentType:'text/html',body:`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; worker-src blob:; object-src 'none'"><title>Collection integration verification</title>${scripts.map(src=>`<script src="${src}"></script>`).join('')}`});
  if(url.startsWith(base)){
   const relative=decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length));
   if(scripts.includes(relative)||relative==='vendor/ocr/ocr-pack.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(ROOT,relative))});
  }
  return route.abort();
 });
 else await context.route(/^(?:https?|wss?):\/\//,route=>route.abort());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.createCaseCollection==='function');
  await page.evaluate(async()=>{globalThis.collectionVault=await PBGCRag.createCaseVault();globalThis.collection=await PBGCRag.createCaseCollection({vault:collectionVault});});

  await t.test('streamed text preserves UTF-16 offsets, CRLF lines, emoji and the last passage',async()=>{
   const result=await page.evaluate(async()=>{
    const id='text-stream';await collectionVault.createCase({id,name:'Synthetic streaming text'});
    const lead='SYNTHETIC TEST ONLY 😀\r\n',line='Plan narrative retains qualified benefits and complete source evidence.\r\n';
    const body=lead+line.repeat(9000)+'The zirconium provision sets normal retirement age at 67.\r\n';
    const imported=await collection.importFiles(id,[new File([body],'plan.txt')]);
    const source=imported[0].source,summary=await collection.summary(id,source.id);let count=0,offsetMismatch=0,last;
    for await(const shard of collectionVault.iterateShards(id,{kind:'records',sourceId:source.id}))if(Array.isArray(shard.payload.records))for(const record of shard.payload.records){count++;if(body.slice(record.locator.offset,record.locator.offset+record.locator.length)!==record.text)offsetMismatch++;last=record;}
    const found=await collection.search(id,'zirconium provision');return{imported:imported.map(x=>({status:x.status,error:x.error})),summary,count,offsetMismatch,last,found,bytes:new Blob([body]).size};
   });
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.ok(result.bytes>512*1024);assert.equal(result.count,9002);assert.equal(result.offsetMismatch,0);assert.equal(result.last.locator.line,9002);assert.equal(result.last.text,'The zirconium provision sets normal retirement age at 67.');
   assert.ok(result.found.results.some(chunk=>chunk.text.includes(result.last.text)));assert.equal(result.found.diagnostics.strongMatches,1);assert.equal(result.summary.ready,true);
  });

  await t.test('a physical line above the streaming budget retains every character and marks unavoidable sentence cuts',async()=>{
   const result=await page.evaluate(async()=>{
    const id='long-physical-line';await collectionVault.createCase({id,name:'Synthetic long sentence boundaries'});
    const text='Unbroken synthetic sentence '+ 'qualifier '.repeat(60000)+'retains all conditions.\r\nNext physical line contains limonite marker.';
    const imported=await collection.importFiles(id,[new File([text],'long-line.txt')]);if(imported[0].status!=='imported')return{imported};
    const source=imported[0].source,summary=await collection.summary(id,source.id),records=[],segments=[];
    for await(const shard of collectionVault.iterateShards(id,{kind:'records',sourceId:source.id}))if(Array.isArray(shard.payload.records))records.push(...shard.payload.records);
    for await(const shard of collectionVault.iterateShards(id,{kind:'chunks',sourceId:source.id}))for(const entry of shard.payload.search)segments.push(...entry.chunk.segments.map(segment=>({startsMidSentence:segment.startsMidSentence,endsMidSentence:segment.endsMidSentence})));
    const found=await collection.search(id,'limonite marker');return{imported:imported.map(x=>({status:x.status,error:x.error})),summary,records:records.map(record=>({locator:record.locator,sourceFragment:record.sourceFragment,textLength:record.text.length,exact:text.slice(record.locator.offset,record.locator.offset+record.locator.length)===record.text})),textCharacters:text.length,segments,found};
   });
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.ok(result.records.length>=3);assert.ok(result.records.every(record=>record.exact));
   assert.equal(result.records.reduce((sum,record)=>sum+record.textLength,0)+2,result.textCharacters,'only the original CRLF delimiter lies outside text records');
   assert.equal(result.records[0].sourceFragment.endsMidSentence,true);assert.equal(result.records[1].sourceFragment.startsMidSentence,true);assert.equal(result.records.at(-1).locator.line,2);
   assert.ok(result.segments.some(segment=>segment.startsMidSentence));assert.ok(result.segments.some(segment=>segment.endsMidSentence));assert.ok(result.found.results.some(chunk=>chunk.text.includes('limonite marker')));
  });

  await t.test('CSV records preserve quoted newlines and absolute row/line/cell offsets across batches',async()=>{
   const result=await page.evaluate(async()=>{
    const id='csv-stream';await collectionVault.createCase({id,name:'Synthetic streaming CSV'});
    const header='Participant,ID,Age,Notes\r\n',rows=[];for(let i=0;i<4800;i++)rows.push(`Person ${i},P${i},${55+i%20},"Qualified provision ${i}: ${'evidence '.repeat(12)}${i%100===0?'\r\nContinuation on the same cell.':''}"\r\n`);
    const text=header+rows.join(''),imported=await collection.importFiles(id,[new File([text],'participants.csv')]);const first=imported[0];
    if(first.status!=='imported')return{imported};
    const before=await collection.search(id,'Person 4799',{forAnswers:true});
    await collection.configureHeader(id,first.source.id,1);
    const summary=await collection.summary(id,first.source.id),found=await collection.search(id,'Person 4799 Age',{forAnswers:true});
    let count=0,last,firstLocator,quoted=0;for await(const shard of collectionVault.iterateShards(id,{kind:'records',sourceId:first.source.id}))if(shard.payload.generation===summary.generation&&Array.isArray(shard.payload.records))for(const record of shard.payload.records){if(record.locator.row===1)continue;count++;last=record;if(!firstLocator)firstLocator=record.locator;if(record.text.includes('\r\n'))quoted++;}
    return{imported:imported.map(x=>({status:x.status,error:x.error})),bytes:new Blob([text]).size,beforeCount:before.results.length,summary,count,last,firstLocator,quoted,found};
   });
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.ok(result.bytes>512*1024);assert.equal(result.beforeCount,0,'unconfirmed table columns cannot supply answer evidence');assert.equal(result.summary.headerRow,1);assert.equal(result.count,4800*4);assert.ok(result.quoted>0);assert.equal(result.last.locator.row,4801);assert.equal(result.last.locator.column,4);assert.ok(result.last.locator.line>4801,'quoted newlines retain physical source line');assert.ok(result.found.results.some(chunk=>chunk.tableEvidence?.sourceRow===4801),JSON.stringify(result.found));
  });

  await t.test('250-page PDF import covers both native page windows without dropping pages',async()=>{
   const result=await page.evaluate(async bytes=>{
    const id='pdf-windows';await collectionVault.createCase({id,name:'Synthetic 250-page PDF'});
    const imported=await collection.importFiles(id,[new File([new Uint8Array(bytes)],'250-pages.pdf')]);if(imported[0].status!=='imported')return{imported};
    const summary=await collection.summary(id,imported[0].source.id);let pages=[];for await(const shard of collectionVault.iterateShards(id,{kind:'records'}))if(Array.isArray(shard.payload.records))pages.push(...shard.payload.records.map(r=>r.locator.page));
    const found=await collection.search(id,'Synthetic collection page 250');return{imported:imported.map(x=>({status:x.status,error:x.error})),summary,pages,found};
   },multiPagePdf(250));
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.equal(new Set(result.pages).size,250);assert.equal(result.summary.pageCoverage.length,250);assert.ok(result.summary.pageCoverage.every(p=>p.nativeText==='extracted'));assert.ok(result.found.results.some(c=>c.locators.some(loc=>loc.page===250)));
   assert.equal(result.summary.coverageComplete,true);assert.deepEqual(result.summary.unreadPages,[]);
   assert.ok(!result.summary.warnings.some(warning=>/other pages were not processed in this window/.test(warning)),'completed page windows do not leave stale omission warnings');
  });

  await t.test('document and case scope exclude equally relevant evidence from other sources',async()=>{
   const result=await page.evaluate(async()=>{
    const id='source-scope';await collectionVault.createCase({id,name:'Synthetic source scope'});
    const imported=await collection.importFiles(id,[new File(['Plan amber normal retirement age is 65.'],'amber.txt'),new File(['Plan cobalt normal retirement age is 67.'],'cobalt.txt')]);
    const [first,second]=imported.map(item=>item.source),question='normal retirement age';
    const all=await collection.search(id,question),one=await collection.search(id,question,{sourceIds:[first.id]}),other=await collection.search(id,question,{sourceIds:[second.id]});
    const foreignId='foreign-scope';await collectionVault.createCase({id:foreignId,name:'Separate synthetic case'});const foreign=await collection.importFiles(foreignId,[new File(['Foreign case normal retirement age is 99.'],'foreign.txt')]);
    let rejected;try{await collection.search(id,question,{sourceIds:[foreign[0].source.id]});}catch(error){rejected=error.message;}
    return{all,one,other,rejected,first,second};
   });
   assert.equal(new Set(result.all.results.map(item=>item.sourceId)).size,2);assert.equal(result.one.results.length,1);assert.equal(result.other.results.length,1);
   assert.ok(result.one.results.every(item=>item.sourceId===result.first.id&&item.text.includes('65')&&!item.text.includes('67')));
   assert.ok(result.other.results.every(item=>item.sourceId===result.second.id&&item.text.includes('67')&&!item.text.includes('65')));
   assert.match(result.rejected,/selected document is unavailable/);
  });

  await t.test('each workbook sheet retains its own confirmed header row through later batches and backup',async()=>{
   const result=await page.evaluate(async bytes=>{
    const id='two-sheet-workbook';await collectionVault.createCase({id,name:'Synthetic two-sheet workbook'});
    const imported=await collection.importFiles(id,[new File([new Uint8Array(bytes)],'independent-sheets.xlsx')]);if(imported[0].status!=='imported')return{imported};
    const source=imported[0].source;await collection.configureHeader(id,source.id,1,{tableName:'Benefits'});
    const firstSummary=await collection.summary(id,source.id),before=await collection.search(id,'Plan B 0400 Factor',{forAnswers:true});
    await collection.configureHeader(id,source.id,2,{tableName:'Rates'});
    const summary=await collection.summary(id,source.id),benefits=await collection.search(id,'Plan A 0400 Age',{forAnswers:true}),rates=await collection.search(id,'Plan B 0400 Factor',{forAnswers:true});
    const backup=await PBGCRag.createCaseCollectionArchive(collectionVault,id),parsed=await PBGCRag.parseCaseCollectionArchive(backup),entry=parsed.entries[0],restoredId='restored-two-sheets';await collectionVault.createCase({id:restoredId,name:'Reparsed independent sheets'});
    const restored=await collection.importFiles(restoredId,[entry.file],{expectedHash:entry.source.hash,tableHeaders:entry.source.tableHeaders}),restoredSource=restored[0].source,restoredSummary=restoredSource&&await collection.summary(restoredId,restoredSource.id),reopened=await collection.search(restoredId,'Plan B 0400 Factor',{forAnswers:true});
    return{imported:imported.map(x=>({status:x.status,error:x.error})),firstSummary,before,summary,benefits,rates,manifest:parsed.manifest,restored:restored.map(x=>({status:x.status,error:x.error})),restoredSummary,reopened};
   },twoSheetWorkbook());
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.deepEqual(result.summary.tableNames,['Benefits','Rates']);
   assert.deepEqual(result.firstSummary.tableHeaders,[{tableName:'Benefits',headerRow:1}]);assert.ok(result.before.results.every(chunk=>chunk.tableEvidence?.tableName!=='Rates'),'unconfirmed Rates sheet cannot provide answer evidence');
   const choices=[{tableName:'Benefits',headerRow:1},{tableName:'Rates',headerRow:2}];assert.deepEqual(result.summary.tableHeaders,choices);assert.deepEqual(result.manifest.sources[0].tableHeaders,choices);assert.deepEqual(result.restoredSummary.tableHeaders,choices);
   assert.ok(result.benefits.results.some(chunk=>chunk.tableEvidence?.sourceRow===401&&chunk.tableEvidence.focus.locator.sheet==='Benefits'&&chunk.tableEvidence.focus.rawText==='65'));
   assert.ok(result.rates.results.some(chunk=>chunk.tableEvidence?.sourceRow===402&&chunk.tableEvidence.focus.locator.sheet==='Rates'&&chunk.tableEvidence.focus.rawText==='0.85'));
   assert.ok(result.rates.results.every(chunk=>chunk.tableEvidence?.tableName==='Rates'),'no Benefits cells are relabeled with Rates headers');
   assert.equal(result.restored[0].status,'imported',JSON.stringify(result.restored));assert.ok(result.reopened.results.some(chunk=>chunk.tableEvidence?.focus.locator.sheet==='Rates'&&chunk.tableEvidence.focus.rawText==='0.85'));
  });

  await t.test('a failed header rebuild keeps the previously committed evidence generation searchable',async()=>{
   const result=await page.evaluate(async()=>{
    const id='two-sheet-workbook',source=(await collection.sources(id))[0],before=await collection.summary(id,source.id),beforeCase=await collectionVault.getCase(id);let rejected;
    try{await collection.configureHeader(id,source.id,5000,{tableName:'Rates'});}catch(error){rejected=error.message;}
    const after=await collection.summary(id,source.id),afterCase=await collectionVault.getCase(id),found=await collection.search(id,'Plan B 0400 Factor',{forAnswers:true});return{before,after,beforeCase,afterCase,rejected,found};
   });
   assert.match(result.rejected,/column-name row is not present/);assert.equal(result.after.generation,result.before.generation);assert.deepEqual(result.after.tableHeaders,result.before.tableHeaders);
   assert.equal(result.afterCase.derivedBytes,result.beforeCase.derivedBytes,'uncommitted header-rebuild shards do not consume case capacity');assert.equal(result.afterCase.shardCount,result.beforeCase.shardCount);
   assert.ok(result.found.results.some(chunk=>chunk.tableEvidence?.sourceRow===402&&chunk.tableEvidence.focus.rawText==='0.85'));
  });

  await t.test('standalone image ingestion indexes actual OCR and retains unverified machine-text metadata',async()=>{
   const result=await page.evaluate(async()=>{
    const id='image-source';await collectionVault.createCase({id,name:'Synthetic photographed page'});
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,300);ctx.fillStyle='black';ctx.font='52px Arial';ctx.fillText('Normal retirement age is 65.',40,115);ctx.font='40px Arial';ctx.fillText('SYNTHETIC IMAGE TEST ONLY',40,205);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),imported=await collection.importFiles(id,[new File([blob],'photographed-page.png')]);
    if(imported[0].status!=='imported')return{imported};const source=imported[0].source,summary=await collection.summary(id,source.id),found=await collection.search(id,'normal retirement age');
    const original=await collectionVault.getSource(id,source.id);return{imported:imported.map(x=>({status:x.status,error:x.error})),summary,found,originalBytes:original.blob.size,inputBytes:blob.size};
   });
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.equal(result.summary.format,'image');assert.equal(result.originalBytes,result.inputBytes);assert.ok(result.found.results.some(c=>/normal retirement age is 65/i.test(c.text)));assert.ok(result.found.results.every(c=>c.hasMachineText&&c.requiresSourceReview&&c.locators.every(loc=>loc.type==='image-ocr-line')));assert.match(result.summary.warnings.join(' '),/Machine OCR/);
  });

  await t.test('backup contains originals and explicit table settings; restore reparses new evidence',async()=>{
   const result=await page.evaluate(async()=>{
    const backup=await PBGCRag.createCaseCollectionArchive(collectionVault,'csv-stream'),parsed=await PBGCRag.parseCaseCollectionArchive(backup);
    const id='restored-csv';await collectionVault.createCase({id,name:'Restored synthetic table'});const imported=[];
    for(const entry of parsed.entries)imported.push(...await collection.importFiles(id,[entry.file],{expectedHash:entry.source.hash,headerRow:entry.source.headerRow}));
    const source=imported[0]?.source,summary=source&&await collection.summary(id,source.id),found=await collection.search(id,'Person 4799 Age',{forAnswers:true});
    const original=await collectionVault.getSource(id,source.id);collectionVault.close();globalThis.collectionVault=await PBGCRag.createCaseVault();globalThis.collection=await PBGCRag.createCaseCollection({vault:collectionVault});const reopened=await collection.search(id,'Person 4799 Age',{forAnswers:true});
    return{backupSize:backup.size,manifest:parsed.manifest,imported:imported.map(x=>({status:x.status,error:x.error})),summary,found,reopened,originalHash:original.hash,sourceId:source.id};
   });
   assert.equal(result.manifest.sourceCount,1);assert.equal(result.manifest.sources[0].headerRow,1);assert.ok(result.backupSize>result.manifest.originalBytes);assert.equal(result.imported[0].status,'imported');assert.equal(result.summary.headerRow,1);assert.equal(result.originalHash,result.manifest.sources[0].hash);assert.notEqual(result.sourceId,result.manifest.sources[0].id,'restored records bind to a fresh source ID');assert.deepEqual(result.reopened.results,result.found.results);
  });

  await t.test('cancellation rolls back the incomplete source and keeps earlier committed evidence',async()=>{
   const result=await page.evaluate(async()=>{
    const id='cancel-import';await collectionVault.createCase({id,name:'Synthetic cancelled import'});await collection.importFiles(id,[new File(['The retained plan normal retirement age is 65.'],'kept.txt')]);
    const before=await collectionVault.getCase(id),controller=new AbortController();let cancelled;
    try{await collection.importFiles(id,[new File(['Cancellable complete synthetic sentence.\n'.repeat(20000)],'cancel.txt')],{signal:controller.signal,onProgress:event=>{if(event.phase==='indexing')controller.abort();}});}catch(error){cancelled=error.name;}
    const after=await collectionVault.getCase(id),sources=await collection.sources(id),found=await collection.search(id,'retained plan');return{before,after,sources,cancelled,found};
   });
   assert.equal(result.cancelled,'AbortError');assert.equal(result.sources.length,1);assert.equal(result.sources[0].name,'kept.txt');assert.equal(result.after.originalBytes,result.before.originalBytes);assert.equal(result.after.sourceCount,1);assert.ok(result.found.results.some(c=>c.text.includes('retained plan')));
  });

  await t.test('a changed case rejects an in-flight search and SHA mismatch cannot bypass duplicate checks',async()=>{
   const result=await page.evaluate(async()=>{
    let reads=0,stale;
    const concurrent=await PBGCRag.createCaseCollection({vault:{...collectionVault,getCase:async(...args)=>{if(++reads===2)await collection.importFiles('text-stream',[new File(['Changed case evidence.'],'added.txt')]);return collectionVault.getCase(...args);}}});
    try{await concurrent.search('text-stream','zirconium');}catch(error){stale=error.message;}
    const source=(await collection.sources('text-stream')).find(s=>s.name==='plan.txt'),original=await collectionVault.getSource('text-stream',source.id);
    const mismatch=await collection.importFiles('text-stream',[new File([original.blob],'same-original.txt')],{expectedHash:'0'.repeat(64)});
    return{stale,mismatch:mismatch.map(x=>({status:x.status,error:x.error,duplicate:x.duplicate}))};
   });
   assert.equal(result.mismatch[0].status,'rejected',JSON.stringify(result.mismatch));assert.match(result.mismatch[0].error,/SHA-256/);
   assert.match(result.stale,/changed during search/);
  });

  await t.test('compact search covers every indexed passage and loads only matching payload shards',async()=>{
   const result=await page.evaluate(async()=>{
    const id='compact-passages';await collectionVault.createCase({id,name:'Compact candidates'});
    const prefix='This synthetic archive paragraph records correspondence and review history. '.repeat(30)+'\n',body=prefix.repeat(450);
    await collection.importFiles(id,[new File([body,'\nThe zirconiumcompactmarker amount is 815 dollars.\n'],'compact.txt'),new File([body,'\nA separate document has no matching marker.\n'],'other.txt')]);
    let reads=0;const counted=await PBGCRag.createCaseCollection({vault:{...collectionVault,getShard:async(...args)=>{if(args[2]==='chunks')reads++;return collectionVault.getShard(...args);}}});
    const found=await counted.search(id,'zirconiumcompactmarker amount'),metadata=await collection.sources(id),summaries=await Promise.all(metadata.map(source=>collection.summary(id,source.id)));
    return{found,reads,totalShards:summaries.reduce((n,s)=>n+s.termShards.length,0),totalChunks:summaries.reduce((n,s)=>n+s.chunks,0)};
   });
   assert.equal(result.found.diagnostics.candidateIndex,'authenticated-exact-term-postings');assert.ok(result.found.results.some(c=>c.text.includes('815 dollars')));
   assert.equal(result.found.diagnostics.scannedChunks,result.totalChunks);assert.ok(result.reads>0&&result.reads<result.totalShards);
   assert.equal(result.reads,result.found.diagnostics.loadedPassageShards);assert.ok(result.found.diagnostics.loadedPassageChunks<result.totalChunks);
  });

  await t.test('a deleted active term shard fails closed instead of shrinking the searched corpus',async()=>{
   const result=await page.evaluate(async()=>{
    const id='missing-term-shard';await collectionVault.createCase({id,name:'Missing compact metadata'});
    const [created]=await collection.importFiles(id,[new File(['Normal retirement age is 65.'],'plan.txt')]);
    const info=await collection.summary(id,created.source.id),binding=info.termShards[0];
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pbgc-rag-case-vault',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('shards','readwrite');tx.objectStore('shards').delete([id,created.source.id,'terms',binding.id]);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    try{await collection.search(id,'retirement age');return'unexpected success';}catch(error){return error.message;}
   });
   assert.match(result,/missing|inventory|incomplete/i);
  });

  await t.test('authenticated compact metadata still must match its complete passage ID list',async()=>{
   const result=await page.evaluate(async()=>{
    const id='term-protocol-drift';await collectionVault.createCase({id,name:'Term protocol guard'});
    const [created]=await collection.importFiles(id,[new File(['Normal retirement age is 65.'],'plan.txt')]),info=await collection.summary(id,created.source.id),binding=info.termShards[0];
    const shard=await collectionVault.getShard(id,created.source.id,'terms',binding.id),payload=structuredClone(shard.payload);payload.searchIndex.chunkIds[0]='chunk:changed-protocol-identity';
    await collectionVault.putShard(id,created.source.id,{id:binding.id,kind:'terms',sourceHash:created.source.hash,sourceRevision:created.source.revision,payload});
    try{await collection.search(id,'retirement age');return'unexpected success';}catch(error){return error.message;}
   });
   assert.match(result,/bind|identity|passage.*index|passage.*shard/i);
  });

  await t.test('a legacy cache cannot silently omit an active passage shard',async()=>{
   const result=await page.evaluate(async()=>{
    const id='legacy-inventory';await collectionVault.createCase({id,name:'Legacy inventory guard'});
    const line='Synthetic archive correspondence records remain available for later review.\n',body='The zirconiumlegacy amount is 815 dollars.\n'+line.repeat(9000);
    const [created]=await collection.importFiles(id,[new File([body],'legacy-plan.txt')]);
    const summary=await collectionVault.getShard(id,created.source.id,'records','summary'),payload=structuredClone(summary.payload);delete payload.termIndexProfile;
    await collectionVault.putShard(id,created.source.id,{id:'summary',kind:'records',sourceHash:created.source.hash,sourceRevision:created.source.revision,payload});
    const control=await collection.search(id,'zirconiumlegacy amount');
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pbgc-rag-case-vault',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const remove=payload.termShards.at(-1).chunkShardId;
    await new Promise((resolve,reject)=>{const tx=db.transaction('shards','readwrite');tx.objectStore('shards').delete([id,created.source.id,'chunks',remove]);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    let rejected;try{await collection.search(id,'zirconiumlegacy amount');}catch(error){rejected=error.message;}return{rejected,count:control.diagnostics.scannedChunks,expected:payload.chunks,shards:payload.termShards.length};
   });
   assert.ok(result.shards>1);assert.equal(result.count,result.expected);assert.match(result.rejected,/inventory|incomplete/i);
  });

  await t.test('an authenticated term index cannot use a stale topic normalization profile',async()=>{
   const result=await page.evaluate(async()=>{
    const id='term-normalization';await collectionVault.createCase({id,name:'Topic profile guard'});
    const [created]=await collection.importFiles(id,[new File(['Normal retirement age is 65.'],'plan.txt')]),info=await collection.summary(id,created.source.id),binding=info.termShards[0];
    const shard=await collectionVault.getShard(id,created.source.id,'terms',binding.id),payload=structuredClone(shard.payload);payload.normalizationProfile='obsolete-topics-v0';
    await collectionVault.putShard(id,created.source.id,{id:binding.id,kind:'terms',sourceHash:created.source.hash,sourceRevision:created.source.revision,payload});
    try{await collection.search(id,'retirement age');return'unexpected success';}catch(error){return error.message;}
   });
   assert.match(result,/inventory|profile|invalid/i);
  });

  await t.test('real native PDF headers and wrapped qualifications retain the complete supported answer',async()=>{
   const bytes=multiPagePdf(1,()=> 'BT /F1 12 Tf 72 720 Td (PLAN HEADER) Tj 0 -18 Td (1) Tj 0 -18 Td (Normal retirement age is) Tj 0 -18 Td (65) Tj 0 -18 Td (only if service is at least 10 years and the participant is vested.) Tj ET');
   const result=await page.evaluate(async bytes=>{
    const id='pdf-qualification';await collectionVault.createCase({id,name:'Native PDF complete qualification'});
    const imported=await collection.importFiles(id,[new File([new Uint8Array(bytes)],'qualified-plan.pdf')]);
    const model={id:'MOCK-native-PDF-grounding-not-model-quality',generate:async()=> 'S1'};
    return{imported:imported.map(s=>({status:s.status,error:s.error})),answer:await collection.answer(id,'What is the normal retirement age?',{model})};
   },bytes);
   assert.equal(result.imported[0].status,'imported',JSON.stringify(result.imported));assert.equal(result.answer.status,'answered',JSON.stringify(result.answer.diagnostics));
   assert.match(result.answer.answer,/65/);assert.match(result.answer.answer,/only if service is at least 10 years and the participant is vested/);
   assert.equal(result.answer.citations[0].hasUnverifiedTextLayer,true);assert.ok(result.answer.citations[0].locators.every(locator=>locator.type==='pdf-text-item'&&locator.page===1));
  });

  await t.test('source attribution remains explicit and a concurrent change during final original verification blocks release',async()=>{
   const result=await page.evaluate(async()=>{
    const id='answer-release-race';await collectionVault.createCase({id,name:'Synthetic answer release protocol'});
    await collection.importFiles(id,[new File(['Normal retirement age is 99.'],'single-statement.txt')]);
    let calls=0;const model={id:'MOCK-release-protocol-not-model-quality',generate:async()=>{calls++;return 'S1';}};
    const control=await collection.answer(id,'What is the normal retirement age?',{model});let changed=false,rejected;
    const concurrent=await PBGCRag.createCaseCollection({vault:{...collectionVault,getSource:async(...args)=>{const original=await collectionVault.getSource(...args);if(!changed){changed=true;await collection.importFiles(id,[new File(['Concurrent new source.'],'added-during-verification.txt')]);}return original;}}});
    try{await concurrent.answer(id,'What is the normal retirement age?',{model});}catch(error){rejected=error.message;}
    return{control,rejected,calls,changed};
   });
   assert.equal(result.control.status,'answered','the mock tests release orchestration, not factual truth');assert.equal(result.control.diagnostics.sourceSupport.singleSource,true);assert.equal(result.control.diagnostics.sourceSupport.citedDocumentCount,1);assert.match(result.control.diagnostics.sourceSupport.message,/Only one source is cited/);
   assert.equal(result.changed,true);assert.equal(result.calls,2);assert.match(result.rejected,/changed during source verification/);
  });

  if(process.env.PBGC_COLLECTION_EXTENDED==='1')await t.test('four real UTF-8 sources exceed both legacy five-MiB and twenty-MiB limits',async()=>{
   const result=await page.evaluate(async()=>{
    const id='above-legacy';await collectionVault.createCase({id,name:'Synthetic above-legacy volume'});let total=0,importMs=0;const statuses=[];
    for(let i=0;i<4;i++){const start=performance.now(),prefix=`Synthetic independent source ${i}.\n`,sentence='A synthetic plan provision retains a complete qualifying source sentence.\n',target=5*1024*1024+1024;let body=prefix+sentence.repeat(Math.floor((target-prefix.length-100)/sentence.length));body+='Source '+i+' has the sapphire'+i+' marker at the end.';const file=new File([body],'large-'+i+'.txt');total+=file.size;statuses.push(...await collection.importFiles(id,[file]));importMs+=performance.now()-start;}
    const manifest=await collectionVault.getCase(id),found=await collection.search(id,'sapphire3 marker');return{statuses:statuses.map(x=>({status:x.status,error:x.error,bytes:x.source?.bytes})),total,manifest,found,importMs};
   });
   assert.ok(result.total>20*1024*1024);assert.equal(result.manifest.originalBytes,result.total);assert.equal(result.statuses.length,4);assert.ok(result.statuses.every(s=>s.status==='imported'&&s.bytes>5*1024*1024),JSON.stringify(result.statuses));assert.ok(result.found.results.some(c=>c.text.includes('sapphire3')));t.diagnostic(JSON.stringify({profile,originalBytes:result.total,sourceCount:4,importMs:Math.round(result.importMs),scannedChunks:result.found.diagnostics.scannedChunks}));
  });
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({profile,externalRequests:external.length,largerThanLegacyVolume:process.env.PBGC_COLLECTION_EXTENDED==='1',oneGiBAcceptance:'NOT_ESTABLISHED_BY_THIS_SUITE'}));
 }finally{await context.close();await browser.close();}
});
