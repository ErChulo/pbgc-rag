'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {sourceText,backupSamples,verifyRestoredSamples,failureDetails,runLargeCaseBenchmark}=require('../tools/measure-large-case.js');
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

test('model-required mode rejects a missing pinned file instead of falling back to lexical-only acceptance',async()=>{
 await assert.rejects(runLargeCaseBenchmark({requireModel:'yes'}),/flag must be boolean/);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-required-model-'));
 try{const report=await runLargeCaseBenchmark({bytes:4096,sourceBytes:4096,profile:'http',requireModel:true,modelPath:path.join(directory,'missing.gguf'),out:path.join(directory,'report.json')});assert.equal(report.status,'FAIL');assert.equal(report.workload.realModelRequired,true);assert.ok(report.errors.some(message=>message.includes('Required pinned local Qwen model is absent')));assert.equal(report.quality.answer,undefined);assert.equal(report.stagesMs.import,undefined);assert.equal(report.lastStage,'initialization');}
 finally{await fs.rm(directory,{recursive:true,force:true});}
});
