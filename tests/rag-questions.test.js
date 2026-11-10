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

test('MOCK equal questions can select different documents while all-documents conflicts remain guarded',async()=>{
 const older=age(),newer=chunk('new-age','Normal retirement age is 67.'),chunks=[older,newer];let calls=0;
 const provider=mockProvider(({prompt})=>{calls++;return prompt.includes('67.')?newer.text:older.text;});
 const all=await answerQuestions({questions:[ageQuestion],chunks,provider,retrieve:()=>chunks});assert.equal(all.status,'conflict');assert.equal(calls,0,'All-documents scope still checks both conflicting source statements');
 const scopes=[{sourceIds:[older.sourceId]},{sourceIds:[newer.sourceId]}],requests=[];
 const result=await answerQuestions({questions:[ageQuestion,ageQuestion],questionScopes:scopes,chunks,provider,retrieve:request=>{requests.push(request.scope);assert.ok(Object.isFrozen(request.searchedSources));assert.deepEqual(request.searchedSources.map(source=>source.sourceId),request.scope.sourceIds);return request.chunks;}});
 assert.equal(result.status,'answered');assert.equal(result.answeredCount,2);assert.equal(calls,2);
 for(const [index,entry] of result.results.entries()){
  const source=chunks[index];assert.deepEqual(entry.scope.sourceIds,[source.sourceId]);assert.ok(Object.isFrozen(entry.scope.sourceIds));assert.equal(entry.result.answer,source.text+' [C1]');assert.deepEqual(entry.result.citations.map(value=>value.sourceId),[source.sourceId]);assert.equal(entry.result.citations[0].sourceHash,source.sourceHash);
  assert.deepEqual(entry.searchedSources,[{sourceId:source.sourceId,sourceName:source.sourceName,sourceHash:source.sourceHash}]);assert.ok(Object.isFrozen(entry.searchedSources));assert.ok(Object.isFrozen(entry.searchedSources[0]));
 }
 assert.deepEqual(requests.map(value=>value.sourceIds),[[older.sourceId],[newer.sourceId]]);
});

test('MOCK source selection intersects global IDs and hashes and never widens empty results',async()=>{
 const older=age(),newer=chunk('new-age','Normal retirement age is 67.'),chunks=[older,newer];
 for(const scope of [{sourceIds:[older.sourceId]},{sourceHashes:[older.sourceHash]},{sourceIds:[older.sourceId,newer.sourceId],sourceHashes:[older.sourceHash]}]){
  let retrieved=0,generated=0;
  const result=await answerQuestions({questions:[ageQuestion,ageQuestion],questionScopes:[{sourceIds:[older.sourceId,newer.sourceId]},{sourceIds:[newer.sourceId]}],scope,chunks,provider:mockProvider(()=>{generated++;return older.text;}),retrieve:request=>{retrieved++;assert.deepEqual(request.scope.sourceIds,[older.sourceId]);return request.chunks;}});
  assert.equal(result.status,'partial');assert.equal(retrieved,1,'An empty intersection does not call a retriever with empty IDs or fall back to all sources');assert.equal(generated,1);assert.equal(result.results[0].result.status,'answered');assert.equal(result.results[1].result.status,'abstained');assert.deepEqual(result.results[1].scope.sourceIds,[]);assert.deepEqual(result.results[1].searchedSources,[]);assert.deepEqual(result.results[1].result.retrieved,[]);
 }
 for(const scope of [{sourceIds:[]},{sourceHashes:[]},{sourceIds:['unknown-global-source']}]){
  let called=false;
  const result=await answerQuestions({questions:[ageQuestion],questionScopes:[{sourceIds:[older.sourceId]}],scope,chunks,retrieve:()=>{called=true;return chunks;},provider:mockProvider(()=>{called=true;return older.text;})});
  assert.equal(called,false);assert.equal(result.status,'abstained');assert.deepEqual(result.results[0].searchedSources,[]);
 }
});

test('MOCK duplicate checks use effective verified source bindings rather than selection order or syntax',async()=>{
 const chunks=[age(),retention()],all=chunks.map(value=>value.sourceId);let called=false;const common={questions:[ageQuestion,ageQuestion],chunks,retrieve:()=>{called=true;return chunks;},provider:mockProvider(()=>{called=true;return age().text;})};
 for(const questionScopes of [[{},{}],[{},{sourceIds:all}],[{sourceIds:all},{sourceIds:all.slice().reverse()}]])await assert.rejects(answerQuestions({...common,questionScopes}),/different question or document selection/);
 await assert.rejects(answerQuestions({...common,scope:{sourceIds:[all[0]]},questionScopes:[{}, {sourceIds:all}]}),/different question or document selection/,'Selections that become equal after the global restriction are duplicates');
 await assert.rejects(answerQuestions({...common,scope:{sourceIds:[]},questionScopes:[{sourceIds:[all[0]]},{sourceIds:[all[1]]}]}),/different question or document selection/,'Two empty effective source sets are also equal');
 assert.equal(called,false);
});

