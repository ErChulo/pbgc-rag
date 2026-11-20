'use strict';
// Ordinary single-property source prose must keep its complete conditions.
// These adapters test source-selection/grounding, not actual model quality.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {answerQuestion}=require('../assets/rag.js');
const QUESTION='What is the normal retirement age?';
function chunk(id,text){return{id,text,sourceId:'source-'+id,sourceName:'synthetic-'+id+'.txt',sourceHash:(id==='other'?'b':'a').repeat(64),locators:[{type:'text-line',line:1,offset:0}],recordIndices:[0]};}
function local(raw='S1',observe=()=>{}){return{id:'MOCK-single-qualified-source-protocol',answerFormat:'source-selection-grounded-v1',generate:async request=>{observe(request);return raw;}};}
const run=(question,chunks,provider)=>answerQuestion({question,chunks,retrieval:{results:chunks,diagnostics:{weak:false}},provider});
function sourceData(prompt){return JSON.parse(prompt.split('UNTRUSTED DATA JSON\n')[1].split('\nEND DATA')[0]);}

for(const [name,fact]of [
 ['full benefit phrasing','Normal retirement age for a full benefit is 65.'],
 ['joined service and vesting conditions','Normal retirement age is 65 only if service is at least 10 years and the participant is vested.'],
 ['alternative complete conditions','Normal retirement age is 65 only if service is at least 10 years or a completed application is received.'],
 ['comma qualified condition','Normal retirement age is 65 only if service is at least 10 years, documented by the administrator.']
])test('single factual selection preserves '+name,async()=>{
 let request,calls=0;const chunks=[chunk('plan','The archive retains a signed instrument. '+fact+' The archive retains source correspondence.')];
 const result=await run(QUESTION,chunks,local('S1',value=>{calls++;request=value;}));
 assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(calls,1);
 assert.equal(result.answer,fact+' [C1]');assert.equal(result.citations.length,1);assert.deepEqual(result.citations[0].quotes,[fact]);
 assert.equal(request.responseFormat,'source-selection-v1');assert.ok(request.prompt.length<650);
 assert.deepEqual(sourceData(request.prompt).sources,[{id:'S1',text:fact}]);
});

test('a compound question still cannot borrow two people from one joined assertion',async()=>{
 let calls=0;const result=await run("What is Alice's age? What is Bob's age?",[chunk('plan','Alice age is 65 and Bob age is 67.')],local('S1',()=>calls++));
 assert.equal(result.status,'abstained');assert.equal(calls,0);assert.equal(result.diagnostics.reason,'question-part-evidence-missing');
});

test('conflicting joined-condition statements stop before model selection',async()=>{
 let calls=0;const first='Normal retirement age is 65 only if service is at least 10 years and the participant is vested.',second='Normal retirement age is 67 only if service is at least 10 years and the participant is vested.';
 const result=await run(QUESTION,[chunk('plan',first),chunk('other',second)],local('S1',()=>calls++));
 assert.equal(result.status,'conflict');assert.equal(result.diagnostics.reason,'possible-source-conflict');assert.equal(calls,0);
});

test('a joined condition outside the quoted prefix cannot be dropped to create a short choice',async()=>{
 let calls=0;const fact='Normal retirement age is 65'+' '.repeat(2100)+'only if service is at least 10 years and the participant is vested.';
 const result=await run(QUESTION,[chunk('plan',fact)],local('S1',()=>calls++));
 assert.equal(result.status,'abstained');assert.equal(calls,0);assert.equal(result.diagnostics.reason,'question-part-evidence-missing');
});
