'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {rankRecords}=require('../assets/ranking.js');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} differs from ${expected}`);
test('BM25 matches independently calculated two-document numeric regression',()=>{
 const records=[{text:'alpha alpha beta',sourceHash:'a',locator:{line:1}},{text:'beta gamma',sourceHash:'b',locator:{line:2}}];
 const results=rankRecords(records,'alpha beta');
 // N=2, avgdl=2.5, df(alpha)=1, df(beta)=2. Hand-expanded BM25 terms:
 // doc1 alpha ln(2)*4.4/3.38; beta ln(1.2)*2.2/2.38.
 // doc2 beta ln(1.2)*2.2/2.02. Constants are independent of implementation.
 close(results[0].score,Math.log(2)*4.4/3.38+Math.log(1.2)*2.2/2.38);
 close(results[1].score,Math.log(1.2)*2.2/2.02);
 assert.equal(results[0].sourceHash,'a');assert.deepEqual(results[0].locator,{line:1});assert.notEqual(results[0],records[0]);assert.equal(records[0].score,undefined);
 const detail=results[0].explanation;assert.equal(detail.documentLength,3);close(detail.averageDocumentLength,2.5);assert.equal(detail.matchedTerms[0].frequency,2);close(detail.matchedTerms[0].idf,Math.log(2));close(detail.matchedTerms.reduce((sum,term)=>sum+term.contribution,0),results[0].score);
});
test('rare terms, repeated terms and length normalization behave as BM25 specifies',()=>{const rows=[{text:'rare common',id:1},{text:'common common common common common common',id:2},{text:'rare',id:3}];assert.equal(rankRecords(rows,'rare')[0].id,3);assert.equal(rankRecords(rows,'common')[0].id,2);assert.deepEqual(rankRecords(rows,'rare rare').map(r=>r.score),rankRecords(rows,'rare').map(r=>r.score));assert.equal(rankRecords(rows,'missing').length,0);});
test('Unicode case, punctuation and natural-language query remain lexical and transparent',()=>{const rows=[{text:'Pensión ÅLDER 65. 月',id:1},{text:'pension age',id:2}];const results=rankRecords(rows,'Where is pensión, ålder and 月?');assert.equal(results.length,1);assert.equal(results[0].id,1);assert.deepEqual(results[0].explanation.matchedTerms.map(t=>t.term),['pensión','ålder','月']);assert.match(results[0].explanation.method,/lexical/);assert.equal(rankRecords(rows,'retirement').length,0);});
test('stable ties, empty documents and result limits preserve record order',()=>{const rows=[{text:'same',id:1},{text:'same',id:2},{text:'',id:3}];assert.deepEqual(rankRecords(rows,'same').map(r=>r.id),[1,2]);assert.equal(rankRecords(rows,'same')[0].explanation.recordCount,3);assert.equal(rankRecords(rows,'same',{limit:1}).length,1);assert.deepEqual(rankRecords(rows,'same',{limit:0}),[]);assert.deepEqual(rankRecords(rows,'?!'),[]);assert.deepEqual(rankRecords([],'same'),[]);});
test('input, query, record, character and token budgets fail before partial results',()=>{assert.throws(()=>rankRecords(new Array(50001),'x'),/50,000/);assert.throws(()=>rankRecords([{text:'x'}],'x'.repeat(501)),/500/);assert.throws(()=>rankRecords([{text:'x'}],Array.from({length:33},(_,i)=>'t'+i).join(' ')),/32/);assert.throws(()=>rankRecords([{text:'x'}],'x',{limit:-1}),/limit/);assert.throws(()=>rankRecords([{text:'x'.repeat(2000001)}],'x'),/2,000,000/);assert.throws(()=>rankRecords(Array.from({length:11},()=>({text:'x'.repeat(2000000)})),'x'),/20,000,000/);assert.throws(()=>rankRecords(Array.from({length:6},()=>({text:'x '.repeat(1000000)})),'x'),/token budget/);assert.throws(()=>rankRecords([{text:null}],'x'),/Invalid/);});
