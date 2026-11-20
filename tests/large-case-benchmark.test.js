'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {sourceText,backupSamples,verifyRestoredSamples,verifyOriginalBindings,verifyFullRestore,failureDetails,runLargeCaseBenchmark,diskSnapshot,importFailureCounts}=require('../tools/measure-large-case.js');
const {createCaseCollectionArchive,parseCaseCollectionArchive}=require('../assets/case-archive.js');
const {summarizeLargeCaseReport,readSummary}=require('../tools/large-case-ci-summary.js');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=()=>Array.from({length:3},(_,index)=>{const body=Buffer.from(sourceText(index,4096).text);return{name:`synthetic-plan-${String(index).padStart(4,'0')}.txt`,bytes:body.length,hash:sha(body),blob:new Blob([body])};});

test('backup samples restore distinct corpus originals when real ZIP UUID order differs from filename order',async()=>{
 const corpus=files(),originals=[corpus[2],corpus[0],corpus[1]].map((source,index)=>({...source,id:'source-'+index,revision:1,parserVersion:'synthetic-v1'}));
 const metadata=source=>{const {blob,...record}=source;return record;};
 const vault={async getCase(){return{id:'synthetic-case',name:'Synthetic shuffled source order',revision:9,sourceCount:3,originalBytes:originals.reduce((sum,s)=>sum+s.bytes,0)};},async listSources(_id,{afterId}={}){return originals.filter(s=>afterId===undefined||s.id>afterId).map(metadata);},async getSource(_id,id){return originals.find(s=>s.id===id);},async getShard(){return null;}};
 const parsed=await parseCaseCollectionArchive(await createCaseCollectionArchive(vault,'synthetic-case'));
 assert.deepEqual(parsed.entries.map(entry=>entry.file.name),[corpus[2].name,corpus[0].name,corpus[1].name]);
 const expected=backupSamples(corpus),restored=[];
 for(const sample of expected){const entry=parsed.entries.find(item=>item.file.name===sample.name);assert.ok(entry);restored.push({name:entry.file.name,hash:sha(Buffer.from(await entry.file.arrayBuffer())),status:'imported'});}
 verifyRestoredSamples(restored,expected);
 assert.throws(()=>verifyRestoredSamples(parsed.entries.map(entry=>({name:entry.file.name,hash:entry.source.hash,status:'imported'})),expected),/selected original names/,'The old positional comparison is invalid for the real archive order.');
});

test('sample selection restores one or two originals once and retains exact count, status and hash checks',()=>{
 const corpus=files();assert.equal(backupSamples(corpus.slice(0,1)).length,1);assert.equal(backupSamples(corpus.slice(0,2)).length,2);assert.equal(backupSamples(corpus).length,3);
 const expected=backupSamples(corpus),valid=expected.map(source=>({...source,status:'imported'}));verifyRestoredSamples(valid,expected);
 assert.throws(()=>verifyRestoredSamples([],expected),/Every selected distinct/);
 assert.throws(()=>verifyRestoredSamples(valid.slice(0,2),expected),/Every selected distinct/);
 assert.throws(()=>verifyRestoredSamples(valid.map((s,i)=>i? s:{...s,hash:'0'.repeat(64)}),expected),/SHA-256/);
 assert.throws(()=>verifyRestoredSamples(valid.map((s,i)=>i? s:{...s,status:'rejected'}),expected));
 assert.throws(()=>backupSamples([corpus[0],corpus[0]]),/names must be unique/);assert.throws(()=>backupSamples([]),/must contain originals/);
});

