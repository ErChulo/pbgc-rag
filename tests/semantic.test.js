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


test('source-scoped dense and hybrid ranking select candidates before global top-K and lexical fusion',async()=>{
  const distractors=Array.from({length:110},(_,i)=>({id:'distractor-'+i,text:'pension pension pension archive '+i,sourceId:'excluded',sourceName:'synthetic-excluded.txt',sourceHash:'a'.repeat(64),locators:[{type:'text-line',line:i+1}],recordIndices:[i]}));
  const target={id:'selected-target',text:'target pension',sourceId:'selected',sourceName:'synthetic-selected.txt',sourceHash:'b'.repeat(64),locators:[{type:'text-line',line:1}],recordIndices:[0]};
  const provider=fixtureProvider({async embedTexts(texts){return texts.map(text=>new Float32Array(text==='target pension'?[0.8,0.6,0]:[1,0,0]));}}),index=await api.buildSemanticIndex([...distractors,target],provider);
  const global=await api.retrieveSemantic(index,'pension',provider,{topK:100,minScore:0.75});
  assert.equal(global.results.length,100);assert.ok(global.results.every(chunk=>chunk.sourceId==='excluded'),'The selected target is below the global dense candidate limit');
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    const result=await retrieve(index,'pension',provider,{topK:4,minScore:0.75,sourceIds:['selected']});
    assert.deepEqual(result.results.map(chunk=>chunk.id),['selected-target']);
    assert.equal(result.results[0].sourceHash,target.sourceHash);assert.deepEqual(result.results[0].citations[0].locators,target.locators);
    assert.equal(result.diagnostics.indexedChunks,1);assert.equal(result.diagnostics.totalIndexedChunks,111);
    assert.ok(Math.abs(result.diagnostics.topScore-0.8)<0.000001);assert.equal(result.diagnostics.margin,null);assert.equal(result.diagnostics.weak,false);assert.equal(result.diagnostics.ambiguous,false);
    assert.deepEqual(result.diagnostics.sourceSelection,{sourceIds:['selected'],matchedSourceIds:['selected'],missingSourceIds:[]});
    if(retrieve===api.retrieveHybrid){assert.equal(result.diagnostics.lexicalMatches,1);assert.ok(Math.abs(result.results[0].lexicalScore-Math.log(4/3))<1e-12,'BM25 document frequency and length normalization use only the selected document');}
  }
});

test('a strong excluded document cannot hide weak selected semantic evidence',async()=>{
  const input=chunks();input[1].text='Synthetic pension survivor evidence';
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(input,provider);
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    const result=await retrieve(index,'pension query',provider,{sourceIds:['synthetic-b'],minScore:0.25});
    assert.equal(result.diagnostics.topScore,0);assert.equal(result.diagnostics.weak,true);assert.equal(result.diagnostics.margin,null);assert.equal(result.diagnostics.indexedChunks,1);
    assert.ok(result.results.every(chunk=>chunk.sourceId==='synthetic-b'));
    if(retrieve===api.retrieveSemantic)assert.deepEqual(result.results,[]);
    else assert.equal(result.diagnostics.lexicalMatches,1,'Lexical matches do not rewrite semantic weakness');
  }
});

test('unknown or nonindexed source selections return empty weak evidence without global fallback or query embedding',async()=>{
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider),calls=provider.calls.length;
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    const empty=await retrieve(index,'pension',provider,{sourceIds:['missing-or-image-only']});
    assert.deepEqual(empty.results,[]);assert.equal(empty.diagnostics.weak,true);assert.equal(empty.diagnostics.topScore,null);assert.equal(empty.diagnostics.margin,null);assert.equal(empty.diagnostics.indexedChunks,0);assert.equal(empty.diagnostics.totalIndexedChunks,3);assert.equal(empty.diagnostics.reason,'no-indexed-source-chunks');
    assert.deepEqual(empty.diagnostics.sourceSelection,{sourceIds:['missing-or-image-only'],matchedSourceIds:[],missingSourceIds:['missing-or-image-only']});
    assert.equal(provider.calls.length,calls,'No query embedding is needed when no indexed source is eligible');
  }
  const mixed=await api.retrieveHybrid(index,'pension',provider,{sourceIds:['synthetic-a','missing-or-image-only']});
  assert.deepEqual(mixed.results.map(chunk=>chunk.sourceId),['synthetic-a']);assert.deepEqual(mixed.diagnostics.sourceSelection.missingSourceIds,['missing-or-image-only']);
});

test('invalid and sparse source selections reject before a query embedding can run',async()=>{
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider),calls=provider.calls.length;
  const sparse=[];sparse.length=2;sparse[0]='synthetic-a';
  const invalid=[[],null,'synthetic-a',{},[''],['   '],['synthetic-a','synthetic-a'],['synthetic-a',7],['x'.repeat(301)],Array.from({length:201},(_,i)=>'s'+i),sparse];
  for(const sourceIds of invalid)for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid])await assert.rejects(retrieve(index,'pension',provider,{sourceIds}),/source selection/);
  assert.equal(provider.calls.length,calls);
});

