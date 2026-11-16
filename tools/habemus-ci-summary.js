#!/usr/bin/env node
'use strict';
// CI-only projection: never publish prompts, source text, model output or error messages.
const fs=require('node:fs'),path=require('node:path');
const {workflowEscape}=require('./ci-summary.js');
const MAX_REPORT_BYTES=1024*1024,MAX_CALLS=2,MAX_ELAPSED_MS=60*60*1000;
const enumValue=(value,allowed)=>allowed.includes(value)?value:'unknown';
const count=(value,maximum)=>Number.isSafeInteger(value)&&value>=0&&value<=maximum?value:null;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ERROR_NAMES=['AbortError','TimeoutError','LocalLlmError','Error','TypeError','RangeError'];
const ERROR_CODES=['ABORTED','TIMEOUT','BUSY','CONTEXT_LIMIT','DISPOSED','INTEGRITY','INVALID_INPUT','INVALID_MANIFEST','INVALID_MODEL','INVALID_OPTIONS','RUNTIME','UNAVAILABLE'];
const REASONS=['model-abstained','model-grounding-rejected','question-subject-binding-rejected','question-part-evidence-missing','compound-question-needs-explicit-parts','missing-or-quarantined-evidence','weak-retrieval','evidence-analysis-budget','possible-source-conflict','ambiguous-table-row','unverified-source-applicability','question-topic-not-supported','generation-provider-unavailable','cited-synthesis-guarded','grounded-source-quotations'];
function reasonCode(value){
 if(typeof value!=='string')return'unknown';
 if(/^generation-failed: Local generation exceeded the \d{1,7} ms time budget\.$/.test(value))return'generation-time-budget-exceeded';
 if(value.startsWith('generation-failed: '))return'generation-failed';
 return enumValue(value,REASONS);
}
function summarizeHabemusReport(report){
 if(!object(report)||report.kind!=='real-qwen-habemus-selection')return{schemaVersion:1,reason:'invalid-report'};
 return{
  schemaVersion:1,
  stage:enumValue(report.stage,['combined-answer','complete','failed']),
  profile:enumValue(report.profile,['actual offline file://','supplementary HTTP only']),
  elapsedMs:count(report.elapsedMs,MAX_ELAPSED_MS),
  externalRequests:count(report.externalRequests,1000000),
  calls:(Array.isArray(report.calls)?report.calls:[]).slice(0,MAX_CALLS).map(call=>{
   call=object(call)?call:{};
   return{state:enumValue(call.state,['running','completed','failed']),elapsedMs:count(call.elapsedMs,MAX_ELAPSED_MS),firstTokenMs:count(call.firstTokenMs,MAX_ELAPSED_MS),emittedCharacters:count(call.emittedCharacters,65536),formattedPromptTokens:count(call.formattedPromptTokens,4096),prefillBatchSize:count(call.prefillBatchSize,4096),promptCharacters:count(call.promptCharacters,2600),rawLength:typeof call.raw==='string'?Math.min(call.raw.length,MAX_REPORT_BYTES):0,errorName:enumValue(call.errorName,ERROR_NAMES)};
  }),
  results:(Array.isArray(report.results)?report.results:[]).slice(0,MAX_CALLS).map(result=>{
   result=object(result)?result:{};const diagnostics=object(result.diagnostics)?result.diagnostics:{};
   return{status:enumValue(result.status,['answered','abstained','conflict']),reason:reasonCode(diagnostics.reason),errorName:enumValue(diagnostics.generationErrorName,ERROR_NAMES),errorCode:enumValue(diagnostics.generationErrorCode,ERROR_CODES)};
  })
 };
}
function readHabemusSummary(file){
 try{const info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_REPORT_BYTES)return{schemaVersion:1,reason:'report-unavailable'};return summarizeHabemusReport(JSON.parse(fs.readFileSync(file,'utf8')));}
 catch(_){return{schemaVersion:1,reason:'report-unavailable'};}
}
function main(){
 const file=path.resolve(__dirname,'../test-results/rag-habemus-real-file.json');
 process.stdout.write('::notice title=Real source-selection diagnostic::'+workflowEscape(JSON.stringify(readHabemusSummary(file)))+'\n');
}
if(require.main===module)main();
module.exports={summarizeHabemusReport,readHabemusSummary};
