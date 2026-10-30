'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRule, calculate, buildReview } = require('../assets/review.js');
const hash = 'a'.repeat(64);
function rule(operation = 'add', scale = 2) { return { schemaVersion: 1, id: 'synthetic-test', version: '1', kind: 'synthetic-arithmetic', status: 'approved', approval: {reviewer: 'Synthetic test reviewer', at: '2026-01-01', ruleVersion: '1'}, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', sources: [{sourceHash: hash, locator: {type:'text-line', line:1}}], operation, inputs: ['left', 'right'], output: {scale, rounding:'half-away-from-zero'} }; }
const context = {asOf:'2026-10-30'};
test('review keeps exact source provenance and separates text from approved facts', () => {
  const workspace = {schemaVersion:1,name:'Synthetic case',sources:[{name:'synthetic.txt',hash,parserVersion:'1',records:[{text:'Synthetic retirement example',locator:{type:'text-line',line:2}}]}]};
  const before = JSON.stringify(workspace);
  const result = buildReview(workspace);
  assert.equal(result.official, false); assert.equal(result.officialReleaseAllowed, false);
  assert.equal(result.inventory[0].sourceHash, hash);
  assert.deepEqual(result.evidence[0].locator, {type:'text-line',line:2});
  assert.equal(result.evidence[0].excerpt, 'Synthetic retirement example');
  assert.equal(result.evidence[0].verification,'unverified');
  assert.deepEqual(result.interpretations, []); assert.deepEqual(result.calculations, []);
  assert.match(result.r1Draft,/NOT AN OFFICIAL ARTIFACT/); assert.match(result.r1Draft,/\[S1:R1\]/);
  assert.equal(result.bsrs.executable,false); assert.equal(result.bsrs.fieldMap.length,0);
  assert.match(result.bsrs.syntax,/not BSRS configuration/);
  assert.ok(result.blockers.some(x=>x.includes('data_dictionary_complete.xlsm')));
  result.evidence[0].locator.line = 99;
  assert.equal(JSON.stringify(workspace), before, 'review must not mutate source workspace');
});
test('empty review and bounded excerpt coverage never pretend complete facts', () => {
  const empty=buildReview({schemaVersion:1,name:'Empty',sources:[]});
  assert.match(empty.blockers[0],/No source/);
  const records=Array.from({length:201},()=>({text:'x'.repeat(2001),locator:{type:'text-line',line:1}}));
  const result=buildReview({schemaVersion:1,name:'Synthetic',sources:[{name:'test.txt',hash,records}]});
  assert.equal(result.evidence.length,200); assert.equal(result.totalRecords,201);
  assert.equal(result.evidence[0].excerpt.length,2000); assert.equal(result.evidence[0].excerptTruncated,true);
  assert.match(result.r1Draft,/Maximum 200 excerpts/);
});
test('malformed provenance and excessive review resources fail explicitly', () => {
  assert.throws(()=>buildReview({schemaVersion:2,name:'x',sources:[]}),/Invalid workspace/);
  assert.throws(()=>buildReview({schemaVersion:1,name:'x',sources:[{name:'a.txt',hash:'bad',records:[]}]}),/hashes/);
  assert.throws(()=>buildReview({schemaVersion:1,name:'x',sources:[{name:'a.txt',hash,records:[{text:'test',locator:{}}]}]}),/locators/);
  assert.throws(()=>buildReview({schemaVersion:1,name:'x',sources:[{name:'a.txt',hash,records:Array(50001).fill({text:'x',locator:{line:1}})}]}),/50,000/);
});
test('unapproved, stale-version and official-like rules are rejected', () => {
  assert.equal(validateRule(rule()).valid,true);
  for (const change of [{status:'proposed'},{kind:'official-actuarial'}, {approval:{reviewer:'Someone',at:'2026-01-01',ruleVersion:'old'}}, {effectiveFrom:'2026-02-30'}, {sources:[]}, {output:{scale:2,rounding:'unspecified'}}, {inputs:['left','left']}]) {
    const invalid={...rule(),...change};
    assert.equal(validateRule(invalid).valid,false);
    assert.throws(()=>calculate(invalid,{left:'1',right:'2'},context));
  }
  const bad=rule(); bad.sources[0].locator.self=bad.sources[0].locator;
  assert.equal(validateRule(bad).valid,false);
});
test('independently expected decimal arithmetic avoids floating point errors', () => {
  assert.equal(calculate(rule(),{left:'0.1',right:'0.2'},context).value,'0.30');
  assert.equal(calculate(rule('subtract'),{left:'10',right:'0.01'},context).value,'9.99');
  assert.equal(calculate(rule('multiply'),{left:'1250.25',right:'12'},context).value,'15003.00');
  assert.equal(calculate(rule('divide'),{left:'10',right:'3'},context).value,'3.33');
  assert.equal(calculate(rule('multiply',0),{left:'999999999999999999',right:'999999999999999999'},context).value,'999999999999999998000000000000000001');
  const output=calculate(rule('divide'),{left:'1',right:'8'},context);
  assert.equal(output.value,'0.13'); assert.equal(output.trace.exactNumerator,'1'); assert.equal(output.trace.exactDenominator,'8');
  assert.equal(output.official,false); assert.equal(output.kind,'synthetic-calculation');
});
test('rounding is explicit half away from zero with normalized zero', () => {
  assert.equal(calculate(rule('divide'),{left:'-1',right:'8'},context).value,'-0.13');
  assert.equal(calculate(rule('divide'),{left:'1',right:'-8'},context).value,'-0.13');
  assert.equal(calculate(rule('add'),{left:'-0.001',right:'0'},context).value,'0.00');
  assert.equal(calculate(rule('divide',0),{left:'5',right:'2'},context).value,'3');
  assert.equal(calculate(rule('divide',0),{left:'-5',right:'2'},context).value,'-3');
});
test('effective dates, approvals and decimal input contract block unsafe calculation', () => {
  assert.throws(()=>calculate(rule(),{left:'1',right:'2'},{asOf:'2025-12-31'}),/effective period/);
  const future=rule(); future.approval.at='2026-11-01';
  assert.throws(()=>calculate(future,{left:'1',right:'2'},context),/approval occurs after/);
  assert.throws(()=>calculate(rule('divide'),{left:'1',right:'0'},context),/Division by zero/);
  for (const value of [NaN,Infinity,0.1,'1e10','01','1.0000000000001','9'.repeat(19)]) assert.throws(()=>calculate(rule(),{left:value,right:'1'},context),/decimal strings/);
  assert.throws(()=>calculate(rule(),{left:'1',right:'2',extra:'3'},context),/contract exactly/);
});
