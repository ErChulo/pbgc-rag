'use strict';
// MOCK providers test named-subject grounding, not model quality or general entailment.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {answerQuestion}=require('../assets/rag.js'),{parseText}=require('../assets/core.js'),{buildAnswerCorpus}=require('../assets/rag-corpus.js');
function chunk(text){return{id:'subject-role',text,sourceId:'synthetic-subject-role',sourceName:'synthetic-subject-role.txt',sourceHash:'a'.repeat(64),locators:[{type:'text-line',line:1}],recordIndices:[0]};}
async function ask(question,text,format='source-selection-grounded-v1'){
 const chunks=[chunk(text)];let calls=0;
 const provider={id:'MOCK-named-subject-role',answerFormat:format,generate:async()=>{calls++;return format==='source-selection-grounded-v1'?'S1':format==='plain-grounded-v1'?text:JSON.stringify({status:'answered',answer:text,citations:[{label:'C1',quote:text}]});}};
 const result=await answerQuestion({question,chunks,retrieval:{results:chunks,diagnostics:{weak:false}},provider});return{result,calls};
}

for(const [name,question,text]of [
 ['modal name Will attribution',"What is Will's age?","Bob's age is 65 according to Will."],
 ['modal name May counterparty','What monthly income does May receive?','Bob receives monthly income of 1000 dollars from May.'],
 ['modal is not a named subject',"What is Will's age?",'Bob will retire at age 65.'],
 ['possessive attribution',"What is Alice's age?","Bob's age is 65 according to Alice."],
 ['income counterparty','What monthly income does Alice receive?','Bob receives monthly income of 1000 dollars from Alice.'],
 ['retirement-age attribution',"What is Alice's normal retirement age?","Bob's normal retirement age is 65 according to Alice."],
 ['lowercase possessive',"what is alice's age?","Bob's age is 65 according to Alice."],
 ['lowercase receiving subject','what monthly income does alice receive?','Bob receives monthly income of 1000 dollars from Alice.'],
 ['front attribution',"What is Alice's age?","According to Alice, Bob's age is 65."],
 ['plan context',"What is Alice's normal retirement age under Plan Acme?","Under Plan Acme, Bob's normal retirement age is 65 according to Alice."],
 ['for target cannot override primary owner','What is the age for Alice?',"Bob's age is 65 for Alice's review."],
 ['father owns the age',"What is Alice's age?","Alice's father’s age is 65."],
 ['spouse owns the age',"What is Alice's age?","Alice's spouse age is 65."],
 ['spouse receives the income','What monthly income does Alice receive?',"Alice's spouse receives monthly income of 1000 dollars."],
 ['value-first family owner',"What is Alice's age?","Age is 65 for Alice's father."]
])test('source selection rejects the wrong primary subject: '+name,async()=>{
 const {result,calls}=await ask(question,text);assert.equal(result.status,'abstained',JSON.stringify({question,answer:result.answer,diagnostics:result.diagnostics}));assert.equal(calls,0,'A wrong subject must not become a source choice.');assert.equal(result.diagnostics.modelOutputAccepted,false);assert.equal(result.citations.length,0);
});

for(const [name,question,text]of [
 ['modal name Will owner',"What is Will's age?","Will's age is 65."],
 ['modal name May subject','What monthly income does May receive?','May receives monthly income of 1000 dollars.'],
 ['modal given name in full owner',"What is Will Smith's age?","Will Smith's age is 65."],
 ['possessive owner',"What is Alice's age?","Alice's age is 65."],
 ['receiving subject with counterparty','What monthly income does Alice receive?','Alice receives monthly income of 1000 dollars from Bob.'],
 ['for owner after value',"What is Alice's age?",'Age is 65 for Alice.'],
 ['of owner before predicate',"What is Alice's age?",'The age of Alice is 65.'],
 ['explicit question for target','What is the age for Alice?','Age is 65 for Alice.'],
 ['explicit question of target','What is the age of Alice?','The age of Alice is 65.'],
 ['plan context preserves subject',"What is Alice's normal retirement age under Plan Acme?","Under Plan Acme, Alice's normal retirement age is 65."],
 ['actorless plan context','What is the normal retirement age under Plan Acme?','Under Plan Acme, normal retirement age is 65.'],
 ['actorless personal attribution','What is the normal retirement age according to Alice?','According to Alice, normal retirement age is 65.'],
 ['actorless plan attribution','What is the normal retirement age according to Plan Acme?','According to Plan Acme, normal retirement age is 65.'],
 ['lowercase question',"what is alice's age?","Alice's age is 65."],
 ['lowercase receiving question','what monthly income does alice receive?','Alice receives monthly income of 1000 dollars from Bob.'],
 ['complete joined condition',"What is Alice's normal retirement age?","Alice's normal retirement age is 65 only if service is at least 10 years and the participant is vested."],
 ['accrued vested benefit',"What is Alice's accrued vested monthly benefit?","Alice's accrued vested monthly benefit is 1000 dollars."],
 ['family in complete condition',"What is Alice's age?","Alice's age is 65 only if her father completes the form."],
 ['explicitly requested family owner',"What is Alice's father's age?","Alice's father's age is 65."],
 ['attributed correct property',"What is Alice's age?","Alice's age is 65 according to Bob."]
])test('subject binding preserves supported complete quotations: '+name,async()=>{
 const {result,calls}=await ask(question,text);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(calls,1);assert.equal(result.answer,text+' [C1]');assert.deepEqual(result.citations[0].quotes,[text]);
});

test('plain and structured responses cannot release a counterparty as the requested subject',async()=>{
 const text='Bob receives monthly income of 1000 dollars from Alice.';
 for(const format of ['plain-grounded-v1','structured-grounded-test']){const{result}=await ask('What monthly income does Alice receive?',text,format);assert.equal(result.status,'abstained',format+': '+result.answer);assert.equal(result.diagnostics.modelOutputAccepted,false);}
});

test('typed table identity remains governed by authenticated row and focus cells',async()=>{
 const source={id:'table-subject-role',name:'synthetic-people.csv',hash:'a'.repeat(64),parserVersion:'synthetic-subject-role-v1',records:parseText('synthetic-people.csv','Name,Age\nAlice,65\nBob,67').records};
 const {chunks}=await buildAnswerCorpus([source],{headers:[{sourceId:source.id,tableName:source.name,headerRow:1}]});
 const result=await answerQuestion({question:"What is Alice's age?",chunks,retrieval:{results:chunks,diagnostics:{weak:false}},provider:{id:'MOCK-typed-subject-role',answerFormat:'source-selection-grounded-v1',generate:async()=> 'S1'}});
 assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(result.citations.length,1);assert.equal(result.citations[0].tableEvidence.focus.rawText,'65');assert.equal(result.citations[0].tableEvidence.identity.find(cell=>cell.columnName==='Name').rawText,'Alice');
});
