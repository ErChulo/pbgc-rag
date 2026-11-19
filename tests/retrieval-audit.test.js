'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const semantic=require('../assets/semantic.js');
const {chunkSources,CHUNKER_PROFILE}=require('../assets/chunking.js');
const make=(id,text,extra={})=>({id,text,sourceId:'plan',sourceName:'invented-plan.txt',sourceHash:'a'.repeat(64),parserVersion:'synthetic-v1',locators:[{type:'text-line',line:1}],recordIndices:[0],...extra});
const protocolProvider=()=>({id:'MOCK-retrieval-audit-only',dimension:2,calls:[],async embedTexts(texts){this.calls.push(texts.slice());return texts.map(text=>new Float32Array(text.startsWith('What')?[1,0]:[0,1]));}});

test('hybrid weakness can pass a full multi-term lexical hit without changing semantic weakness',async()=>{
 const provider=protocolProvider(),chunks=[make('factor','The early retirement factor at age 60 is 0.80.'),make('partial','The retirement application needs a signature.')],index=await semantic.buildSemanticIndex(chunks,provider);
 const dense=await semantic.retrieveSemantic(index,'What is the early retirement factor at age 60?',provider);
 assert.equal(dense.diagnostics.weak,true);assert.deepEqual(dense.results,[]);
 const hybrid=await semantic.retrieveHybrid(index,'What is the early retirement factor at age 60?',provider);
 assert.equal(hybrid.diagnostics.weak,false);assert.equal(hybrid.diagnostics.semanticWeak,true);assert.deepEqual(hybrid.diagnostics.strongLexicalSupport.chunkIds,['factor']);assert.equal(hybrid.diagnostics.relevanceEstablished,false);
 assert.equal(hybrid.results[0].id,'factor');assert.equal(hybrid.results[0].semanticScore,null);assert.ok(hybrid.results[0].lexicalScore>0);
 const partial=await semantic.retrieveHybrid(index,'What is the retirement pension?',provider);
 assert.equal(partial.diagnostics.weak,true);assert.deepEqual(partial.diagnostics.strongLexicalSupport.chunkIds,[]);
 const single=await semantic.retrieveHybrid(index,'What retirement?',provider);assert.equal(single.diagnostics.weak,true,'one incidental query token is not strong lexical support');
});

test('hybrid query length rejects before the real or mock query encoder is invoked',async()=>{
 const provider=protocolProvider(),index=await semantic.buildSemanticIndex([make('a','Normal retirement age is 65.')],provider),calls=provider.calls.length;
 await assert.rejects(semantic.retrieveHybrid(index,'What '+ 'a'.repeat(496),provider),/500-character lexical limit/);assert.equal(provider.calls.length,calls);
});

test('threshold provenance is explicit and a nonweak retrieval is never a relevance assertion',async()=>{
 const provider=protocolProvider();provider.retrievalProfile={id:'synthetic-provider-screen-v1',defaultMinScore:0.1};
 const index=await semantic.buildSemanticIndex([make('a','Normal retirement age is 65.')],provider);
 const result=await semantic.retrieveSemantic(index,'normal retirement',provider);
 assert.equal(result.diagnostics.minScore,.1);assert.equal(result.diagnostics.minScoreSource,'provider-profile');assert.equal(result.diagnostics.thresholdProfileId,provider.retrievalProfile.id);assert.equal(result.diagnostics.thresholdUse,'candidate-screening-only');assert.equal(result.diagnostics.relevanceEstablished,false);
 const override=await semantic.retrieveSemantic(index,'normal retirement',provider,{minScore:.8});assert.equal(override.diagnostics.minScoreSource,'caller');assert.equal(override.diagnostics.minScore,.8);
});

test('same-source repeated literal passages leave room for new evidence while qualifications and contradictions survive',()=>{
 const full=make('full','Normal retirement age is 65. The early retirement factor at age 60 is 0.80.');
 const repeated=make('overlap','The early retirement factor at age 60 is 0.80.');
 const reflow=make('reflow','Normal retirement age is 65.\n\nThe early retirement factor at age 60 is 0.80.');
 const contradiction=make('conflict','Normal retirement age is 67.');
 const qualifier=make('qualifier','Normal retirement age is 65 only for employees hired before 2019.');
 const negation=make('negation','Normal retirement age is not 65.');
 const newFact=make('new-fact','Normal retirement age is 65. Payments require an election.');
 const otherSource=make('other-source',repeated.text,{sourceId:'amendment',sourceHash:'b'.repeat(64)});
 const machine=make('machine',repeated.text,{hasMachineText:true,minimumOcrConfidence:22,requiresSourceReview:true});
 const input=[full,repeated,reflow,contradiction,qualifier,negation,newFact,otherSource,machine];
 const result=semantic.deduplicateRetrievalResults(input,{limit:10});
 assert.deepEqual(result.results.map(chunk=>chunk.id),['full','conflict','qualifier','negation','new-fact','other-source','machine']);
 assert.deepEqual(result.diagnostics.removed.map(item=>item.chunkId),['overlap','reflow']);assert.equal(input.length,9);assert.equal(result.diagnostics.fullIndexRetained,true);
 const cells=[make('first-cell','65',{locators:[{type:'excel-cell',sheet:'Values',cell:'A1'}]}),make('second-cell','65',{locators:[{type:'excel-cell',sheet:'Values',cell:'A2'}]})];assert.equal(semantic.deduplicateRetrievalResults(cells).results.length,2,'equal table cell values retain distinct row identities');
 const decimals=[make('two-factors','The factor is 0.70. Another factor is 1.80.'),make('new-decimal','The factor is 0.80.')];assert.equal(semantic.deduplicateRetrievalResults(decimals).results.length,2,'decimal points are not statement boundaries that can hide a changed number');
});

