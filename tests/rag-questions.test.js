'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {answerQuestions,QUESTION_SET_LIMITS}=require('../assets/rag-questions.js');
const {answerQuestion}=require('../assets/rag.js');
const ageQuestion='What is the normal retirement age?';
const retentionQuestion='How long are case files retained?';
function chunk(id,text){return{id,text,sourceId:'source-'+id,sourceName:'synthetic-'+id+'.txt',sourceHash:(id==='age'?'a':'b').repeat(64),locators:[{type:'text-line',line:1}],recordIndices:[0]};}
const age=()=>chunk('age','Normal retirement age is 65.');
const retention=()=>chunk('retention','Case files are retained for seven years.');
function mockProvider(generate){return{id:'MOCK-question-set-orchestration-not-model-quality',answerFormat:'plain-grounded-v1',generate};}
const answerFromPrompt=({prompt})=>prompt.includes(JSON.stringify(retentionQuestion))?'Case files are retained for seven years.':'Normal retirement age is 65.';
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));

test('MOCK explicit questions receive separate retrieval and source-bound answers in user order',async()=>{
 const calls=[],progress=[],chunks=[age(),retention()];let active=0,maxActive=0;
 const result=await answerQuestions({questions:['  '+ageQuestion+'  ',retentionQuestion],chunks,provider:mockProvider(async args=>{active++;maxActive=Math.max(maxActive,active);await nextTurn();const answer=answerFromPrompt(args);active--;return answer;}),retrieve:async request=>{calls.push(request.question);assert.equal(request.index,calls.length-1);assert.ok(Object.isFrozen(request.chunks));return request.chunks.filter(value=>request.index===0?value.id==='age':value.id==='retention');},onProgress:event=>{progress.push(event);assert.deepEqual(Object.keys(event).sort(),['index','phase','total']);}});
 assert.equal(result.status,'answered');assert.equal(result.answeredCount,2);assert.equal(result.totalQuestions,2);assert.equal(result.diagnostics.allQuestionsAnswered,true);assert.equal(result.diagnostics.automaticDecomposition,false);assert.equal(result.officialReleaseAllowed,false);assert.equal(maxActive,1);
 assert.deepEqual(calls,[ageQuestion,retentionQuestion]);assert.deepEqual(progress.map(value=>value.phase),['retrieving','answering','complete','retrieving','answering','complete']);
 assert.deepEqual(result.results.map(value=>value.question),[ageQuestion,retentionQuestion]);
 for(const [index,entry] of result.results.entries()){assert.equal(entry.index,index);assert.equal(entry.result.status,'answered');assert.equal(entry.result.citations.length,1);assert.equal(entry.result.citations[0].sourceHash,chunks[index].sourceHash);assert.deepEqual(entry.result.citations[0].locators,chunks[index].locators);assert.equal(entry.result.citations[0].quotes[0],chunks[index].text);assert.match(entry.result.answer,/\[C1\]$/);}
});

test('MOCK missing retrieval callback uses independent lexical retrieval and does not split prose',async()=>{
 const chunks=[age(),retention()],provider=mockProvider(answerFromPrompt);
 const result=await answerQuestions({questions:[ageQuestion,retentionQuestion],chunks,provider});assert.equal(result.status,'answered');assert.deepEqual(result.results.map(value=>value.result.retrieved[0].sourceId),chunks.map(value=>value.sourceId));
 const combined='What are the normal retirement age and the case file retention period?';let calls=0;
 const blocked=await answerQuestions({questions:[combined],chunks,provider:mockProvider(()=>{calls++;return chunks[0].text;}),retrieve:()=>chunks});assert.equal(blocked.status,'abstained');assert.equal(blocked.results.length,1);assert.equal(blocked.results[0].result.diagnostics.reason,'plain-multi-part-question-unsupported');assert.equal(calls,0);
});

test('MOCK the supported maximum runs three questions with individually scoped citations',async()=>{
 const questions=[ageQuestion,retentionQuestion,'What retirement age is documented?'],chunks=[age(),retention()];
 const result=await answerQuestions({questions,chunks,provider:mockProvider(answerFromPrompt)});assert.equal(result.status,'answered');assert.equal(result.answeredCount,3);assert.equal(result.totalQuestions,3);assert.deepEqual(result.results.map(value=>value.result.citations[0].sourceId),['source-age','source-retention','source-age']);
});

