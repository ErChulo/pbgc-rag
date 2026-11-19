'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolvePython}=require('./helpers/python.js');
test('fixture interpreter resolves python3 when python is absent',()=>{
 const seen=[];assert.equal(resolvePython(command=>{seen.push(command);return command==='python'?{error:{code:'ENOENT'}}:{status:0};}),'python3');assert.deepEqual(seen,['python','python3']);
 assert.equal(resolvePython(()=>({status:0})),'python');
 assert.throws(()=>resolvePython(()=>({error:{code:'ENOENT'}})),/python or python3/);
 assert.throws(()=>resolvePython(()=>({status:1})),/interpreter failed/);
});