test('dense ranking deduplicates repeated same-source text before consuming top-K slots',async()=>{
 const chunks=[make('a','Normal retirement age is 65. Early retirement is available at age 60.'),make('b','Normal retirement age is 65.'),make('c','The normal retirement age is 67.')],provider={id:'MOCK-same-vectors-only',dimension:2,embedTexts:async texts=>texts.map(()=>new Float32Array([1,0]))},index=await semantic.buildSemanticIndex(chunks,provider);
 const result=await semantic.retrieveSemantic(index,'normal retirement age',provider,{topK:2});assert.deepEqual(result.results.map(chunk=>chunk.id),['a','c']);assert.equal(index.chunks.length,3);assert.deepEqual(result.diagnostics.deduplication.removed,[{chunkId:'b',duplicateOf:'a'}]);
 const many=[chunks[0],...Array.from({length:1100},(_,index)=>({...chunks[1],id:'repeat-'+index})),chunks[2]],diverse=semantic.deduplicateRetrievalResults(many,{limit:2});assert.deepEqual(diverse.results.map(chunk=>chunk.id),['a','c'],'no fixed candidate cutoff hides distinct evidence behind repeated passages');
});

test('sentence boundaries and machine-text metadata survive source-bound passage creation',()=>{
 const text='A complete source statement has a date and condition. '.repeat(30),source={id:'plan',name:'plan.txt',hash:'a'.repeat(64),parserVersion:'synthetic-v1',records:[{text,locator:{type:'pdf-ocr-line',page:1,line:1},ocr:{engineId:'synthetic-test-ocr',confidence:24,verification:'unverified-machine-text',lowConfidence:true}},{text:'This is an externally OCR-derived PDF layer of unknown origin.',locator:{type:'pdf-text',page:2,item:1},textLayer:{origin:'native-or-external-OCR-unknown',verification:'unverified-source-text-layer'}}]};
 const result=chunkSources([source],{maxChars:300,maxTokens:100,overlapChars:0});assert.equal(CHUNKER_PROFILE.version,3);assert.equal(result.chunks.some(chunk=>chunk.hasMachineText),true);assert.equal(result.chunks.some(chunk=>chunk.hasUnverifiedTextLayer),true);
 for(const chunk of result.chunks)for(const segment of chunk.segments){const record=source.records[segment.recordIndex];assert.equal(chunk.text.slice(segment.chunkStart,segment.chunkEnd),record.text.slice(segment.recordStart,segment.recordEnd));if(segment.recordIndex===0){assert.equal(segment.ocr.confidence,24);assert.equal(segment.ocr.lowConfidence,true);assert.equal(segment.sentenceFragment,false);}}
 assert.equal(result.chunks.filter(chunk=>chunk.hasMachineText).every(chunk=>chunk.minimumOcrConfidence===24&&chunk.requiresSourceReview),true);
});

test('explicit source table headers repeat in every bounded row passage with exact header locators',()=>{
 const records=[{text:'Age',locator:{type:'excel-cell',sheet:'Factors',cell:'A1'}},{text:'Early retirement factor',locator:{type:'excel-cell',sheet:'Factors',cell:'B1'}}];
 for(let age=40;age<=70;age++){records.push({text:String(age),locator:{type:'excel-cell',sheet:'Factors',cell:'A'+(age-38)}},{text:(age/80).toFixed(4),locator:{type:'excel-cell',sheet:'Factors',cell:'B'+(age-38)}});}
 const source={id:'plan',name:'factors.xlsx',hash:'a'.repeat(64),parserVersion:'synthetic-v1',records},result=chunkSources([source],{maxChars:180,maxTokens:70,overlapChars:20,headers:[{sourceId:'plan',tableName:'Factors',headerRow:1}]});assert.ok(result.chunks.length>2);
 for(const chunk of result.chunks){assert.ok(chunk.text.length<=180);assert.ok(chunk.lexicalTokenCount<=70);assert.equal(chunk.recordIndices.includes(0),true);assert.equal(chunk.recordIndices.includes(1),true);assert.ok(chunk.locators.some(locator=>locator.cell==='A1'));assert.ok(chunk.locators.some(locator=>locator.cell==='B1'));for(const segment of chunk.segments)assert.equal(chunk.text.slice(segment.chunkStart,segment.chunkEnd),records[segment.recordIndex].text.slice(segment.recordStart,segment.recordEnd));}
 assert.ok(result.chunks.slice(1).every(chunk=>chunk.segments.some(segment=>segment.headerContext)));
 const plain=chunkSources([source],{maxChars:180,maxTokens:70,overlapChars:20});assert.ok(plain.chunks.some(chunk=>!chunk.recordIndices.includes(0)),'the first row is never inferred to be an approved header');
 assert.throws(()=>chunkSources([source],{headers:[{sourceId:'plan',tableName:'Missing',headerRow:1}]}),/unavailable/);
});
