'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildCaseTermIndex,queryCaseTermIndex,validateCaseTermIndex,inspectCaseTermIndex,CASE_TERM_INDEX_LIMITS}=require('../assets/case-term-index.js');
const entry=(id,terms,extra={})=>({chunk:{id,text:'This source passage must not enter the term index.',locators:[{type:'text-line',line:1}],sourceHash:'a'.repeat(64),...extra},terms});
const clone=value=>JSON.parse(JSON.stringify(value));
test('exact JSON byte accounting agrees with platform UTF-8 for escaped and multibyte metadata',()=>{
 const fragments=['plain','é','世界','😀','"','\\','\u2028','\u2029'];
 for(let round=0;round<40;round++){
  const entries=Array.from({length:round+1},(_,i)=>entry('id:'+i+fragments.slice(i%fragments.length).join(''),[...new Set([fragments[i%fragments.length],fragments[(i+round)%fragments.length],'word'+i])].filter(term=>!(/\s/u.test(term)))));
  const index=buildCaseTermIndex(entries),stats=inspectCaseTermIndex(index);
  assert.equal(stats.bytes,Buffer.byteLength(JSON.stringify(index),'utf8'));assert.ok(stats.nodes>=index.count);
 }
});
function brute(entries,input){const queryTerms=[...new Set(input)],counts=entries.map(item=>queryTerms.filter(term=>item.terms.includes(term)).length),results=[];let strongCount=0;for(let ordinal=0;ordinal<counts.length;ordinal++){const matches=counts[ordinal];if(!matches)continue;const strong=matches===queryTerms.length;if(strong)strongCount++;results.push({ordinal,chunkId:entries[ordinal].chunk.id,matches,score:matches/queryTerms.length,strong});}results.sort((a,b)=>b.matches-a.matches||a.ordinal-b.ordinal);return{queryTerms,counts,strongCount,matchedCount:results.length,results};}
function malformed(index,change,pattern){const value=clone(index);change(value);assert.throws(()=>validateCaseTermIndex(value),pattern||/Case term index/);}

test('exact postings preserve numbers, negation, qualifiers, case and special property names without retaining evidence',()=>{
  const entries=[entry('base',['normal','retirement','age','65','2019']),entry('amended',['normal','retirement','age','67','2024']),entry('negated',['normal','retirement','age','not','65']),entry('form',['benefit','form','factor','0.80']),entry('names',['__proto__','constructor','prototype','Age'])],index=buildCaseTermIndex(entries);
  for(const query of [['normal','retirement','age'],['age','65'],['age','not','65'],['age','67','2024'],['factor','0.80'],['factor','0.8'],['__proto__'],['constructor','prototype'],['Age'],['age'],[],['unknown'],['age','age','65']])assert.deepEqual(queryCaseTermIndex(index,query),brute(entries,query));
  const json=JSON.stringify(index);assert.doesNotMatch(json,/This source passage|locators|sourceHash|text-line/);assert.deepEqual(Object.keys(index).sort(),['schemaVersion','kind','profile','count','chunkIds','postings'].sort());assert.equal({}.polluted,undefined);
});

test('adaptive sparse and dense postings match an independently scanned corpus',()=>{
  const entries=Array.from({length:4000},(_,ordinal)=>entry('chunk-'+ordinal,['common',...(ordinal%2?['alternating']:[]),...(ordinal===7?['unique']:[]),...(ordinal%43===0?['occasional']:[])])),index=buildCaseTermIndex(entries);
  assert.equal(index.postings.find(item=>item.term==='common').encoding,'bits');assert.equal(index.postings.find(item=>item.term==='unique').encoding,'sparse');
  for(const query of [['common'],['common','alternating'],['unique','common'],['occasional','alternating'],['unknown','common'],['unknown']])assert.deepEqual(queryCaseTermIndex(index,query),brute(entries,query));
  for(const posting of index.postings){const ordinals=entries.flatMap((item,i)=>item.terms.includes(posting.term)?[i]:[]),sparse=JSON.stringify({term:posting.term,encoding:'sparse',ordinals}),chosen=JSON.stringify(posting);if(posting.encoding==='bits')assert.ok(chosen.length<sparse.length);}
});

