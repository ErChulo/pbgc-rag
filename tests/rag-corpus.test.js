'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseText}=require('../assets/core.js'),{buildAnswerCorpus}=require('../assets/rag-corpus.js'),{findCitationRecordIndex}=require('../assets/presentation.js');
const hash='a'.repeat(64),source=(id,name,records)=>({id,name,records,hash,parserVersion:'synthetic-1'});
test('answer corpus never falls back to flattened unconfigured or unsafe cells',async()=>{
 const csv=source('csv','synthetic.csv',parseText('synthetic.csv','Name,Age,EmployeeID\nAlice,,65').records);
 assert.equal((await buildAnswerCorpus([csv])).chunks.length,0);
 const configured=await buildAnswerCorpus([csv],{headers:[{sourceId:csv.id,tableName:csv.name,headerRow:1}]});
 assert.ok(configured.chunks.length>0);assert.ok(configured.chunks.every(chunk=>chunk.evidenceKind==='table-field-v1'));assert.ok(configured.chunks.every(chunk=>chunk.tableEvidence.focus.propertyText!=='Age'));
 const excel=source('excel','synthetic.xlsx',[{text:'Age',locator:{type:'excel-cell',sheet:'Plan',cell:'A1',part:'xl/worksheets/sheet1.xml'},tableLayoutProfile:'unmerged-sheet-v1'},{text:'65',formula:'60+5',cachedValue:'65',locator:{type:'excel-cell',sheet:'Plan',cell:'A2',part:'xl/worksheets/sheet1.xml'},tableLayoutProfile:'unmerged-sheet-v1'}]);
 assert.equal((await buildAnswerCorpus([excel],{headers:[{sourceId:'excel',tableName:'Plan',headerRow:1}]})).chunks.length,0);
});
test('mixed prose and unsupported Word tables preserve exact original record indices',async()=>{
 const word=source('word','synthetic.docx',[{text:'Normal retirement age is 65.',locator:{type:'word-paragraph',part:'word/document.xml',paragraph:1}},{text:'Unsafe table value 999',locator:{type:'word-paragraph',part:'word/document.xml',paragraph:2,table:1,row:1,column:1}},{text:'Records are retained for seven years.',locator:{type:'word-paragraph',part:'word/document.xml',paragraph:3}}]);
 const result=await buildAnswerCorpus([word]);assert.ok(result.chunks.length);assert.ok(result.chunks.every(chunk=>!chunk.text.includes('999')));for(const chunk of result.chunks)for(let i=0;i<chunk.recordIndices.length;i++){assert.deepEqual(chunk.locators[i],word.records[chunk.recordIndices[i]].locator);assert.notEqual(chunk.recordIndices[i],1);}
 assert.equal(word.records[1].text,'Unsafe table value 999');assert.ok(result.tableDiagnostics.some(item=>item.code==='word-table-unsupported'));
});
test('table value anchors open row150 rather than the heading and reject altered anchors',()=>{
 const records=[{text:'Age',locator:{type:'excel-cell',sheet:'Plan',cell:'A1'}},{text:'65',locator:{type:'excel-cell',sheet:'Plan',cell:'A150'}}],citation={evidenceKind:'table-field-v1',locators:records.map(record=>record.locator),primaryLocator:records[1].locator,tableEvidence:{focus:{locator:records[1].locator}}};
 assert.equal(findCitationRecordIndex(records,citation),1);assert.equal(findCitationRecordIndex(records,{...citation,primaryLocator:records[0].locator}),-1);assert.equal(findCitationRecordIndex(records,{...citation,primaryLocator:{type:'excel-cell',sheet:'Other',cell:'A150'}}),-1);assert.equal(findCitationRecordIndex(records,{...citation,locators:[records[0].locator]}),-1);
});