test('a scoped retrieval snapshots source IDs and metadata before asynchronous embedding',async()=>{
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider);let begin,release;
    const started=new Promise(resolve=>{begin=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
    provider.embedTexts=async()=>{begin();await waiting;return[new Float32Array([1,0,0])];};
    const ids=['synthetic-a'],config={sourceIds:ids,minScore:-1},pending=retrieve(index,'evidence',provider,config);
    await started;ids.push('synthetic-b');config.sourceIds=['synthetic-b'];
    index.chunks[0].sourceId='synthetic-b';index.chunks[0].sourceHash='b'.repeat(64);index.chunks[0].text='Mutated excluded documentary content';
    release();const result=await pending;
    assert.equal(result.results.length,1);assert.equal(result.results[0].sourceId,'synthetic-a');assert.equal(result.results[0].sourceHash,'a'.repeat(64));assert.equal(result.results[0].text,'Synthetic pension evidence');
    assert.deepEqual(result.diagnostics.sourceSelection.sourceIds,['synthetic-a']);
  }
});

test('query retrieval snapshots validated vectors before asynchronous embedding',async()=>{
  const mutations=[
    index=>{index.vectors[0][0]=NaN;},
    index=>{index.vectors[0]=new Float32Array([1]);},
    index=>{index.vectors[0].set([-1,0,0]);}
  ];
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid])for(const sourceIds of [undefined,['synthetic-a']])for(const mutate of mutations){
    const provider=fixtureProvider(),input=chunks(),index=await api.buildSemanticIndex(input,provider);let begin,release;
    const started=new Promise(resolve=>{begin=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
    provider.embedTexts=async()=>{begin();await waiting;return[new Float32Array([1,0,0])];};
    const pending=retrieve(index,'pension',provider,{sourceIds,minScore:0.25});
    await started;mutate(index);release();const result=await pending;
    assert.equal(result.diagnostics.topScore,1,'In-flight ranking uses the vector validated with its source metadata');
    assert.equal(result.diagnostics.weak,false);assert.equal(Number.isFinite(result.diagnostics.topScore),true);
    assert.deepEqual(result.results.map(chunk=>chunk.id),['chunk-z']);
    assert.equal(result.results[0].semanticScore,1);assert.equal(result.results[0].sourceHash,input[0].sourceHash);
    assert.deepEqual(result.results[0].locators,input[0].locators);
  }
});

test('scope selection never bypasses index issuance, vector integrity or cancellation',async()=>{
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider);
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    await assert.rejects(retrieve({...index},'pension',provider,{sourceIds:['missing']}),/Untrusted/);
    const aborted=new AbortController();aborted.abort();await assert.rejects(retrieve(index,'pension',provider,{sourceIds:['missing'],signal:aborted.signal}),error=>error.name==='AbortError');
  }
  const damaged=await api.buildSemanticIndex(chunks(),provider);damaged.vectors[1][0]=NaN;
  await assert.rejects(api.retrieveSemantic(damaged,'pension',provider,{sourceIds:['synthetic-a']}),/nonfinite/,'Excluded vectors remain part of the validated index trust boundary');
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    let started;const querying=new Promise(resolve=>{started=resolve;});
    provider.embedTexts=async()=>{started();return new Promise(()=>{});};
    const controller=new AbortController(),pending=retrieve(index,'pension',provider,{sourceIds:['synthetic-a'],signal:controller.signal});
    await querying;controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');
  }
});

test('omitting source selection preserves unscoped rankings, diagnostics and reranking behavior',async()=>{
  const provider=fixtureProvider(),index=await api.buildSemanticIndex(chunks(),provider);
  for(const retrieve of [api.retrieveSemantic,api.retrieveHybrid]){
    const unscoped=await retrieve(index,'pension',provider,{topK:3,minScore:-1}),explicit=await retrieve(index,'pension',provider,{topK:3,minScore:-1,sourceIds:undefined});
    assert.deepEqual(unscoped,explicit);assert.equal(unscoped.diagnostics.indexedChunks,3);assert.equal(unscoped.diagnostics.sourceSelection,undefined);assert.equal(unscoped.diagnostics.totalIndexedChunks,undefined);
  }
  const reranked=await api.rerankSemantic(index,'survivor',provider,['chunk-a','chunk-z'],{sourceIds:['synthetic-b'],minScore:-1});
  assert.deepEqual(reranked.results.map(chunk=>chunk.sourceId),['synthetic-b']);
});

test('validated retrieval snapshots preserve existing near-boundary scores without a second normalization',async()=>{
 const provider=fixtureProvider({async embedTexts(texts){return texts.map(text=>new Float32Array(text==='q'?[1,0,0]:[.25,Math.sqrt(15)/4,0]));}});
 for(const scope of [{},{sourceIds:['synthetic-a']}]){
  const index=await api.buildSemanticIndex(chunks().slice(0,1),provider);
  for(let d=0;d<3;d++)index.vectors[0][d]*=1.00005; // Inside the existing unit-vector tolerance.
  const expected=index.vectors[0][0];assert.ok(expected>.25001);
  assert.equal(api.validateSemanticIndex(index,undefined,provider).valid,true);
  const result=await api.retrieveSemantic(index,'q',provider,{...scope,minScore:.25001});
  assert.equal(result.results.length,1);assert.equal(result.diagnostics.topScore,expected);assert.equal(result.diagnostics.weak,false);
 }
});
