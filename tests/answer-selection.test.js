'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SELECTION_LIMITS,planFactualQuestion,createAnswerChoices,buildSelectionPrompt,parseSelectionIds,validateChoiceCoverage}=require('../assets/answer-selection.js');
function context(text,label='C1',excerpt=text,extra={}){return{label,excerpt,chunk:{id:'source-'+label,text,...extra}};}
const question='What are the normal retirement age and the case file retention period?';
const plan=()=>planFactualQuestion(question);
function propertyBind(part,choice){
 const text=choice.text.toLowerCase();
 if(/\bage\b/i.test(part))return text.includes('retirement age');
 if(/retention|kept/i.test(part))return /case files?.*(?:kept|retained)/.test(text);
 if(/benefit/i.test(part))return text.includes('benefit');
 return false;
}
const sources=()=>[context('Normal retirement age is 65.'),context('Case files are kept for seven years.','C2')];
test('compound planner expands anonymous properties and preserves independently written questions',()=>{
 assert.deepEqual(plan(),{kind:'compound',question,parts:['What is the normal retirement age?','What is the case file retention period?']});
 for(const value of ['What retirement age and monthly benefit are documented?','What retirement age and payment frequency are written in the two notes?'])assert.equal(planFactualQuestion(value).kind,'compound',value);
 for(const value of ["What is Alice's retirement age? What is Bob's monthly benefit?", "What is Alice's retirement age and what is Bob's monthly benefit?", "What is Alice's retirement age; what is Bob's monthly benefit?"]){
  const result=planFactualQuestion(value);assert.equal(result.kind,'compound');assert.deepEqual(result.parts,["What is Alice's retirement age?","What is Bob's monthly benefit?"]);
 }
 const triple=planFactualQuestion('What is the normal age? How long are files kept? Which form lists the bank account?');assert.equal(triple.kind,'compound');assert.equal(triple.parts.length,3);
});
test('single factual questions preserve the old plain path and relation endpoints are not split',()=>{
 for(const value of ['At what age does normal retirement begin?','Who should receive a change of mailing address?','Which document lists the bank account number?','How long are case files kept?','What payment is documented between Alice and Bob?']){
  assert.deepEqual(planFactualQuestion(value),{kind:'single',question:value,parts:[value]});
 }
});
test('ambiguous shared subjects, groups, pronouns, causal relations and too many parts are unsupported',()=>{
 for(const value of ["What are Alice's normal retirement age and monthly benefit?",'What are the normal retirement age and monthly benefit for Alice?','What are normal retirement age and monthly benefit for hourly employees?','What are retirement ages of Alice and Bob?',"What is Alice's retirement age? What is her benefit?",'What is the retirement age? Why does it affect the benefit?','What is retirement age and payment frequency?','What is age? What is benefit? What is retention? What is frequency?','What is the age; monthly benefit?','What is normal retirement age and what monthly benefit is documented for Alice?','What is normal retirement age for hourly employees; what is monthly benefit?', 'What is normal retirement age? What is monthly benefit and the retention period?', 'What retirement age and monthly benefit are documented for Alice?']){
  const result=planFactualQuestion(value);assert.equal(result.kind,'unsupported',value);assert.equal(result.parts.length,0);assert.ok(result.reason.length>10);
 }
 assert.equal(planFactualQuestion('x'.repeat(1001)).kind,'unsupported');assert.equal(planFactualQuestion(null).kind,'unsupported');
});
test('choices bind complete source statements and preserve full source/context identity',()=>{
 const input=sources(),choices=createAnswerChoices(input,{plan:plan(),bind:propertyBind});
 assert.deepEqual(choices.map(({id,label,text})=>({id,label,text})),[{id:'S1',label:'C1',text:input[0].chunk.text},{id:'S2',label:'C2',text:input[1].chunk.text}]);
 assert.equal(choices[0].context,input[0]);assert.equal(choices[1].context,input[1]);
 const prompt=buildSelectionPrompt(plan(),choices);assert.ok(prompt.length<=2600);assert.match(prompt,/EVERY question part/);assert.match(prompt,/untrusted data/);assert.match(prompt,/"id":"S2"/);assert.match(prompt,/seven years/);
 const body=JSON.parse(prompt.split('UNTRUSTED DATA JSON\n')[1].split('\nEND DATA')[0]);assert.equal(body.question,question);assert.deepEqual(body.parts,plan().parts);assert.deepEqual(body.sources,[{id:'S1',text:input[0].chunk.text},{id:'S2',text:input[1].chunk.text}]);
});
test('clipped source conditions and unpunctuated wrapped conditions cannot become new sentences',()=>{
 const complete='Normal retirement age is 65 only if the service condition is met.';
 const clipped=context(complete,'C1','Normal retirement age is 65');
 assert.deepEqual(createAnswerChoices([clipped],{plan:plan(),bind:propertyBind}),[]);
 const two='Normal retirement age is 65. Case files are kept for seven years only if the closure condition is met.';
 const choices=createAnswerChoices([context(two,'C1','Normal retirement age is 65. Case files are kept for seven years')],{plan:plan(),bind:propertyBind});assert.deepEqual(choices.map(choice=>choice.text),['Normal retirement age is 65.']);assert.equal(validateChoiceCoverage(plan(),choices,propertyBind).complete,false);
 const wrapped='Normal retirement age is 65\nonly if the service condition is met.';
 assert.deepEqual(createAnswerChoices([context(wrapped,'C1','Normal retirement age is 65')],{plan:plan(),bind:propertyBind}),[]);
 const qualified=createAnswerChoices([context(complete)],{plan:plan(),bind:propertyBind});assert.equal(qualified[0].text,complete);
});
test('joined assertions, different named subjects and role endpoint mixtures are not source choices',()=>{
 const values=['Alice retirement age is 65 while Bob receives a monthly benefit of 100 dollars.','Alice retirement age is 65 and case files are retained for seven years.','Normal retirement age is 65; case files are retained for seven years.','Alice retirement age is 65, Bob monthly benefit is 100 dollars.','Alice pays Bob a retirement benefit of 65 dollars.','Alice retirement age is 65, her monthly benefit is 100 dollars.'];
 for(const text of values)assert.deepEqual(createAnswerChoices([context(text)],{plan:plan(),bind:()=>true}),[],text);
});
test('OCR casing, punctuation joins, causal links and repeated finite predicates cannot hide multiple assertions',()=>{
 const p=planFactualQuestion("What is Alice's age? What is Bob's monthly benefit?");
 const values=["alice's monthly benefit is 100 dollars / bob's age is 65.","alice's monthly benefit is 100 dollars — bob's age is 65.","alice's monthly benefit is 100 dollars & bob's age is 65.","alice's monthly benefit is 100 dollars because bob's age is 65.","alice's monthly benefit is 100 dollars bob's age is 65.","alice receives 100 dollars bob age is 65.","alice's age is 65 because bob retires."];
 for(const text of values)assert.deepEqual(createAnswerChoices([context(text)],{plan:p,bind:()=>true}),[],text);
 const broad=context('The documented age is 65.');assert.deepEqual(createAnswerChoices([broad],{plan:p,bind:()=>true}),[],'one broad prose statement cannot satisfy independently named parts');
});
test('sentence boundaries do not cut a condition at a title abbreviation or initial',()=>{
 for(const text of ['Normal retirement age is 65 only if Dr. Smith certifies disability.','Normal retirement age is 65 only if J. Smith certifies disability.']){
  const clipped=context(text,'C1',text.slice(0,text.indexOf('. ')+1));assert.deepEqual(createAnswerChoices([clipped],{plan:plan(),bind:propertyBind}),[],text);
  const choices=createAnswerChoices([context(text)],{plan:plan(),bind:propertyBind});assert.ok(choices.length===0||choices[0].text===text,'an abbreviation never emits only the condition prefix');
 }
 const ordinary='Normal retirement age may be 65 only if the participant meets the service condition.';const choices=createAnswerChoices([context(ordinary)],{plan:plan(),bind:propertyBind});assert.equal(choices.length,1);assert.equal(choices[0].text,ordinary);
});
test('trusted table fields remain one whole candidate and ignore untrusted top-level metadata',()=>{
 const text='Row: Alice\nNormal retirement age: 65';
 const chunkMetadata={evidenceKind:'table-field-v1',tableEvidence:{schemaVersion:1,focus:{propertyText:'Normal retirement age'}}};
 const item=context(text,'C1',text,chunkMetadata),choices=createAnswerChoices([item],{plan:plan(),bind:propertyBind});
 assert.equal(choices.length,1);assert.equal(choices[0].text,text);assert.equal(choices[0].tableEvidence,chunkMetadata.tableEvidence);assert.equal(choices[0].trustedTableField,true);
 assert.deepEqual(createAnswerChoices([{...context(text),tableEvidence:chunkMetadata.tableEvidence}],{plan:plan(),bind:propertyBind}),[]);
 assert.deepEqual(createAnswerChoices([context(text,'C1',text,{...chunkMetadata,tableEvidence:{schemaVersion:2}})],{plan:plan(),bind:propertyBind}),[]);
 const single=planFactualQuestion('What is the normal retirement age?'),singleChoices=createAnswerChoices([item],{plan:single,bind:propertyBind});assert.equal(single.kind,'single');assert.equal(singleChoices.length,1);assert.equal(validateChoiceCoverage(single,singleChoices,propertyBind).complete,true);assert.match(buildSelectionPrompt(single,singleChoices),/Row: Alice/);
});
test('selection output contains only unique known IDs or NONE',()=>{
 const choices=createAnswerChoices(sources(),{plan:plan(),bind:propertyBind});
 assert.deepEqual(parseSelectionIds('S1,S2',choices),['S1','S2']);assert.deepEqual(parseSelectionIds('\nNONE\n',choices),[]);assert.deepEqual(parseSelectionIds('S2',choices),['S2']);
 for(const raw of ['','S1,S1','S3','S0','S01','s1','S1, S2','S1\nS2','["S1","S2"]','S1 and S2','S1,S2.','NONE,S1','Select S1,S2','S1,S2\nExplanation: enough evidence.','S1,'.repeat(100)])assert.throws(()=>parseSelectionIds(raw,choices),Error,raw);
 const twelve=Array.from({length:12},(_,index)=>({id:'S'+(index+1)}));assert.deepEqual(parseSelectionIds('S7,S12',twelve),['S7','S12']);assert.throws(()=>parseSelectionIds('S1,S2,S3,S4,S5,S6,S7',twelve));
});
test('coverage requires all parts after selection, rejects partial answers and unused claims',()=>{
 const p=plan(),choices=createAnswerChoices(sources(),{plan:p,bind:propertyBind});
 assert.deepEqual(validateChoiceCoverage(p,choices,propertyBind),{complete:true,missingParts:[],irrelevantIds:[]});
 assert.deepEqual(validateChoiceCoverage(p,[choices[0]],propertyBind),{complete:false,missingParts:[p.parts[1]],irrelevantIds:[]});
 assert.equal(validateChoiceCoverage(p,[],propertyBind).complete,false);
 assert.equal(validateChoiceCoverage(p,[choices[0],choices[0],choices[1]],propertyBind).complete,false,'repeated choices cannot claim coverage');
 assert.equal(validateChoiceCoverage(p,choices,()=>{throw Error('Binding refused.');}).complete,false);
 const unrelated={id:'S3',text:'The storage room is blue.'};assert.deepEqual(validateChoiceCoverage(p,[...choices,unrelated],propertyBind),{complete:false,missingParts:[],irrelevantIds:['S3']});
});
test('each named full question binds its own person and property rather than a global union',()=>{
 const p=planFactualQuestion("What is Alice's normal retirement age? What is Bob's monthly benefit?");
 const ownBind=(part,choice)=>{
  const subject=/Alice/.test(part)?'Alice':'Bob',property=/retirement age/.test(part)?'retirement age':'monthly benefit';return choice.text.includes(subject)&&choice.text.includes(property);
 };
 const wrong=createAnswerChoices([context('Alice monthly benefit is 100 dollars.'),context('Bob normal retirement age is 65.','C2')],{plan:p,bind:ownBind});
 assert.equal(wrong.length,0);assert.equal(validateChoiceCoverage(p,wrong,ownBind).complete,false);
 const correct=createAnswerChoices([context('Alice normal retirement age is 65.'),context('Bob monthly benefit is 100 dollars.','C2')],{plan:p,bind:ownBind});assert.equal(correct.length,2);assert.equal(validateChoiceCoverage(p,correct,ownBind).complete,true);assert.equal(validateChoiceCoverage(p,[correct[0]],ownBind).complete,false);
});
test('candidate and prompt bounds drop complete choices instead of clipping text',()=>{
 const p=plan(),many=Array.from({length:30},(_,index)=>'Normal retirement age is '+(50+index)+'.').join(' ');
 const choices=createAnswerChoices([context(many)],{plan:p,bind:propertyBind});assert.equal(choices.length,12);assert.deepEqual(choices.map(choice=>choice.id),Array.from({length:12},(_,index)=>'S'+(index+1)));
 const lengthy=Array.from({length:5},(_,index)=>'Normal retirement age is 65 '+('source qualifier '+index+' ').repeat(40)+'.').join(' ');
 const bounded=createAnswerChoices([context(lengthy)],{plan:p,bind:propertyBind});assert.ok(bounded.length>0&&bounded.length<5);assert.ok(buildSelectionPrompt(p,bounded).length<=SELECTION_LIMITS.promptCharacters);for(const choice of bounded)assert.ok(lengthy.includes(choice.text));
 assert.equal(createAnswerChoices([context('Normal retirement age is 65 '+ 'x'.repeat(2000)+'.')],{plan:p,bind:propertyBind}).length,0);
 assert.throws(()=>buildSelectionPrompt(p,[{id:'S1',text:'x'.repeat(2600)}]));
 assert.equal(createAnswerChoices([context('Normal retirement age is 65.','FAKE')],{plan:p,bind:propertyBind}).length,0);
 assert.equal(createAnswerChoices(sources(),{plan:p,bind:()=>{throw Error('No binding.');}}).length,0);
});
