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
function profileFingerprint(){
  const names=['index.html','tools/measure-large-case.js','tools/measure-resources.js'];
  function visit(directory){for(const entry of fs.readdirSync(path.join(ROOT,directory),{withFileTypes:true})){if(entry.isSymbolicLink())continue;const name=directory+'/'+entry.name;if(entry.isDirectory())visit(name);else if(entry.isFile()&&/\.(?:js|json|css|wasm)$/.test(entry.name))names.push(name);}}
  visit('assets');visit('vendor');
  return Object.fromEntries(names.sort().map(name=>[name,digest(fs.readFileSync(path.join(ROOT,name)))]));
}
function backupSamples(files){
  assert.ok(Array.isArray(files)&&files.length,'A benchmark corpus must contain originals.');
  assert.equal(new Set(files.map(file=>file.name)).size,files.length,'Benchmark original names must be unique.');
  const indices=[...new Set([0,Math.floor(files.length/2),files.length-1])];
  return indices.map(index=>({name:files[index].name,hash:files[index].hash,bytes:files[index].bytes}));
}
function failureDetails(error,stage){
  const message=String(error?.message||error),reason=
    /ERR_BLOCKED_BY_ADMINISTRATOR/.test(message)?'BROWSER_ADMIN_POLICY':
    /quota|storage.*full|no space left|disk.*full|browser has no room|insufficient (?:storage|space)|not enough (?:storage|space)/i.test(message)?'STORAGE_QUOTA':
    /metadata.*(?:complex|budget)|node budget|serialized.*budget/i.test(message)?'DERIVED_METADATA_BUDGET':
    /IndexedDB|HMAC|WebCrypto|SHA-256.*unavailable|signing key/i.test(message)?'STORAGE_OR_CRYPTO_CAPABILITY':
    /selected backup original|archive UUID order|selected distinct backup original/i.test(message)?'BACKUP_SAMPLE_IDENTITY':
    /source.*(?:changed|revision)|case changed|stale.*(?:source|case)/i.test(message)?'STALE_SOURCE_OR_CASE':
    /hash|SHA-256|integrity/i.test(message)?'SOURCE_OR_CACHE_INTEGRITY':
    /exceeded.*(?:time|memory)|time budget|timeout|timed out/i.test(message)?'TIME_OR_MEMORY_BUDGET':
    /target.*closed|browser.*closed|crash/i.test(message)?'BROWSER_PROCESS_CLOSED':
    /limit|budget/i.test(message)?'INPUT_OR_CACHE_BUDGET':
    error?.code==='ERR_ASSERTION'?'BENCHMARK_ASSERTION':'UNCLASSIFIED';
  const names=['Error','AssertionError','TypeError','RangeError','TimeoutError','AbortError','CaseVaultError','DOMException'];
  const codes=['ERR_ASSERTION','INTEGRITY','CONFLICT','INVALID_INPUT','UNAVAILABLE','QUOTA','SIZE_LIMIT','TIMEOUT','ABORTED'];
  const value=input=>typeof input==='number'&&Number.isFinite(input)?input:typeof input==='string'&&/^synthetic-plan-[0-9]{4}\.txt$/.test(input)?input:null;
  const location=/tools[\\/]measure-large-case\.js:(\d+):(\d+)/.exec(String(error?.stack||''));
  return{reason,name:names.includes(error?.name)?error.name:'unknown',code:codes.includes(error?.code)?error.code:null,stage,
    assertion:error?.code==='ERR_ASSERTION'?{operator:['strictEqual','deepStrictEqual','==','!=','===','!==','match','doesNotMatch'].includes(error.operator)?error.operator:'unknown',actual:value(error.actual),expected:value(error.expected)}:null,
    location:location?{file:'tools/measure-large-case.js',line:Number(location[1]),column:Number(location[2])}:null};
}
function verifyRestoredSamples(restored,expected){
  assert.equal(restored.length,expected.length,'Every selected distinct backup original must be reparsed.');
  for(let index=0;index<expected.length;index++){
    assert.equal(restored[index].status,'imported');
    assert.equal(restored[index].name,expected[index].name,'Backup samples must follow the selected original names, not archive UUID order.');
    assert.equal(restored[index].hash,expected[index].hash,'Each reparsed sample must retain its original SHA-256.');
  }
}
function verifyOriginalBindings(actual,expected,{requireStatus=false,requireStoredHash=false}={}){
  assert.equal(actual.length,expected.length,'Every backup original must retain its independent binding.');
  assert.equal(new Set(actual.map(item=>item.name)).size,expected.length,'Backup original names must remain unique.');
  for(const source of expected){
    const restored=actual.find(item=>item.name===source.name);assert.ok(restored,'A backup original name is missing.');
    if(requireStatus)assert.equal(restored.status,'imported','Every backup original must be reparsed successfully.');
    assert.equal(restored.hash,source.hash,'Every backup original must retain its independent SHA-256.');
    if(requireStoredHash)assert.equal(restored.storedHash,source.hash,'Stored restored bytes must retain their independent SHA-256.');
    assert.equal(restored.bytes,source.bytes,'Every backup original must retain its independent byte count.');
    assert.equal(restored.headerRow??null,source.headerRow??null,'Every backup original must retain its column-name row binding.');
    assert.deepEqual(restored.tableHeaders??[],source.tableHeaders??[],'Every backup original must retain its table column-name bindings.');
    if(requireStatus)assert.equal(restored.ready,true,'Every restored original must have a complete rebuilt passage index.');
  }
}
function verifyFullRestore(restored,expected){
  verifyOriginalBindings(restored.results,expected,{requireStatus:true,requireStoredHash:true});
  verifyOriginalBindings(restored.sources,expected);
  assert.equal(restored.manifest.sourceCount,expected.length,'The restored case must contain every original.');
  assert.equal(restored.manifest.originalBytes,expected.reduce((total,item)=>total+item.bytes,0),'The restored case must retain every original byte.');
}

