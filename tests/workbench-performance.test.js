'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const graph=require('../assets/graph.js'),reports=require('../assets/reports.js');
const HASH='a'.repeat(64);
function source(count=3){return{id:'synthetic',name:'synthetic-plan.txt',hash:HASH,parserVersion:'synthetic-1',records:Array.from({length:count},(_,i)=>({text:'Synthetic plan paragraph '+(i+1)+'.',locator:{type:'text-line',line:i+1}}))};}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if('value'in d)freeze(d.value);Object.freeze(value);}return value;}
function layout(count=3){return{schemaVersion:1,title:'Synthetic report',sections:['inventory','evidence','timeline'],maxEvidence:10,timeline:Array.from({length:count},(_,i)=>({date:'2026-01-01',label:'Synthetic event '+i,sourceHash:HASH,locator:{type:'text-line',line:50000-i}}))};}
function assertion(){return{id:'assertion:synthetic-link',type:'user-link',from:'document:synthetic',to:'record:synthetic:0',label:'Proposed documentary connection',author:'Synthetic reviewer',recordedOn:'2026-01-01',status:'proposed',validity:{from:null,to:null},evidence:{recordId:'record:synthetic:0',sourceId:'synthetic',sourceHash:HASH,locator:{type:'text-line',line:1}}};}

test('source-record handles reject forgery and refresh mutable content, locators and source membership',()=>{
 const sources=[source()],index=graph.buildSourceRecordIndex(sources);
 assert.equal(Object.isFrozen(index),true);assert.equal(graph.findSourceRecord(index,HASH,{line:1,type:'text-line'}).recordIndex,0);
 sources[0].records[0].text='Changed documentary text.';sources[0].records[0].locator.line=9;
 assert.equal(graph.findSourceRecord(index,HASH,{type:'text-line',line:1}),null);
 assert.equal(graph.findSourceRecord(index,HASH,{type:'text-line',line:9}).text,'Changed documentary text.');
 sources[0].hash='b'.repeat(64);assert.equal(graph.findSourceRecord(index,HASH,{type:'text-line',line:9}),null);
 assert.equal(graph.findSourceRecord(index,'b'.repeat(64),{type:'text-line',line:9}).recordIndex,0);
 sources.splice(0,1);assert.equal(graph.findSourceRecord(index,'b'.repeat(64),{type:'text-line',line:9}),null);
 assert.throws(()=>graph.findSourceRecord({schemaVersion:1,kind:'source-record-index'},HASH,{type:'text-line',line:1}),/issued/);
});

test('frozen accessors do not qualify as immutable source content',()=>{
 let text='First text.';
 const record=Object.freeze({get text(){return text;},locator:Object.freeze({type:'text-line',line:1})});
 const sources=[Object.freeze({id:'synthetic',name:'synthetic.txt',hash:HASH,records:Object.freeze([record])})],index=graph.buildSourceRecordIndex(sources);
 assert.equal(graph.sourceRecordIndexInfo(index).immutable,false);
 text='Changed through the frozen accessor.';
 assert.equal(graph.findSourceRecord(index,HASH,{type:'text-line',line:1}).text,text);
});

test('50,000 immutable records and 200 timeline references use one source index, then no record rescans',t=>{
 let recordReads=0;
 const input=source(50000);
 input.records=input.records.map(record=>new Proxy(freeze(record),{get(target,key,receiver){if(key==='text'||key==='locator')recordReads++;return Reflect.get(target,key,receiver);}}));
 freeze(input);const sources=[input],started=performance.now(),index=graph.buildSourceRecordIndex(sources),buildMs=performance.now()-started;
 assert.equal(graph.sourceRecordIndexInfo(index).recordCount,50000);
 assert.ok(recordReads>=50000);recordReads=0;
 const config=layout(200),matches=graph.findSourceRecords(index,config.timeline);
 assert.equal(matches.length,200);assert.equal(matches[0].recordIndex,49999);assert.equal(matches[199].recordIndex,49800);
 assert.equal(recordReads,0,'Repeated immutable-source lookups do not read/canonicalize 50,000 source records per event.');
 const lookupStarted=performance.now();reports.validateReportBindings({schemaVersion:1,name:'Synthetic large case',sources},config);
 assert.equal(recordReads,0,'The report binding check reuses the immutable per-source index.');
 const lookupMs=performance.now()-lookupStarted;
 sources[0]=freeze({...source(),hash:'b'.repeat(64)});
 assert.equal(graph.findSourceRecord(index,HASH,{type:'text-line',line:50000}),null,'Replacing a frozen source invalidates the source-set handle.');
 t.diagnostic(JSON.stringify({records:50000,timelineReferences:200,sourceIndexBuildMs:Math.round(buildMs),boundTimelineLookupMs:Math.round(lookupMs),sourceRecordReadsDuringCachedLookups:0}));
});

