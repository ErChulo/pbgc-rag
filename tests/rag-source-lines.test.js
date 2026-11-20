'use strict';
// MOCK selection isolates exact source segmentation; no model or PDF OCR inference.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {splitSourceStatements,planFactualQuestion,createAnswerChoices}=require('../assets/answer-selection.js'),{answerQuestion}=require('../assets/rag.js');
const QUESTION='What is the normal retirement age?';
function chunk(text,extra={}){return{id:'source-lines',text,sourceId:'synthetic-source-lines',sourceName:'synthetic-source-lines.txt',sourceHash:'a'.repeat(64),locators:[{type:'text-line',line:1}],recordIndices:[0],...extra};}
function promptData(prompt){return JSON.parse(prompt.split('UNTRUSTED DATA JSON\n')[1].split('\nEND DATA')[0]);}
async function ask(text,{question=QUESTION,raw='S1',extra={}}={}){
 const chunks=[chunk(text,extra)];let calls=0,request;
 const result=await answerQuestion({question,chunks,retrieval:{results:chunks,diagnostics:{weak:false}},provider:{id:'MOCK-exact-source-lines',answerFormat:'source-selection-grounded-v1',generate:async value=>{calls++;request=value;return raw;}}});return{result,calls,request};
}

test('header and page-number records do not swallow the following source statement',async()=>{
 const fact='Normal retirement age is 65.',text='PLAN HEADER\n1\n'+fact;
 assert.deepEqual(splitSourceStatements(text),['PLAN HEADER','1',fact]);
 const{result,calls,request}=await ask(text);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(calls,1);assert.equal(result.answer,fact+' [C1]');assert.deepEqual(promptData(request.prompt).sources,[{id:'S1',text:fact}]);
});

test('an age heading followed by a page number cannot invent a conflicting age',async()=>{
 const fact='Normal retirement age is 65.',text='NORMAL RETIREMENT AGE\n1\n'+fact;
 assert.deepEqual(splitSourceStatements(text),['NORMAL RETIREMENT AGE','1',fact]);
 const {result}=await ask(text);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(result.answer,fact+' [C1]');assert.deepEqual(result.citations[0].quotes,[fact]);
});

for(const [name,text]of [
 ['copula wrap','Normal retirement age is\n65.'],
 ['CRLF whitespace wrap','Normal retirement age is\r\n\t65.'],
 ['numeric property value','Normal retirement age\n65.'],
 ['written property value','Normal retirement age:\nsixty-five.'],
 ['condition wrap','Normal retirement age is 65\nonly if service is at least 10 years and the participant is vested.'],
 ['condition with wrapped conjunction','Normal retirement age is 65 only if service is at least 10 years\nand the participant is vested.'],
 ['alternative wrapped condition','Normal retirement age is 65\nunless the participant has fewer than 10 years of service.'],
 ['wrapped service scope','Normal retirement age is 65\nfor participants with at least 10 years of service.'],
 ['wrapped before date','Normal retirement age is 65\nbefore January 1, 2025.'],
 ['wrapped after date','Normal retirement age is 65\nafter January 1, 2025.'],
 ['wrapped alternative age','Normal retirement age is 65\nor 67 depending on the participant group.'],
 ['wrapped only-for scope','Normal retirement age is 65\nonly for salaried employees.'],
 ['wrapped subject-to scope','Normal retirement age is 65\nsubject to the participant being vested.'],
 ['wrapped as-of date','Normal retirement age is 65\nas of January 1, 2020.'],
 ['wrapped on-condition clause','Normal retirement age is 65\non condition that service is at least 10 years.'],
 ['wrapped restricted-to scope','Normal retirement age is 65\nrestricted to salaried employees.'],
 ['wrapped with scope','Normal retirement age is 65\nwith at least 10 years of service.'],
 ['wrapped excluding scope','Normal retirement age is 65\nexcluding participants hired after 2020.'],
 ['preposed wrapped condition','If service is at least 10 years,\nnormal retirement age is 65.'],
 ['preposed condition wraps twice','If service is at least\n10 years,\nnormal retirement age is 65.'],
 ['preposed for scope with comma','For salaried employees,\nnormal retirement age is 65.'],
 ['preposed for scope without punctuation','For salaried employees\nnormal retirement age is 65.'],
 ['preposed subject-to scope with comma','Subject to vesting,\nnormal retirement age is 65.'],
 ['preposed subject-to scope without punctuation','Subject to vesting\nnormal retirement age is 65.'],
 ['uppercase group scope','SALARIED EMPLOYEES\nnormal retirement age is 65.'],
 ['preposed scope with colon','Subject to vesting:\nnormal retirement age is 65.'],
 ['preposed scope with semicolon','Subject to vesting;\nnormal retirement age is 65.']
])test('selection retains the exact complete source substring: '+name,async()=>{
 assert.deepEqual(splitSourceStatements(text),[text]);
 const{result,calls,request}=await ask(text);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(calls,1);assert.equal(result.answer,text+' [C1]');assert.deepEqual(result.citations[0].quotes,[text]);assert.deepEqual(promptData(request.prompt).sources,[{id:'S1',text}]);
});