test('deterministic randomized queries have no missing candidates or inflated match counts',()=>{
  let state=0x21cafe;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;},vocabulary=Array.from({length:73},(_,i)=>'term'+i),entries=Array.from({length:181},(_,i)=>entry('random-'+i,vocabulary.filter(()=>random()<.24))),index=buildCaseTermIndex(entries);
  assert.deepEqual(buildCaseTermIndex(clone(entries)),index);
  for(let attempt=0;attempt<120;attempt++){const query=Array.from({length:1+Math.floor(random()*7)},()=>vocabulary[Math.floor(random()*vocabulary.length)]);if(attempt%5===0)query.push('absent');assert.deepEqual(queryCaseTermIndex(index,query),brute(entries,query));}
});

test('empty shards and empty vocabulary remain empty; input mutation cannot change a built index',()=>{
  const empty=buildCaseTermIndex([]);assert.deepEqual(queryCaseTermIndex(empty,['unknown']).results,[]);assert.deepEqual(queryCaseTermIndex(empty,[]).counts,[]);
  const entries=[entry('empty',[]),entry('fact',['age'])],index=buildCaseTermIndex(entries);entries[1].terms[0]='false';entries[1].chunk.id='changed';assert.deepEqual(queryCaseTermIndex(index,['age']).results.map(item=>item.chunkId),['fact']);assert.equal(queryCaseTermIndex(index,[]).strongCount,0);
  assert.equal(Object.isFrozen(index),true);assert.equal(Object.isFrozen(index.chunkIds),true);assert.equal(Object.isFrozen(index.postings[0]),true);
});

test('invalid schemas, extra fields, duplicate chunk identities, terms and out-of-range sparse ordinals fail',()=>{
  const index=buildCaseTermIndex(Array.from({length:40},(_,i)=>entry('c'+i,i===1?['age']:[])));
  malformed(index,value=>value.count++);malformed(index,value=>value.schemaVersion=2);malformed(index,value=>value.kind='other');malformed(index,value=>value.profile='other');malformed(index,value=>value.records=[]);malformed(index,value=>value.chunkIds[1]=value.chunkIds[0]);
  for(const ordinals of [[-1],[40],[0,0],[2,1],[NaN],[1.5],[],new Array(1)]){const value=clone(index);value.postings=[{term:'age',encoding:'sparse',ordinals}];assert.throws(()=>validateCaseTermIndex(value),/Case term index/);}
  malformed(index,value=>value.postings.push(value.postings[0]));malformed(index,value=>value.postings[0].extra='hidden');malformed(index,value=>value.postings[0].encoding='compressed');malformed(index,value=>value.postings[0].term='two words');
  const both=buildCaseTermIndex([entry('a',['a','z'])]);malformed(both,value=>value.postings.reverse());
});

test('dense postings reject incorrect byte lengths, high padding bits, noncanonical base64 and empty membership',()=>{
  const index=buildCaseTermIndex([entry('a',['age']),entry('b',[]),entry('c',['age'])]);assert.equal(index.postings[0].encoding,'bits');
  for(const bits of ['!Q==','BQ','BQA=','BR==','hQ==','AA==','BQ=\n','BQ===','BA==trailing'])malformed(index,value=>value.postings[0].bits=bits,/dense posting/);
  const larger=buildCaseTermIndex(Array.from({length:9},(_,i)=>entry('x'+i,['all'])));assert.equal(larger.postings[0].encoding,'bits');malformed(larger,value=>value.postings[0].bits='/wM=',/outside the shard/);
  const zero=clone(buildCaseTermIndex([]));zero.postings=[{term:'age',encoding:'bits',bits:'AQ=='}];assert.throws(()=>validateCaseTermIndex(zero),/entry count/);
});

