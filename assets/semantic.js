/* Dense retrieval over actual embedding-provider outputs. This module contains
 * no model, lexical substitute, random/hash embeddings or generation backend. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const SEMANTIC_LIMITS=Object.freeze({chunks:20000,dimension:4096,vectorBytes:64*1024*1024,text:40*1024*1024,chunkText:8000,query:2000,topK:100,batch:64,cacheCharacters:160*1024*1024});
  const issued=new WeakSet();
  const fail=message=>{throw Error(message);};
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
  function cancelled(signal){if(signal?.aborted){const error=Error('Semantic retrieval cancelled.');error.name='AbortError';throw error;}}
  function options(value){if(!plain(value))fail('Invalid semantic options.');if(value.signal&&(typeof value.signal.aborted!=='boolean'||typeof value.signal.addEventListener!=='function'||typeof value.signal.removeEventListener!=='function'))fail('Invalid semantic cancellation signal.');cancelled(value.signal);}
  function providerInfo(provider){if(!provider||typeof provider.id!=='string'||!provider.id.trim()||provider.id.length>500||!Number.isInteger(provider.dimension)||provider.dimension<1||provider.dimension>SEMANTIC_LIMITS.dimension||typeof provider.embedTexts!=='function')fail('Provide a versioned local embedding provider with an explicit dimension.');return{id:provider.id,dimension:provider.dimension};}
  function canonical(value,depth=0,state={count:0}){if(++state.count>10000||depth>16)fail('Semantic chunk metadata exceeds its complexity limit.');if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(item=>canonical(item,depth+1,state)).join(',')+']';if(!plain(value))fail('Semantic chunks must contain plain JSON data.');return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],depth+1,state)).join(',')+'}';}
  const copy=value=>JSON.parse(canonical(value));
  function chunksChecked(chunks,dimension){
    if(!Array.isArray(chunks)||!chunks.length||chunks.length>SEMANTIC_LIMITS.chunks)fail('Semantic indexing requires one to 20,000 source-bound chunks.');
    if(chunks.length*dimension*4>SEMANTIC_LIMITS.vectorBytes)fail('Semantic vectors exceed the 64 MiB budget.');
    let characters=0;const ids=new Set(),clean=[];
    for(const chunk of chunks){
      if(!plain(chunk)||typeof chunk.id!=='string'||!chunk.id||chunk.id.length>300||ids.has(chunk.id)||typeof chunk.text!=='string'||!chunk.text.trim()||chunk.text.length>SEMANTIC_LIMITS.chunkText||typeof chunk.sourceId!=='string'||!chunk.sourceId||chunk.sourceId.length>300||typeof chunk.sourceName!=='string'||!chunk.sourceName||chunk.sourceName.length>255||typeof chunk.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(chunk.sourceHash))fail('Invalid, duplicate or oversized semantic source chunk.');
      ids.add(chunk.id);characters+=chunk.text.length;if(characters>SEMANTIC_LIMITS.text)fail('Semantic text exceeds the 40 MiB overlap budget.');
      if(!Array.isArray(chunk.locators)||!chunk.locators.length||chunk.locators.length>500||chunk.locators.some(locator=>!plain(locator)||typeof locator.type!=='string'||!locator.type||canonical(locator).length>4096))fail('Semantic chunks need exact typed source locators.');
      if(!Array.isArray(chunk.recordIndices)||!chunk.recordIndices.length||chunk.recordIndices.length>500||chunk.recordIndices.some(index=>!Number.isInteger(index)||index<0||index>=50000)||new Set(chunk.recordIndices).size!==chunk.recordIndices.length)fail('Semantic chunks need exact source record indices.');
      const encoded=canonical(chunk);if(encoded.length>100000)fail('Semantic chunk metadata exceeds its size budget.');clean.push(JSON.parse(encoded));
    }return clean;
  }
  function normalize(vector,dimension,alreadyNormalized=false){
    if(!(vector instanceof Float32Array)||vector.length!==dimension)fail('Embedding vector dimension or Float32Array type is invalid.');let squares=0;
    for(const value of vector){if(!Number.isFinite(value))fail('Embedding vector contains a nonfinite value.');squares+=value*value;}
    const norm=Math.sqrt(squares);if(!Number.isFinite(norm)||norm===0)fail('Embedding vector has zero or invalid norm; semantic evidence is unavailable for this text.');
    if(alreadyNormalized&&Math.abs(norm-1)>0.0001)fail('Cached semantic vector is not normalized.');
    const output=new Float32Array(dimension);for(let i=0;i<dimension;i++)output[i]=vector[i]/norm;return output;
  }
  async function embedding(provider,texts,signal){
    cancelled(signal);let remove=()=>{};
    const aborted=new Promise((_,reject)=>{if(signal){const listener=()=>{const error=Error('Semantic embedding cancelled.');error.name='AbortError';reject(error);};signal.addEventListener('abort',listener,{once:true});remove=()=>signal.removeEventListener('abort',listener);}});
    try{const result=await Promise.race([Promise.resolve().then(()=>{cancelled(signal);return provider.embedTexts(texts,{signal});}),aborted]);cancelled(signal);return result;}finally{remove();}
  }
  async function buildSemanticIndex(chunks,provider,config={}){
    options(config);const info=providerInfo(provider),clean=chunksChecked(chunks,info.dimension),batchSize=config.batchSize===undefined?16:config.batchSize;
    if(!Number.isInteger(batchSize)||batchSize<1||batchSize>SEMANTIC_LIMITS.batch)fail('Semantic batch size must be from one to 64.');if(config.onProgress!==undefined&&typeof config.onProgress!=='function')fail('Invalid semantic progress callback.');
    const vectors=[];if(config.onProgress)config.onProgress({completed:0,total:clean.length,phase:'embedding'});
    for(let start=0;start<clean.length;start+=batchSize){
      cancelled(config.signal);const texts=clean.slice(start,start+batchSize).map(chunk=>chunk.text),batch=await embedding(provider,texts,config.signal);
      if(!Array.isArray(batch)||batch.length!==texts.length)fail('Embedding provider returned a mismatched batch.');for(const vector of batch)vectors.push(normalize(vector,info.dimension));
      if(config.onProgress)config.onProgress({completed:vectors.length,total:clean.length,phase:'embedding'});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    cancelled(config.signal);if(provider.id!==info.id||provider.dimension!==info.dimension)fail('Embedding provider changed during indexing.');
    const index={schemaVersion:1,kind:'dense-semantic-index',provider:info,chunks:clean,vectors};issued.add(index);return index;
  }
  function validateIndex(index,verifiedChunks,provider,allowUnissued=false){
    const info=providerInfo(provider);if(!plain(index)||index.schemaVersion!==1||index.kind!=='dense-semantic-index'||!plain(index.provider)||index.provider.id!==info.id||index.provider.dimension!==info.dimension)fail('Semantic index provider or schema is stale. Rebuild the index.');
    if(!allowUnissued&&!issued.has(index))fail('Untrusted semantic index must be restored and re-embedded before retrieval.');
    const clean=chunksChecked(index.chunks,info.dimension);
    if(!Array.isArray(index.vectors)||index.vectors.length!==clean.length)fail('Semantic vector count does not match its chunks.');for(const vector of index.vectors)normalize(vector,info.dimension,true);
    if(verifiedChunks!==undefined){const verified=chunksChecked(verifiedChunks,info.dimension);if(verified.length!==clean.length)fail('Semantic index source set is stale.');for(let i=0;i<clean.length;i++)if(canonical(clean[i])!==canonical(verified[i]))fail('Semantic index chunk text, identity or source citation is stale.');}
    return clean;
  }
  function validateSemanticIndex(index,verifiedChunks,provider){try{validateIndex(index,verifiedChunks,provider);return{valid:true,errors:[]};}catch(error){return{valid:false,errors:[error.message]};}}
  function retrievalConfig(query,config){options(config);if(typeof query!=='string'||!query.trim()||query.length>SEMANTIC_LIMITS.query)fail('Semantic queries need one to 2,000 characters.');const topK=config.topK===undefined?8:config.topK,minScore=config.minScore===undefined?0.25:config.minScore,ambiguityMargin=config.ambiguityMargin===undefined?0.02:config.ambiguityMargin;if(!Number.isInteger(topK)||topK<1||topK>SEMANTIC_LIMITS.topK||typeof minScore!=='number'||!Number.isFinite(minScore)||minScore< -1||minScore>1||typeof ambiguityMargin!=='number'||!Number.isFinite(ambiguityMargin)||ambiguityMargin<0||ambiguityMargin>2)fail('Invalid semantic retrieval limit, threshold or ambiguity margin.');return{topK,minScore,ambiguityMargin};}
  const citation=chunk=>({chunkId:chunk.id,sourceId:chunk.sourceId,sourceName:chunk.sourceName,sourceHash:chunk.sourceHash,locators:copy(chunk.locators),excerpt:chunk.text});
  async function retrieveSemantic(index,query,provider,config={}){
    const settings=retrievalConfig(query,config);validateIndex(index,undefined,provider);const id=provider.id,dimension=provider.dimension,batch=await embedding(provider,[query],config.signal);
    if(!Array.isArray(batch)||batch.length!==1)fail('Embedding provider returned an invalid query batch.');const vector=normalize(batch[0],dimension);if(provider.id!==id||provider.dimension!==dimension)fail('Embedding provider changed during retrieval.');
    const scored=[];for(let i=0;i<index.chunks.length;i++){if(i%256===0)cancelled(config.signal);let score=0;for(let d=0;d<dimension;d++)score+=index.vectors[i][d]*vector[d];scored.push({index:i,score:Math.max(-1,Math.min(1,score))});}
    scored.sort((a,b)=>b.score-a.score||(index.chunks[a.index].id<index.chunks[b.index].id?-1:index.chunks[a.index].id>index.chunks[b.index].id?1:0));
    const topScore=scored[0]?.score??null,margin=scored.length>1?scored[0].score-scored[1].score:null,weak=topScore===null||topScore<settings.minScore;
    const results=scored.filter(item=>item.score>=settings.minScore).slice(0,settings.topK).map(item=>({...copy(index.chunks[item.index]),score:item.score,semanticScore:item.score,citations:[citation(index.chunks[item.index])]}));
    return{results,diagnostics:{method:'dense-cosine',providerId:id,dimension,indexedChunks:index.chunks.length,topScore,margin,minScore:settings.minScore,weak,ambiguous:!weak&&margin!==null&&margin<=settings.ambiguityMargin,ambiguityMargin:settings.ambiguityMargin,confidenceNotice:'Cosine similarity is a retrieval score, not a calibrated probability, factual confidence or legal authority.'}};
  }
  async function retrieveHybrid(index,query,provider,config={}){
    const settings=retrievalConfig(query,config),weight=config.semanticWeight===undefined?0.7:config.semanticWeight,k=config.rrfK===undefined?60:config.rrfK;
    if(typeof weight!=='number'||!Number.isFinite(weight)||weight<0||weight>1||!Number.isInteger(k)||k<1||k>1000)fail('Invalid hybrid fusion weight or rank constant.');
    const semantic=await retrieveSemantic(index,query,provider,{...config,topK:SEMANTIC_LIMITS.topK}),rank=root.PBGCRag?.rankRecords||(typeof require==='function'?require('./ranking.js').rankRecords:null);if(typeof rank!=='function')fail('BM25 lexical ranking is unavailable.');
    if(query.length>500)fail('Hybrid queries exceed the 500-character lexical limit.');
    const lexical=rank(index.chunks,query,{limit:SEMANTIC_LIMITS.topK}),map=new Map();
    semantic.results.forEach((chunk,i)=>map.set(chunk.id,{chunk,semanticRank:i+1,semanticScore:chunk.semanticScore,lexicalRank:null,lexicalScore:null}));
    lexical.forEach((chunk,i)=>{const entry=map.get(chunk.id)||{chunk,semanticRank:null,semanticScore:null,lexicalRank:null,lexicalScore:null};entry.lexicalRank=i+1;entry.lexicalScore=chunk.score;map.set(chunk.id,entry);});
    const scored=Array.from(map.values()).map(entry=>({...entry,fusionScore:(entry.semanticRank===null?0:weight/(k+entry.semanticRank))+(entry.lexicalRank===null?0:(1-weight)/(k+entry.lexicalRank))})).sort((a,b)=>b.fusionScore-a.fusionScore||(a.chunk.id<b.chunk.id?-1:a.chunk.id>b.chunk.id?1:0));
    cancelled(config.signal);return{results:scored.slice(0,settings.topK).map(entry=>{const chunk=index.chunks.find(item=>item.id===entry.chunk.id);return{...copy(chunk),score:entry.fusionScore,semanticScore:entry.semanticScore,lexicalScore:entry.lexicalScore,citations:[citation(chunk)],explanation:{method:'weighted reciprocal-rank fusion',semanticRank:entry.semanticRank,lexicalRank:entry.lexicalRank,semanticWeight:weight,rrfK:k}};}),diagnostics:{...semantic.diagnostics,method:'hybrid-cosine-bm25-rrf',semanticWeight:weight,rrfK:k,lexicalMatches:lexical.length,confidenceNotice:'Reciprocal-rank fusion is a ranking score, not confidence. Semantic weakness and ambiguity diagnostics remain separate. No learned reranker is used.'}};
  }
  async function rerankSemantic(index,query,provider,candidateIds,config={}){
    validateIndex(index,undefined,provider);if(!Array.isArray(candidateIds)||!candidateIds.length||candidateIds.length>1000||candidateIds.some(id=>typeof id!=='string')||new Set(candidateIds).size!==candidateIds.length)fail('Provide one to 1,000 distinct candidate chunk IDs.');
    const positions=new Map(index.chunks.map((chunk,i)=>[chunk.id,i]));if(candidateIds.some(id=>!positions.has(id)))fail('Reranking candidate does not belong to the semantic index.');
    const subset={schemaVersion:1,kind:'dense-semantic-index',provider:{...index.provider},chunks:candidateIds.map(id=>index.chunks[positions.get(id)]),vectors:candidateIds.map(id=>index.vectors[positions.get(id)])};issued.add(subset);
    const result=await retrieveSemantic(subset,query,provider,config);return{results:result.results,diagnostics:{...result.diagnostics,method:'cosine-candidate-rerank',candidateCount:candidateIds.length,rerankingNotice:'Candidates are reordered using the same learned embedding cosine scores. No separate learned cross-encoder reranker is used.'}};
  }
  function serializeSemanticIndex(index){if(!issued.has(index))fail('Only a built semantic index can be serialized.');const provider={...index.provider,embedTexts:async()=>[]};validateIndex(index,undefined,provider);const cache={schemaVersion:1,kind:'dense-semantic-cache',provider:copy(index.provider),chunks:index.chunks.map(chunk=>copy(chunk)),vectors:index.vectors.map(vector=>Array.from(vector))};if(JSON.stringify(cache).length>SEMANTIC_LIMITS.cacheCharacters)fail('Serialized semantic cache exceeds its size budget.');return cache;}
  async function restoreSemanticIndex(cache,verifiedChunks,provider,config={}){
    options(config);if(!plain(cache)||cache.schemaVersion!==1||cache.kind!=='dense-semantic-cache'||!Array.isArray(cache.vectors)||!Array.isArray(cache.chunks)||cache.chunks.length>SEMANTIC_LIMITS.chunks||cache.vectors.length!==cache.chunks.length)fail('Invalid semantic cache schema.');
    if(JSON.stringify(cache).length>SEMANTIC_LIMITS.cacheCharacters)fail('Semantic cache exceeds its size budget.');const dimension=providerInfo(provider).dimension;if(cache.vectors.length*dimension*4>SEMANTIC_LIMITS.vectorBytes)fail('Cached semantic vectors exceed the memory budget.');
    if(cache.vectors.some(vector=>!Array.isArray(vector)||vector.length!==dimension||vector.some(value=>typeof value!=='number'||!Number.isFinite(value))))fail('Invalid cached semantic vector.');
    const candidate={schemaVersion:1,kind:'dense-semantic-index',provider:cache.provider,chunks:cache.chunks,vectors:cache.vectors.map(vector=>new Float32Array(vector))};validateIndex(candidate,verifiedChunks,provider,true);
    // Imported embeddings are derived untrusted data. Re-embed verified text;
    // valid-looking forged vectors never become an issued retrieval index.
    return buildSemanticIndex(verifiedChunks,provider,config);
  }
  return{SEMANTIC_LIMITS,buildSemanticIndex,validateSemanticIndex,retrieveSemantic,retrieveHybrid,rerankSemantic,serializeSemanticIndex,restoreSemanticIndex};
});
