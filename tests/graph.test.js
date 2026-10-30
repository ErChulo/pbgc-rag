'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildGraph,validateGraph,createGraphAssertion,queryGraph} = require('../assets/graph.js');
const clone = value => JSON.parse(JSON.stringify(value));
const sources = () => [
  {id:'a',name:'synthetic-plan.txt',hash:'a'.repeat(64),records:[{text:'Synthetic normal retirement age is 65.',locator:{type:'text-line',line:1,offset:0,length:38}},{text:'Synthetic provision two.',locator:{type:'text-line',line:2,offset:39,length:24}}]},
  {id:'b',name:'synthetic-amendment.txt',hash:'b'.repeat(64),records:[{text:'Synthetic amendment evidence.',locator:{type:'text-line',line:1,offset:0,length:29}}]}
];
const assertion = (graph,overrides = {}) => createGraphAssertion(graph,{id:'link-one',from:'record:a:0',to:'document:b',evidenceRecordId:'record:b:0',label:'User proposes a documentary connection',author:'Synthetic reviewer',recordedOn:'2026-10-30',validity:{from:'2026-01-01',to:'2026-12-31'},...overrides});
test('documentary graph preserves exact source identity, text and locators without inferred dates',() => {
  const input = sources(), graph = buildGraph(input);
  assert.equal(graph.nodes.length,5); assert.equal(graph.edges.length,3);
  assert.equal(validateGraph(graph,input),true);
  const record = graph.nodes.find(node=>node.id==='record:a:0');
  assert.equal(record.sourceHash,input[0].hash); assert.equal(record.text,input[0].records[0].text);
  assert.deepEqual({...record.locator},input[0].records[0].locator);
  assert.deepEqual(graph.edges[0].validity,{from:null,to:null});
  record.locator.line = 100;
  assert.equal(input[0].records[0].locator.line,1,'graph does not mutate original locator objects');
});
test('documentary edges reject dangling nodes, forged hash/locator, wrong parent and missing containment',() => {
  const graph = buildGraph(sources());
  for (const alter of [
    g=>g.edges[0].to='missing',
    g=>g.edges[0].evidence.sourceHash='c'.repeat(64),
    g=>g.edges[0].evidence.locator.line=22,
    g=>g.edges[0].from='document:b',
    g=>g.nodes[1].sourceHash='c'.repeat(64),
    g=>g.edges.pop(),
    g=>g.edges[0].validity.from='2026-01-01',
    g=>g.edges.push({...g.edges[0]}),
    g=>g.nodes.push({...g.nodes[0]})
  ]) { const changed = clone(graph); alter(changed); assert.throws(()=>validateGraph(changed)); }
});
test('optional verified source binding rejects self-consistent altered text and source hashes',() => {
  const input = sources(), graph = buildGraph(input);
  graph.nodes.find(n=>n.id==='record:a:0').text='Forged excerpt';
  assert.equal(validateGraph(graph),true,'self-consistency alone cannot authenticate evidence');
  assert.throws(()=>validateGraph(graph,input),/verified source/);
  const changed = buildGraph(input);
  for (const node of changed.nodes) if(node.sourceId==='a') node.sourceHash='c'.repeat(64);
  for (const edge of changed.edges) if(edge.evidence.sourceId==='a') edge.evidence.sourceHash='c'.repeat(64);
  assert.equal(validateGraph(changed),true);
  assert.throws(()=>validateGraph(changed,input),/verified source/);
});
test('explicit links remain proposed and retain documentary provenance',() => {
  const graph = buildGraph(sources()), edge = assertion(graph);
  assert.equal(edge.status,'proposed'); assert.equal(edge.type,'user-link');
  assert.equal(edge.evidence.sourceHash,'b'.repeat(64)); assert.equal(edge.evidence.recordId,'record:b:0');
  assert.equal(graph.edges.length,3,'creation does not activate or mutate graph');
  const augmented = {...graph,edges:[...graph.edges,edge]}; assert.equal(validateGraph(augmented,sources()),true);
  const approved = clone(augmented); approved.edges.at(-1).status='approved';
  assert.throws(()=>validateGraph(approved),/assertion/);
});
test('assertions reject invalid dates, reverse validity, missing evidence and duplicate IDs',() => {
  const graph = buildGraph(sources());
  for (const overrides of [
    {recordedOn:'2026-02-30'},
    {validity:{from:'2026-12-31',to:'2026-01-01'}},
    {validity:{from:'2026-01-01'}},
    {validity:{from:'2026-01-01',to:null,extra:'unexpected'}},
    {evidenceRecordId:'document:a'},
    {to:'absent'},
    {author:''}
  ]) assert.throws(()=>assertion(graph,overrides));
  const augmented = {...graph,edges:[...graph.edges,assertion(graph)]};
  assert.throws(()=>assertion(augmented),/Duplicate/);
  assert.doesNotThrow(()=>assertion(graph,{recordedOn:'2024-02-29',validity:{from:null,to:null}}));
});
test('bounded multi-hop traversal is deterministic, cycle-safe and depth-aware',() => {
  const graph = buildGraph(sources());
  graph.edges.push(assertion(graph));
  graph.edges.push(assertion(graph,{id:'cycle',from:'record:b:0',to:'document:a'}));
  const result = queryGraph(graph,{startId:'document:a',maxDepth:4});
  assert.deepEqual(result.nodes.map(n=>[n.id,n.depth]),[['document:a',0],['record:a:0',1],['record:a:1',1],['document:b',2],['record:b:0',3]]);
  assert.equal(result.truncated,false); assert.equal(result.edges.length,5);
  assert.deepEqual(queryGraph(graph,{startId:'document:a',maxDepth:4}),result);
  const bounded = queryGraph(graph,{startId:'document:a',maxDepth:1});
  assert.equal(bounded.nodes.length,3); assert.equal(bounded.truncated,true);
  const limited = queryGraph(graph,{startId:'document:a',maxDepth:4,maxNodes:2});
  assert.equal(limited.nodes.length,2); assert.equal(limited.truncated,true);
});
test('temporal and edge-type filters apply only to explicit links, with inclusive endpoints',() => {
  const graph = buildGraph(sources()); graph.edges.push(assertion(graph));
  const run = options=>queryGraph(graph,{startId:'document:a',maxDepth:4,...options}).nodes.map(n=>n.id);
  assert.equal(run({asOf:'2025-12-31'}).includes('document:b'),false);
  assert.equal(run({asOf:'2026-01-01'}).includes('document:b'),true);
  assert.equal(run({asOf:'2026-12-31'}).includes('document:b'),true);
  assert.equal(run({asOf:'2027-01-01'}).includes('document:b'),false);
  assert.equal(run({types:['contains']}).length,3);
  assert.deepEqual(queryGraph(graph,{startId:'record:a:0',maxDepth:1,direction:'both',types:['contains']}).nodes.map(n=>n.id),['record:a:0','document:a']);
});
test('query options and graph inputs fail closed at explicit limits',() => {
  const graph = buildGraph(sources());
  for (const options of [{startId:'missing'},{startId:'document:a',maxDepth:9},{startId:'document:a',maxDepth:-1},{startId:'document:a',maxNodes:1001},{startId:'document:a',maxNodes:0},{startId:'document:a',asOf:'2026-02-30'},{startId:'document:a',types:['inferred-law']},{startId:'document:a',types:[]},{startId:'document:a',direction:'arbitrary'}]) assert.throws(()=>queryGraph(graph,options));
  assert.throws(()=>buildGraph(Array(201).fill(sources()[0])),/200-source/);
  assert.throws(()=>buildGraph([{...sources()[0],records:Array(11).fill({text:'x'.repeat(2000000),locator:{type:'text-line',line:1}})}]),/text budget/);
  assert.throws(()=>buildGraph([sources()[0],sources()[0]]),/Duplicate/);
  assert.throws(()=>buildGraph([{...sources()[0],hash:'invalid'}]),/hash/);
  assert.throws(()=>buildGraph([{...sources()[0],records:[{text:'x',locator:{line:1}}]}]),/locator/);
  assert.throws(()=>buildGraph([{...sources()[0],records:[{text:'x',locator:{type:'line',value:Infinity}}]}]),/JSON/);
});
