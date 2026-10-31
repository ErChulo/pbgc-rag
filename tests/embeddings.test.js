'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEmbeddingProvider,validateEmbeddingPack}=require('../assets/embeddings.js');
const pack=require('../vendor/embeddings/model.js');
test('learned sentence weights are pinned and modified payloads fail integrity',async()=>{
 const verified=await validateEmbeddingPack(pack);assert.ok(verified.module instanceof WebAssembly.Module);assert.equal(pack.manifest.dimension,384);
 await assert.rejects(validateEmbeddingPack({...pack,wasmBase64:'B'+pack.wasmBase64.slice(1)}),/integrity/);
 await assert.rejects(validateEmbeddingPack({...pack,manifest:{...pack.manifest,id:'other'}}),/Unsupported/);
});
test('real transformer returns finite unit vectors deterministically and handles long windows',async()=>{
 const provider=await createEmbeddingProvider();const texts=['The surviving spouse receives monthly income.','The surviving spouse receives monthly income.',('Medical certification is required for disability payments. ').repeat(70)];
 const vectors=await provider.embedTexts(texts);assert.equal(vectors.length,3);assert.deepEqual(vectors[0],vectors[1]);for(const vector of vectors){assert.ok(vector instanceof Float32Array);assert.equal(vector.length,384);assert.ok([...vector].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-5);}assert.equal(provider.kind,'learned-sentence-embedding');assert.equal(provider.coverage('zzqqq').embeddable,true);assert.equal(provider.coverage('zzqqq').ratio,null);provider.dispose();await assert.rejects(provider.embedTexts(['hello']),/disposed/);
});
test('sentence provider rejects invalid batches and honors already cancelled signals',async()=>{
 const provider=await createEmbeddingProvider();for(const texts of [[''],['x'.repeat(12001)],Array(129).fill('hello'),[42]])await assert.rejects(provider.embedTexts(texts),/batch/);const controller=new AbortController();controller.abort();await assert.rejects(provider.embedTexts(['hello'],{signal:controller.signal}),error=>error.code==='ABORT_ERR');provider.dispose();
});