test('MOCK every grouped result preserves the existing single-question guards and abstention',async()=>{
 const chunks=[age(),retention()],provider=mockProvider(answerFromPrompt),questions=[ageQuestion,'Which mortality table is documented?'];
 const grouped=await answerQuestions({questions,chunks,provider});assert.equal(grouped.status,'partial');assert.equal(grouped.answeredCount,1);assert.equal(grouped.diagnostics.allQuestionsAnswered,false);
 for(const [index,entry] of grouped.results.entries()){const independent=await answerQuestion({question:questions[index],chunks,provider});assert.deepEqual(entry.result,independent);}
 const conflict=[age(),chunk('age-conflict','Normal retirement age is 67.'),retention()];
 const mixed=await answerQuestions({questions:[ageQuestion,retentionQuestion],chunks:conflict,provider});assert.equal(mixed.status,'partial');assert.deepEqual(mixed.results.map(value=>value.result.status),['conflict','answered']);
 const none=await answerQuestions({questions:[ageQuestion,'Which mortality table is documented?'],chunks:conflict,provider});assert.equal(none.status,'conflict');assert.equal(none.answeredCount,0);
 const unavailable=await answerQuestions({questions:[ageQuestion,retentionQuestion],chunks});assert.equal(unavailable.status,'abstained');assert.equal(unavailable.answeredCount,0);assert.ok(unavailable.results.every(value=>value.result.diagnostics.reason==='generation-provider-unavailable'));
});

test('MOCK set bounds and duplicate questions reject before retrieval or model work',async()=>{
 let called=false;const input={chunks:[age()],provider:mockProvider(()=>{called=true;return age().text;}),retrieve:()=>{called=true;return[age()];}};
 for(const questions of [[],Array(4).fill(ageQuestion),Object.assign(Array(2),{0:ageQuestion}),[' '],[ageQuestion,ageQuestion.toUpperCase()],[ageQuestion,'What  is the normal retirement age?'],['x'.repeat(1001)],[42]])await assert.rejects(answerQuestions({...input,questions}));
 for(const options of [{batchTimeoutMs:0},{batchTimeoutMs:360001},{batchTimeoutMs:1.5},{timeoutMs:120001},{contextCharacters:12001},{maxChunks:7},{groundingMode:'unsafe'},{maxTokens:1025},{unknown:1}])await assert.rejects(answerQuestions({...input,questions:[ageQuestion],options}));
 assert.equal(called,false);assert.equal(QUESTION_SET_LIMITS.questions,3);assert.equal(QUESTION_SET_LIMITS.timeoutMs,360000);
});

test('MOCK immutable source and scope snapshots prevent asynchronous caller changes',async()=>{
 const chunks=[age(),retention()],scope={sourceIds:[chunks[0].sourceId]},options={timeoutMs:1000};let release;const started=new Promise(resolve=>{release=resolve;});
 const pending=answerQuestions({questions:[ageQuestion,retentionQuestion],chunks,scope,options,provider:mockProvider(answerFromPrompt),retrieve:async request=>{release();await nextTurn();assert.ok(Object.isFrozen(request.scope.sourceIds));assert.throws(()=>{request.chunks[0].text='Normal retirement age is 99.';},TypeError);return request.chunks;}});
 await started;chunks[0].text='Normal retirement age is 99.';chunks[0].locators[0].line=99;scope.sourceIds.push('source-retention');options.timeoutMs=1;
 const result=await pending;assert.equal(result.status,'partial');assert.equal(result.results[0].result.answer,'Normal retirement age is 65. [C1]');assert.equal(result.results[0].result.citations[0].locators[0].line,1);assert.equal(result.results[1].result.diagnostics.reason,'question-topic-not-supported');assert.ok(result.results[1].result.retrieved.every(value=>value.sourceId==='source-age'));
});

test('MOCK stale retrieval, failed callbacks and unclonable source metadata remain errors',async()=>{
 const chunks=[age()];await assert.rejects(answerQuestions({questions:[ageQuestion],chunks,retrieve:()=>[{...chunks[0],text:'Normal retirement age is 99.'}]}),/does not bind/);
 await assert.rejects(answerQuestions({questions:[ageQuestion],chunks,retrieve:()=>undefined}),/must return evidence/);
 const sentinel=Error('Synthetic retrieval failed.');await assert.rejects(answerQuestions({questions:[ageQuestion],chunks,retrieve:()=>{throw sentinel;}}),error=>error===sentinel);
 await assert.rejects(answerQuestions({questions:[ageQuestion],chunks,onProgress:()=>{throw sentinel;}}),error=>error===sentinel);
 const cyclic=age();cyclic.locators[0].self=cyclic.locators[0];await assert.rejects(answerQuestions({questions:[ageQuestion],chunks:[cyclic]}),/cycles/);
 const uncloneable=age();uncloneable.locators[0].callback=()=>{};await assert.rejects(answerQuestions({questions:[ageQuestion],chunks:[uncloneable]}),/cloneable JSON/);
 const malformed=age();malformed.sourceHash='invalid';let called=false;await assert.rejects(answerQuestions({questions:[ageQuestion],chunks:[malformed],retrieve:()=>{called=true;return[];}}),/hashes/);assert.equal(called,false);
 const invalidScope={asOf:'2026-02-30'};await assert.rejects(answerQuestions({questions:[ageQuestion],chunks,scope:invalidScope}),/as-of/);
});