test('full restore verifies every independent original, stored hash and header binding beyond three samples',()=>{
 const expected=Array.from({length:5},(_,index)=>{const body=Buffer.from(sourceText(index,4096).text);return{name:`synthetic-plan-${String(index).padStart(4,'0')}.txt`,bytes:body.length,hash:sha(body),headerRow:index===2?3:null,tableHeaders:index===2?[{tableName:'Benefits',headerRow:3}]:[]};});
 const results=[expected[4],expected[0],expected[3],expected[2],expected[1]].map(item=>({...item,status:'imported',storedHash:item.hash,ready:true})),sources=expected.map(item=>({...item})),manifest={sourceCount:5,originalBytes:5*4096},valid={results,sources,manifest};
 verifyFullRestore(valid,expected);verifyOriginalBindings(results,expected);
 assert.throws(()=>verifyFullRestore({...valid,results:results.slice(0,3)},expected),/Every backup original/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map((item,index)=>index===2?{...item,status:'rejected'}:item)},expected),/reparsed successfully/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map((item,index)=>index===2?{...item,storedHash:'0'.repeat(64)}:item)},expected),/Stored restored bytes/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map((item,index)=>index===2?{...item,hash:'0'.repeat(64)}:item)},expected),/independent SHA-256/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map((item,index)=>index===2?{...item,bytes:item.bytes-1}:item)},expected),/independent byte count/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map(item=>item.headerRow?{...item,headerRow:1}:item)},expected),/column-name row binding/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map(item=>item.tableHeaders.length?{...item,tableHeaders:[{tableName:'Other sheet',headerRow:3}]}:item)},expected),/table column-name bindings/);
 assert.throws(()=>verifyFullRestore({...valid,results:results.map((item,index)=>index===2?{...item,ready:false}:item)},expected),/complete rebuilt/);
 assert.throws(()=>verifyFullRestore({...valid,sources:[...sources.slice(0,4),sources[0]]},expected),/names must remain unique/);
 assert.throws(()=>verifyFullRestore({...valid,manifest:{...manifest,sourceCount:4}},expected),/contain every original/);
 assert.throws(()=>verifyFullRestore({...valid,manifest:{...manifest,originalBytes:manifest.originalBytes-1}},expected),/retain every original byte/);
});

