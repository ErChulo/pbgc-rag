'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('../js/office.js');require('../js/sqlite.js');require('../js/pdf.js');
const {parseFile}=require('../js/parsers.js'),{search}=require('../js/search.js'),{exportCase,importCase}=require('../js/artifacts.js');
test('actual Office PDF and SQLite originals survive ingestion search and portable recovery',async()=>{
 const sources=[];
 for(const filename of ['fixtures/synthetic-plan.docx','fixtures/synthetic-plan.xlsx','fixtures/synthetic-plan.pdf','tests/fixtures/sqlite-synthetic.db']){
  const bytes=fs.readFileSync(path.join(__dirname,'..',filename));const file=new File([bytes],path.basename(filename));const source=await parseFile(file);sources.push(source);
  assert.deepEqual(Buffer.from(source.originalBase64,'base64'),bytes);assert.ok(source.records.length);assert.ok(search(source.records,'synthetic').length);
 }
 const c={schemaVersion:1,id:'binary-test',name:'Synthetic binary test',createdAt:'2026-10-28T00:00:00.000Z',sources,graph:{nodes:[],edges:[]},rules:[],calculations:[]};
 assert.deepEqual(await importCase(await exportCase(c)),JSON.parse(JSON.stringify(c)));
 assert.equal(sources[0].records[1].locator.cell,1);assert.equal(sources[1].records[1].fields.formula,'500+250');assert.equal(sources[2].records[0].locator.page,1);
});