async function diskSnapshot(directory){
  try{const stats=await fsp.statfs(directory,{bigint:true}),bytes=value=>{const result=value*stats.bsize;return result>=0n&&result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null;};return{available:true,totalBytes:bytes(stats.blocks),availableBytes:bytes(stats.bavail),freeBytes:bytes(stats.bfree)};}
  catch(error){return{available:false,errorCode:['ENOENT','ENOSYS','ENOTSUP','EACCES','EPERM','EIO'].includes(error?.code)?error.code:'unknown'};}
}
async function storageSnapshot(page){
  if(!page||page.isClosed())return{available:false,reason:'BROWSER_CLOSED'};
  try{return await page.evaluate(async()=>{
    if(typeof navigator.storage?.estimate!=='function')return{available:false,reason:'API_UNAVAILABLE'};
    try{const estimate=await navigator.storage.estimate(),count=value=>Number.isSafeInteger(value)&&value>=0?value:null;let persisted=null;if(typeof navigator.storage.persisted==='function')try{persisted=await navigator.storage.persisted();}catch(_){}
      return{available:true,usageBytes:count(estimate.usage),quotaBytes:count(estimate.quota),indexedDBBytes:count(estimate.usageDetails?.indexedDB),persisted:typeof persisted==='boolean'?persisted:null};
    }catch(error){return{available:false,reason:['SecurityError','InvalidStateError','UnknownError','TypeError'].includes(error?.name)?error.name:'unknown'};}
  });}catch(_){return{available:false,reason:'BROWSER_CLOSED'};}
}
function importFailureCounts(results){
  const counts={};for(const result of Array.isArray(results)?results:[]){if(result?.status!=='rejected')continue;const reason=failureDetails({message:result.error},'import').reason;counts[reason]=(counts[reason]||0)+1;}return counts;
}

