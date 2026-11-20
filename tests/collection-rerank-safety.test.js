'use strict';
// MOCK vault authentication and semantic ranking isolate collection orchestration.
// These checks do not measure IndexedDB integrity, embedding recall or Qwen quality.
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const rag=require('../assets/rag.js'),chunking=require('../assets/chunking.js'),terms=require('../assets/case-term-index.js');
const api=globalThis.PBGCRag={...rag,...chunking,...terms};
const {createCaseCollection}=require('../assets/case-collection.js');
const PROFILE='large-case-corpus-v1',AUTH='authenticated-local-derived-v1',QUESTION='What is the normal retirement age?';
const chunkerProfile=[chunking.CHUNKER_PROFILE.id,chunking.CHUNKER_PROFILE.version,1800,400,250].join(':');

function mockVault(){
 const records=Array.from({length:7},(_,index)=>{
  const fact='Normal retirement age is '+(index===6?'67':'65')+'.',original=fact+'\nSynthetic archive document '+index+'.',hash=createHash('sha256').update(original).digest('hex');
  const source={id:'source-'+index,name:'synthetic-'+index+'.txt',hash,revision:1,bytes:Buffer.byteLength(original)},generation='generation-'+index;
  const chunk={id:'chunk-'+index,sourceId:source.id,sourceName:source.name,sourceHash:hash,text:fact,locators:[{type:'text-line',line:1}]};
  const entry={chunk,terms:rag.normalizeEvidenceTopics(fact)},binding={id:'t-'+generation+'-00000000',chunkShardId:'c-'+generation+'-00000000',searchCount:1,answerCount:1,searchCharacters:fact.length,answerCharacters:fact.length};
  const envelope=payload=>({sourceId:source.id,sourceHash:hash,verification:AUTH,payload:{profile:PROFILE,generation,...payload}});
  return{source,original,chunk,binding,summary:envelope({ready:true,chunks:1,coverageComplete:true,termIndexProfile:terms.CASE_TERM_INDEX_PROFILE,normalizationProfile:rag.RAG_TOPIC_PROFILE,chunkerProfile,termShards:[binding]}),passages:envelope({chunkerProfile,search:[entry],answersUseSearch:true}),index:{...envelope({chunkerProfile,termIndexProfile:terms.CASE_TERM_INDEX_PROFILE,normalizationProfile:rag.RAG_TOPIC_PROFILE,chunkShardId:binding.chunkShardId,searchIndex:terms.buildCaseTermIndex([entry]),answersUseSearch:true}),id:binding.id}};
 });
 return{
  getCase:async()=>({id:'mock-case',revision:1}),
  listSources:async(caseId,{afterId}={})=>records.filter(record=>afterId===undefined||record.source.id>afterId).map(record=>record.source),
  getSource:async(caseId,sourceId)=>{const record=records.find(record=>record.source.id===sourceId);return record?{...record.source,blob:new Blob([record.original])}:null;},
  getShard:async(caseId,sourceId,kind,id)=>{const record=records.find(record=>record.source.id===sourceId);if(!record)return null;if(kind==='records'&&id==='summary')return record.summary;if(kind==='chunks'&&id===record.binding.chunkShardId)return record.passages;return null;},
  async *iterateShards(caseId,{kind,sourceId}={}){if(kind==='terms')for(const record of records)if(sourceId===undefined||sourceId===record.source.id)yield record.index;}
 };
}

async function checkConflict(embedding){
 const collection=await createCaseCollection({vault:mockVault()});let calls=0;
 const found=await collection.search('mock-case',QUESTION,{forAnswers:true});
 assert.equal(found.results.length,7);assert.equal(found.diagnostics.strongMatches,7);assert.equal(found.diagnostics.candidateIndex,'authenticated-exact-term-postings');
 assert.match(found.results[6].text,/67/);assert.equal(new Set(found.results.map(chunk=>chunk.sourceHash)).size,7);
 const result=await collection.answer('mock-case',QUESTION,{embedding,model:{id:'MOCK-must-not-choose-around-a-conflict',generate:async()=>{calls++;return'S1';}}});
 assert.equal(result.status,'conflict',JSON.stringify({answer:result.answer,diagnostics:result.diagnostics}));
 assert.equal(result.diagnostics.reason,'possible-source-conflict');assert.equal(result.diagnostics.evidenceAnalysis.chunks,7);assert.equal(calls,0);
}

test('collection checks the seventh exact prose candidate before nonsemantic source selection',async()=>checkConflict());

test('collection checks every exact candidate after semantic top-six ranking',async()=>{
 const previous={buildSemanticIndex:api.buildSemanticIndex,retrieveHybrid:api.retrieveHybrid};
 try{
  api.buildSemanticIndex=async chunks=>chunks;
  api.retrieveHybrid=async chunks=>({results:chunks.slice(0,6),diagnostics:{weak:false,method:'MOCK-top-six-rerank'}});
  await checkConflict({id:'MOCK-embedding-ranking-only'});
 }finally{Object.assign(api,previous);}
});

test('encoder coverage filtering cannot remove a competing exact fact from evidence guards',async()=>{
 const previous={buildSemanticIndex:api.buildSemanticIndex,retrieveHybrid:api.retrieveHybrid};
 try{
  api.buildSemanticIndex=async chunks=>chunks;
  api.retrieveHybrid=async chunks=>({results:chunks.slice(0,6),diagnostics:{weak:false,method:'MOCK-top-six-rerank'}});
  await checkConflict({id:'MOCK-encoder-coverage-only',inspectTextCoverage:async chunks=>chunks.map((_,index)=>({embeddable:index<6}))});
 }finally{Object.assign(api,previous);}
});