test('entry, term, occurrence-shape and query limits reject unbounded or noncanonical inputs',()=>{
  assert.throws(()=>buildCaseTermIndex(new Array(CASE_TERM_INDEX_LIMITS.entries+1)),/4,000/);assert.throws(()=>buildCaseTermIndex([entry('same',[]),entry('same',[])]),/duplicate chunk/);
  for(const terms of [['age','age'],[''],[' '],['age\n'],['x'.repeat(1001)],[1],[null],['\ud800']])assert.throws(()=>buildCaseTermIndex([entry('fact',terms)]),/Case term index/);
  assert.throws(()=>buildCaseTermIndex([entry('fact',new Array(4001).fill('age'))]),/bounded normalized/);assert.throws(()=>buildCaseTermIndex([entry('x'.repeat(301),['age'])]),/chunk ID/);
  const index=buildCaseTermIndex([entry('a',['age'])]);for(const query of [null,'age',new Array(1001).fill('age'),[''],['two words'],new Array(1),[,'age']])assert.throws(()=>queryCaseTermIndex(index,query),/Case term index/);
  const inherited=Array(1);Object.setPrototypeOf(inherited,Object.assign(Object.create(Array.prototype),{0:'age'}));assert.throws(()=>queryCaseTermIndex(index,inherited),/sparse entries/);
});

test('serialized node and byte budgets apply even to otherwise valid posting metadata',()=>{
  const index={schemaVersion:1,kind:'case-term-postings',profile:'exact-terms-v1',count:1000,chunkIds:Array.from({length:1000},(_,i)=>'c'+i),postings:Array.from({length:510},(_,i)=>({term:'term'+String(i).padStart(4,'0'),encoding:'sparse',ordinals:Array.from({length:1000},(_,j)=>j)}))};assert.throws(()=>validateCaseTermIndex(index),/node/);
  const entries=Array.from({length:6},(_,i)=>entry('large'+i,Array.from({length:4000},(_,j)=>'t'+String(i*4000+j).padStart(5,'0')+'x'.repeat(994))));assert.throws(()=>buildCaseTermIndex(entries),/bounded budget|20 MiB/);
});

test('a real 512 KiB paragraph shard has a compact exact candidate index',async t=>{
  const {chunkSources}=require('../assets/chunking.js'),{normalizeEvidenceTopics}=require('../assets/rag.js');
  const records=[];let offset=0,line=1;
  while(offset<512*1024){const id=String(line).padStart(6,'0'),text=`Synthetic plan ${id}. The normal retirement age for participant ${id} is 65. The early retirement factor at age 60 is 0.80. This statement applies to the salaried group hired before January 1, 2019. Payments begin only after a signed application is received. The disability provision does not change the normal retirement age. The administrative address is retained for correspondence and is not a payment instruction. This paragraph is synthetic evaluation evidence and contains no personal data.`;records.push({text,locator:{type:'text-line',line,offset,length:text.length,offsetUnit:'UTF-16 code units'}});offset+=text.length+1;line++;}
  const source={id:'synthetic-source',name:'synthetic-plan.txt',hash:'a'.repeat(64),parserVersion:'synthetic-v1',records},chunks=chunkSources([source]).chunks,entries=chunks.map(chunk=>({chunk,terms:normalizeEvidenceTopics(chunk.text)})),before=performance.now(),index=buildCaseTermIndex(entries),buildMs=performance.now()-before,queryStart=performance.now();
  for(const query of [['normal','retirement','age','65'],['early','retirement','factor','60'],['does','not','change'],['000001'],[String(records.length).padStart(6,'0')],['unknown']])assert.deepEqual(queryCaseTermIndex(index,query),brute(entries,query));
  const queryMs=performance.now()-queryStart,indexBytes=Buffer.byteLength(JSON.stringify(index)),fullEntryBytes=Buffer.byteLength(JSON.stringify(entries));assert.ok(indexBytes<fullEntryBytes*.25,'Candidate metadata should be materially smaller than full evidence');
  t.diagnostic(JSON.stringify({rawCharacters:offset,chunks:chunks.length,terms:index.postings.length,indexBytes,fullEntryBytes,ratio:indexBytes/fullEntryBytes,buildMs,queries:6,queryMs}));
});