for(const reference of ['It','This age','That provision','These benefits'])test('a reference-led qualification remains in the complete source span: '+reference,async()=>{
 const text='Normal retirement age is 65\n'+reference+' is applicable only to salaried employees.';
 assert.deepEqual(splitSourceStatements(text),[text]);const {result}=await ask(text);
 assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(result.answer,text+' [C1]');assert.deepEqual(result.citations[0].quotes,[text]);
 const clipped='Normal retirement age is 65\n'+' '.repeat(2100)+reference+' is applicable only to salaried employees.';
 assert.deepEqual(splitSourceStatements(clipped),[clipped]);const refused=await ask(clipped);assert.equal(refused.result.status,'abstained');assert.equal(refused.calls,0);assert.equal(refused.result.diagnostics.modelOutputAccepted,false);
});

for(const qualification of [
 'The age is applicable only to salaried employees.',
 'The provision is restricted to vested participants.',
 'The age is applicable only to participants with 10 years of service.',
 'The participants are salaried employees.'
])test('an ambiguous definite-head clause retains the preceding fact: '+qualification,async()=>{
 const text='Normal retirement age is 65\n'+qualification;
 assert.deepEqual(splitSourceStatements(text),[text]);const {result}=await ask(text);
 assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(result.answer,text+' [C1]');assert.deepEqual(result.citations[0].quotes,[text]);
 const clipped='Normal retirement age is 65\n'+' '.repeat(2100)+qualification;
 assert.deepEqual(splitSourceStatements(clipped),[clipped]);const refused=await ask(clipped);assert.equal(refused.result.status,'abstained');assert.equal(refused.calls,0);assert.equal(refused.result.diagnostics.modelOutputAccepted,false);
});

for(const value of ['67','sixty-seven'])test('a direct definite-head value remains independent and cannot hide a conflicting age: '+value,async()=>{
 const first='Normal retirement age is 65',second='The age is '+value+'.';
 assert.deepEqual(splitSourceStatements(first+'\n'+second),[first,second]);
 const {result,calls}=await ask(first+'\nThe normal retirement age is '+value+'.');assert.equal(result.status,'conflict',JSON.stringify(result.diagnostics));assert.equal(calls,0);assert.equal(result.diagnostics.reason,'possible-source-conflict');
});

test('plain source lines remain separate rather than becoming one merged factual choice',async()=>{
 const age='Normal retirement age is 65',retention='Case files are retained for 7 years.',text=age+'\n'+retention;
 assert.deepEqual(splitSourceStatements(text),[age,retention]);
 const{result,request}=await ask(text);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(result.answer,age+' [C1]');assert.deepEqual(promptData(request.prompt).sources,[{id:'S1',text:age}]);
 const combined=await ask(text,{question:'What is the normal retirement age? How long are case files retained?',raw:'S1,S2'});
 assert.equal(combined.result.status,'answered',JSON.stringify(combined.result.diagnostics));assert.equal(combined.result.answer,age+' [C1]\n\n'+retention+' [C1]');
});

