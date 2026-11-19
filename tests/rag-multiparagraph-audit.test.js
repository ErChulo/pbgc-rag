'use strict';
// Deterministic providers exercise the real parser/chunker/orchestration guards.
// This corpus does not measure embedding recall or a language model's accuracy.
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const fixture=require('../fixtures/rag-multiparagraph-audit.json');
const {parseText}=require('../assets/core.js'),{chunkSources}=require('../assets/chunking.js');
const {answerQuestion,normalizeQuestionTopics,normalizeEvidenceTopics,RAG_LIMITS}=require('../assets/rag.js');
const hash=text=>createHash('sha256').update(text).digest('hex');
const source=(id,text)=>({id,name:id+'.txt',hash:hash(text),parserVersion:'synthetic-audit-text-1',records:parseText(id+'.txt',text).records});
const sources=fixture.sources.map(item=>source(item.id,item.paragraphs.join('\n\n')));
const chunks=chunkSources(sources).chunks;
const build=(...texts)=>chunkSources(texts.map((text,index)=>source('variant-'+index,text))).chunks;
const question='What is the normal retirement age?';
async function ask(q,corpus,answer,extra={}){
 let calls=0,prompt;
 const result=await answerQuestion({question:q,chunks:corpus,retrieval:{results:corpus,diagnostics:{weak:false}},provider:{id:'MOCK-multiparagraph-guard-only',answerFormat:'plain-grounded-v1',generate:async request=>{calls++;prompt=request.prompt;return answer;}},...extra});
 return{result,calls,prompt};
}

test('AUDIT realistic eight-paragraph plan answers an age question despite unrelated units and nine-source distractions',async()=>{
 assert.equal(fixture.sources[0].paragraphs.length,8);assert.equal(sources.length,9);assert.ok(chunks.length>sources.length,'the fixture must exercise actual chunk boundaries');
 const {result,calls}=await ask(question,chunks,fixture.expected.retirementAge);
 assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));assert.equal(calls,1);assert.equal(result.citations[0].sourceId,'cedar-plan');
 assert.equal(result.citations[0].quotes[0],fixture.expected.retirementAge);assert.equal(result.citations[0].sourceHash,sources[0].hash);
 for(const locator of result.citations[0].locators)assert.ok(sources[0].records.some(record=>isDeepStrictEqual(record.locator,locator)),'every citation locator must survive the actual parser and chunker');
 assert.equal(result.diagnostics.evidenceAnalysis.complete,true);assert.equal(result.diagnostics.conflicts,undefined);
});

test('AUDIT same-property age changes conflict even after the eight-paragraph document and outside prompt context',async()=>{
 const other=build('Normal retirement age is 67.');
 const {result,calls}=await ask(question,[...chunks,...other],fixture.expected.retirementAge,{options:{maxChunks:1}});
 assert.equal(result.status,'conflict');assert.equal(calls,0);assert.equal(result.diagnostics.contextTruncated,true);
 assert.ok(result.diagnostics.conflicts.some(issue=>issue.chunkIds.includes(other[0].id)));
});

test('AUDIT number words and additional values of a different property do not manufacture an age conflict',async()=>{
 for(const text of ['Normal retirement age is sixty-five.','Normal retirement age is sixty five.','Normal retirement age is 65 and disability income is 60 percent.']){
  const {result}=await ask(question,[...build('Normal retirement age is 65.'),...build(text).map(item=>({...item,id:item.id+':second',sourceId:'second'}))],fixture.expected.retirementAge);
  assert.equal(result.status,'answered',text+' '+JSON.stringify(result.diagnostics));
 }
 const {result}=await ask(question,build('Normal retirement age is sixty-five.','Normal retirement age is sixty-seven.'),'Normal retirement age is sixty-five.');assert.equal(result.status,'conflict');
});

test('AUDIT disjoint group/date statements remain documentary evidence without inventing applicability',async()=>{
 const groupCorpus=build('Hourly employees retire at age 65. Salaried employees retire at age 67.');
 const ambiguous=await ask('What retirement age is documented?',groupCorpus,'Hourly employees retire at age 65.');
 assert.equal(ambiguous.result.status,'abstained');assert.equal(ambiguous.result.diagnostics.reason,'unverified-source-applicability');assert.equal(ambiguous.result.diagnostics.conflicts,undefined);assert.equal(ambiguous.calls,0);
 const explicit=await ask('What retirement age is documented for Hourly employees?',groupCorpus,'Hourly employees retire at age 65.');assert.equal(explicit.result.status,'answered');
 const dates=build('Normal retirement age is 65 effective January 1, 2019. Normal retirement age is 67 effective January 1, 2024.');
 const dated=await ask(question,dates,'Normal retirement age is 65 effective January 1, 2019.');assert.equal(dated.result.status,'abstained');assert.equal(dated.result.diagnostics.reason,'unverified-source-applicability');assert.equal(dated.result.diagnostics.conflicts,undefined);assert.equal(dated.calls,0);
});

test('AUDIT an unsupported mortality question is not replaced by an unrelated archive conflict',async()=>{
 const {result,calls}=await ask('Which mortality table is documented?',chunks,fixture.expected.retirementAge);
 assert.equal(result.status,'abstained');assert.equal(result.diagnostics.reason,'question-topic-not-supported');assert.equal(result.diagnostics.conflicts,undefined);assert.equal(calls,0);
});

