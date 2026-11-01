'use strict';
const {showAllTools, openManualModel}=require('./helpers/ui.js');
// Independent synthetic release-guard corpus. MOCK generation is deliberately
// separate from the real learned retrieval test below; neither proves Qwen quality.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const {isDeepStrictEqual}=require('node:util');
const path=require('node:path');
const fixture=require('../fixtures/rag-challenges.json');
const {chunkSources}=require('../assets/chunking.js');
const {answerQuestion}=require('../assets/rag.js');
const semantic=require('../assets/semantic.js');
function sourcesFrom(descriptors){return descriptors.map(value=>{
 let records;if(value.table){records=[];for(const [rowIndex,row]of [value.table.columns,...value.table.rows].entries())for(const [columnIndex,text]of row.entries())records.push({text:String(text),locator:{type:'excel-cell',sheet:value.table.sheet,cell:String.fromCharCode(65+columnIndex)+(rowIndex+1)}});}
 else{let offset=0;records=value.text.split('\n').map((text,index)=>{const record={text,locator:{type:'text-line',line:index+1,offset,length:text.length,offsetUnit:'UTF-16 code units'}};offset+=text.length+1;return record;});}
 return{id:value.id,name:'synthetic-'+value.id+(value.table?'.xlsx':'.txt'),hash:createHash('sha256').update(JSON.stringify(records)).digest('hex'),parserVersion:'independent-challenge-shaped-records-v1',records};
});}
function checkCitations(result,sources,chunks){
 assert.ok(result.citations.length,'Released answer needs source-bound citations');
 for(const citation of result.citations){const source=sources.find(item=>item.id===citation.sourceId);assert.ok(source);assert.equal(citation.sourceHash,source.hash);for(const locator of citation.locators)assert.ok(source.records.some(record=>isDeepStrictEqual(record.locator,locator)),'Every locator resolves to the original synthetic record');for(const quote of citation.quotes||[citation.excerpt])assert.ok(chunks.some(chunk=>chunk.sourceId===source.id&&chunk.text.includes(quote)),'Quoted text is an exact substring of verified source text');}
}
test('fixed independent challenge corpus covers required engineering risks without official inputs',()=>{
 assert.equal(fixture.kind,'synthetic-independent-rag-challenges');assert.equal(fixture.schemaVersion,1);
 const ids=fixture.safetyCases.map(item=>item.id);assert.equal(new Set(ids).size,ids.length);
 for(const category of ['supported','conflict','scope','relation','condition','numeric','unsupported','injection','citation','multi-document','table'])assert.ok(fixture.safetyCases.some(item=>item.category===category),category);
 assert.equal(fixture.retrieval.queries.length,12);assert.equal(fixture.retrieval.minimumRecallAt1,.75);assert.equal(fixture.retrieval.minimumRecallAt3,1);
});
for(const item of fixture.safetyCases)test('MOCK challenge '+item.id+' ('+item.category+'): '+item.expected,async()=>{
 const sources=sourcesFrom(item.sources),chunks=chunkSources(sources).chunks;let calls=0;
 const provider={id:'MOCK-independent-challenge-protocol-only',...(item.protocol==='json'?{}:{answerFormat:'plain-grounded-v1'}),generate:async()=>{calls++;if(item.protocol!=='json')return item.answer;return JSON.stringify(item.claims?{status:'answered',claims:item.claims}:{status:'answered',answer:item.answer,citations:[{label:'C1',quote:item.quote==='$SOURCE_TEXT'?chunks[0].text:item.quote}]});}};
 const result=await answerQuestion({question:item.question,chunks,retrieval:{results:chunks.map(chunk=>({...chunk,score:.95})),diagnostics:{weak:!!item.weak,ambiguous:false}},provider,scope:item.scope});
 assert.equal(result.official,false);assert.equal(result.officialReleaseAllowed,false);
 if(item.expected==='answered'){assert.equal(result.status,'answered',item.id+': '+result.diagnostics.reason);assert.equal(calls,1);checkCitations(result,sources,chunks);if(item.id==='multi-document-supported-quotes')assert.equal(new Set(result.citations.map(c=>c.sourceId)).size,2,'Both independently supplied documents must be cited');}
 else{assert.ok(['abstained','conflict'].includes(result.status),item.id+' released unsafe answer: '+result.answer);assert.equal(result.diagnostics.modelOutputAccepted,false);if(item.mustNotGenerate)assert.equal(calls,0,'Unsafe context must stop before generation');}
});
test('REAL sentence encoder: fixed twelve-question independent retrieval challenge retains exact citations',async t=>{
 const {createEmbeddingProvider}=require('../assets/embeddings.js');const provider=await createEmbeddingProvider();
 try{
  assert.equal(provider.kind,'learned-sentence-embedding');assert.equal(provider.dimension,384);
  const sources=sourcesFrom(fixture.retrieval.corpus),chunks=chunkSources(sources).chunks,index=await semantic.buildSemanticIndex(chunks,provider);let correct1=0,correct3=0;const rows=[];
  for(const item of fixture.retrieval.queries){const result=await semantic.retrieveSemantic(index,item.question,provider,{topK:3,minScore:0});const ids=result.results.map(entry=>entry.sourceId);correct1+=ids[0]===item.target?1:0;correct3+=ids.includes(item.target)?1:0;rows.push({id:item.id,question:item.question,target:item.target,top:ids,scores:result.results.map(entry=>Number(entry.score.toFixed(4)))});for(const entry of result.results){const source=sources.find(source=>source.id===entry.sourceId);assert.equal(entry.sourceHash,source.hash);assert.deepEqual(entry.locators,source.records.map(record=>record.locator));assert.equal(entry.text,source.records.map(record=>record.text).join('\n'));}}
  const report={kind:'independent-fixed-retrieval-evaluation',model:provider.id,queries:rows.length,recallAt1:correct1/rows.length,recallAt3:correct3/rows.length,thresholds:{recallAt1:fixture.retrieval.minimumRecallAt1,recallAt3:fixture.retrieval.minimumRecallAt3},rows,scope:'Real sentence embedding inference only; no Qwen inference and no actuarial acceptance.'};
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../test-results/rag-challenge-retrieval.json'),JSON.stringify(report,null,2)+'\n');t.diagnostic(JSON.stringify(report));
  assert.ok(report.recallAt1>=fixture.retrieval.minimumRecallAt1,'At least nine of twelve independently fixed questions must rank the expected source first');assert.ok(report.recallAt3>=fixture.retrieval.minimumRecallAt3,'All twelve independently fixed questions must retrieve the expected source within top three');
 }finally{provider.dispose?.();}
});