test('full restore diagnostics preserve the exact stage and bounded quota evidence without source content',async()=>{
 const report={kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',lastStage:'full-restore',workload:{fullRestoreRequired:true},stagesMs:{backupParseAndVerify:41,fullRestore:900},failure:{reason:'STORAGE_QUOTA'},quality:{fullRestore:{status:'FAIL',results:[{status:'imported',name:'secret-source'},{status:'rejected',error:'secret-error'}],manifest:{sourceCount:1,originalBytes:4194304,derivedBytes:100},verifiedOriginals:0,verifiedHeaderBindings:0,search:[],deleted:true,failureCounts:{STORAGE_QUOTA:1,'secret-reason':1},firstFailure:{sourceIndex:1,sourceName:'synthetic-plan-0001.txt',reason:'STORAGE_QUOTA',messageClassifiedCode:'QUOTA'},headers:'secret-headers'}},storage:{beforeFullRestore:{available:true,quotaBytes:1024},afterFullRestore:{available:true,usageBytes:1024},afterFullRestoreCleanup:{available:true,usageBytes:512}},hostDisk:{beforeFullRestore:{available:true,availableBytes:1024},afterFullRestore:{available:true,availableBytes:512},afterFullRestoreCleanup:{available:true,availableBytes:1024}}};
 const summary=summarizeLargeCaseReport(report);assert.equal(summary.lastStage,'full-restore');assert.equal(summary.workload.fullRestoreRequired,true);assert.equal(summary.fullRestore.importedCount,1);assert.equal(summary.fullRestore.rejectedCount,1);assert.equal(summary.fullRestore.deleted,true);assert.deepEqual(summary.fullRestore.failureCounts,{STORAGE_QUOTA:1});assert.equal(summary.fullRestore.firstFailure.messageClassifiedCode,'QUOTA');assert.equal(summary.timings.fullRestore,900);assert.equal(summary.storage.afterFullRestore.usageBytes,1024);assert.equal(summary.hostDisk.beforeFullRestore.availableBytes,1024);assert.ok(!JSON.stringify(summary).includes('secret'));
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-restore-summary-'));
 try{const log=path.join(directory,'run.log');await fs.writeFile(log,JSON.stringify({stage:'full-restore'})+'\n'+JSON.stringify({stage:'import-progress',phase:'source',operation:'full-restore',name:'secret-source'})+'\n');const absent=readSummary(path.join(directory,'missing.json'),log);assert.equal(absent.lastStage,'full-restore');assert.ok(!JSON.stringify(absent).includes('secret'));}
 finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('failure projection records safe assertion identity and classifies browser/storage failures without raw messages',()=>{
 let assertion;try{assert.equal('synthetic-plan-0220.txt','synthetic-plan-0000.txt');}catch(error){assertion=error;}
 const report={kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',profile:'actual offline file://',commit:'a'.repeat(40),failure:failureDetails(assertion,'backup-and-parse'),errors:['Arbitrary confidential error text'],workload:{sourceBytes:1024**3,sourceCount:256},resources:{samples:50,peak:{budgetMetricBytes:1000},errors:[]},lastStage:'backup-and-parse'};
 const summary=summarizeLargeCaseReport(report);assert.equal(summary.failure.reason,'BENCHMARK_ASSERTION');assert.equal(summary.failure.assertion.actual,'synthetic-plan-0220.txt');assert.equal(summary.failure.assertion.expected,'synthetic-plan-0000.txt');assert.equal(summary.lastStage,'backup-and-parse');assert.ok(!JSON.stringify(summary).includes('confidential'));
 assert.equal(failureDetails(Error('net::ERR_BLOCKED_BY_ADMINISTRATOR'),'browser-entry').reason,'BROWSER_ADMIN_POLICY');
 assert.equal(failureDetails(Error('Derived shard metadata is too complex'),'import').reason,'DERIVED_METADATA_BUDGET');
 assert.equal(failureDetails(Error('QuotaExceededError storage quota'),'import').reason,'STORAGE_QUOTA');
 assert.equal(failureDetails(Error('IndexedDB unavailable'),'browser-entry').reason,'STORAGE_OR_CRYPTO_CAPABILITY');
 const unknown=summarizeLargeCaseReport({...report,failure:{reason:'secret-reason',name:'secret-name',code:'secret-code',assertion:{actual:'secret-value',expected:'secret-value'}}});assert.ok(!JSON.stringify(unknown).includes('secret'));assert.equal(unknown.failure.reason,'UNCLASSIFIED');
 assert.equal(summarizeLargeCaseReport({...report,failure:undefined,resources:{samples:1,errors:['secret-counter-text']}}).failure.reason,'RESOURCE_MEASUREMENT_UNAVAILABLE');assert.equal(summarizeLargeCaseReport({...report,failure:undefined,runtimeUnchanged:false}).failure.reason,'RUNTIME_CHANGED');
 const model=summarizeLargeCaseReport({...report,quality:{answer:{status:'abstained',answer:'secret-answer',reason:'generation-failed: Local generation exceeded the 120000 ms time budget.',calls:[{prompt:'secret-prompt',promptCharacters:500,firstTokenMs:null,elapsedMs:120001.2,emittedCharacters:0}]}}});assert.equal(model.modelCheck.reason,'GENERATION_TIME_BUDGET');assert.equal(model.modelCheck.calls[0].elapsedMs,120001);assert.ok(!JSON.stringify(model).includes('secret'));
});

test('missing reports retain only a known stage from bounded synthetic logs',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-ci-summary-'));
 try{const report=path.join(directory,'report.json'),log=path.join(directory,'run.log');await fs.writeFile(log,JSON.stringify({stage:'import'})+'\n'+JSON.stringify({stage:'secret-stage',message:'secret-text'})+'\n');const absent=readSummary(report,log);assert.equal(absent.status,'REPORT_UNAVAILABLE');assert.equal(absent.lastStage,'import');assert.ok(!JSON.stringify(absent).includes('secret'));
  await fs.writeFile(report,JSON.stringify({kind:'other',errors:['secret-text']}));assert.equal(readSummary(report,log).status,'REPORT_UNAVAILABLE');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('the exact no-room import error is classified as quota without leaking source errors',()=>{
 const message='The browser has no room for this large-case write. Existing committed data was kept.';
 assert.equal(failureDetails(Error(message),'import').reason,'STORAGE_QUOTA');
 assert.deepEqual(importFailureCounts([{status:'imported'},...Array.from({length:3},()=>({status:'rejected',error:message})),{status:'rejected',error:'Arbitrary parser failure'}]),{STORAGE_QUOTA:3,UNCLASSIFIED:1});
 const report={kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',browserMode:'persistent-normal-profile',lastStage:'import',failure:{reason:'STORAGE_QUOTA'},quality:{fullBrowserRestart:false,import:{failureCounts:{STORAGE_QUOTA:3,'secret-category':9},firstFailure:{sourceIndex:162,sourceName:'synthetic-plan-0162.txt',reason:'STORAGE_QUOTA',messageClassifiedCode:'QUOTA',error:'secret-error'}}},storage:{beforeImport:{available:true,usageBytes:1024,quotaBytes:4*1024**3,persisted:false,internal:'secret-origin'},atFailure:{available:true,usageBytes:4*1024**3,quotaBytes:4*1024**3}},hostDisk:{atFailure:{available:true,totalBytes:20*1024**3,availableBytes:8*1024**3,path:'secret-path'}}};
 const summary=summarizeLargeCaseReport(report);assert.equal(summary.browserMode,'persistent-normal-profile');assert.equal(summary.failure.reason,'STORAGE_QUOTA');assert.deepEqual(summary.importFailures.failureCounts,{STORAGE_QUOTA:3});assert.equal(summary.importFailures.firstFailure.messageClassifiedCode,'QUOTA');assert.equal(summary.storage.atFailure.quotaBytes,4*1024**3);assert.equal(summary.hostDisk.atFailure.availableBytes,8*1024**3);assert.ok(!JSON.stringify(summary).includes('secret'));
});

test('public storage diagnostics omit unknown phases, unsafe numbers and arbitrary identifiers',()=>{
 const summary=summarizeLargeCaseReport({kind:'pbgc-rag-large-case-resource-benchmark',status:'FAIL',browserMode:'secret-mode',storage:{'secret-phase':{quotaBytes:100},beforeImport:{available:true,usageBytes:-1,quotaBytes:Infinity,reason:'secret-reason'}},hostDisk:{atStart:{available:true,availableBytes:-3,errorCode:'secret-code'}},quality:{import:{failureCounts:{STORAGE_QUOTA:Infinity},firstFailure:{sourceIndex:999999,sourceName:'secret-source',reason:'secret-reason',messageClassifiedCode:'secret-code'}}}});
 assert.equal(summary.browserMode,'unknown');assert.equal(summary.storage.beforeImport.usageBytes,null);assert.equal(summary.storage.beforeImport.quotaBytes,null);assert.equal(summary.hostDisk.atStart.availableBytes,null);assert.equal(summary.importFailures.firstFailure.sourceName,null);assert.ok(!JSON.stringify(summary).includes('secret'));
});

test('disk diagnostics record only bounded filesystem capacities or a safe unsupported marker',async()=>{
 const actual=await diskSnapshot(os.tmpdir());assert.equal(typeof actual.available,'boolean');
 if(actual.available){for(const key of ['totalBytes','availableBytes','freeBytes'])assert.ok(actual[key]===null||Number.isSafeInteger(actual[key])&&actual[key]>=0);assert.ok(actual.totalBytes>=actual.availableBytes);}
 else assert.ok(['ENOENT','ENOSYS','ENOTSUP','EACCES','EPERM','EIO','unknown'].includes(actual.errorCode));
 assert.ok(!JSON.stringify(actual).includes(os.tmpdir()));
});

test('model-required mode rejects a missing pinned file instead of falling back to lexical-only acceptance',async()=>{
 await assert.rejects(runLargeCaseBenchmark({requireModel:'yes'}),/flag must be boolean/);
 for(const fullRestore of ['yes',1,null,{},[]])await assert.rejects(runLargeCaseBenchmark({fullRestore}),/full-restore benchmark flag must be boolean/);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-required-model-'));
 try{const report=await runLargeCaseBenchmark({bytes:4096,sourceBytes:4096,profile:'http',requireModel:true,modelPath:path.join(directory,'missing.gguf'),out:path.join(directory,'report.json')});assert.equal(report.status,'FAIL');assert.equal(report.workload.realModelRequired,true);assert.ok(report.errors.some(message=>message.includes('Required pinned local Qwen model is absent')));assert.equal(report.quality.answer,undefined);assert.equal(report.stagesMs.import,undefined);assert.equal(report.lastStage,'initialization');}
 finally{await fs.rm(directory,{recursive:true,force:true});}
});
