'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {summarizeHabemusReport,readHabemusSummary}=require('../tools/habemus-ci-summary.js');
test('real selection CI summary distinguishes timeout from model abstention without exposing evidence',()=>{
 const report={kind:'real-qwen-habemus-selection',stage:'failed',profile:'actual offline file://',elapsedMs:138432,externalRequests:0,calls:[{state:'failed',elapsedMs:120001,promptCharacters:473,prompt:'private-source-prompt',errorName:'AbortError',errorMessage:'private-error-message'}],results:[{status:'abstained',answer:'private-answer',citations:['private-citation'],diagnostics:{reason:'generation-failed: Local generation exceeded the 120000 ms time budget.',generationErrorName:'Error'}}]};
 const summary=summarizeHabemusReport(report);
 assert.equal(summary.stage,'failed');assert.equal(summary.calls[0].elapsedMs,120001);assert.equal(summary.calls[0].rawLength,0);assert.equal(summary.results[0].reason,'generation-time-budget-exceeded');assert.equal(summary.results[0].errorName,'Error');assert.ok(!JSON.stringify(summary).includes('private-'));
 report.calls=[{state:'completed',elapsedMs:89181,promptCharacters:394,raw:'NONE',firstTokenMs:87000,emittedCharacters:4,formattedPromptTokens:127,prefillBatchSize:128}];report.results[0].diagnostics.reason='model-abstained';
 const abstention=summarizeHabemusReport(report);assert.equal(abstention.calls[0].rawLength,4);assert.equal(abstention.calls[0].firstTokenMs,87000);assert.equal(abstention.calls[0].emittedCharacters,4);assert.equal(abstention.calls[0].formattedPromptTokens,127);assert.equal(abstention.calls[0].prefillBatchSize,128);assert.equal(abstention.results[0].reason,'model-abstained');assert.ok(!JSON.stringify(abstention).includes('NONE'));
});
test('real selection CI summary allows only fixed labels and bounded counts',()=>{
 const secret='private-value\n::error::injected',badCall={state:secret,raw:secret,prompt:secret,errorName:secret,elapsedMs:Infinity,promptCharacters:2601},badResult={status:secret,diagnostics:{reason:secret,generationErrorCode:secret,generationErrorName:secret}};
 const summary=summarizeHabemusReport({kind:'real-qwen-habemus-selection',stage:secret,profile:secret,elapsedMs:-1,externalRequests:1.5,calls:Array(100).fill(badCall),results:Array(100).fill(badResult)});
 assert.equal(summary.calls.length,2);assert.equal(summary.results.length,2);assert.equal(summary.stage,'unknown');assert.equal(summary.elapsedMs,null);assert.equal(summary.externalRequests,null);assert.equal(summary.calls[0].promptCharacters,null);assert.equal(summary.calls[0].elapsedMs,null);assert.equal(summary.calls[0].rawLength,secret.length);assert.ok(!JSON.stringify(summary).includes('private-value'));assert.ok(!JSON.stringify(summary).includes('::error::'));
 assert.deepEqual(summarizeHabemusReport({kind:secret}),{schemaVersion:1,reason:'invalid-report'});
 const generic=summarizeHabemusReport({kind:'real-qwen-habemus-selection',results:[{diagnostics:{reason:'generation-failed: '+secret,generationErrorCode:'TIMEOUT'}}]});assert.equal(generic.results[0].reason,'generation-failed');assert.equal(generic.results[0].errorCode,'TIMEOUT');assert.ok(!JSON.stringify(generic).includes(secret));
});
test('real selection CI summary rejects missing, malformed, oversized and non-file reports',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pbgc-habemus-ci-')),file=path.join(directory,'report.json');
 try{
  for(const target of [file,directory])assert.deepEqual(readHabemusSummary(target),{schemaVersion:1,reason:'report-unavailable'});
  fs.writeFileSync(file,'{private-invalid-json');assert.equal(readHabemusSummary(file).reason,'report-unavailable');
  fs.writeFileSync(file,'x'.repeat(1024*1024+1));assert.equal(readHabemusSummary(file).reason,'report-unavailable');
  fs.writeFileSync(file,JSON.stringify({kind:'real-qwen-habemus-selection',stage:'complete',calls:[],results:[]}));assert.equal(readHabemusSummary(file).stage,'complete');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
