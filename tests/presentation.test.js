'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {formatLocation,findCitationRecordIndex}=require('../assets/presentation.js');
test('readable location labels preserve source positions without exposing locator objects',()=>{
  for(const [locator,label]of [
    [{type:'text-line',line:2},'Line 2'],
    [{type:'delimited-cell',row:3,column:4},'Row 3, column 4'],
    [{type:'word-paragraph',paragraph:7},'Paragraph 7'],
    [{type:'word-paragraph',paragraph:2,table:1,row:3,column:4},'Table 1, row 3, column 4 · Paragraph 2'],
    [{type:'excel-cell',sheet:'Synthetic',cell:'B2'},'Synthetic · Cell B2'],
    [{type:'sqlite-cell',table:'benefits',rowid:'7',column:'amount'},'benefits · Row 7 · amount'],
    [{type:'pdf-text-item',page:3,item:2},'Page 3 · Text excerpt 2'],
    [{type:'json-pointer',pointer:'/participants/0'},'JSON value: /participants/0'],
    [{type:'json-pointer',pointer:''},'Document value'],
    [null,'Source excerpt'],
    [{type:'unknown'},'Source excerpt'],
    [{type:'text-line',line:0},'Source excerpt']
  ])assert.equal(formatLocation(locator),label);
  assert.equal(formatLocation({type:'unknown'},'Excerpt 12'),'Excerpt 12');
});

const lineLocator=line=>({type:'text-line',line,offset:(line-1)*20,length:19,offsetUnit:'UTF-16 code units'});
test('citation navigation matches exact flat locators regardless of property order',()=>{
 const locator=lineLocator(75),records=[{text:'Archive text',locator:lineLocator(1)},{text:'Normal retirement age is 65.',locator}];
 const reordered={offsetUnit:locator.offsetUnit,length:locator.length,offset:locator.offset,line:75,type:'text-line'};
 const citation={locators:[reordered],excerpt:records[1].text},before=JSON.stringify({records,citation});
 assert.equal(findCitationRecordIndex(records,citation),1);assert.equal(JSON.stringify({records,citation}),before);
});
test('citation navigation matches nested PDF boxes and arrays without approximating positions',()=>{
 const locator={type:'pdf-ocr-line',page:4,line:2,bbox:{x:12,y:18,width:200,height:30},pageView:[0,0,612,792],renderTransform:[2,0,0,-2,0,1584]};
 const records=[{text:'A source sentence.',locator}],reordered={renderTransform:[2,0,0,-2,0,1584],pageView:[0,0,612,792],bbox:{height:30,width:200,y:18,x:12},line:2,page:4,type:'pdf-ocr-line'};
 assert.equal(findCitationRecordIndex(records,{locators:[reordered]}),0);
 for(const changed of [{...reordered,page:5},{...reordered,bbox:{...reordered.bbox,x:13}},{...reordered,renderTransform:[2,0,0,-2,1,1584]},{...reordered,pageView:[0,0,792,612]}])assert.equal(findCitationRecordIndex(records,{locators:[changed]}),-1);
});
test('quote preference selects a matching cited record and never an uncited duplicate',()=>{
 const records=Array.from({length:90},(_,index)=>({text:index===0||index===74?'Normal retirement age is 65.':'Archive text.',locator:lineLocator(index+1)}));
 const locators=[records[72].locator,records[73].locator,records[74].locator,records[75].locator];
 assert.equal(findCitationRecordIndex(records,{locators,quotes:['Normal retirement age is 65.']}),74);
 assert.equal(findCitationRecordIndex(records,{locators,excerpt:'Normal retirement age is 65.'}),74);
 assert.equal(findCitationRecordIndex(records,{locators,excerpt:'No matching single-record excerpt.'}),72);
 assert.equal(findCitationRecordIndex(records,{locators:[lineLocator(91)],quotes:['Normal retirement age is 65.']}),-1);
 const long=records.map(record=>({...record}));long[0].text='Archive text.';
 assert.equal(findCitationRecordIndex(long,{locators:long.map(record=>record.locator),quotes:['Normal retirement age is 65.'],excerpt:'Archive text.'}),74,'A cited quote on record 75 wins over a generic excerpt at the beginning of a long citation');
});
test('malformed and oversized citation locations fail closed without running accessors',()=>{
 const records=[{text:'Source text.',locator:lineLocator(1)}];let invoked=0;
 const active={type:'text-line',line:1};Object.defineProperty(active,'offset',{enumerable:true,get(){invoked++;return 0;}});
 const cycle={type:'text-line'};cycle.self=cycle;
 const deep={type:'json-pointer'};let next=deep;for(let i=0;i<15;i++){next.child={};next=next.child;}
 for(const locator of [null,{},[],{line:1},active,cycle,deep,{type:'json-pointer',pointer:'x'.repeat(4097)},{type:'text-line',line:NaN},{type:'text-line',line:1,extra:undefined}])assert.equal(findCitationRecordIndex(records,{locators:[locator]}),-1);
 assert.equal(invoked,0);
 for(const citation of [null,{}, {locators:[]},{locators:Array(201).fill(lineLocator(1))},{locators:Array(1)}])assert.equal(findCitationRecordIndex(records,citation),-1);
 assert.equal(findCitationRecordIndex(Array(50001),{locators:[lineLocator(1)]}),-1);
});
