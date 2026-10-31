'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../assets/semantic.js');
function chunks(){return[{id:'chunk-z',text:'Synthetic pension evidence',sourceId:'synthetic-a',sourceName:'synthetic.txt',sourceHash:'a'.repeat(64),locators:[{type:'text-line',line:1}],recordIndices:[0]},{id:'chunk-a',text:'Synthetic survivor evidence',sourceId:'synthetic-b',sourceName:'synthetic2.txt',sourceHash:'b'.repeat(64),locators:[{type:'text-line',line:2}],recordIndices:[1]},{id:'chunk-b',text:'Synthetic unrelated text',sourceId:'synthetic-c',sourceName:'synthetic3.txt',sourceHash:'c'.repeat(64),locators:[{type:'text-line',line:3}],recordIndices:[2]}];}
// Injected finite vectors exercise orchestration only. This is NOT a real model
// and these tests make no claim of actual semantic retrieval quality.
function fixtureProvider(overrides={}){return{id:'unit-fixture-vectors-not-a-model-v1',dimension:3,calls:[],async embedTexts(texts,{signal}={}){this.calls.push(texts.slice());return texts.map(text=>new Float32Array(text.includes('unrelated')?[0,0,2]:text.includes('survivor')?[0,2,0]:[2,0,0]));},...overrides};}
const clone=value=>JSON.parse(JSON.stringify(value));
test('actual provider protocol is batched, normalized and source-bound without altering inputs',async()=>{
  const provider=fixtureProvider(),input=chunks(),events=[];const index=await api.buildSemanticIndex(input,provider,{batchSize:2,onProgress:event=>events.push(event)});
  assert.equal(provider.calls.length,2);assert.deepEqual(events.map(event=>event.completed),[0,2,3]);assert.deepEqual(Array.from(index.vectors[0]),[1,0,0]);assert.equal(input[0].score,undefined);
  assert.equal(api.validateSemanticIndex(index,input,provider).valid,true);index.chunks[0].locators[0].line=99;assert.equal(input[0].locators[0].line,1);assert.equal(api.validateSemanticIndex(index,input,provider).valid,false);
});
test('cosine retrieval preserves citations, diagnostics and deterministic ties',async()=>{
  const provider=fixtureProvider(),input=chunks(),index=await api.buildSemanticIndex(input,provider),result=await api.retrieveSemantic(index,'pension query',provider,{topK:2,minScore:0.1});
  assert.equal(result.results.length,1);assert.equal(result.results[0].id,'chunk-z');assert.equal(result.results[0].semanticScore,1);assert.equal(result.results[0].citations[0].sourceHash,input[0].sourceHash);assert.deepEqual(result.results[0].citations[0].locators,input[0].locators);assert.equal(result.diagnostics.weak,false);assert.equal(result.diagnostics.ambiguous,false);assert.match(result.diagnostics.confidenceNotice,/not a calibrated/);
  const tied=await api.buildSemanticIndex(input.slice(0,2),fixtureProvider({async embedTexts(texts){return texts.map(()=>new Float32Array([1,0,0]));}}));
  const tieProvider=fixtureProvider({async embedTexts(texts){return texts.map(()=>new Float32Array([1,0,0]));}}),tie=await api.retrieveSemantic(tied,'query',tieProvider,{topK:2});assert.deepEqual(tie.results.map(chunk=>chunk.id),['chunk-a','chunk-z']);assert.equal(tie.diagnostics.ambiguous,true);
});
test('weak retrieval returns no fabricated semantic hits and exact thresholds stay explicit',async()=>{
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks().slice(0,1),provider),result=await api.retrieveSemantic(index,'survivor query',provider,{minScore:0.2});assert.equal(result.results.length,0);assert.equal(result.diagnostics.weak,true);assert.equal(result.diagnostics.topScore,0);assert.equal(result.diagnostics.margin,null);
});
test('stale source content, locators and provider identity reject; locator key ordering is canonical',async()=>{
  const provider=fixtureProvider(),input=chunks(),index=await api.buildSemanticIndex(input,provider);
  for(const change of [list=>list[0].sourceHash='d'.repeat(64),list=>list[0].text+=' changed',list=>list[0].locators[0].line=99,list=>list.pop()]){const changed=clone(input);change(changed);assert.equal(api.validateSemanticIndex(index,changed,provider).valid,false);}
  assert.equal(api.validateSemanticIndex(index,input,fixtureProvider({id:'different-real-model-version'})).valid,false);await assert.rejects(api.retrieveSemantic(index,'query',fixtureProvider({dimension:2})),/stale/);
  const plain={...index};await assert.rejects(api.retrieveSemantic(plain,'query',provider),/Untrusted/);
});
test('invalid, zero, wrong-size and nonfinite vectors fail closed',async()=>{
  for(const vector of [new Float32Array([0,0,0]),new Float32Array([1,NaN,0]),new Float32Array([1,Infinity,0]),new Float32Array([1,0]),[1,0,0]])await assert.rejects(api.buildSemanticIndex(chunks().slice(0,1),fixtureProvider({async embedTexts(){return[vector];}})),/vector/);
  await assert.rejects(api.buildSemanticIndex(chunks(),fixtureProvider({async embedTexts(){return[];}})),/batch/);
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider);index.vectors[0][0]=2;assert.equal(api.validateSemanticIndex(index,chunks(),provider).valid,false);
});
test('cancellation rejects promptly and is forwarded to provider without yielding a partial index',async()=>{
  const controller=new AbortController();let seenSignal;
  const promise=api.buildSemanticIndex(chunks(),fixtureProvider({async embedTexts(texts,{signal}){seenSignal=signal;return new Promise(()=>{});}}),{signal:controller.signal});await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await assert.rejects(promise,error=>error.name==='AbortError');assert.equal(seenSignal,controller.signal);
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider),queryAbort=new AbortController();queryAbort.abort();await assert.rejects(api.retrieveSemantic(index,'query',provider,{signal:queryAbort.signal}),error=>error.name==='AbortError');
});
test('portable caches validate source/provider and re-embed rather than trust forged normalized vectors',async()=>{
  const provider=fixtureProvider(),input=chunks(),index=await api.buildSemanticIndex(input,provider),cache=api.serializeSemanticIndex(index);assert.equal(cache.kind,'dense-semantic-cache');assert.equal(Array.isArray(cache.vectors[0]),true);
  cache.vectors[0]=[0,1,0];const before=provider.calls.length,restored=await api.restoreSemanticIndex(cache,input,provider);assert.ok(provider.calls.length>before);assert.deepEqual(Array.from(restored.vectors[0]),[1,0,0]);
  const zero=clone(cache);zero.vectors[0]=[0,0,0];await assert.rejects(api.restoreSemanticIndex(zero,input,provider),/zero/);
  const stale=clone(cache);stale.chunks[0].text='forged cache excerpt';await assert.rejects(api.restoreSemanticIndex(stale,input,provider),/stale/);await assert.rejects(api.restoreSemanticIndex(cache,input,fixtureProvider({id:'other'})),/stale/);
});
test('hybrid fusion and candidate reranking retain semantic/lexical scores with honest method labels',async()=>{
  const provider=fixtureProvider(),input=chunks(),index=await api.buildSemanticIndex(input,provider),hybrid=await api.retrieveHybrid(index,'pension',provider,{topK:3});assert.equal(hybrid.results[0].id,'chunk-z');assert.ok(hybrid.results[0].semanticScore>0);assert.ok(hybrid.results[0].lexicalScore>0);assert.equal(hybrid.results[0].explanation.method,'weighted reciprocal-rank fusion');assert.match(hybrid.diagnostics.confidenceNotice,/not confidence/);
  const reranked=await api.rerankSemantic(index,'survivor',provider,['chunk-z','chunk-a'],{topK:2,minScore:-1});assert.equal(reranked.results[0].id,'chunk-a');assert.equal(reranked.diagnostics.method,'cosine-candidate-rerank');assert.match(reranked.diagnostics.rerankingNotice,/No separate/);await assert.rejects(api.rerankSemantic(index,'query',provider,['missing']),/does not belong/);
});
test('chunk metadata, memory, query and provider budgets reject before inference',async()=>{
  const provider=fixtureProvider();await assert.rejects(api.buildSemanticIndex([],provider),/one to/);await assert.rejects(api.buildSemanticIndex(chunks(),fixtureProvider({dimension:4097})),/dimension/);
  for(const change of [list=>list.push(list[0]),list=>list[0].sourceHash='invalid',list=>list[0].locators=[],list=>list[0].recordIndices=[-1],list=>list[0].text='x'.repeat(8001)]){const input=chunks();change(input);await assert.rejects(api.buildSemanticIndex(input,provider));}
  const index=await api.buildSemanticIndex(chunks(),provider);for(const config of [{topK:0},{topK:101},{minScore:NaN},{minScore:2},{ambiguityMargin:-1}])await assert.rejects(api.retrieveSemantic(index,'query',provider,config));await assert.rejects(api.retrieveSemantic(index,'x'.repeat(2001),provider),/2,000/);
  const overBudget=Array.from({length:4097},(_,i)=>({...chunks()[0],id:'many-'+i}));await assert.rejects(api.buildSemanticIndex(overBudget,fixtureProvider({dimension:4096})),/64 MiB/);
});
test('bundled learned embeddings retrieve six synthetic synonym topics without exact query words',async()=>{
  const {createEmbeddingProvider}=require('../assets/embeddings.js');const provider=await createEmbeddingProvider();assert.equal(provider.kind,'learned-sentence-embedding');
  const texts=['The automobile needs gasoline and engine maintenance.','Physicians diagnose illnesses and prescribe medical treatment.','Teachers help pupils learn lessons in school classrooms.','Investors trade company shares on the financial exchange.','Employees receive a pension income after retirement.','Farmers harvest wheat and grow crops in fields.'];
  const corpus=texts.map((text,index)=>({id:'learned-'+index,text,sourceId:'synthetic-'+index,sourceName:'synthetic-topic.txt',sourceHash:String(index).repeat(64),locators:[{type:'text-line',line:index+1}],recordIndices:[index]}));
  const queries=['car fuel repairs','doctor medicine sick patient','student education instruction','stock market equity','retiree monthly benefits','agriculture grain farming'];
  const index=await api.buildSemanticIndex(corpus,provider);let recallAtOne=0;
  for(let expected=0;expected<queries.length;expected++){
    const query=queries[expected],documentWords=new Set(texts[expected].toLowerCase().match(/[a-z]+/g));assert.ok(query.split(' ').every(word=>!documentWords.has(word)),'synonym fixture has no exact query words in target');
    const result=await api.retrieveSemantic(index,query,provider,{topK:3,minScore:0.25});if(result.results[0]?.id==='learned-'+expected)recallAtOne++;assert.equal(result.results[0].sourceHash,corpus[expected].sourceHash);assert.deepEqual(result.results[0].locators,corpus[expected].locators);assert.equal(result.diagnostics.providerId,provider.id);
  }
  assert.equal(recallAtOne,6,'Recall@1=6/6 on this small synthetic synonym fixture; not a general domain-quality claim');
});
