#!/usr/bin/env node
'use strict';
// Development acceptance only. The office app does not use Node or a server.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {monitorResources,DEFAULT_BUDGET}=require('./measure-resources.js');
const {startLoopbackServer}=require('./verify-browser.js');
const ROOT=path.resolve(__dirname,'..'),MiB=1024**2,GiB=1024**3;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function sourceText(index,bytes){
  if(!Number.isInteger(index)||index<0||!Number.isInteger(bytes)||bytes<4096||bytes>64*MiB)throw Error('Invalid synthetic source dimensions.');
  const tag='document'+String(index).padStart(4,'0'),markers=['opening','middle','closing'].map((location,n)=>({term:`benchmarkanchor${tag}${location}`,value:731+n+index,location}));
  let text='',paragraph=0;
  const appendMarker=marker=>{marker.offset=text.length;marker.line=text.split('\n').length;marker.text=`The ${marker.term} amount is ${marker.value} dollars.`;text+=marker.text+'\n';};
  const fill=end=>{while(text.length<end){
    const lead=`Synthetic plan ${tag}, archive paragraph ${String(paragraph++).padStart(6,'0')}. `;
    const prose=lead+'The administrator retains the signed plan instrument and each dated amendment in the source archive. Reviewers compare the effective date, participant group and benefit form before applying a provision. The administrative record contains correspondence, employment history, payment records and review notes. A document quotation supports the words shown in that document; it does not establish that the provision applies to every participant. An amendment can change one group while an earlier provision continues for another group. The source page remains available for review. The archive also records when material was received and whether a later document supersedes an earlier version. Document copies retain their own file names and source hashes. This paragraph is synthetic workload text, not an official plan rule.\n';
    text+=prose.slice(0,end-text.length);
  }};
  appendMarker(markers[0]);fill(Math.floor(bytes/2));text+='\n';appendMarker(markers[1]);
  const tail=`\nThe ${markers[2].term} amount is ${markers[2].value} dollars.\n`;
  fill(bytes-tail.length);text+='\n';appendMarker(markers[2]);
  assert.equal(Buffer.byteLength(text),bytes);
  return{text,markers};
}
async function generateCorpus(directory,{bytes=GiB,sourceBytes=4*MiB}={}){
  if(!Number.isSafeInteger(bytes)||bytes<sourceBytes||bytes>GiB||bytes%sourceBytes||!Number.isSafeInteger(sourceBytes)||sourceBytes<4096||sourceBytes>64*MiB||bytes/sourceBytes>2000)throw Error('Use an integral, bounded number of synthetic source files.');
  await fsp.mkdir(directory,{recursive:true});const files=[];
  for(let i=0;i<bytes/sourceBytes;i++){
    const name=`synthetic-plan-${String(i).padStart(4,'0')}.txt`,file=path.join(directory,name),generated=sourceText(i,sourceBytes);
    await fsp.writeFile(file,generated.text,{flag:'wx'});files.push({path:file,name,bytes:sourceBytes,hash:digest(generated.text),markers:generated.markers});
  }
  return{bytes,sourceBytes,sourceCount:files.length,files};
}
function profileFingerprint(){const names=['assets/case-vault.js','assets/case-collection.js','assets/case-archive.js','assets/chunking.js','assets/rag.js','assets/core.js','tools/measure-large-case.js'];return Object.fromEntries(names.map(name=>[name,digest(fs.readFileSync(path.join(ROOT,name)))]));}