// Optional expensive real-model quality gate. Root coordinates CPU serialization.
// Default module tests above do not imply this gate ran or passed.
if(process.env.PBGC_CHALLENGE_QWEN==='1')test('REAL Qwen: fixed four-question factual coverage and four unsafe-context abstentions',{
 timeout:900000
},async t=>{
 const {chromium}=require('playwright'),{pathToFileURL}=require('node:url');
 const root=path.resolve(__dirname,'..'),target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(root,'index.html')).href;
 const modelPath=process.env.PBGC_MODEL_PATH||path.join(root,'dist/models/qwen2.5-0.5b-instruct-q4_k_m.gguf');
 assert.ok(fs.existsSync(modelPath),'Real model pack is mandatory for the Qwen quality gate');
 const fixtureSha256=createHash('sha256').update(fs.readFileSync(path.join(root,'fixtures/rag-challenges.json'))).digest('hex');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();if(target.startsWith('file:'))await context.setOffline(true);
  const external=[],errors=[];context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
  await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(target);await showAllTools(page);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
  // Capture the actual provider instance returned to the UI, never replace weights,
  // output, runtime or generation behavior with an artificial implementation.
  await page.evaluate(()=>{const create=PBGCRag.createLocalLlmProvider;PBGCRag.createLocalLlmProvider=async options=>{const provider=await create(options);globalThis.__challengeRealProvider=provider;return provider;};});
  await openManualModel(page);await page.locator('#rag-model-files').setInputFiles(modelPath);await page.locator('#load-rag-model').click();
  await page.waitForFunction(()=>!document.querySelector('#load-rag-model').disabled,null,{timeout:180000});
  assert.match(await page.locator('#rag-model-status').textContent(),/Qwen.*loaded/i);
  const positiveSources=sourcesFrom(fixture.generation.positiveSources);
  const positives=await page.evaluate(async({sources,queries})=>{
   const api=PBGCRag,real=globalThis.__challengeRealProvider,embedding=await api.createEmbeddingProvider();
   globalThis.__challengeEmbedding=embedding;
   const chunks=api.chunkSources(sources).chunks,index=await api.buildSemanticIndex(chunks,embedding),results=[];
   for(const query of queries){let modelCalls=0,rawOutput='';const observer={id:real.id,answerFormat:real.answerFormat,generate:async request=>{modelCalls++;rawOutput=await real.generate(request);return rawOutput;}};
    const start=performance.now(),retrieval=await api.retrieveHybrid(index,query.question,embedding,{topK:3});
    const answer=await api.answerQuestion({question:query.question,chunks,retrieval,provider:observer,options:{contextCharacters:1200,maxChunks:3,maxTokens:128,timeoutMs:120000}});
    results.push({id:query.id,target:query.target,expectedQuote:query.expectedQuote,requiredAnswerPattern:query.requiredAnswerPattern,status:answer.status,answer:answer.answer,citations:answer.citations,reason:answer.diagnostics.reason,rawOutput:rawOutput.slice(0,1000),modelCalls,elapsedMs:Math.round(performance.now()-start),retrievedSourceIds:retrieval.results.map(item=>item.sourceId)});
   }return results;
  },{sources:positiveSources,queries:fixture.generation.positiveQueries});
  const negatives=[];
  for(const id of fixture.generation.negativeCaseIds){const item=fixture.safetyCases.find(item=>item.id===id);assert.ok(item);const sources=sourcesFrom(item.sources);
   negatives.push(await page.evaluate(async({item,sources})=>{const api=PBGCRag,real=globalThis.__challengeRealProvider,embedding=globalThis.__challengeEmbedding,chunks=api.chunkSources(sources).chunks,index=await api.buildSemanticIndex(chunks,embedding);let modelCalls=0,rawOutput='';const observer={id:real.id,answerFormat:real.answerFormat,generate:async request=>{modelCalls++;rawOutput=await real.generate(request);return rawOutput;}};
    const retrieval=await api.retrieveHybrid(index,item.question,embedding,{topK:3}),start=performance.now();const result=await api.answerQuestion({question:item.question,chunks,retrieval,provider:observer,scope:item.scope,options:{contextCharacters:1200,maxChunks:3,maxTokens:128,timeoutMs:120000}});
    return{id:item.id,status:result.status,answer:result.answer,reason:result.diagnostics.reason,citations:result.citations,rawOutput:rawOutput.slice(0,1000),modelCalls,elapsedMs:Math.round(performance.now()-start),retrievalDiagnostics:retrieval.diagnostics,retrievedSourceIds:retrieval.results.map(entry=>entry.sourceId)};
   },{item,sources}));
  }
  const info=await page.evaluate(()=>globalThis.__challengeRealProvider.info()),accepted=positives.filter(item=>item.status==='answered');
  const report={kind:'real-qwen-fixed-independent-quality-evaluation',profile:target.startsWith('file:')?'actual file://, browser network offline':'supplementary HTTP only',fixtureSha256,provider:info,answerCoverage:accepted.length/positives.length,minimumAnswerCoverage:fixture.generation.minimumAnswerCoverage,positives,negatives,externalRequests:external.length,limitations:'Four synthetic factual questions only; citation guards do not prove entailment or official actuarial correctness. Mock protocol tests and learned retrieval evaluation are separate.'};
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results','rag-challenge-qwen-'+(target.startsWith('file:')?'file':'http')+'.json'),JSON.stringify(report,null,2)+'\n');t.diagnostic(JSON.stringify(report));
  for(const item of accepted){assert.match(item.answer,new RegExp(item.requiredAnswerPattern,'i'),'Accepted answer contains the independently expected fact: '+item.id);assert.ok(item.modelCalls>0,'Accepted factual answer came from real Qwen inference');assert.ok(item.citations.some(c=>c.sourceId===item.target&&c.quotes?.includes(item.expectedQuote)),'Accepted answer must cite the independently expected source sentence: '+item.id);assert.ok(item.citations.every(c=>c.sourceId===item.target),'An unrelated source cannot become a correct answer: '+item.id);}
  for(const item of negatives)assert.ok(['abstained','conflict'].includes(item.status),'Unsafe real-model context released an answer: '+item.id);
  assert.ok(report.answerCoverage>=fixture.generation.minimumAnswerCoverage,'At least three of four fixed factual questions must release an independently correct source-bound answer');assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await page.evaluate(async()=>{globalThis.__challengeEmbedding.dispose();await globalThis.__challengeRealProvider.dispose();});
 }finally{await browser.close();}
});
