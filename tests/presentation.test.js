'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {formatLocation}=require('../assets/presentation.js');
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
