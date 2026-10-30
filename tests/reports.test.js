'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateReportLayout,buildReport,reportToCSV,renderReportHTML}=require('../assets/reports.js');
const hash='b'.repeat(64);
function workspace(text='Synthetic evidence') { return {schemaVersion:1,name:'Synthetic case Ω',sources:[{name:'source.txt',hash,parserVersion:'1',records:[{text,locator:{type:'text-line',line:1}}]}]}; }
function layout(sections=['inventory','evidence','timeline']) { return {schemaVersion:1,title:'Synthetic review report',sections,maxEvidence:100,timeline:[{date:'2026-01-02',label:'Explicit synthetic event',sourceHash:hash,locator:{line:1,type:'text-line'}}]}; }
test('reusable versioned report layout selects tables and preserves provenance',()=>{
 const ws=workspace('Evidence with unicode 😀 and Ω');const config=layout();const original=JSON.stringify({ws,config});
 const report=buildReport(ws,config);
 assert.equal(report.official,false);assert.equal(report.officialReleaseAllowed,false);
 assert.equal(report.evidence[0].excerpt,'Evidence with unicode 😀 and Ω');
 assert.equal(report.evidence[0].sourceHash,hash);assert.deepEqual(report.evidence[0].locator,{type:'text-line',line:1});
 assert.equal(report.timeline[0].verification,'unverified user-supplied date');
 assert.match(report.timeline[0].meaning,/No legal effective date/);
 assert.equal(JSON.stringify({ws,config}),original);
 report.layout.timeline[0].locator.line=99;
 assert.equal(config.timeline[0].locator.line,1);
 assert.deepEqual(buildReport(ws,layout(['inventory'])).evidence,[]);
 assert.deepEqual(buildReport(ws,layout(['inventory'])).timeline,[]);
});
test('timeline dates are explicit and must resolve to actual source records',()=>{
 const config=layout();config.timeline.push({date:'2025-12-31',label:'Earlier date',sourceHash:hash,locator:{type:'text-line',line:1}});
 assert.deepEqual(buildReport(workspace(),config).timeline.map(row=>row.date),['2025-12-31','2026-01-02']);
 const missingHash=layout();missingHash.timeline[0].sourceHash='c'.repeat(64);
 assert.throws(()=>buildReport(workspace(),missingHash),/does not resolve/);
 const missingLocator=layout();missingLocator.timeline[0].locator.line=2;
 assert.throws(()=>buildReport(workspace(),missingLocator),/does not resolve/);
 const noDates=layout();noDates.timeline=[];
 assert.equal(buildReport(workspace('Document says January 1, 2026.'),noDates).timeline.length,0,'dates must never be extracted as asserted effective dates');
});
test('invalid layouts, impossible dates, unbounded fields and executable templates fail',()=>{
 for(const changes of [{schemaVersion:2},{title:''},{title:'x'.repeat(161)},{sections:['inventory','inventory']},{sections:['script']},{maxEvidence:0},{maxEvidence:201},{template:'<script>'},{timeline:[{date:'2026-02-30',label:'bad',sourceHash:hash,locator:{line:1}}]},{timeline:Array(201).fill({})}]) {
  const config={...layout(),...changes};assert.equal(validateReportLayout(config).valid,false);assert.throws(()=>buildReport(workspace(),config));
 }
 const cycle=layout();cycle.timeline[0].locator.self=cycle.timeline[0].locator;
 assert.equal(validateReportLayout(cycle).valid,false);
});
test('CSV quotes delimiters, Unicode and embedded quotes without losing source references',()=>{
 const report=buildReport(workspace('He said "Ω,😀"\nnext line'),layout());
 const csv=reportToCSV(report,'evidence');
 assert.match(csv,/"S1:R1","S1","bbbb/);
 assert.ok(csv.includes('"He said ""Ω,😀""\nnext line"'));
 assert.ok(csv.endsWith('\r\n'));
 assert.throws(()=>reportToCSV(buildReport(workspace(),layout(['inventory'])),'evidence'),/included/);
 assert.throws(()=>reportToCSV(report,'not-a-table'),/included/);
});
test('CSV neutralizes formula injection after whitespace and dangerous control prefixes',()=>{
 for(const payload of ['=HYPERLINK("https://example.invalid")','+1+1','-1+1','@SUM(1,2)','   =1+1','\uFEFF=1+1','\ttext','\rtext','\ntext']) {
  const report=buildReport(workspace(payload),layout());const csv=reportToCSV(report,'evidence');
  assert.ok(csv.includes('"\''+payload.replace(/"/g,'""')+'"'),JSON.stringify(payload));
 }
 const ws=workspace();ws.sources[0].name='=cmd';
 assert.ok(reportToCSV(buildReport(ws,layout()),'inventory').includes('"\'=cmd"'));
});
test('standalone HTML escapes malicious content and denies scripts and remote assets',()=>{
 const payload='</td><script>alert("x")</script><img src="https://example.invalid/track" onerror="alert(1)">& Ω 😀';
 const ws=workspace(payload);ws.name=payload.slice(0,100);ws.sources[0].name=payload;
 const config=layout();config.title='<script>title</script>';config.timeline[0].label=payload;
 const report=buildReport(ws,config);const html=renderReportHTML(report);
 assert.match(html,/default-src 'none'/);assert.match(html,/script-src 'none'/);assert.match(html,/connect-src 'none'/);
 assert.doesNotMatch(html,/<script\b/i);assert.doesNotMatch(html,/<img\b/i);assert.doesNotMatch(html,/<style\b/i);
 assert.ok(html.includes('&lt;script&gt;title&lt;/script&gt;'));
 assert.ok(html.includes('&lt;img src=&quot;https://example.invalid/track&quot;'));
 assert.ok(html.includes('Ω 😀'));
 assert.match(html,/<th scope="col">/);assert.match(html,/<caption>/);
 assert.equal(renderReportHTML(report),html,'rendering should be deterministic');
 assert.throws(()=>renderReportHTML({...report,official:true}),/Invalid nonofficial/);
});
test('report coverage discloses truncated excerpts and selected evidence limit',()=>{
 const ws=workspace('x'.repeat(2001));ws.sources[0].records.push({text:'Second record',locator:{type:'text-line',line:2}});
 const config=layout();config.maxEvidence=1;
 const report=buildReport(ws,config);
 assert.equal(report.coverage.totalRecords,2);assert.equal(report.coverage.shownEvidence,1);
 assert.equal(report.evidence[0].excerptTruncated,true);assert.equal(report.evidence[0].excerpt.length,2000);
 assert.match(renderReportHTML(report),/1 records shown out of 2 parsed records/);
});