for(const conjunction of ['and','or','but'])test('an unterminated factual clause retains its ambiguous '+conjunction+' continuation',async()=>{
 const first='Normal retirement age is 65',second=conjunction+' the bank form has a separate mailing address.',text=first+'\n'+second;
 assert.deepEqual(splitSourceStatements(text),[text]);
 const {result}=await ask(text);assert.ok(['answered','abstained'].includes(result.status));
 if(result.status==='answered'){assert.equal(result.answer,text+' [C1]');assert.deepEqual(result.citations[0].quotes,[text]);}
});

test('table hints cannot become prose choices after source lines are split',()=>{
 const text='Row: Alice\nNormal retirement age: 65',plan=planFactualQuestion(QUESTION),base={chunk:chunk(text),label:'C1',excerpt:text};
 const evidence={schemaVersion:1,focus:{propertyText:'Normal retirement age'}};
 for(const item of [
  {...base,tableEvidence:evidence},
  {...base,evidenceKind:'table-field-v1'},
  {...base,chunk:{...base.chunk,tableEvidence:evidence}},
  {...base,chunk:{...base.chunk,evidenceKind:'table-field-v1'}},
  {...base,chunk:{...base.chunk,evidenceKind:'table-field-v1',tableEvidence:{...evidence,schemaVersion:2}}},
  {...base,chunk:{...base.chunk,evidenceKind:'unknown-table-profile',tableEvidence:evidence}}
 ])assert.deepEqual(createAnswerChoices([item],{plan,bind:()=>true}),[]);
 const trusted={...base,chunk:{...base.chunk,evidenceKind:'table-field-v1',tableEvidence:evidence},tableEvidence:{schemaVersion:2},evidenceKind:'untrusted-top-level-imitation'};
 const choices=createAnswerChoices([trusted],{plan,bind:()=>true});assert.equal(choices.length,1);assert.equal(choices[0].text,text);assert.equal(choices[0].trustedTableField,true);assert.equal(choices[0].tableEvidence,evidence);
});

test('conditional continuation retains original indentation and whitespace',()=>{
 const text='Normal retirement age is 65\r\n  only if service is at least 10 years\r\n\tand the participant is vested.';
 assert.deepEqual(splitSourceStatements(text),[text]);assert.equal(text.includes(splitSourceStatements(text)[0]),true);
});

test('abbreviations and initials retain their existing punctuation behavior',()=>{
 const one="Dr. A. Smith reviewed the plan under Sec. 3.",two='Normal retirement age is 65.';
 assert.deepEqual(splitSourceStatements(one+'\n'+two),[one,two]);
});

for(const qualification of [
 'only if service is at least 10 years and the participant is vested.',
 'for participants with at least 10 years of service.',
 'before January 1, 2025.',
 'or 67 depending on the participant group.',
 'only for salaried employees.',
 'subject to the participant being vested.',
 'as of January 1, 2020.',
 'on condition that service is at least 10 years.',
 'restricted to salaried employees.',
 'with at least 10 years of service.',
 'excluding participants hired after 2020.'
])test('a wrapped qualification outside the prompt excerpt cannot become an unqualified age choice: '+qualification,async()=>{
 const text='Normal retirement age is 65\n'+' '.repeat(2100)+qualification;
 assert.deepEqual(splitSourceStatements(text),[text]);const{result,calls}=await ask(text);assert.equal(result.status,'abstained');assert.equal(calls,0);assert.equal(result.diagnostics.modelOutputAccepted,false);
});

test('a cut wrapped qualification is refused without releasing its preceding age fragment',async()=>{
 const text='Normal retirement age is 65\nonly if service is at least';
 const{result,calls}=await ask(text,{extra:{segments:[{recordIndex:0,recordStart:0,recordEnd:text.length,chunkStart:0,chunkEnd:text.length,endsMidSentence:true}],hasSentenceFragments:true}});
 assert.equal(result.status,'abstained');assert.equal(calls,0);assert.equal(result.diagnostics.modelOutputAccepted,false);
});
