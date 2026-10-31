'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../assets/evidence.js');
const {createEvidenceAnnotation:create,updateEvidenceAnnotation:update,validateEvidenceAnnotation:validate,reviewEvidenceAnnotation:review,reconcileEvidence:reconcile,evidenceContentKey:key}=api;
const sources=()=>[{id:'synthetic',name:'synthetic.txt',hash:'a'.repeat(64),records:[{text:'Synthetic normal retirement age 65; not an official provision.',locator:{type:'text-line',line:1,offset:0,length:59}},{text:'Synthetic amendment example.',locator:{type:'text-line',line:2,offset:60,length:28}}]}];
function input(overrides={}){return{id:'synthetic-one',kind:'provision',subject:'synthetic-plan',predicate:'internal.NRD',value:'65',sources:[{sourceHash:'a'.repeat(64),locator:{type:'text-line',line:1,offset:0,length:59}}],authority:{label:'Synthetic plan text',reference:null},applicability:'all-dates',validity:{from:null,to:null},group:'*',...overrides};}
function reviewed(annotation,s=sources()){return review(annotation,{reviewer:'Synthetic reviewer',at:'2026-10-30',version:annotation.version,contentKey:key(annotation)},s);}
const clone=value=>JSON.parse(JSON.stringify(value));
test('creation binds exact verified hash and locator, remains proposed, and copies caller data',()=>{
  const source=sources(),data=input(),annotation=create(data,source);assert.equal(annotation.schemaVersion,1);assert.equal(annotation.version,1);assert.equal(annotation.status,'proposed');assert.equal(annotation.review,null);assert.equal(validate(annotation,source).valid,true);
  data.sources[0].locator.line=99;assert.equal(annotation.sources[0].locator.line,1);assert.equal(source[0].records[0].locator.line,1);
  assert.throws(()=>create(input({sources:[{sourceHash:'b'.repeat(64),locator:input().sources[0].locator}]}),source),/resolve/);
  assert.throws(()=>create(input({sources:[{sourceHash:'a'.repeat(64),locator:{type:'text-line',line:99}}]}),source),/resolve/);
  assert.throws(()=>create(input(),[]),/resolve/);
});
test('review requires exact content, version, reviewer and calendar date and records no official approval',()=>{
  const annotation=create(input(),sources());
  for(const patch of [{version:2},{contentKey:'forged'},{reviewer:''},{at:'2026-02-30'}])assert.throws(()=>review(annotation,{reviewer:'Reviewer',at:'2026-10-30',version:1,contentKey:key(annotation),...patch},sources()));
  const result=reviewed(annotation);assert.equal(result.status,'reviewed');assert.equal(validate(result,sources(),{requireReviewed:true}).valid,true);assert.equal(annotation.status,'proposed');assert.equal(result.officialApproved,undefined);
  assert.equal(validate(annotation,sources(),{requireReviewed:true}).valid,false);
  const changed=clone(result);changed.value='66';assert.equal(validate(changed,sources()).valid,false);
});
test('content edits immutably increment version, reset review and invalidate stale review claims',()=>{
  const before=reviewed(create(input(),sources())),after=update(before,{value:'66'},sources());assert.equal(after.version,2);assert.equal(after.status,'proposed');assert.equal(after.review,null);assert.equal(before.value,'65');assert.equal(before.status,'reviewed');
  assert.throws(()=>review(after,before.review,sources()),/content and version/);
  assert.throws(()=>update(before,{status:'reviewed'},sources()),/fields/);assert.throws(()=>update(before,{},sources()),/content edit/);
});
test('canonical locator key ordering does not break source binding or review content',()=>{
  const annotation=create(input(),sources()),reordered=clone(annotation);reordered.sources[0].locator={length:59,offset:0,line:1,type:'text-line'};assert.equal(validate(reordered,sources()).valid,true);assert.equal(key(annotation),key(reordered));
  assert.equal(validate(reviewed(reordered),sources()).valid,true);
});
test('unknown facts, scope, authority and unreviewed claims always abstain',()=>{
  for(const overrides of [{value:null},{group:null},{applicability:'unknown'},{authority:{label:'unknown',reference:null}}]){const annotation=reviewed(create(input(overrides),sources()));assert.equal(reconcile([annotation],sources(),{}).status,'abstain');}
  assert.equal(reconcile([create(input(),sources())],sources()).status,'abstain');
  assert.equal(reconcile([],sources()).status,'abstain');
  const annotation=reviewed(create(input({applicability:'period',validity:{from:'2020-01-01',to:null},group:'synthetic cohort'}),sources()));
  assert.equal(reconcile([annotation],sources()).status,'abstain');
  assert.equal(reconcile([annotation],sources(),{asOf:'2026-10-30',group:'synthetic cohort'}).status,'reviewed-consistent');
});
test('possible contradictions retain all authorities and never prefer the latest or stronger-sounding label',()=>{
  const first=reviewed(create(input({id:'a',applicability:'period',validity:{from:'2020-01-01',to:'2030-12-31'}}),sources()));
  const second=reviewed(create(input({id:'b',value:'66',authority:{label:'Later synthetic amendment; unadjudicated',reference:null},applicability:'period',validity:{from:'2025-01-01',to:null}}),sources()));
  const result=reconcile([second,first],sources(),{subject:'synthetic-plan',predicate:'internal.NRD',asOf:'2026-10-30',group:'synthetic cohort'});
  assert.equal(result.status,'abstain');assert.equal(result.value,null);assert.deepEqual(result.annotationIds,['a','b']);assert.equal(result.possibleConflicts.length,1);assert.deepEqual(result.possibleConflicts[0].annotationIds,['a','b']);assert.match(result.reason,/disagree/);
  assert.deepEqual(reconcile([first,second],sources(),{subject:'synthetic-plan',predicate:'internal.NRD',asOf:'2026-10-30',group:'synthetic cohort'}),result);
});
test('nonoverlapping periods/groups do not create conflict flags; inclusive dates and explicit scope filter correctly',()=>{
  const a=reviewed(create(input({id:'a',group:'cohort-a',applicability:'period',validity:{from:'2020-01-01',to:'2020-12-31'}}),sources()));
  const b=reviewed(create(input({id:'b',value:'66',group:'cohort-a',applicability:'period',validity:{from:'2021-01-01',to:null}}),sources()));
  const c=reviewed(create(input({id:'c',value:'67',group:'cohort-b'}),sources()));
  const result=reconcile([a,b,c],sources(),{asOf:'2020-12-31',group:'cohort-a'});assert.equal(result.possibleConflicts.length,0);assert.equal(result.status,'reviewed-consistent');assert.equal(result.value,'65');assert.deepEqual(result.annotationIds,['a']);
  assert.equal(reconcile([a,b,c],sources(),{asOf:'2021-01-01',group:'cohort-a'}).value,'66');
  assert.equal(reconcile([a],sources(),{asOf:'2019-12-31',group:'cohort-a'}).status,'abstain');
});
test('malformed schemas, dates, authority, references, duplicate IDs and bounds reject',()=>{
  for(const overrides of [{schemaVersion:2},{version:2},{kind:'official-ruling'},{value:5},{id:''},{sources:[]},{sources:[input().sources[0],input().sources[0]]},{validity:{from:'2026-02-30',to:null},applicability:'period'},{validity:{from:'2026-01-02',to:'2026-01-01'},applicability:'period'},{validity:{from:null,to:null},applicability:'period'},{authority:{label:'label'}},{review:{reviewer:'x'}},{officialApproved:true},{value:'x'.repeat(4001)}])assert.throws(()=>create(input(overrides),sources()));
  const a=create(input(),sources());assert.throws(()=>reconcile([a,a],sources()),/Duplicate/);assert.throws(()=>reconcile(Array(2001).fill(a),sources()),/2,000/);assert.throws(()=>reconcile([a],sources(),{asOf:'bad'}),/dates/);
  assert.equal(validate(a,sources(),{requireReviewed:'yes'}).valid,false);
});
test('internal topic inventory supplies no fabricated official definitions or activated rules',()=>{
  assert.ok(api.INTERNAL_EVIDENCE_TERMS.some(term=>term.term==='NRD'));assert.ok(api.INTERNAL_EVIDENCE_TERMS.every(term=>term.officialDefinition===null&&term.kind==='internal-topic'));assert.equal(Object.isFrozen(api.INTERNAL_EVIDENCE_TERMS),true);
  const result=reconcile([reviewed(create(input(),sources()))],sources());assert.equal(result.status,'reviewed-consistent');assert.equal(result.value,'65');assert.match(result.warnings.join(' '),/unauthenticated/);assert.match(result.reason,/not an official determination/);
});
test('bulk validation rejects duplicate IDs, stale reviews and unresolved source references',()=>{
  const a=reviewed(create(input(),sources())),b=create(input({id:'second'}),sources());
  assert.deepEqual(api.validateEvidenceAnnotations([a,b],sources()),{valid:true,errors:[]});
  assert.deepEqual(api.validateEvidenceAnnotations([],sources()),{valid:true,errors:[]});
  assert.equal(api.validateEvidenceAnnotations([a,a],sources()).valid,false);
  assert.match(api.validateEvidenceAnnotations([a,a],sources()).errors[0],/Duplicate/);
  const stale=clone(a);stale.value='66';assert.match(api.validateEvidenceAnnotations([stale],sources()).errors[0],/content and version/);
  const unresolved=clone(b);unresolved.sources[0].locator.line=99;assert.match(api.validateEvidenceAnnotations([unresolved],sources()).errors[0],/resolve/);
  assert.equal(api.validateEvidenceAnnotations(Array(2001).fill(a),sources()).valid,false);
  assert.equal(api.validateEvidenceAnnotations(null,sources()).valid,false);
  assert.equal(api.validateEvidenceAnnotations([a],null).valid,false);
  assert.equal(a.status,'reviewed');assert.equal(b.status,'proposed');
});
test('bulk validation indexes many source records once for 500 independent annotations',()=>{
  const base=create(input(),sources());let locatorReads=0;
  const manySources=Array.from({length:20},(_,sourceIndex)=>({id:'synthetic-'+sourceIndex,name:'synthetic-'+sourceIndex+'.txt',hash:sourceIndex===0?'a'.repeat(64):sourceIndex.toString(16).padStart(64,'0'),records:Array.from({length:500},(_,recordIndex)=>{
    const location=sourceIndex===0&&recordIndex===0?input().sources[0].locator:{type:'text-line',line:recordIndex+1,offset:recordIndex*10,length:8};
    return {text:'Synthetic '+recordIndex,get locator(){locatorReads++;return location;}};
  })}));
  const annotations=Array.from({length:500},(_,index)=>({...clone(base),id:'synthetic-bulk-'+index}));
  assert.deepEqual(api.validateEvidenceAnnotations(annotations,manySources),{valid:true,errors:[]});
  assert.equal(locatorReads,10000,'each verified source locator is indexed once, rather than once per annotation');
  assert.equal(annotations[0].status,'proposed');assert.equal(annotations[0].review,null);
});
