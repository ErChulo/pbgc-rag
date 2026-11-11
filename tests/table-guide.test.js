'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseText}=require('../assets/core.js');
const {tableGuideModels,tableHeaderPatch,mountTableGuide}=require('../assets/table-guide.js');
const hash='a'.repeat(64);
function csv(id='csv',name='synthetic.csv',text='Name,Age\nAlice,65\nBob,67'){return {id,name,hash,parserVersion:'test',records:parseText(name,text).records};}
function workspace(sources=[csv()],headers=[]){return {id:'synthetic-case',sources,workbench:{tableHeaders:headers}};}
test('table guide requires an explicit header choice and preserves original values and other mappings',()=>{
 const second=csv('second','other.csv'),active=workspace([csv(),second],[{sourceId:'second',tableName:'other.csv',headerRow:1}]),before=JSON.stringify(active),[model]=tableGuideModels(active);
 assert.equal(model.headerRow,null);assert.deepEqual(model.columnNames,[]);assert.equal(model.rows[1].cells[1].text,'65');
 const patch=tableHeaderPatch(active,{...model,headerRow:1});assert.deepEqual(patch.tableHeaders,[{sourceId:'second',tableName:'other.csv',headerRow:1},{sourceId:'csv',tableName:'synthetic.csv',headerRow:1}]);assert.equal(JSON.stringify(active),before);
 const configured=tableGuideModels({...active,workbench:patch})[0];assert.equal(configured.headerRow,1);assert.deepEqual(configured.columnNames,['Name','Age']);
});
test('header choice binds case, original hash and sheet identity and rejects stale data',()=>{
 const active=workspace(),model=tableGuideModels(active)[0],choice={...model,headerRow:1};
 for(const changed of [{...active,id:'other-case'},{...active,sources:[{...active.sources[0],hash:'b'.repeat(64)}]},{...active,sources:[]}])assert.throws(()=>tableHeaderPatch(changed,choice),/changed|again/);
 assert.throws(()=>tableHeaderPatch(active,{...choice,tableName:'unavailable'}),/changed/);
 for(const value of [0,-1,1.5,1048577,NaN])assert.throws(()=>tableHeaderPatch(active,{...choice,headerRow:value}),/valid row/);
 assert.throws(()=>tableHeaderPatch(active,{...choice,headerRow:20}),/no source cells/);
});
test('duplicate, blank and formula headings fail rather than silently changing source names',()=>{
 for(const text of ['Name,Name\nAlice,65',',Age\nAlice,65']){const active=workspace([csv('csv','synthetic.csv',text)]),choice={...tableGuideModels(active)[0],headerRow:1};assert.throws(()=>tableHeaderPatch(active,choice),/Blank, duplicate/);}
 const excel={id:'xls',name:'synthetic.xlsx',hash,records:[{text:'Name',formula:'1+1',locator:{type:'excel-cell',sheet:'Plan',cell:'A1'}},{text:'Alice',locator:{type:'excel-cell',sheet:'Plan',cell:'A2'}}]},active=workspace([excel]);assert.throws(()=>tableHeaderPatch(active,{...tableGuideModels(active)[0],headerRow:1}),/Formula cells/);
});
test('SQLite already has column names and requires no guide; Excel uses exact sheet and source row',()=>{
 const db={id:'db',name:'test.sqlite',hash,records:[{text:'65',value:65,valueType:'integer',locator:{type:'sqlite-cell',table:'People',rowid:'1',column:'Age'}}]},excel={id:'xls',name:'synthetic.xlsx',hash,records:[{text:'Name',locator:{type:'excel-cell',sheet:'People & plans',cell:'A3'}},{text:'Age',locator:{type:'excel-cell',sheet:'People & plans',cell:'C3'}},{text:'Alice',locator:{type:'excel-cell',sheet:'People & plans',cell:'A4'}},{text:'001',locator:{type:'excel-cell',sheet:'People & plans',cell:'C4'}}]},active=workspace([db,excel]);
 const models=tableGuideModels(active);assert.equal(models.length,1);assert.equal(models[0].tableName,'People & plans');assert.equal(models[0].rows[0].row,3);assert.equal(models[0].rows[1].cells[1].text,'001');assert.deepEqual(tableHeaderPatch(active,{...models[0],headerRow:3}).tableHeaders,[{sourceId:'xls',tableName:'People & plans',headerRow:3}]);
});

// DOM boundary checks: source text must remain inert and changing a selection
// while a queued operation waits must not save the earlier choice.
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this._text='';this.value='';this.hidden=false;this.disabled=false;this.attributes={};}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(item=>item.textContent).join('');}
 append(...children){this.children.push(...children);}replaceChildren(...children){this._text='';this.children=children;}
 setAttribute(key,value){this.attributes[key]=String(value);}addEventListener(name,fn){(this.listeners[name]||=([])).push(fn);}emit(name){for(const fn of this.listeners[name]||[])fn();}
}
function fakeDocument(){const container=new Node('section');container.id='table-reading-guide';return {container,createElement:tag=>new Node(tag),getElementById(id){function find(node){if(node.id===id)return node;for(const child of node.children){const result=find(child);if(result)return result;}return null;}return find(container);}};}
test('guide uses inert text and saves nothing before the explicit confirmation',async()=>{
 const document=fakeDocument(),previous=global.document;global.document=document;let active=workspace([csv('csv','<img src=x onerror=alert(1)>.csv','Name,Age\n<script>bad()</script>,65')]),writes=0;const pending=[];
 try{const ui=mountTableGuide({getWorkspace:()=>active,operation:fn=>{const promise=fn();pending.push(promise);return promise;},updateWorkbench:async patch=>{writes++;active={...active,workbench:patch};}});ui.refresh();assert.equal(writes,0);assert.match(document.container.textContent,/<script>bad\(\)<\/script>/);assert.match(document.container.textContent,/<img src=x/);assert.equal(document.getElementById('table-guide-header-row').value,'1');document.getElementById('table-guide-confirm').emit('click');await pending[0];assert.equal(writes,1);assert.equal(active.workbench.tableHeaders[0].headerRow,1);assert.match(document.container.textContent,/Column names saved from row 1/);}
 finally{global.document=previous;}
});
test('queued confirmation is invalidated by a changed preview or active case',async()=>{
 for(const change of ['row','case']){const document=fakeDocument(),previous=global.document;global.document=document;let active=workspace(),writes=0,queued;
  try{const ui=mountTableGuide({getWorkspace:()=>active,operation:fn=>{queued=fn;},updateWorkbench:async()=>{writes++;}});ui.refresh();document.getElementById('table-guide-confirm').emit('click');if(change==='row'){const input=document.getElementById('table-guide-header-row');input.value='2';input.emit('input');}else active={...active,id:'other-case'};await assert.rejects(queued(),/changed/);assert.equal(writes,0);}
  finally{global.document=previous;}
 }
});
test('missing source tables hide the guide and invalid saved mappings show a visible error',()=>{
 const document=fakeDocument(),previous=global.document;global.document=document;let active=workspace([]);
 try{const ui=mountTableGuide({getWorkspace:()=>active});ui.refresh();assert.equal(document.container.hidden,true);active=workspace([csv()],[{sourceId:'removed',tableName:'missing',headerRow:1}]);ui.refresh();assert.equal(document.container.hidden,false);assert.match(document.container.textContent,/Could not read the column names/);}
 finally{global.document=previous;}
});
