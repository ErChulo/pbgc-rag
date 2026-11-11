'use strict';
// Independent review regressions. Mock selection tests grounding, not model quality.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseText}=require('../assets/core.js'),{buildAnswerCorpus}=require('../assets/rag-corpus.js'),{answerQuestion}=require('../assets/rag.js'),{answerQuestions}=require('../assets/rag-questions.js');
async function ageUnits(tables){
 const sources=tables.map(([id,text])=>({id,name:id+'.csv',hash:'a'.repeat(64),parserVersion:'synthetic-1',records:parseText(id+'.csv',text).records}));
 const corpus=await buildAnswerCorpus(sources,{headers:sources.map(source=>({sourceId:source.id,tableName:source.name,headerRow:1}))});return corpus.chunks.filter(chunk=>chunk.tableEvidence?.focus.columnName.toLowerCase()==='age');
}
async function ask(question,chunks,{retrieved=chunks,scope}={}){let calls=0;const result=await answerQuestion({question,chunks,retrieval:{results:retrieved,diagnostics:{weak:false}},scope,provider:{id:'MOCK-independent-table-review',answerFormat:'auto-grounded-v2',generate:async()=>{calls++;return 'S1';}}});return {result,calls};}

test('a shared person name with differing IDs and ages cannot choose an arbitrary row',async()=>{
 const chunks=await ageUnits([['people','Name,ID,Age\nAlice,1,65\nAlice,2,67']]),{result,calls}=await ask("What is Alice's age?",chunks);
 assert.notEqual(result.status,'answered');assert.equal(calls,0);assert.deepEqual(result.citations.filter(citation=>citation.quotes?.length),[]);
});

test('the actual explicit ID disambiguates same-named rows without a conflict from the other ID',async()=>{
 const chunks=await ageUnits([['people','Name,ID,Age\nAlice,1,65\nAlice,2,67']]);
 for(const [id,value]of [['1','65'],['2','67']]){const {result,calls}=await ask("What is Alice's age for ID "+id+'?',chunks);assert.equal(result.status,'answered');assert.equal(calls,1);assert.equal(result.citations.length,1);assert.equal(result.citations[0].tableEvidence.focus.rawText,value);assert.equal(result.citations[0].tableEvidence.identity.find(cell=>cell.columnName==='ID').rawText,id);}
});

test('same-row conflicts survive source header order and case differences',async()=>{
 const chunks=await ageUnits([['one','Name,ID,Age\nAlice,1,65'],['two','id,name,age\n1,alice,67']]),{result,calls}=await ask("What is Alice's age?",chunks);
 assert.equal(result.status,'conflict');assert.equal(calls,0);
});

test('same-name ambiguity cannot hide behind retrieval top-K when the verified scoped corpus has both rows',async()=>{
 const chunks=await ageUnits([['people','Name,ID,Age\nAlice,1,65\nAlice,2,67']]),{result,calls}=await ask("What is Alice's age?",chunks,{retrieved:[chunks[0]]});
 assert.notEqual(result.status,'answered');assert.equal(calls,0);assert.equal(result.citations.length,2,'Both ambiguous original rows remain available for review even when retrieval returned one.');
});

test('an explicit source scope excludes a different same-named person from ambiguity checks',async()=>{
 const chunks=await ageUnits([['one','Name,ID,Age\nAlice,1,65'],['two','Name,ID,Age\nAlice,2,67']]),{result,calls}=await ask("What is Alice's age?",chunks,{retrieved:chunks.filter(chunk=>chunk.sourceId==='one'),scope:{sourceIds:['one']}});
 assert.equal(result.status,'answered');assert.equal(calls,1);assert.equal(result.citations[0].sourceId,'one');assert.equal(result.citations[0].tableEvidence.focus.rawText,'65');
});

test('unrecognized FullName and ParticipantName headers safely abstain on a named age question',async()=>{
 for(const header of ['FullName','ParticipantName']){const chunks=await ageUnits([['people',header+',Age\nAlice,65']]),{result,calls}=await ask("What is Alice's age?",chunks);assert.equal(result.status,'abstained');assert.equal(calls,0);}
});

test('question-set snapshots preserve typed fields and exact provenance when live table metadata changes',async()=>{
 const chunks=await ageUnits([['people','Name,Age\nAlice,65\nBob,67']]),expected=JSON.parse(JSON.stringify(chunks));
 const pending=answerQuestions({questions:["What is Alice's age?","What is Bob's age?"],chunks,provider:{id:'MOCK-independent-table-review',answerFormat:'auto-grounded-v2',generate:async()=> 'S1'},retrieve:async({chunks:sourceChunks})=>({results:sourceChunks,diagnostics:{weak:false}})});
 chunks[0].tableEvidence.focus.rawText='99';chunks[0].tableEvidence.focus.locator.row=999;chunks[0].recordIndices[0]=999;chunks[0].locators[0].row=999;
 const batch=await pending;assert.equal(batch.status,'answered');assert.equal(batch.results.length,2);for(let i=0;i<2;i++){const citation=batch.results[i].result.citations[0];assert.equal(citation.evidenceKind,'table-field-v1');assert.deepEqual(citation.tableEvidence,expected[i].tableEvidence);assert.deepEqual(citation.locators,expected[i].locators);assert.deepEqual(citation.primaryLocator,expected[i].tableEvidence.focus.locator);}
});

test('question-set snapshots cannot erase a malformed typed profile and turn it into prose',async()=>{
 const chunks=await ageUnits([['people','Name,Age\nAlice,65']]);delete chunks[0].evidenceKind;
 await assert.rejects(answerQuestion({question:"What is Alice's age?",chunks}),/Unsupported table evidence profile/);
 await assert.rejects(answerQuestions({questions:["What is Alice's age?"],chunks,retrieve:async({chunks:sourceChunks})=>({results:sourceChunks,diagnostics:{weak:false}})}));
});