async function runLargeCaseBenchmark(options={}){
  const bytes=options.bytes??GiB,profile=options.profile??'file',sourceBytes=options.sourceBytes??4*MiB,timeoutMs=options.timeoutMs??3_600_000,withModel=options.requireModel===true||options.withModel===true,fullRestore=options.fullRestore===true;
  if(!['http','file'].includes(profile)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>7_200_000)throw Error('Invalid benchmark profile or timeout.');
  for(const key of ['requireModel','withModel'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error('The real-model benchmark flag must be boolean.');
  if(options.fullRestore!==undefined&&typeof options.fullRestore!=='boolean')throw Error('The full-restore benchmark flag must be boolean.');
  let currentStage='initialization';
  const started=Date.now(),stage=(name,detail={})=>{if(name!=='import-progress')currentStage=name;options.onStage?.(name,detail);};
  const report={schemaVersion:1,kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',browserMode:'persistent-normal-profile',startedAt:new Date().toISOString(),profile:profile==='file'?'actual offline file://':'supplementary HTTP only',
    commit:spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),trackedSourceDirty:!!spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),runtimeSha256:profileFingerprint(withModel),
    workload:{sourceBytes:bytes,sourceFileBytes:sourceBytes,sourceCount:bytes/sourceBytes,synthetic:true,realModelRequired:withModel,fullRestoreRequired:fullRestore,content:'UTF-8 multi-paragraph plan/archive prose with distinct source/paragraph IDs and three factual markers per source. No sparse files, binary padding or blank filler.',retrieval:'Full-case authenticated lexical candidates. No global dense index.'},
    scope:'Import actual browser Files through the collection parser/chunker and IndexedDB vault; cancel/rollback; close the entire browser and reopen the same persistent profile; search across the whole case; export and parse an original-file ZIP; verify all backup original hashes. '+(fullRestore?'Reparse every archive original into a second case while retaining the first, verify all stored bytes and header bindings, search opening/middle/closing markers with exact locators, then delete the restored case. ':'Reparse first/middle/last distinct sources; a full second-copy restore is a separate test. ')+(withModel?'Pinned single-thread CPU Qwen and the real local encoder must answer one source-bound synthetic opening fact. This is an integration test, not general answer-quality evidence. ':'No model is loaded; model generation and learned reranking are separate tests. ')+'PDF/OCR is a separate test.',
    budgets:{workloadMemoryBytes:DEFAULT_BUDGET,totalTimeMs:timeoutMs,sampleIntervalMs:500},hardware:{platform:process.platform,release:os.release(),cpus:os.cpus().length,totalMemoryBytes:os.totalmem()},stagesMs:{},quality:{},errors:[]};
  let temporary,corpus,loopback,browser,context,page,monitor,deadline,limitError,progressCount=0;const external=[];
  const stop=error=>{if(!limitError)limitError=error;context?.close().catch(()=>{});browser?.close().catch(()=>{});};
  try{
    temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'pbgc-large-case-'));report.hostDisk={atStart:await diskSnapshot(temporary)};report.storage={};report.quality.browserPids=[];
    const manifest=withModel?JSON.parse(await fsp.readFile(path.join(ROOT,'vendor/local-llm/bundled.manifest.json'),'utf8')):null;
    const modelPath=withModel?(options.modelPath||process.env.PBGC_MODEL_PATH||path.join(ROOT,'dist/models',manifest.files[0].name)):null;
    if(withModel&&!fs.existsSync(modelPath))throw Error('Required pinned local Qwen model is absent.');
    monitor=await monitorResources({intervalMs:500,budgetBytes:DEFAULT_BUDGET,onLimit:stop});
    deadline=setTimeout(()=>stop(Error('Large-case benchmark exceeded its total time budget.')),timeoutMs);
    stage('generate-corpus');let at=Date.now();corpus=await generateCorpus(path.join(temporary,'corpus'),{bytes,sourceBytes});report.stagesMs.generateCorpus=Date.now()-at;
    if(limitError)throw limitError;
    const target=profile==='http'?(process.env.PBGC_TEST_URL||(loopback=await startLoopbackServer(ROOT)).url):pathToFileURL(path.join(ROOT,'index.html')).href;
    const {chromium}=require('playwright'),userDataDir=path.join(temporary,'browser-profile');
    async function openBrowser(){
      // A normal persistent profile models office use. No quota overrides or
      // unlimited-storage flags are permitted by this benchmark.
      context=await chromium.launchPersistentContext(userDataDir,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],acceptDownloads:true});browser=context.browser();
      if(limitError){await context.close();throw limitError;}
      const session=await browser.newBrowserCDPSession();try{const info=await session.send('SystemInfo.getProcessInfo'),pid=Number(info.processInfo.find(process=>process.type==='browser')?.id);assert.ok(Number.isSafeInteger(pid)&&pid>0,'The persistent browser PID must be measurable.');monitor.setBrowserPid(pid);report.quality.browserPids.push(pid);}finally{await session.detach();}
      if(profile==='file')await context.setOffline(true);
      context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(profile!=='http'||!url.startsWith(new URL(target).origin+'/')))external.push(url);});
      await context.route(/^(?:https?|wss?):\/\//,route=>profile==='http'&&route.request().url().startsWith(new URL(target).origin+'/')?route.continue():route.abort());
      page=context.pages()[0]||await context.newPage();await page.exposeFunction('__largeProgress',event=>{if(event.phase==='source'||++progressCount%50===0)stage('import-progress',event);});await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.createCaseCollection==='function');
    }
    stage('browser-entry');at=Date.now();await openBrowser();
    async function initialize(){await page.evaluate(async()=>{
      globalThis.__largeVault=await PBGCRag.createCaseVault();globalThis.__largeCollection=await PBGCRag.createCaseCollection({vault:__largeVault});
      globalThis.__largeWorkloadAbort=new AbortController();
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
    report.storage.beforeImport=await storageSnapshot(page);report.hostDisk.beforeImport=await diskSnapshot(temporary);
    stage('import');at=Date.now();const imported=await page.evaluate(async()=>{
      await __largeVault.createCase({id:'scalecase',name:'Synthetic large-scale case'});const results=await __largeCollection.importFiles('scalecase',document.getElementById('large-benchmark-files').files,{onProgress:event=>__largeProgress(event)});
      return{results:results.map(result=>({name:result.name,status:result.status,error:result.error,hash:result.source?.hash,chunks:result.summary?.chunks,records:result.summary?.records,termShards:result.summary?.termShards?.length})),manifest:await __largeVault.getCase('scalecase'),heartbeat:__largeHeartbeat};
    });report.stagesMs.import=Date.now()-at;report.quality.import=imported;report.quality.import.failureCounts=importFailureCounts(imported.results);const firstRejected=imported.results.findIndex(result=>result.status==='rejected');if(firstRejected!==-1){const rejected=imported.results[firstRejected],reason=failureDetails({message:rejected.error},'import').reason;report.quality.import.firstFailure={sourceIndex:firstRejected,sourceName:/^synthetic-plan-[0-9]{4}\.txt$/.test(rejected.name)?rejected.name:null,reason,messageClassifiedCode:reason==='STORAGE_QUOTA'?'QUOTA':null};}report.storage.afterImport=await storageSnapshot(page);report.hostDisk.afterImport=await diskSnapshot(temporary);
    assert.equal(imported.results.filter(item=>item.status==='imported').length,corpus.sourceCount,JSON.stringify(imported.results.filter(item=>item.status!=='imported')));assert.equal(imported.manifest.sourceCount,corpus.sourceCount);assert.equal(imported.manifest.originalBytes,bytes);
    for(const file of corpus.files)assert.equal(imported.results.find(item=>item.name===file.name)?.hash,file.hash);
    report.workload.indexedChunks=imported.results.reduce((sum,item)=>sum+item.chunks,0);report.workload.termShards=imported.results.reduce((sum,item)=>sum+(item.termShards||0),0);report.workload.records=imported.results.reduce((sum,item)=>sum+item.records,0);report.workload.derivedBytes=imported.manifest.derivedBytes;report.workload.derivedToOriginalRatio=imported.manifest.derivedBytes/bytes;
    stage('reopen');at=Date.now();await page.evaluate(()=>{clearInterval(__largeTimer);__largeVault.close();});await context.close();context=null;browser=null;page=null;await openBrowser();await initialize();assert.equal(report.quality.browserPids.length,2);assert.notEqual(report.quality.browserPids[0],report.quality.browserPids[1],'The whole browser must restart before persistence acceptance.');report.quality.fullBrowserRestart=true;report.storage.afterBrowserRestart=await storageSnapshot(page);
    report.quality.reopen=await page.evaluate(async()=>({manifest:await __largeVault.getCase('scalecase'),sources:await __largeCollection.sources('scalecase')}));assert.equal(report.quality.reopen.sources.length,corpus.sourceCount);assert.equal(report.quality.reopen.manifest.originalBytes,bytes);report.stagesMs.reopen=Date.now()-at;
    const chosen=[0,Math.floor(corpus.sourceCount/2),corpus.sourceCount-1],markers=chosen.map((index,n)=>({...corpus.files[index].markers[n],hash:corpus.files[index].hash,name:corpus.files[index].name}));
    stage('search-all-case');at=Date.now();report.quality.search=[];
    for(const marker of markers){const queried=Date.now(),result=await page.evaluate(async term=>{const found=await __largeCollection.search('scalecase',term);return{diagnostics:found.diagnostics,matches:found.results.map(chunk=>({name:chunk.sourceName,hash:chunk.sourceHash,text:chunk.text,locators:chunk.locators}))};},marker.term);
      const matched=result.matches.find(chunk=>chunk.hash===marker.hash&&chunk.text.includes(marker.text));
      assert.ok(matched,'Full-case search did not recover marker '+marker.term);
      const locator=matched.locators.find(item=>item.type==='text-line'&&item.offset===marker.offset&&item.line===marker.line);
      assert.ok(locator,'Full-case search changed the original marker line or UTF-16 offset for '+marker.term);
      assert.equal(result.diagnostics.scannedChunks,report.workload.indexedChunks);assert.equal(result.diagnostics.candidateIndex,'authenticated-exact-term-postings','Fresh cases must use the authenticated compact index.');assert.ok(result.diagnostics.loadedPassageShards>0,'A verified result must load its original passage shard.');if(report.workload.termShards>1)assert.ok(result.diagnostics.loadedPassageShards<report.workload.termShards,'A unique factual query must not reload every full passage shard.');report.quality.search.push({marker:marker.term,position:marker.location,source:marker.name,expectedOffset:marker.offset,expectedLine:marker.line,verifiedLocator:locator,ms:Date.now()-queried,diagnostics:result.diagnostics});}
    report.stagesMs.threeFullCaseSearches=Date.now()-at;
    stage('search-selected-source');at=Date.now();const scopedMarker=markers.at(-1),scopedSource=report.quality.reopen.sources.find(source=>source.name===scopedMarker.name);
    report.quality.scopedSearch=await page.evaluate(async({question,sourceId})=>{const found=await __largeCollection.search('scalecase',question,{sourceIds:[sourceId]});return{diagnostics:found.diagnostics,results:found.results.map(chunk=>({sourceId:chunk.sourceId,hash:chunk.sourceHash,text:chunk.text}))};},{question:scopedMarker.term,sourceId:scopedSource.id});
    assert.ok(report.quality.scopedSearch.results.some(chunk=>chunk.hash===scopedMarker.hash&&chunk.text.includes(scopedMarker.text)));
    assert.ok(report.quality.scopedSearch.results.every(chunk=>chunk.sourceId===scopedSource.id));
    assert.equal(report.quality.scopedSearch.diagnostics.scannedChunks,imported.results.find(item=>item.name===scopedMarker.name).chunks);
    report.stagesMs.selectedSourceSearch=Date.now()-at;
    if(withModel){
      stage('model-file-selection');at=Date.now();await page.addScriptTag({url:new URL('vendor/local-llm/wllama-classic.js',target).href});
      await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='large-benchmark-model';document.body.append(input);globalThis.__largeModelAbort=new AbortController();});
      await page.locator('#large-benchmark-model').setInputFiles(modelPath);
      report.stagesMs.modelFileSelection=Date.now()-at;stage('model-hash-and-load');at=Date.now();
      report.model=await page.evaluate(async manifest=>{globalThis.__largeModel=await PBGCRag.createLocalLlmProvider({files:document.getElementById('large-benchmark-model').files,manifest,signal:__largeModelAbort.signal,contextSize:2048,timeoutMs:120000});return __largeModel.info();},manifest);
      assert.equal(report.model.sha256,manifest.files[0].sha256);assert.equal(report.model.modelBytes,manifest.files[0].bytes);assert.equal(report.model.cpuOnly,true);assert.equal(report.model.threads,1);report.stagesMs.modelHashAndLoad=Date.now()-at;
      stage('embedding-load');at=Date.now();await page.evaluate(async()=>{globalThis.__largeEmbedding=await PBGCRag.createEmbeddingProvider({signal:__largeModelAbort.signal});});report.stagesMs.embeddingLoad=Date.now()-at;
      stage('real-qwen-answer');at=Date.now();const opening=corpus.files[0].markers[0];
      report.quality.answer=await page.evaluate(async question=>{
        const calls=[],observed={id:__largeModel.id,generate:async request=>{const started=performance.now(),call={promptCharacters:request.prompt?.length,outputTokenBudget:request.maxTokens,responseFormat:request.responseFormat,firstTokenMs:null,emittedCharacters:0};calls.push(call);try{const raw=await __largeModel.generate({...request,onToken:piece=>{if(call.firstTokenMs===null)call.firstTokenMs=performance.now()-started;call.emittedCharacters+=piece.length;request.onToken?.(piece);}});call.returnedCharacters=raw.length;return raw;}catch(error){call.errorName=error.name;call.errorCode=error.code;throw error;}finally{call.elapsedMs=performance.now()-started;}}};
        const answer=await __largeCollection.answer('scalecase',question,{model:observed,embedding:__largeEmbedding,signal:__largeModelAbort.signal});return{status:answer.status,answer:answer.answer,citations:answer.citations,calls,sourceSupport:answer.diagnostics?.sourceSupport,reason:answer.diagnostics?.reason,search:answer.diagnostics?.collectionSearch};
      },`What is the ${opening.term} amount?`);
      assert.equal(report.quality.answer.status,'answered','Real Qwen must release a grounded answer in model-required mode.');assert.ok(new RegExp('\\b'+opening.value+'\\b').test(report.quality.answer.answer),'Real Qwen must answer the independently known amount.');
      assert.ok(report.quality.answer.calls.length>0,'Model-required acceptance must invoke the real provider.');
      assert.ok(report.quality.answer.citations.some(citation=>citation.sourceHash===corpus.files[0].hash&&citation.excerpt.includes(opening.text)&&citation.locators.some(locator=>locator.type==='text-line'&&locator.line===opening.line&&locator.offset===opening.offset)),'The real answer must bind to the exact original source and opening locator.');
      assert.equal(report.quality.answer.sourceSupport?.singleSource,true);report.stagesMs.realQwenAnswerAndGrounding=Date.now()-at;
      await page.evaluate(async()=>{await __largeModel.dispose();__largeEmbedding.dispose();globalThis.__largeModel=null;globalThis.__largeEmbedding=null;});
    }
    stage('backup-and-parse');at=Date.now();const expectedSamples=backupSamples(corpus.files),expectedOriginals=corpus.files.map(file=>({name:file.name,hash:file.hash,bytes:file.bytes,headerRow:null,tableHeaders:[]}));report.quality.backup=await page.evaluate(async expected=>{
      const signal=__largeWorkloadAbort.signal,backup=await PBGCRag.createCaseCollectionArchive(__largeVault,'scalecase',{signal}),parsed=await PBGCRag.parseCaseCollectionArchive(backup,{signal}),hashes=[];
      for(const entry of parsed.entries){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await entry.file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==entry.source.hash)throw Error('An archive original failed its SHA-256 binding.');hashes.push({name:entry.file.name,hash,bytes:entry.file.size,headerRow:entry.source.headerRow??null,tableHeaders:entry.source.tableHeaders??[]});}
      if(expected.fullRestore){globalThis.__largeBackupParsed=parsed;return{archiveBytes:backup.size,manifest:parsed.manifest,hashes,restored:[],heartbeat:__largeHeartbeat};}
      await __largeVault.createCase({id:'restoredsamples',name:'Synthetic backup samples'},{signal});const restored=[];
      // Archive entries follow source UUID order. Select the independently known
      // corpus originals by name; an ordinal in that archive is not a file ID.
      for(const sample of expected.samples){const entry=parsed.entries.find(item=>item.file.name===sample.name);if(!entry||entry.source.hash!==sample.hash||entry.file.size!==sample.bytes)throw Error('A selected backup original is missing or changed.');const result=await __largeCollection.importFiles('restoredsamples',[entry.file],{signal,expectedHash:sample.hash,headerRow:entry.source.headerRow,tableHeaders:entry.source.tableHeaders});restored.push(...result.map(item=>({name:item.name,status:item.status,error:item.error,hash:item.source?.hash})));}
      const heartbeat=__largeHeartbeat;await __largeVault.deleteCase('restoredsamples');return{archiveBytes:backup.size,manifest:parsed.manifest,hashes,restored,heartbeat,expected};
    },{bytes,sourceCount:corpus.sourceCount,samples:expectedSamples,fullRestore});
    assert.equal(report.quality.backup.manifest.originalBytes,bytes);verifyOriginalBindings(report.quality.backup.hashes,expectedOriginals);
    if(!fullRestore){verifyRestoredSamples(report.quality.backup.restored,expectedSamples);report.stagesMs.backupParseAndSampleReparse=Date.now()-at;}
    else{
      report.stagesMs.backupParseAndVerify=Date.now()-at;stage('full-restore');at=Date.now();report.storage.beforeFullRestore=await storageSnapshot(page);report.hostDisk.beforeFullRestore=await diskSnapshot(temporary);
      report.quality.fullRestore={status:'FAIL',results:[],verifiedOriginals:0,verifiedHeaderBindings:0,search:[],deleted:false};
      const restored=await page.evaluate(async()=>{
        const signal=__largeWorkloadAbort.signal,results=[];await __largeVault.createCase({id:'restoredfull',name:'Synthetic complete backup restore'},{signal});
        // This is the same per-original parser/chunker import path used by the
        // collection restore controller. Retain the original case throughout.
        for(const [sourceIndex,entry] of __largeBackupParsed.entries.entries()){
          const imported=await __largeCollection.importFiles('restoredfull',[entry.file],{signal,expectedHash:entry.source.hash,headerRow:entry.source.headerRow,tableHeaders:entry.source.tableHeaders,onProgress:event=>__largeProgress({...event,...(event.phase==='source'?{index:sourceIndex,total:__largeBackupParsed.entries.length}:{}),operation:'full-restore'})});
          for(const item of imported){const record={name:item.name,status:item.status,error:item.error,hash:item.source?.hash,bytes:item.source?.bytes};if(item.status==='imported'){
            const stored=await __largeVault.getSource('restoredfull',item.source.id,{signal}),summary=await __largeCollection.summary('restoredfull',item.source.id,signal);
            record.storedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await stored.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');record.headerRow=summary.headerRow??null;record.tableHeaders=summary.tableHeaders??[];record.ready=summary.ready===true;
          }results.push(record);}
          if(imported.some(item=>item.status!=='imported'))break;
        }
        const sources=[];for(const source of await __largeCollection.sources('restoredfull',signal)){const summary=await __largeCollection.summary('restoredfull',source.id,signal);sources.push({name:source.name,hash:source.hash,bytes:source.bytes,headerRow:summary.headerRow??null,tableHeaders:summary.tableHeaders??[]});}
        return{results,sources,manifest:await __largeVault.getCase('restoredfull',{signal}),originalCaseManifest:await __largeVault.getCase('scalecase',{signal})};
      });Object.assign(report.quality.fullRestore,restored);report.quality.fullRestore.failureCounts=importFailureCounts(restored.results);const firstRejected=restored.results.findIndex(item=>item.status==='rejected');if(firstRejected!==-1){const rejected=restored.results[firstRejected],reason=failureDetails({message:rejected.error},'full-restore').reason;report.quality.fullRestore.firstFailure={sourceIndex:firstRejected,sourceName:/^synthetic-plan-[0-9]{4}\.txt$/.test(rejected.name)?rejected.name:null,reason,messageClassifiedCode:reason==='STORAGE_QUOTA'?'QUOTA':null};}
      report.stagesMs.fullRestore=Date.now()-at;report.storage.afterFullRestore=await storageSnapshot(page);report.hostDisk.afterFullRestore=await diskSnapshot(temporary);verifyFullRestore(restored,expectedOriginals);assert.equal(restored.originalCaseManifest?.sourceCount,corpus.sourceCount);assert.equal(restored.originalCaseManifest?.originalBytes,bytes);assert.equal(restored.originalCaseManifest?.revision,report.quality.reopen.manifest.revision,'The original case must remain unchanged during the full second-copy restore.');report.quality.fullRestore.verifiedOriginals=expectedOriginals.length;report.quality.fullRestore.verifiedHeaderBindings=expectedOriginals.length;
      stage('full-restore-search');at=Date.now();
      for(const marker of markers){const queried=Date.now(),result=await page.evaluate(async term=>{const found=await __largeCollection.search('restoredfull',term,{signal:__largeWorkloadAbort.signal});return{diagnostics:found.diagnostics,matches:found.results.map(chunk=>({name:chunk.sourceName,hash:chunk.sourceHash,text:chunk.text,locators:chunk.locators}))};},marker.term),matched=result.matches.find(chunk=>chunk.name===marker.name&&chunk.hash===marker.hash&&chunk.text.includes(marker.text));
        assert.ok(matched,'Restored-case search did not recover an independently known marker.');const locator=matched.locators.find(item=>item.type==='text-line'&&item.offset===marker.offset&&item.line===marker.line);assert.ok(locator,'Restored-case search changed the original marker line or UTF-16 offset.');assert.equal(result.diagnostics.scannedChunks,report.workload.indexedChunks);assert.equal(result.diagnostics.candidateIndex,'authenticated-exact-term-postings');report.quality.fullRestore.search.push({marker:marker.term,position:marker.location,source:marker.name,expectedOffset:marker.offset,expectedLine:marker.line,verifiedLocator:locator,ms:Date.now()-queried,diagnostics:result.diagnostics});
      }
      report.stagesMs.fullRestoreSearch=Date.now()-at;stage('full-restore-cleanup');at=Date.now();await page.evaluate(async()=>{await __largeVault.deleteCase('restoredfull');globalThis.__largeBackupParsed=null;if(await __largeVault.getCase('restoredfull'))throw Error('The restored acceptance case was not deleted.');});report.quality.fullRestore.deleted=true;report.quality.fullRestore.status='PASS';report.stagesMs.fullRestoreCleanup=Date.now()-at;report.storage.afterFullRestoreCleanup=await storageSnapshot(page);report.hostDisk.afterFullRestoreCleanup=await diskSnapshot(temporary);
    }
    report.quality.externalRequests=external.length;assert.equal(external.length,0);if(limitError)throw limitError;report.status='PASS';
  }catch(error){report.status=/ERR_BLOCKED_BY_ADMINISTRATOR/.test(String(error.message))?'BLOCKED':'FAIL';report.failure=failureDetails(limitError||error,currentStage);if(!limitError&&(currentStage==='import'&&report.quality.import?.failureCounts?.STORAGE_QUOTA||currentStage==='full-restore'&&report.quality.fullRestore?.failureCounts?.STORAGE_QUOTA))report.failure.reason='STORAGE_QUOTA';report.storage||={};report.storage.atFailure=await storageSnapshot(page);report.hostDisk||={};if(temporary)report.hostDisk.atFailure=await diskSnapshot(temporary);report.errors.push(String(limitError?.message||error.message||error).slice(0,2000));
    if(report.quality.fullRestore&&page&&!page.isClosed())try{const cleanupStarted=Date.now();report.quality.fullRestore.deleted=await page.evaluate(async()=>{await __largeVault.deleteCase('restoredfull');globalThis.__largeBackupParsed=null;return!(await __largeVault.getCase('restoredfull'));});report.stagesMs.fullRestoreCleanup=Date.now()-cleanupStarted;report.storage.afterFullRestoreCleanup=await storageSnapshot(page);report.hostDisk.afterFullRestoreCleanup=await diskSnapshot(temporary);}catch(_){}
  }
  finally{
    if(page)await page.evaluate(async()=>{clearInterval(globalThis.__largeTimer);if(globalThis.__largeModel)await __largeModel.dispose();globalThis.__largeEmbedding?.dispose();globalThis.__largeVault?.close();}).catch(()=>{});if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(loopback)await loopback.close();if(monitor)report.resources=await monitor.stop();if(deadline)clearTimeout(deadline);if(temporary)await fsp.rm(temporary,{recursive:true,force:true});
    report.totalMs=Date.now()-started;report.finishedAt=new Date().toISOString();report.lastStage=currentStage;report.quality.externalRequests=external.length;
    report.runtimeSha256After=profileFingerprint(withModel);report.runtimeUnchanged=JSON.stringify(report.runtimeSha256)===JSON.stringify(report.runtimeSha256After);
    if(!report.runtimeUnchanged){report.status='FAIL';report.errors.push('Benchmark code or runtime files changed during the measurement. Repeat against a stable source snapshot.');}
    if(report.status!=='BLOCKED'&&(!report.resources||report.resources.samples<2||report.resources.errors.length||report.resources.exceeded)){report.status='FAIL';report.errors.push('Whole-process measurements unavailable, incomplete or above budget.');}
    if(options.out){await fsp.mkdir(path.dirname(options.out),{recursive:true});await fsp.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
  }
  return report;
}
async function main(argv=process.argv.slice(2)){
  const options={profile:'file',bytes:GiB,out:path.join(ROOT,'test-results','large-case-file.json'),onStage:(stage,details)=>process.stdout.write(JSON.stringify({stage,...details})+'\n')};
  for(let i=0;i<argv.length;i++){if(argv[i]==='--http')options.profile='http';else if(argv[i]==='--file')options.profile='file';else if(argv[i]==='--with-model')options.requireModel=true;else if(argv[i]==='--full-restore')options.fullRestore=true;else if(argv[i]==='--model-path')options.modelPath=path.resolve(argv[++i]);else if(argv[i]==='--mib')options.bytes=Number(argv[++i])*MiB;else if(argv[i]==='--source-mib')options.sourceBytes=Number(argv[++i])*MiB;else if(argv[i]==='--timeout-ms')options.timeoutMs=Number(argv[++i]);else if(argv[i]==='--out')options.out=path.resolve(argv[++i]);else if(argv[i]==='--help'){process.stdout.write('Usage: node tools/measure-large-case.js [--file|--http] [--mib 1024] [--source-mib 4] [--with-model] [--full-restore] [--model-path pinned.gguf] [--timeout-ms 3600000] [--out report.json]\nActual Files, parsers, workers, IndexedDB and full-case search. HTTP checks are supplementary. --full-restore rebuilds and verifies every archive original in a second case before deleting that case. --with-model requires the pinned local Qwen and one real grounded answer. No general model-quality claim.\n');return 0;}else throw Error('Unknown option: '+argv[i]);}
  const report=await runLargeCaseBenchmark(options);process.stdout.write(JSON.stringify({status:report.status,sourceBytes:report.workload.sourceBytes,totalMs:report.totalMs,stagesMs:report.stagesMs,peak:report.resources?.peak,errors:report.errors})+'\n');return report.status==='PASS'?0:report.status==='BLOCKED'?2:1;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={sourceText,generateCorpus,runLargeCaseBenchmark,backupSamples,verifyRestoredSamples,verifyOriginalBindings,verifyFullRestore,failureDetails,diskSnapshot,importFailureCounts};
