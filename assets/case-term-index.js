/* Exact lexical candidate metadata for one bounded passage shard.
 * Terms are already normalized by the caller. This module does not stem text,
 * infer relevance, perform semantic retrieval or retain source passages.
 * Persisted indexes still require authenticated source/generation bindings.
 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PROFILE='exact-terms-v1',KIND='case-term-postings';
  const CASE_TERM_INDEX_LIMITS=Object.freeze({entries:4000,termCharacters:1000,chunkIdCharacters:300,termsPerEntry:4000,queryTerms:1000,postings:100000,inputOccurrences:4000000,bytes:20*1024*1024,nodes:500000});
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',encoder=new TextEncoder();
  const fail=message=>{throw Error('Case term index: '+message);};
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  function keys(value,names){if(!plain(value)||Object.keys(value).length!==names.length||Object.keys(value).some(key=>!names.includes(key)))fail('unexpected or missing metadata fields.');}
  function string(value,maximum,label){if(typeof value!=='string'||!value.length||value.length>maximum||/[\x00-\x1f\x7f]/.test(value)||typeof value.isWellFormed==='function'&&!value.isWellFormed())fail('invalid '+label+'.');return value;}
  const term=value=>{string(value,CASE_TERM_INDEX_LIMITS.termCharacters,'normalized term');if(/\s/u.test(value))fail('normalized terms cannot contain whitespace.');return value;};
  function denseBytes(count){return Math.ceil(count/8);}
  function encodeBits(bytes){let result='';for(let at=0;at<bytes.length;at+=3){const a=bytes[at],b=bytes[at+1],c=bytes[at+2],value=(a<<16)|((b||0)<<8)|(c||0);result+=alphabet[value>>>18]+alphabet[value>>>12&63]+(b===undefined?'=':alphabet[value>>>6&63])+(c===undefined?'=':alphabet[value&63]);}return result;}
  function decodeBits(value,count){
    const length=denseBytes(count);if(typeof value!=='string'||value.length!==Math.ceil(length/3)*4||!value.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('invalid dense posting encoding or length.');
    const bytes=new Uint8Array(length);let at=0;
    for(let index=0;index<value.length;index+=4){const encoded=(alphabet.indexOf(value[index])<<18)|(alphabet.indexOf(value[index+1])<<12)|((value[index+2]==='='?0:alphabet.indexOf(value[index+2]))<<6)|(value[index+3]==='='?0:alphabet.indexOf(value[index+3]));if(at<length)bytes[at++]=encoded>>>16;if(at<length)bytes[at++]=encoded>>>8&255;if(at<length)bytes[at++]=encoded&255;}
    if(encodeBits(bytes)!==value)fail('noncanonical dense posting padding.');
    if(count%8&&bytes.at(-1)&(255<<(count%8)))fail('dense posting addresses an ordinal outside the shard.');
    return bytes;
  }
  function bitOrdinals(bytes,count){const ordinals=[];for(let ordinal=0;ordinal<count;ordinal++)if(bytes[ordinal>>>3]&(1<<(ordinal&7)))ordinals.push(ordinal);return ordinals;}
  function ordinalBits(ordinals,count){const bytes=new Uint8Array(denseBytes(count));for(const ordinal of ordinals)bytes[ordinal>>>3]|=1<<(ordinal&7);return bytes;}
  function jsonStringBytes(value){
    let bytes=2; // Opening and closing quotes.
    for(let at=0;at<value.length;at++){
      const code=value.charCodeAt(at);
      if(code===34||code===92){bytes+=2;continue;}
      if(code<32){bytes+=[8,9,10,12,13].includes(code)?2:6;continue;}
      if(code<128){bytes++;continue;}if(code<2048){bytes+=2;continue;}
      if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(at+1);if(next>=0xdc00&&next<=0xdfff){bytes+=4;at++;}else bytes+=6;}
      else bytes+=code>=0xdc00&&code<=0xdfff?6:3;
    }
    return bytes;
  }
  function measured(value){
    let bytes=0,nodes=0;
    const add=amount=>{bytes+=amount;if(bytes>CASE_TERM_INDEX_LIMITS.bytes)fail('serialized metadata exceeds 20 MiB.');};
    function visit(item,depth){
      if(++nodes>CASE_TERM_INDEX_LIMITS.nodes||depth>6)fail('metadata exceeds its node or depth budget.');
      if(typeof item==='string'){add(jsonStringBytes(item));return;}
      if(typeof item==='number'&&Number.isSafeInteger(item)&&item>=0){add(String(item).length);return;}
      if(Array.isArray(item)){add(2+Math.max(0,item.length-1));for(const child of item)visit(child,depth+1);return;}
      if(!plain(item))fail('metadata must be plain JSON data.');
      const names=Object.keys(item);add(2+Math.max(0,names.length-1));for(const name of names){if(++nodes>CASE_TERM_INDEX_LIMITS.nodes)fail('metadata exceeds its node budget.');add(jsonStringBytes(name)+1);visit(item[name],depth+1);}
    }
    visit(value,0);return{bytes,nodes};
  }
  function validateCaseTermIndex(index){
    keys(index,['schemaVersion','kind','profile','count','chunkIds','postings']);
    if(index.schemaVersion!==1||index.kind!==KIND||index.profile!==PROFILE||!Number.isInteger(index.count)||index.count<0||index.count>CASE_TERM_INDEX_LIMITS.entries||!Array.isArray(index.chunkIds)||index.chunkIds.length!==index.count||!Array.isArray(index.postings)||index.postings.length>CASE_TERM_INDEX_LIMITS.postings||!index.count&&index.postings.length)fail('invalid profile, entry count or posting list.');
    const ids=new Set();for(const id of index.chunkIds){string(id,CASE_TERM_INDEX_LIMITS.chunkIdCharacters,'chunk ID');if(ids.has(id))fail('duplicate chunk ID.');ids.add(id);}
    let previous=null;
    for(const posting of index.postings){
      if(!plain(posting))fail('posting metadata must be plain JSON.');
      if(posting.encoding==='sparse')keys(posting,['term','encoding','ordinals']);else if(posting.encoding==='bits')keys(posting,['term','encoding','bits']);else fail('unsupported posting encoding.');
      term(posting.term);if(previous!==null&&posting.term<=previous)fail('posting terms must be unique and sorted.');previous=posting.term;
      if(posting.encoding==='sparse'){
        if(!Array.isArray(posting.ordinals)||!posting.ordinals.length||posting.ordinals.length>index.count)fail('invalid sparse posting count.');let last=-1;
        for(const ordinal of posting.ordinals){if(!Number.isInteger(ordinal)||ordinal<=last||ordinal>=index.count)fail('sparse ordinals must be unique, sorted and inside the shard.');last=ordinal;}
      }else{const bytes=decodeBits(posting.bits,index.count);if(!bytes.some(value=>value!==0))fail('empty dense posting.');}
    }
    measured(index);return index;
  }
  function freeze(index){for(const posting of index.postings){if(posting.ordinals)Object.freeze(posting.ordinals);Object.freeze(posting);}Object.freeze(index.chunkIds);Object.freeze(index.postings);return Object.freeze(index);}
  function buildCaseTermIndex(entries){
    if(!Array.isArray(entries)||entries.length>CASE_TERM_INDEX_LIMITS.entries)fail('use at most 4,000 passage entries.');
    const chunkIds=[],ids=new Set(),byTerm=new Map();let occurrences=0,termBytes=0;
    for(let ordinal=0;ordinal<entries.length;ordinal++){
      const entry=entries[ordinal];if(!plain(entry)||!plain(entry.chunk)||!Array.isArray(entry.terms)||entry.terms.length>CASE_TERM_INDEX_LIMITS.termsPerEntry)fail('passage entries need a chunk ID and bounded normalized term array.');
      const id=string(entry.chunk.id,CASE_TERM_INDEX_LIMITS.chunkIdCharacters,'chunk ID');if(ids.has(id))fail('duplicate chunk ID.');ids.add(id);chunkIds.push(id);const seen=new Set();
      for(const input of entry.terms){const value=term(input);if(seen.has(value))fail('duplicate normalized term in one passage.');seen.add(value);if(++occurrences>CASE_TERM_INDEX_LIMITS.inputOccurrences)fail('input term occurrence budget exceeded.');
        let ordinals=byTerm.get(value);if(!ordinals){termBytes+=encoder.encode(JSON.stringify(value)).length;if(termBytes>CASE_TERM_INDEX_LIMITS.bytes||byTerm.size>=CASE_TERM_INDEX_LIMITS.postings)fail('unique term metadata exceeds its bounded budget.');ordinals=[];byTerm.set(value,ordinals);}ordinals.push(ordinal);
      }
    }
    const postings=[];for(const value of [...byTerm.keys()].sort()){
      const ordinals=byTerm.get(value),bits=encodeBits(ordinalBits(ordinals,entries.length)),sparse={term:value,encoding:'sparse',ordinals},dense={term:value,encoding:'bits',bits};
      // Shared term text cancels in this comparison. Choose the smaller actual
      // JSON representation, including field names and base64 expansion.
      postings.push(JSON.stringify({encoding:sparse.encoding,ordinals}).length<=JSON.stringify({encoding:dense.encoding,bits}).length?sparse:dense);
    }
    return freeze(validateCaseTermIndex({schemaVersion:1,kind:KIND,profile:PROFILE,count:entries.length,chunkIds,postings}));
  }
  function queryCaseTermIndex(index,input){
    validateCaseTermIndex(index);if(!Array.isArray(input)||input.length>CASE_TERM_INDEX_LIMITS.queryTerms)fail('use at most 1,000 normalized question terms.');
    for(let ordinal=0;ordinal<input.length;ordinal++)if(!Object.hasOwn(input,ordinal))fail('normalized question terms cannot contain sparse entries.');
    const queryTerms=[...new Set(input.map(term))],counts=new Array(index.count).fill(0);
    for(const value of queryTerms){let low=0,high=index.postings.length-1,posting;
      while(low<=high){const middle=(low+high)>>>1,candidate=index.postings[middle];if(candidate.term===value){posting=candidate;break;}if(candidate.term<value)low=middle+1;else high=middle-1;}
      if(!posting)continue;if(posting.encoding==='sparse'){for(const ordinal of posting.ordinals)counts[ordinal]++;}else{const bits=decodeBits(posting.bits,index.count);for(let ordinal=0;ordinal<index.count;ordinal++)if(bits[ordinal>>>3]&(1<<(ordinal&7)))counts[ordinal]++;}
    }
    const results=[];let strongCount=0;
    for(let ordinal=0;ordinal<index.count;ordinal++){const matches=counts[ordinal];if(!matches)continue;const strong=matches===queryTerms.length;if(strong)strongCount++;results.push({ordinal,chunkId:index.chunkIds[ordinal],matches,score:matches/queryTerms.length,strong});}
    results.sort((a,b)=>b.matches-a.matches||a.ordinal-b.ordinal);return{queryTerms,counts,strongCount,matchedCount:results.length,results};
  }
  function inspectCaseTermIndex(index){validateCaseTermIndex(index);return measured(index);}
  return{buildCaseTermIndex,queryCaseTermIndex,validateCaseTermIndex,inspectCaseTermIndex,CASE_TERM_INDEX_PROFILE:PROFILE,CASE_TERM_INDEX_LIMITS};
});
