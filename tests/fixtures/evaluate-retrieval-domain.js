'use strict';
const {createHash}=require('node:crypto');
const fixture=require('./retrieval-domain-v1.js');
const {chunkSources}=require('../../assets/chunking.js');
const {createEmbeddingProvider}=require('../../assets/embeddings.js');
const semantic=require('../../assets/semantic.js');
const round=value=>Math.round(value*1e6)/1e6;
async function evaluate(){
 const provider=await createEmbeddingProvider();
 try{
  const profiles=[];
  for(const maxChars of [1800,800]){
   const start=performance.now(),chunks=chunkSources(fixture.docs,{maxChars,maxTokens:400,overlapChars:Math.floor(maxChars/7)}).chunks;
   const index=await semantic.buildSemanticIndex(chunks,provider);let recall1=0,recall3=0;
   const positive=[];
   for(const item of fixture.positive){
    const result=await semantic.retrieveSemantic(index,item.question,provider,{topK:100,minScore:-1});
    const matches=chunk=>chunk.sourceId===item.sourceId&&chunk.text.includes(item.quote),rank=result.results.findIndex(matches)+1;
    if(rank===1)recall1++;if(rank>0&&rank<=3)recall3++;
    positive.push({...item,targetRank:rank||null,targetScore:round(result.results.find(matches)?.semanticScore??-1),topScore:round(result.diagnostics.topScore),topSourceId:result.results[0]?.sourceId??null});
   }
   const negative=[];
   for(const question of fixture.negative){
    const result=await semantic.retrieveSemantic(index,question,provider,{topK:3,minScore:-1});
    negative.push({question,topScore:round(result.diagnostics.topScore),topSourceId:result.results[0]?.sourceId??null});
   }
   const thresholds=[0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8].map(minScore=>({minScore,relevantTargetRetained:positive.filter(item=>item.targetScore>=minScore).length,relevantQuestionsWithAnyHit:positive.filter(item=>item.topScore>=minScore).length,unanswerableQuestionsWithHit:negative.filter(item=>item.topScore>=minScore).length}));
   profiles.push({maxChars,maxTokens:400,overlapChars:Math.floor(maxChars/7),chunks:chunks.length,recallAt1:round(recall1/positive.length),recallAt3:round(recall3/positive.length),elapsedMs:Math.round(performance.now()-start),thresholds,positive,negative});
  }
  return {schemaVersion:1,evaluationId:fixture.id,fixtureSha256:createHash('sha256').update(JSON.stringify({docs:fixture.docs,positive:fixture.positive,negative:fixture.negative})).digest('hex'),providerId:provider.id,modelSha256:provider.manifest.wasmSha256,documents:fixture.docs.length,paragraphs:fixture.docs.reduce((sum,doc)=>sum+doc.records.length,0),positiveQuestions:fixture.positive.length,unanswerableQuestions:fixture.negative.length,profiles,notice:fixture.notice};
 }finally{provider.dispose();}
}
module.exports={evaluate};
if(require.main===module)evaluate().then(result=>{
 const text=JSON.stringify(result,null,2)+'\n';
 if(process.argv[2])require('node:fs').writeFileSync(process.argv[2],text);else process.stdout.write(text);
}).catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
