'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {evaluate}=require('./fixtures/evaluate-retrieval-domain.js');
const {createEmbeddingProvider,EMBEDDING_RETRIEVAL_PROFILE}=require('../assets/embeddings.js');
const {CHUNKER_PROFILE}=require('../assets/chunking.js');
const evidence=require('../docs/evidence/retrieval-domain-v1.json');

test('REAL pinned encoder: PBGC-domain candidate-screen operating point and chunk-size comparison are reproducible',async t=>{
 const result=await evaluate();
 assert.equal(result.fixtureSha256,evidence.fixtureSha256);assert.equal(result.fixtureSha256,EMBEDDING_RETRIEVAL_PROFILE.evaluationFixtureSha256);assert.equal(result.modelSha256,evidence.modelSha256);assert.equal(result.positiveQuestions,22);assert.equal(result.unanswerableQuestions,12);
 const compare=profile=>({maxChars:profile.maxChars,chunks:profile.chunks,recallAt1:profile.recallAt1,recallAt3:profile.recallAt3,thresholds:profile.thresholds,positive:profile.positive.map(item=>({targetRank:item.targetRank,targetScore:item.targetScore,topScore:item.topScore})),negative:profile.negative.map(item=>item.topScore)});
 assert.deepEqual(result.profiles.map(compare),evidence.profiles.map(compare),'fixed local encoder and source-bound chunks reproduce the recorded ranks and cosine scores');
 for(const profile of result.profiles){assert.equal(profile.recallAt3,1);assert.equal(profile.thresholds[0].relevantTargetRetained,22);assert.equal(profile.thresholds[0].unanswerableQuestionsWithHit,12);assert.ok(Math.max(...profile.negative.map(item=>item.topScore))>Math.min(...profile.positive.map(item=>item.targetScore)),'a scalar score cannot separate these domain-near-miss questions');}
 assert.equal(CHUNKER_PROFILE.defaultMaxChars,1800);assert.ok(result.profiles[0].recallAt1>=result.profiles[1].recallAt1,'the smaller candidate size did not improve this fixed evaluation');assert.equal(EMBEDDING_RETRIEVAL_PROFILE.thresholdUse,'candidate-screening-only');
 t.diagnostic(JSON.stringify({evaluationId:result.evaluationId,fixtureSha256:result.fixtureSha256,providerId:result.providerId,profiles:result.profiles.map(profile=>({maxChars:profile.maxChars,chunks:profile.chunks,recallAt1:profile.recallAt1,recallAt3:profile.recallAt3,screenAt025:profile.thresholds[0],elapsedMs:profile.elapsedMs})),limitation:result.notice}));
});

test('REAL tokenizer coverage rejects entirely unknown text and distinguishes measured coverage from nonempty input',async()=>{
 const provider=await createEmbeddingProvider();
 try{
  assert.equal(provider.coverage('hello').measured,false);assert.equal(provider.coverage('hello').ratio,null);
  const texts=['The retirement age is 65.','\u0378\u0378\u0378','65 60 0.80'],coverage=await provider.inspectTextCoverage(texts);
  assert.equal(coverage[0].ratio,1);assert.equal(coverage[0].measured,true);assert.equal(coverage[0].unknownTokens,0);assert.ok(coverage[0].tokenCount>0);
  assert.equal(coverage[1].embeddable,false);assert.equal(coverage[1].ratio,0);assert.ok(coverage[1].unknownTokens>0);assert.equal(provider.coverage(texts[1]).measured,true);
  assert.equal(coverage[2].embeddable,true,'numbers in factor evidence are valid tokenizer input; coverage is not a relevance judgment');
  await assert.rejects(provider.embedTexts([texts[1]]),/no known model tokens/);
  const vectors=await provider.embedTexts([texts[0]]);assert.equal(vectors[0].length,384);assert.equal(provider.coverage(texts[0]).measured,true);
 }finally{provider.dispose();}
});