test('workbench saves check bindings without rendering reports or materializing containment graphs',()=>{
 const counts={reports:0,graphs:0},workspace={schemaVersion:2,id:'synthetic-case',name:'Synthetic case',sources:[source()]};
 const sandbox={module:{exports:{}},TextEncoder,JSON,require(name){
  if(name==='./reports.js')return{...reports,buildReport(){counts.reports++;throw Error('Full report rendering is deferred.');}};
  if(name==='./graph.js')return{...graph,buildGraph(){counts.graphs++;throw Error('Containment graph materialization is deferred.');}};
  return require(path.resolve(__dirname,'../assets',name));
 }};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../assets/workbench.js'),'utf8'),sandbox);
 const api=sandbox.module.exports,state=api.emptyWorkbench();
 state.reportLayout={...layout(0),timeline:[{date:'2026-01-01',label:'Exact source event',sourceHash:HASH,locator:{type:'text-line',line:3}}]};state.graphAssertions=[assertion()];
 const checked=api.validateWorkbench(state,workspace);assert.equal(checked.graphAssertions.length,1);assert.equal(checked.reportLayout.timeline.length,1);assert.deepEqual(counts,{reports:0,graphs:0});
 const badEvent=JSON.parse(JSON.stringify(state));badEvent.reportLayout.timeline[0].locator.line=99;assert.throws(()=>api.validateWorkbench(badEvent,workspace),/does not resolve/);
 const badLink=JSON.parse(JSON.stringify(state));badLink.graphAssertions[0].evidence.locator.line=99;assert.throws(()=>api.validateWorkbench(badLink,workspace),/does not match/);
 const approved=JSON.parse(JSON.stringify(state));approved.graphAssertions[0].status='approved';assert.throws(()=>api.validateWorkbench(approved,workspace),/assertion/);
});

test('direct proposed-link validation preserves endpoint, evidence, date and duplicate guards',()=>{
 const sources=[source()],valid=assertion();assert.equal(graph.validateGraphAssertions([valid],sources),true);
 for(const alter of [edge=>edge.from='document:missing',edge=>edge.to='record:synthetic:99',edge=>edge.evidence.recordId='document:synthetic',edge=>edge.evidence.sourceHash='b'.repeat(64),edge=>edge.evidence.locator.line=2,edge=>edge.recordedOn='2026-02-30',edge=>edge.validity={from:'2026-12-31',to:'2026-01-01'},edge=>edge.status='reviewed']){
  const changed=JSON.parse(JSON.stringify(valid));alter(changed);assert.throws(()=>graph.validateGraphAssertions([changed],sources));
 }
 assert.throws(()=>graph.validateGraphAssertions([valid,valid],sources),/Duplicate/);
});

test('prepared graphs are immutable snapshots and still reject mismatched current originals',()=>{
 const sources=[source()],prepared=graph.prepareGraph(graph.buildGraph(sources),sources);
 assert.equal(Object.isFrozen(prepared),true);assert.equal(Object.isFrozen(prepared.nodes[1].locator),true);
 assert.equal(graph.queryGraph(prepared,{startId:'document:synthetic',maxDepth:1,maxNodes:3}).nodes.length,3);
 assert.throws(()=>{prepared.nodes[1].text='Forged';},TypeError);
 sources[0].records[0].text='Changed original.';assert.throws(()=>graph.validateGraph(prepared,sources),/verified source/);
 const ordinary=graph.buildGraph([source()]);ordinary.edges[0].to='missing';assert.throws(()=>graph.queryGraph(ordinary,{startId:'document:synthetic'}),/dangling/);
 const accessor={get schemaVersion(){return 1;},nodes:[],edges:[]};assert.throws(()=>graph.prepareGraph(accessor),/immutable data/);
});

test('case-review table views reuse only frozen source identity and exact header bindings',()=>{
 const nodes=new Map();
 class Node{
  constructor(id=''){this.id=id;this.value='';this.children=[];this.listeners={};this.classList={contains:()=>false};}
  replaceChildren(...children){this.children=children;if(this.id.endsWith('-select')||['annotation-source','dictionary-source'].includes(this.id))this.value=children[0]?.value||'';}
  append(...children){this.children.push(...children);if(!this.value&&children[0]?.value)this.value=children[0].value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
 }
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);},createElement:()=>new Node(),querySelectorAll:()=>[]};
 let workspace={id:'synthetic-case',name:'Synthetic case',sources:[freeze(source())],workbench:{annotations:[],dictionary:null,tableHeaders:[]}},tableBuilds=0;
 const API={...graph,emptyWorkbench:()=>({annotations:[],dictionary:null,tableHeaders:[]}),formatLocation:()=>'',buildTables(){tableBuilds++;return[];}};
 const sandbox={PBGCRag:API,document,Option:class{constructor(label,value){this.text=label;this.value=value;}},URL,Blob,setTimeout};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../assets/case-review-ui.js'),'utf8'),sandbox);
 const ui=sandbox.PBGCRag.mountCaseReview({getWorkspace:()=>workspace});
 ui.refresh();ui.refresh();assert.equal(tableBuilds,1,'Unchanged immutable source views are reused.');
 workspace={...workspace,workbench:{...workspace.workbench,tableHeaders:[{sourceId:'synthetic',tableName:'synthetic-plan.txt',headerRow:1}]}};ui.refresh();assert.equal(tableBuilds,2,'A new header binding rebuilds the source table view.');
 workspace={...workspace,sources:[freeze({...source(),records:[{text:'Different native text.',locator:{type:'text-line',line:1}}]})]};ui.refresh();assert.equal(tableBuilds,3,'New source objects with identical hash labels do not reuse old views.');
 workspace={...workspace,sources:[source()]};ui.refresh();workspace.sources[0].records[0].text='Mutable source changed.';ui.refresh();assert.equal(tableBuilds,5,'Mutable sources are rebuilt rather than trusted from a hash-only cache.');
});