test('AUDIT factor plurals and ERF questions bind to actual source context and preserve the complete quote',async()=>{
 const factorChunks=chunks.filter(chunk=>chunk.sourceId==='cedar-plan'&&chunk.text.includes(fixture.expected.earlyFactors));assert.ok(factorChunks.length);
 for(const q of ['What is the early retirement factor at age 60?','What are the early retirement factors at age 60?','What is the ERF at age 60?']){
  const {result,calls}=await ask(q,factorChunks,fixture.expected.earlyFactors);assert.equal(result.status,'answered',q+' '+JSON.stringify(result.diagnostics));assert.equal(calls,1);assert.equal(result.citations[0].quotes[0],fixture.expected.earlyFactors);
 }
 const pairs={ERF:'early retirement factor',LRF:'late retirement factor',BFCF:'benefit form conversion factor',AFTAP:'adjusted funding target attainment percentage',NRD:'normal retirement date',ARF:'actuarial reduction factor'};
 for(const [acronym,expansion]of Object.entries(pairs))assert.deepEqual(normalizeQuestionTopics('What is the '+acronym+'?'),normalizeQuestionTopics('What is the '+expansion+'?'));
 assert.ok(normalizeEvidenceTopics('Early retirement factors').includes('factor'));
});

test('AUDIT copied factor schedules compare age-bound value sets rather than every pair of numbers',async()=>{
 const statement='Early retirement factors by age are 0.80 at age 60 and 0.84 at age 61.',corpus=build(statement,statement+' The schedule has two example ages.');
 const provider={id:'MOCK-complete-factor-schedule',generate:async()=>JSON.stringify({status:'answered',claims:[{text:statement,citations:[{label:'C1',quote:statement}]}]})};
 const result=await answerQuestion({question:'What is the early retirement factor at age 60?',chunks:corpus,retrieval:corpus,provider});assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));
 const conflicting=build(statement,'Early retirement factor at age 60 is 0.85.');
 const changed=await ask('What is the early retirement factor at age 60?',conflicting,statement);assert.equal(changed.result.status,'conflict');assert.equal(changed.calls,0);
});

test('AUDIT equivalent factor ratios and retention durations compare in their own units',async()=>{
 for(const [q,left,right]of [
  ['What is the early retirement factor at age 60?','Early retirement factor at age 60 is 0.80.','Early retirement factor at age 60 is 80 percent.'],
  ['How long are case files retained?','Case files are retained for seven years.','Case files are retained for 84 months.']
 ]){
  const {result}=await ask(q,build(left,right),left);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));
 }
});

test('AUDIT ordinary full-benefit framing accepts the exact age sentence while unrelated early-age framing fails',async()=>{
 const plan=chunks.filter(chunk=>chunk.sourceId==='cedar-plan');
 const {result}=await ask('What is the normal retirement age for a participant to receive a full benefit?',plan,fixture.expected.retirementAge);assert.equal(result.status,'answered',JSON.stringify(result.diagnostics));
 const absent=await ask('What is the early retirement age?',build(fixture.expected.retirementAge),fixture.expected.retirementAge);assert.equal(absent.result.status,'abstained');assert.equal(absent.calls,0);
});

test('AUDIT a single invented source is attributed and warned about, never independently certified true',async()=>{
 const corpus=build('Normal retirement age is 99.');const {result}=await ask(question,corpus,'Normal retirement age is 99.');
 assert.equal(result.status,'answered');assert.equal(result.citations[0].quotes[0],'Normal retirement age is 99.');
 assert.deepEqual(result.diagnostics.sourceSupport,{citedDocumentCount:1,singleSource:true,message:'Only one source is cited. Check the source.'});
 assert.equal(result.official,false);assert.equal(result.officialReleaseAllowed,false);
 const duplicate=corpus.map(chunk=>({...chunk,id:chunk.id+':copied',sourceId:'copied-source'}));
 const quoted={id:'MOCK-duplicate-citations-not-corroboration',generate:async()=>JSON.stringify({status:'answered',claims:[{text:'Normal retirement age is 99.',citations:[{label:'C1',quote:'Normal retirement age is 99.'},{label:'C2',quote:'Normal retirement age is 99.'}]}]})};
 const copied=await answerQuestion({question,chunks:[...corpus,...duplicate],retrieval:[...corpus,...duplicate],provider:quoted});assert.equal(copied.status,'answered');assert.equal(copied.citations.length,2);assert.equal(copied.diagnostics.sourceSupport.citedDocumentCount,1);assert.equal(copied.diagnostics.sourceSupport.singleSource,true);
});

test('AUDIT legacy literal table-row quotes retain every complete cell and cannot join different rows',async()=>{
 const csv='Group,Normal retirement age,Status\nHourly,65,Active\nSalaried,67,Retired',item={...source('literal-row',csv),name:'literal-row.csv',records:parseText('literal-row.csv',csv).records},corpus=chunkSources([item]).chunks;
 for(const [quote,expected]of [['Hourly\n65\nActive','answered'],['Hourly\n65','abstained'],['Hourly\n65\nActive\nSalaried\n67\nRetired','abstained']]){
  const provider={id:'MOCK-literal-original-row',generate:async()=>JSON.stringify({status:'answered',claims:[{text:quote,citations:[{label:'C1',quote}]}]})};
  const result=await answerQuestion({question:'What does the Hourly row show?',chunks:corpus,retrieval:corpus,provider});assert.equal(result.status,expected,quote+' '+JSON.stringify(result.diagnostics));
 }
});

test('AUDIT default context fits the bounded model profile and output tokens use the provider cap',async()=>{
 assert.equal(RAG_LIMITS.contextCharacters,2600);assert.equal(RAG_LIMITS.contextChunks,3);assert.equal(RAG_LIMITS.outputTokens,512);
 await assert.rejects(()=>ask(question,build(fixture.expected.retirementAge),fixture.expected.retirementAge,{options:{maxTokens:513}}),/token or timeout budget/);
});