async function runLargeCaseBenchmark(options={}){
  const bytes=options.bytes??GiB,profile=options.profile??'file',sourceBytes=options.sourceBytes??4*MiB,timeoutMs=options.timeoutMs??3_600_000;
  if(!['http','file'].includes(profile)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>7_200_000)throw Error('Invalid benchmark profile or timeout.');
  const started=Date.now(),stage=(name,detail={})=>{options.onStage?.(name,detail);};
  const report={schemaVersion:1,kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',startedAt:new Date().toISOString(),profile:profile==='file'?'actual offline file://':'supplementary HTTP only',
    commit:spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),trackedSourceDirty:!!spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),runtimeSha256:profileFingerprint(),
    workload:{sourceBytes:bytes,sourceFileBytes:sourceBytes,sourceCount:bytes/sourceBytes,synthetic:true,content:'UTF-8 multi-paragraph plan/archive prose with distinct source/paragraph IDs and three factual markers per source. No sparse files, binary padding or blank filler.',retrieval:'Full-case authenticated lexical passage scan. No global dense index or model-quality claim.'},
    scope:'Import actual browser Files through the collection parser/chunker and IndexedDB vault; cancel/rollback; close/reopen the database and page; search across the whole case; export and parse an original-file ZIP; verify all backup original hashes and reparse first/middle/last sources. Model loading, learned reranking, PDF/OCR and a full second-copy restore are separate tests.',
    budgets:{workloadMemoryBytes:DEFAULT_BUDGET,totalTimeMs:timeoutMs,sampleIntervalMs:500},hardware:{platform:process.platform,release:os.release(),cpus:os.cpus().length,totalMemoryBytes:os.totalmem()},stagesMs:{},quality:{},errors:[]};
  let temporary,corpus,loopback,server,browser,context,page,monitor,deadline,limitError,progressCount=0;
  const stop=error=>{if(!limitError)limitError=error;server?.kill().catch(()=>{});};
  try{
    temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'pbgc-large-case-'));
    monitor=await monitorResources({intervalMs:500,budgetBytes:DEFAULT_BUDGET,onLimit:stop});
    deadline=setTimeout(()=>stop(Error('Large-case benchmark exceeded its total time budget.')),timeoutMs);
    stage('generate-corpus');let at=Date.now();corpus=await generateCorpus(path.join(temporary,'corpus'),{bytes,sourceBytes});report.stagesMs.generateCorpus=Date.now()-at;
    if(limitError)throw limitError;
    const target=profile==='http'?(process.env.PBGC_TEST_URL||(loopback=await startLoopbackServer(ROOT)).url):pathToFileURL(path.join(ROOT,'index.html')).href;
    const {chromium}=require('playwright');stage('browser-entry');at=Date.now();server=await chromium.launchServer({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});monitor.setBrowserPid(server.process().pid);
    browser=await chromium.connect(server.wsEndpoint());context=await browser.newContext({acceptDownloads:true});if(profile==='file')await context.setOffline(true);
    const external=[];context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(profile!=='http'||!url.startsWith(new URL(target).origin+'/')))external.push(url);});
    await context.route(/^(?:https?|wss?):\/\//,route=>profile==='http'&&route.request().url().startsWith(new URL(target).origin+'/')?route.continue():route.abort());
    page=await context.newPage();await page.exposeFunction('__largeProgress',event=>{if(event.phase==='source'||++progressCount%50===0)stage('import-progress',event);});await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.createCaseCollection==='function');
    async function initialize(){await page.evaluate(async()=>{
      globalThis.__largeVault=await PBGCRag.createCaseVault();globalThis.__largeCollection=await PBGCRag.createCaseCollection({vault:__largeVault});
      globalThis.__largeHeartbeat={count:0,maxGapMs:0,last:performance.now()};globalThis.__largeTimer=setInterval(()=>{const now=performance.now();__largeHeartbeat.count++;__largeHeartbeat.maxGapMs=Math.max(__largeHeartbeat.maxGapMs,now-__largeHeartbeat.last);__largeHeartbeat.last=now;},50);
      const input=document.createElement('input');input.type='file';input.multiple=true;input.id='large-benchmark-files';document.body.append(input);
    });}
    await initialize();report.stagesMs.browserEntry=Date.now()-at;
    await page.locator('#large-benchmark-files').setInputFiles(corpus.files.map(file=>file.path));
    stage('cancel-and-rollback');at=Date.now();report.quality.cancellation=await page.evaluate(async()=>{
      await __largeVault.createCase({id:'cancelcase',name:'Synthetic cancellation'});const original=document.getElementById('large-benchmark-files').files[0],prefix='Cancellation only.\n',file=new File([prefix,original.slice(prefix.length)],original.name),controller=new AbortController();let rejected;
      try{await __largeCollection.importFiles('cancelcase',[file],{signal:controller.signal,onProgress:event=>{if(event.phase==='indexing')controller.abort();}});}catch(error){rejected=error.name;}
      const after=await __largeVault.getCase('cancelcase');await __largeVault.deleteCase('cancelcase');return{rejected,sourceCount:after.sourceCount,originalBytes:after.originalBytes,derivedBytes:after.derivedBytes};
    });assert.deepEqual(report.quality.cancellation,{rejected:'AbortError',sourceCount:0,originalBytes:0,derivedBytes:0});report.stagesMs.cancelAndRollback=Date.now()-at;
    stage('import');at=Date.now();const imported=await page.evaluate(async()=>{
      await __largeVault.createCase({id:'scalecase',name:'Synthetic large-scale case'});const results=await __largeCollection.importFiles('scalecase',document.getElementById('large-benchmark-files').files,{onProgress:event=>__largeProgress(event)});
      return{results:results.map(result=>({name:result.name,status:result.status,error:result.error,hash:result.source?.hash,chunks:result.summary?.chunks,records:result.summary?.records})),manifest:await __largeVault.getCase('scalecase'),heartbeat:__largeHeartbeat};
    });report.stagesMs.import=Date.now()-at;report.quality.import=imported;
    assert.equal(imported.results.filter(item=>item.status==='imported').length,corpus.sourceCount,JSON.stringify(imported.results.filter(item=>item.status!=='imported')));assert.equal(imported.manifest.sourceCount,corpus.sourceCount);assert.equal(imported.manifest.originalBytes,bytes);
    for(const file of corpus.files)assert.equal(imported.results.find(item=>item.name===file.name)?.hash,file.hash);
    report.workload.indexedChunks=imported.results.reduce((sum,item)=>sum+item.chunks,0);report.workload.records=imported.results.reduce((sum,item)=>sum+item.records,0);report.workload.derivedBytes=imported.manifest.derivedBytes;report.workload.derivedToOriginalRatio=imported.manifest.derivedBytes/bytes;
    stage('reopen');at=Date.now();await page.evaluate(()=>{clearInterval(__largeTimer);__largeVault.close();});await page.reload();await page.waitForFunction(()=>typeof PBGCRag?.createCaseCollection==='function');await initialize();
    report.quality.reopen=await page.evaluate(async()=>({manifest:await __largeVault.getCase('scalecase'),sources:await __largeCollection.sources('scalecase')}));assert.equal(report.quality.reopen.sources.length,corpus.sourceCount);assert.equal(report.quality.reopen.manifest.originalBytes,bytes);report.stagesMs.reopen=Date.now()-at;
    const chosen=[0,Math.floor(corpus.sourceCount/2),corpus.sourceCount-1],markers=chosen.map((index,n)=>({...corpus.files[index].markers[n],hash:corpus.files[index].hash,name:corpus.files[index].name}));
    stage('search-all-case');at=Date.now();report.quality.search=[];
    for(const marker of markers){const queried=Date.now(),result=await page.evaluate(async term=>{const found=await __largeCollection.search('scalecase',term);return{diagnostics:found.diagnostics,matches:found.results.map(chunk=>({name:chunk.sourceName,hash:chunk.sourceHash,text:chunk.text,locators:chunk.locators}))};},marker.term);
      const matched=result.matches.find(chunk=>chunk.hash===marker.hash&&chunk.text.includes(marker.text));
      assert.ok(matched,'Full-case search did not recover marker '+marker.term);
      const locator=matched.locators.find(item=>item.type==='text-line'&&item.offset===marker.offset&&item.line===marker.line);
      assert.ok(locator,'Full-case search changed the original marker line or UTF-16 offset for '+marker.term);
      assert.equal(result.diagnostics.scannedChunks,report.workload.indexedChunks);report.quality.search.push({marker:marker.term,position:marker.location,source:marker.name,expectedOffset:marker.offset,expectedLine:marker.line,verifiedLocator:locator,ms:Date.now()-queried,diagnostics:result.diagnostics});}
    report.stagesMs.threeFullCaseSearches=Date.now()-at;
    stage('search-selected-source');at=Date.now();const scopedMarker=markers.at(-1),scopedSource=report.quality.reopen.sources.find(source=>source.name===scopedMarker.name);
    report.quality.scopedSearch=await page.evaluate(async({question,sourceId})=>{const found=await __largeCollection.search('scalecase',question,{sourceIds:[sourceId]});return{diagnostics:found.diagnostics,results:found.results.map(chunk=>({sourceId:chunk.sourceId,hash:chunk.sourceHash,text:chunk.text}))};},{question:scopedMarker.term,sourceId:scopedSource.id});
    assert.ok(report.quality.scopedSearch.results.some(chunk=>chunk.hash===scopedMarker.hash&&chunk.text.includes(scopedMarker.text)));
    assert.ok(report.quality.scopedSearch.results.every(chunk=>chunk.sourceId===scopedSource.id));
    assert.equal(report.quality.scopedSearch.diagnostics.scannedChunks,imported.results.find(item=>item.name===scopedMarker.name).chunks);
    report.stagesMs.selectedSourceSearch=Date.now()-at;
    stage('backup-and-parse');at=Date.now();report.quality.backup=await page.evaluate(async expected=>{
      const backup=await PBGCRag.createCaseCollectionArchive(__largeVault,'scalecase'),parsed=await PBGCRag.parseCaseCollectionArchive(backup),hashes=[];
      for(const entry of parsed.entries){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await entry.file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');hashes.push({name:entry.file.name,hash,bytes:entry.file.size});}
      await __largeVault.createCase({id:'restoredsamples',name:'Synthetic backup samples'});const samples=[0,Math.floor(parsed.entries.length/2),parsed.entries.length-1],restored=[];
      for(const index of samples){const entry=parsed.entries[index],result=await __largeCollection.importFiles('restoredsamples',[entry.file],{expectedHash:entry.source.hash,headerRow:entry.source.headerRow});restored.push(...result.map(item=>({name:item.name,status:item.status,error:item.error,hash:item.source?.hash})));}
      const heartbeat=__largeHeartbeat;await __largeVault.deleteCase('restoredsamples');return{archiveBytes:backup.size,manifest:parsed.manifest,hashes,restored,heartbeat,expected};
    },{bytes,sourceCount:corpus.sourceCount});
    assert.equal(report.quality.backup.manifest.originalBytes,bytes);assert.equal(report.quality.backup.hashes.length,corpus.sourceCount);for(const file of corpus.files)assert.equal(report.quality.backup.hashes.find(item=>item.name===file.name)?.hash,file.hash);
    assert.equal(report.quality.backup.restored.length,chosen.length,'Every selected backup sample must be reparsed.');
    for(let i=0;i<chosen.length;i++){const restored=report.quality.backup.restored[i],expected=corpus.files[chosen[i]];assert.equal(restored.status,'imported');assert.equal(restored.name,expected.name);assert.equal(restored.hash,expected.hash);}
    report.stagesMs.backupParseAndSampleReparse=Date.now()-at;
    report.quality.externalRequests=external.length;assert.equal(external.length,0);if(limitError)throw limitError;report.status='PASS';
  }catch(error){report.status=/ERR_BLOCKED_BY_ADMINISTRATOR/.test(String(error.message))?'BLOCKED':'FAIL';report.errors.push(String(limitError?.message||error.message||error).slice(0,2000));}
  finally{
    if(page)await page.evaluate(async()=>{clearInterval(globalThis.__largeTimer);globalThis.__largeVault?.close();}).catch(()=>{});if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(server)await server.close().catch(()=>{});if(loopback)await loopback.close();if(monitor)report.resources=await monitor.stop();if(deadline)clearTimeout(deadline);if(temporary)await fsp.rm(temporary,{recursive:true,force:true});
    report.totalMs=Date.now()-started;report.finishedAt=new Date().toISOString();
    report.runtimeSha256After=profileFingerprint();report.runtimeUnchanged=JSON.stringify(report.runtimeSha256)===JSON.stringify(report.runtimeSha256After);
    if(!report.runtimeUnchanged){report.status='FAIL';report.errors.push('Benchmark code or runtime files changed during the measurement. Repeat against a stable source snapshot.');}
    if(report.status!=='BLOCKED'&&(!report.resources||report.resources.samples<2||report.resources.errors.length||report.resources.exceeded)){report.status='FAIL';report.errors.push('Whole-process measurements unavailable, incomplete or above budget.');}
    if(options.out){await fsp.mkdir(path.dirname(options.out),{recursive:true});await fsp.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
  }
  return report;
}
async function main(argv=process.argv.slice(2)){
  const options={profile:'file',bytes:GiB,out:path.join(ROOT,'test-results','large-case-file.json'),onStage:(stage,details)=>process.stdout.write(JSON.stringify({stage,...details})+'\n')};
  for(let i=0;i<argv.length;i++){if(argv[i]==='--http')options.profile='http';else if(argv[i]==='--file')options.profile='file';else if(argv[i]==='--mib')options.bytes=Number(argv[++i])*MiB;else if(argv[i]==='--source-mib')options.sourceBytes=Number(argv[++i])*MiB;else if(argv[i]==='--timeout-ms')options.timeoutMs=Number(argv[++i]);else if(argv[i]==='--out')options.out=path.resolve(argv[++i]);else if(argv[i]==='--help'){process.stdout.write('Usage: node tools/measure-large-case.js [--file|--http] [--mib 1024] [--source-mib 4] [--timeout-ms 3600000] [--out report.json]\nActual Files, parsers, workers, IndexedDB and full-case search. HTTP checks are supplementary. No model-quality claim.\n');return 0;}else throw Error('Unknown option: '+argv[i]);}
  const report=await runLargeCaseBenchmark(options);process.stdout.write(JSON.stringify({status:report.status,sourceBytes:report.workload.sourceBytes,totalMs:report.totalMs,stagesMs:report.stagesMs,peak:report.resources?.peak,errors:report.errors})+'\n');return report.status==='PASS'?0:report.status==='BLOCKED'?2:1;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={sourceText,generateCorpus,runLargeCaseBenchmark};
