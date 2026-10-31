'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractFailureNames,workflowEscape}=require('../tools/ci-summary.js');
test('CI summary selects bounded unique test names and excludes diagnostic values',()=>{
 const log='✖ source restore validates exact evidence (15.5ms)\n  actual: private-diagnostic-value\n✖ failing tests:\n✖ source restore validates exact evidence (15.5ms)\nnot ok 2 - rejects forged approval\n';
 assert.deepEqual(extractFailureNames(log),['source restore validates exact evidence','rejects forged approval']);
 assert.equal(extractFailureNames(Array.from({length:100},(_,i)=>'✖ case '+i).join('\n')).length,12);
 assert.equal(extractFailureNames('✖ '+ 'x'.repeat(1000))[0].length,300);
});
test('workflow annotations escape command delimiters instead of adding commands',()=>{
 assert.equal(workflowEscape('case%\r\n::notice::text'),'case%25%0D%0A::notice::text');
});