test('MOCK invalid or stale per-question document scopes reject before any callback',async()=>{
 const chunks=[age(),retention()],id=chunks[0].sourceId;let called=false;
 const common={questions:[ageQuestion,retentionQuestion],chunks,provider:mockProvider(()=>{called=true;return age().text;}),retrieve:()=>{called=true;return chunks;},onProgress:()=>{called=true;}};
 const bad=[null,{},[],[{}],[{},null],[{},undefined],Object.assign(Array(2),{0:{}}),[{},{sourceIds:[]}],[{},{sourceIds:[id,id]}],[{},{sourceIds:[42]}],[{},{sourceIds:['']}],[{},{sourceIds:['missing-source']}],[{},{sourceIds:Array.from({length:201},(_,index)=>'s'+index)}],[{},{sourceIds:[id],group:'Hourly'}],[{},{sourceHashes:[chunks[0].sourceHash]}],[{},{asOf:'2026-01-01'}]];
 for(const questionScopes of bad)await assert.rejects(answerQuestions({...common,questionScopes}));
 const inconsistent=[chunks[0],{...chunk('other','Normal retirement age is 67.'),sourceId:id}];await assert.rejects(answerQuestions({...common,chunks:inconsistent,questionScopes:[{},{}]}),/inconsistent names or hashes/);
 assert.equal(called,false);
});

test('MOCK per-question document selections and verified labels are frozen before asynchronous work',async()=>{
 const first=age(),second=chunk('new-age','Normal retirement age is 67.'),chunks=[first,second],questionScopes=[{sourceIds:[first.sourceId]},{sourceIds:[second.sourceId]}],scope={sourceIds:[first.sourceId,second.sourceId]},questions=[ageQuestion,ageQuestion];let release;
 const ready=new Promise(resolve=>{release=resolve;});
 const pending=answerQuestions({questions,questionScopes,scope,chunks,provider:mockProvider(({prompt})=>prompt.includes('67.')?'Normal retirement age is 67.':'Normal retirement age is 65.'),retrieve:async request=>{
  if(request.index===0){release();await nextTurn();}
  assert.ok(Object.isFrozen(request.scope));assert.ok(Object.isFrozen(request.scope.sourceIds));assert.throws(()=>request.scope.sourceIds.push('wrong-source'),TypeError);
  return request.chunks.filter(value=>request.scope.sourceIds.includes(value.sourceId));
 }});
 await ready;questionScopes[0].sourceIds[0]=second.sourceId;questionScopes[1].sourceIds[0]=first.sourceId;scope.sourceIds.splice(0,2);chunks[0].sourceName='Changed caller name.txt';chunks[0].sourceHash='f'.repeat(64);questions[1]='Who receives the money?';
 const result=await pending;assert.equal(result.status,'answered');assert.deepEqual(result.results.map(entry=>entry.question),[ageQuestion,ageQuestion]);assert.deepEqual(result.results.map(entry=>entry.searchedSources[0].sourceId),['source-age','source-new-age']);assert.equal(result.results[0].searchedSources[0].sourceName,'synthetic-age.txt');assert.equal(result.results[0].searchedSources[0].sourceHash,'a'.repeat(64));assert.equal(result.results[1].result.answer,'Normal retirement age is 67. [C1]');
});

test('MOCK scoped calls preserve global applicability guards and do not trust excluded evidence',async()=>{
 const chunks=[age(),chunk('new-age','Normal retirement age is 67.')];let calls=0;
 const result=await answerQuestions({questions:[ageQuestion],questionScopes:[{sourceIds:[chunks[0].sourceId]}],chunks,retrieve:()=>chunks,provider:mockProvider(()=>{calls++;return chunks[1].text;})});assert.equal(result.status,'abstained');assert.equal(calls,1);assert.equal(result.results[0].result.diagnostics.reason,'model-grounding-rejected');assert.ok(result.results[0].result.retrieved.every(value=>value.sourceId===chunks[0].sourceId));
 for(const scope of [{group:'Hourly'},{asOf:'2026-01-01'}]){
  let generated=false;
  const guarded=await answerQuestions({questions:[ageQuestion],questionScopes:[{sourceIds:[chunks[0].sourceId]}],scope,chunks,retrieve:request=>{for(const key of Object.keys(scope))assert.equal(request.scope[key],scope[key]);return request.chunks;},provider:mockProvider(()=>{generated=true;return chunks[0].text;})});assert.equal(guarded.status,'abstained');assert.equal(guarded.results[0].result.diagnostics.reason,'unverified-source-applicability');assert.equal(generated,false);
 }
});

test('MOCK all-documents callers can still use more than 200 verified corpus sources',async()=>{
 const chunks=Array.from({length:201},(_,index)=>chunk('doc-'+index,'Normal retirement age is 65.'));
 for(const scope of [undefined,{sourceHashes:['b'.repeat(64)]}]){
  const result=await answerQuestions({questions:[ageQuestion],chunks,scope,retrieve:request=>{assert.equal(request.scope.sourceIds,undefined,'All documents does not manufacture an over-limit core sourceIds list');assert.equal(request.searchedSources.length,201);assert.ok(Object.isFrozen(request.searchedSources));return[request.chunks[200]];},provider:mockProvider(()=>chunks[200].text)});
  assert.equal(result.status,'answered');assert.equal(result.results[0].searchedSources.length,201);assert.equal(result.results[0].result.citations[0].sourceId,chunks[200].sourceId);
 }
});
