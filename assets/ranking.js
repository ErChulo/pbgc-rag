(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const RANKING_LIMITS=Object.freeze({records:50000,characters:20000000,recordCharacters:2000000,queryCharacters:500,queryTerms:32,tokens:5000000,limit:50000});
const K1=1.2,B=0.75;
function fail(message){throw Error(message);}
// Versioned lexical tokenizer. Unicode letters/numbers form tokens; punctuation
// separates tokens. Case is normalized with Unicode lowercase. No stemming,
// semantic model, stop-word list, synonym expansion or legal inference is used.
function tokenize(text,visit){const pattern=/[\p{L}\p{N}]+/gu;let match;while((match=pattern.exec(text))!==null)visit(match[0].toLowerCase());}
// Okapi BM25, k1=1.2, b=0.75; IDF = ln(1+(N-df+0.5)/(df+0.5)).
// Records are the documents (not whole source files); all records, including
// empty ones, contribute to N and average length. Unique query terms have unit
// weight. Results match at least one term; ties retain original record order.
function rankRecords(records,query,options={}){
 if(!Array.isArray(records)||records.length>RANKING_LIMITS.records)fail('Ranked search supports at most 50,000 records.');
 if(typeof query!=='string'||query.length>RANKING_LIMITS.queryCharacters)fail('Ranked query exceeds 500 characters.');
 if(!options||typeof options!=='object'||Array.isArray(options))fail('Invalid ranked search options.');
 const limit=options.limit===undefined?100:options.limit;if(!Number.isInteger(limit)||limit<0||limit>RANKING_LIMITS.limit)fail('Ranked result limit must be an integer from zero to 50,000.');
 let characters=0;for(const record of records){if(!record||typeof record.text!=='string'||record.text.length>RANKING_LIMITS.recordCharacters)fail('Invalid ranked search record or record exceeds 2,000,000 characters.');characters+=record.text.length;if(characters>RANKING_LIMITS.characters)fail('Ranked search exceeds 20,000,000 characters.');}
 const terms=[];tokenize(query,term=>{if(!terms.includes(term)){terms.push(term);if(terms.length>RANKING_LIMITS.queryTerms)fail('Ranked query exceeds 32 unique terms.');}});
 if(!terms.length||!records.length||limit===0)return [];
 const termIndex=new Map(terms.map((term,index)=>[term,index])),frequencies=new Uint32Array(terms.length),documents=[];let totalTokens=0;
 for(let order=0;order<records.length;order++){
  const record=records[order],counts=new Map();let length=0;
  tokenize(record.text,term=>{length++;totalTokens++;if(totalTokens>RANKING_LIMITS.tokens)fail('Ranked search exceeds the 5,000,000-token budget.');const index=termIndex.get(term);if(index!==undefined)counts.set(index,(counts.get(index)||0)+1);});
  for(const index of counts.keys())frequencies[index]++;
  documents.push({record,order,length,counts});
 }
 if(!totalTokens)return [];
 const averageLength=totalTokens/records.length,idfs=terms.map((_,index)=>Math.log(1+(records.length-frequencies[index]+0.5)/(frequencies[index]+0.5))),ranked=[];
 for(const document of documents){if(!document.counts.size)continue;let score=0;const matchedTerms=[];
  for(const [index,frequency]of document.counts){const idf=idfs[index],denominator=frequency+K1*(1-B+B*document.length/averageLength),contribution=idf*frequency*(K1+1)/denominator;score+=contribution;matchedTerms.push({term:terms[index],frequency,documentFrequency:frequencies[index],idf,contribution});}
  matchedTerms.sort((a,b)=>termIndex.get(a.term)-termIndex.get(b.term));
  ranked.push({record:document.record,order:document.order,score,explanation:{method:'BM25 lexical ranking',tokenizerVersion:'unicode-alphanumeric-v1',queryTerms:terms.slice(),matchedTerms,documentLength:document.length,averageDocumentLength:averageLength,recordCount:records.length,k1:K1,b:B}});
 }
 ranked.sort((a,b)=>b.score-a.score||a.order-b.order);
 return ranked.slice(0,limit).map(item=>({...item.record,score:item.score,explanation:item.explanation}));
}
return {rankRecords,RANKING_LIMITS};
});