test('MOCK cancellation after a validated first answer releases no partial question set',async()=>{
 const controller=new AbortController(),progress=[];let calls=0,retrievalSignal;
 const pending=answerQuestions({questions:[ageQuestion,retentionQuestion],chunks:[age(),retention()],provider:mockProvider(args=>{calls++;return answerFromPrompt(args);}),signal:controller.signal,onProgress:event=>progress.push(event),retrieve:request=>{if(request.index===0)return[request.chunks[0]];retrievalSignal=request.signal;return new Promise(()=>{});}});
 while(!retrievalSignal)await nextTurn();controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(calls,1);assert.equal(retrievalSignal.aborted,true);assert.deepEqual(progress.filter(value=>value.phase==='complete').map(value=>value.index),[0]);
});

test('MOCK cooperative and uncooperative retrieval cancellation and deadline never start inference',async()=>{
 for(const cooperative of [true,false])for(const cancellation of [true,false]){
  const controller=new AbortController();let started,signal,calls=0;const ready=new Promise(resolve=>{started=resolve;});
  const pending=answerQuestions({questions:[ageQuestion],chunks:[age()],provider:mockProvider(()=>{calls++;return age().text;}),signal:controller.signal,options:{batchTimeoutMs:cancellation?1000:10},retrieve:request=>{signal=request.signal;started();return new Promise((resolve,reject)=>{if(cooperative)request.signal.addEventListener('abort',()=>{const error=Error('Synthetic retrieval stopped.');error.name='AbortError';reject(error);},{once:true});});}});
  await ready;if(cancellation)controller.abort();await assert.rejects(pending,error=>error.name===(cancellation?'AbortError':'TimeoutError'));assert.equal(signal.aborted,true);assert.equal(calls,0);
 }
});

test('MOCK cooperative and uncooperative provider cancellation or timeout cannot run a later question',async()=>{
 for(const cooperative of [true,false])for(const cancellation of [true,false]){
  const controller=new AbortController();let started,signal,calls=0;const ready=new Promise(resolve=>{started=resolve;});
  const pending=answerQuestions({questions:[ageQuestion,retentionQuestion],chunks:[age(),retention()],signal:controller.signal,options:{batchTimeoutMs:cancellation?1000:10},provider:mockProvider(request=>{calls++;signal=request.signal;started();return new Promise((resolve,reject)=>{if(cooperative)request.signal.addEventListener('abort',()=>{const error=Error('Synthetic model stopped.');error.name='AbortError';reject(error);},{once:true});});})});
  await ready;if(cancellation)controller.abort();await assert.rejects(pending,error=>error.name===(cancellation?'AbortError':'TimeoutError'));assert.equal(calls,1);assert.equal(signal.aborted,true);
 }
 let calls=0;await assert.rejects(answerQuestions({questions:[ageQuestion,retentionQuestion],chunks:[age(),retention()],options:{timeoutMs:5,batchTimeoutMs:1000},provider:mockProvider(()=>{calls++;return new Promise(()=>{});})}),error=>error.name==='TimeoutError');assert.equal(calls,1,'a core per-question timeout must not overlap an uncooperative inference with a later one');
});

test('MOCK pre-aborted sets and cancellation inside a progress callback release no inference',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;const provider=mockProvider(()=>{calls++;return age().text;});await assert.rejects(answerQuestions({questions:[ageQuestion],chunks:[age()],provider,signal:controller.signal}),error=>error.name==='AbortError');
 const during=new AbortController();await assert.rejects(answerQuestions({questions:[ageQuestion],chunks:[age()],provider,signal:during.signal,onProgress:()=>during.abort()}),error=>error.name==='AbortError');assert.equal(calls,0);
});

test('MOCK an adapter timeout after one valid answer discards the set and never starts question three',async()=>{
 for(const identification of [{name:'TimeoutError'},{name:'LocalLlmError',code:'TIMEOUT'}]){
  let calls=0,completed=0;
  const pending=answerQuestions({questions:[ageQuestion,retentionQuestion,'What retirement age is documented?'],chunks:[age(),retention()],onProgress:event=>{if(event.phase==='complete')completed++;},provider:mockProvider(()=>{if(++calls===1)return age().text;const error=Error('Synthetic adapter deadline reached.');Object.assign(error,identification);throw error;})});
  await assert.rejects(pending,error=>error.name==='TimeoutError'&&/A question exceeded its time budget/.test(error.message));
  assert.equal(completed,1,'Only progress metadata can describe the first completed question');assert.equal(calls,2,'An adapter deadline must stop the set before a third model call');
 }
});
