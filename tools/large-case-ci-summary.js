#!/usr/bin/env node
'use strict';
// CI-only projection of synthetic workload results. Never project source text,
// model output, arbitrary exception messages or filesystem paths.
const fs=require('node:fs'),path=require('node:path');
const {workflowEscape}=require('./ci-summary.js');
const STAGES=['initialization','generate-corpus','browser-entry','cancel-and-rollback','import','reopen','search-all-case','search-selected-source','model-file-selection','model-hash-and-load','embedding-load','real-qwen-answer','backup-and-parse','full-restore','full-restore-search','full-restore-cleanup'];
const REASONS=['BROWSER_ADMIN_POLICY','STORAGE_QUOTA','DERIVED_METADATA_BUDGET','STORAGE_OR_CRYPTO_CAPABILITY','BACKUP_SAMPLE_IDENTITY','STALE_SOURCE_OR_CASE','SOURCE_OR_CACHE_INTEGRITY','TIME_OR_MEMORY_BUDGET','BROWSER_PROCESS_CLOSED','INPUT_OR_CACHE_BUDGET','BENCHMARK_ASSERTION','RESOURCE_MEASUREMENT_UNAVAILABLE','RUNTIME_CHANGED','UNCLASSIFIED'];
const NAMES=['Error','AssertionError','TypeError','RangeError','TimeoutError','AbortError','CaseVaultError','DOMException'];
const CODES=['ERR_ASSERTION','INTEGRITY','CONFLICT','INVALID_INPUT','UNAVAILABLE','QUOTA','SIZE_LIMIT','TIMEOUT','ABORTED'];
const choice=(value,allowed,fallback='unknown')=>allowed.includes(value)?value:fallback;
const count=(value,maximum=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=0&&value<=maximum?value:null;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const value=input=>typeof input==='number'&&Number.isFinite(input)?input:typeof input==='string'&&/^synthetic-plan-[0-9]{4}\.txt$/.test(input)?input:null;
const elapsed=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=600000?Math.round(value):null;
function modelSummary(answer){
  if(!object(answer))return null;const reason=typeof answer.reason==='string'?answer.reason:'';
  return{status:choice(answer.status,['answered','abstained','conflict']),reason:/^generation-failed: Local generation exceeded the \d+ ms time budget\.$/.test(reason)?'GENERATION_TIME_BUDGET':reason.startsWith('generation-failed: ')?'GENERATION_FAILED':choice(reason,['grounded-source-quotations','cited-synthesis-guarded','question-topic-not-supported','model-grounding-rejected','question-subject-binding-rejected','possible-source-conflict'],'OTHER'),
    singleSource:typeof answer.sourceSupport?.singleSource==='boolean'?answer.sourceSupport.singleSource:null,calls:(Array.isArray(answer.calls)?answer.calls:[]).slice(0,3).map(call=>({promptCharacters:count(call?.promptCharacters,24000),outputTokenBudget:count(call?.outputTokenBudget,512),firstTokenMs:elapsed(call?.firstTokenMs),elapsedMs:elapsed(call?.elapsedMs),emittedCharacters:count(call?.emittedCharacters,65536),returnedCharacters:count(call?.returnedCharacters,65536)}))};
}
function storageSummary(source){
  const result={};for(const phase of ['beforeImport','afterImport','afterBrowserRestart','beforeFullRestore','afterFullRestore','afterFullRestoreCleanup','atFailure']){
    const item=source?.[phase];if(!object(item))continue;
    result[phase]={available:typeof item.available==='boolean'?item.available:null,usageBytes:count(item.usageBytes),quotaBytes:count(item.quotaBytes),indexedDBBytes:count(item.indexedDBBytes),persisted:typeof item.persisted==='boolean'?item.persisted:null,reason:choice(item.reason,['BROWSER_CLOSED','API_UNAVAILABLE','SecurityError','InvalidStateError','UnknownError','TypeError'],null)};
  }return result;
}
function diskSummary(source){
  const result={};for(const phase of ['atStart','beforeImport','afterImport','beforeFullRestore','afterFullRestore','afterFullRestoreCleanup','atFailure']){
    const item=source?.[phase];if(!object(item))continue;
    result[phase]={available:typeof item.available==='boolean'?item.available:null,totalBytes:count(item.totalBytes),availableBytes:count(item.availableBytes),freeBytes:count(item.freeBytes),errorCode:choice(item.errorCode,['ENOENT','ENOSYS','ENOTSUP','EACCES','EPERM','EIO'],null)};
  }return result;
}
function importSummary(source){
  const counts={};for(const reason of REASONS){const amount=count(source?.failureCounts?.[reason],2000);if(amount)counts[reason]=amount;}
  const first=source?.firstFailure;
  return{failureCounts:counts,firstFailure:object(first)?{sourceIndex:count(first.sourceIndex,1999),sourceName:typeof first.sourceName==='string'&&/^synthetic-plan-[0-9]{4}\.txt$/.test(first.sourceName)?first.sourceName:null,reason:choice(first.reason,REASONS,'UNCLASSIFIED'),messageClassifiedCode:choice(first.messageClassifiedCode,CODES,null)}:null};
}
function fullRestoreSummary(source){
  if(!object(source))return null;
  const results=Array.isArray(source.results)?source.results:[],manifest=object(source.manifest)?source.manifest:{};
  return{status:choice(source.status,['PASS','FAIL']),sourceCount:count(manifest.sourceCount,2000),originalBytes:count(manifest.originalBytes,1024**3),derivedBytes:count(manifest.derivedBytes,8*1024**3),
    importedCount:count(results.filter(result=>result?.status==='imported').length,2000),rejectedCount:count(results.filter(result=>result?.status==='rejected').length,2000),verifiedOriginals:count(source.verifiedOriginals,2000),verifiedHeaderBindings:count(source.verifiedHeaderBindings,2000),searchChecks:Array.isArray(source.search)?count(source.search.length,3):null,deleted:typeof source.deleted==='boolean'?source.deleted:null,...importSummary(source)};
}
function summarizeLargeCaseReport(report,logStage){
  if(!object(report)||report.kind!=='pbgc-rag-large-case-resource-benchmark')return{schemaVersion:1,status:'REPORT_UNAVAILABLE',lastStage:choice(logStage,STAGES),failure:{reason:'REPORT_UNAVAILABLE'}};
  const failure=object(report.failure)?report.failure:{},assertion=object(failure.assertion)?failure.assertion:null,resources=object(report.resources)?report.resources:{},peak=object(resources.peak)?resources.peak:{},workload=object(report.workload)?report.workload:{};
  const fallbackReason=resources.exceeded?'TIME_OR_MEMORY_BUDGET':report.runtimeUnchanged===false?'RUNTIME_CHANGED':!object(report.resources)||resources.samples<2||(resources.errorCount??resources.errors?.length??0)>0?'RESOURCE_MEASUREMENT_UNAVAILABLE':'UNCLASSIFIED';
  const timings={};for(const key of ['generateCorpus','browserEntry','cancelAndRollback','import','reopen','threeFullCaseSearches','selectedSourceSearch','modelFileSelection','modelHashAndLoad','embeddingLoad','realQwenAnswerAndGrounding','backupParseAndSampleReparse','backupParseAndVerify','fullRestore','fullRestoreSearch','fullRestoreCleanup'])if(report.stagesMs?.[key]!==undefined)timings[key]=count(report.stagesMs[key],7200000);
  return{schemaVersion:1,status:choice(report.status,['PASS','FAIL','BLOCKED']),profile:choice(report.profile,['actual offline file://','supplementary HTTP only']),browserMode:choice(report.browserMode,['persistent-normal-profile']),fullBrowserRestart:typeof report.quality?.fullBrowserRestart==='boolean'?report.quality.fullBrowserRestart:null,commit:typeof report.commit==='string'&&/^[a-f0-9]{40}$/.test(report.commit)?report.commit:null,
    lastStage:choice(report.lastStage||failure.stage||logStage,STAGES),runtimeUnchanged:typeof report.runtimeUnchanged==='boolean'?report.runtimeUnchanged:null,totalMs:count(report.totalMs,7200000),
    workload:{sourceBytes:count(workload.sourceBytes,1024**3),sourceCount:count(workload.sourceCount,2000),indexedChunks:count(workload.indexedChunks,100000000),derivedBytes:count(workload.derivedBytes,8*1024**3),realModelRequired:typeof workload.realModelRequired==='boolean'?workload.realModelRequired:null,fullRestoreRequired:typeof workload.fullRestoreRequired==='boolean'?workload.fullRestoreRequired:null},
    timings,modelCheck:modelSummary(report.quality?.answer),importFailures:importSummary(report.quality?.import),fullRestore:fullRestoreSummary(report.quality?.fullRestore),storage:storageSummary(report.storage),hostDisk:diskSummary(report.hostDisk),resources:{samples:count(resources.samples,100000),peakBudgetBytes:count(peak.budgetMetricBytes),exceeded:typeof resources.exceeded==='boolean'?resources.exceeded:null,errorCount:count(resources.errorCount??resources.errors?.length,100000)},
    failure:report.status==='PASS'?null:{reason:choice(failure.reason,REASONS,fallbackReason),name:choice(failure.name,NAMES),code:choice(failure.code,CODES,null),
      assertion:assertion?{operator:choice(assertion.operator,['strictEqual','deepStrictEqual','==','!=','===','!==','match','doesNotMatch']),actual:value(assertion.actual),expected:value(assertion.expected)}:null,
      location:failure.location?.file==='tools/measure-large-case.js'?{file:'tools/measure-large-case.js',line:count(failure.location.line,10000),column:count(failure.location.column,10000)}:null}};
}
function lastLogStage(file){
  try{const info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink())return null;const length=Math.min(info.size,128*1024),buffer=Buffer.alloc(length),fd=fs.openSync(file,'r');try{fs.readSync(fd,buffer,0,length,info.size-length);}finally{fs.closeSync(fd);}let stage=null;for(const line of buffer.toString('utf8').split(/\r?\n/)){if(line.length>4000)continue;try{const event=JSON.parse(line);if(STAGES.includes(event.stage))stage=event.stage;else if(event.stage==='import-progress'&&['source','indexing'].includes(event.phase))stage=event.operation==='full-restore'?'full-restore':'import';}catch(_){}}return stage;}catch(_){return null;}
}
function readSummary(reportPath,logPath){
  const stage=lastLogStage(logPath);try{const info=fs.lstatSync(reportPath);if(!info.isFile()||info.isSymbolicLink()||info.size>8*1024*1024)return summarizeLargeCaseReport(null,stage);return summarizeLargeCaseReport(JSON.parse(fs.readFileSync(reportPath,'utf8')),stage);}catch(_){return summarizeLargeCaseReport(null,stage);}
}
function main(){
  const directory=path.resolve(__dirname,'../test-results'),summary=readSummary(path.join(directory,'large-case-file.json'),path.join(directory,'large-case-file.log'));
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'large-case-ci-summary.json'),JSON.stringify(summary,null,2)+'\n');
  process.stdout.write('::'+(summary.status==='PASS'?'notice':'error')+' title=Large-case benchmark summary::'+workflowEscape(JSON.stringify(summary))+'\n');
}
if(require.main===module)main();
module.exports={summarizeLargeCaseReport,lastLogStage,readSummary};
