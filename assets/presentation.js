/* Reading labels and exact citation navigation. Original locators remain unchanged. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const number=value=>Number.isInteger(value)&&value>0;
  function formatLocation(locator,fallback='Source excerpt') {
    if(!locator||typeof locator!=='object')return fallback;
    switch(locator.type){
      case 'text-line': return number(locator.line)?`Line ${locator.line}`:fallback;
      case 'delimited-cell': return number(locator.row)&&number(locator.column)?`Row ${locator.row}, column ${locator.column}`:fallback;
      case 'word-paragraph': {
        const part=typeof locator.part==='string'?locator.part:'';
        const section=/\/header\d+\.xml$/.test(part)?'Header':/\/footer\d+\.xml$/.test(part)?'Footer':/\/footnotes\.xml$/.test(part)?'Footnotes':/\/endnotes\.xml$/.test(part)?'Endnotes':'';
        const pieces=[];
        if(section)pieces.push(section);
        if(number(locator.table)&&number(locator.row)&&number(locator.column))pieces.push(`Table ${locator.table}, row ${locator.row}, column ${locator.column}`);
        if(number(locator.paragraph))pieces.push(`Paragraph ${locator.paragraph}`);
        return pieces.join(' · ')||fallback;
      }
      case 'word-binary-paragraph': return number(locator.paragraph)?`Paragraph ${locator.paragraph}`:fallback;
      case 'excel-cell': return typeof locator.sheet==='string'&&typeof locator.cell==='string'?`${locator.sheet} · Cell ${locator.cell}`:fallback;
      case 'sqlite-cell': return typeof locator.table==='string'&&typeof locator.column==='string'&&locator.rowid!==undefined?`${locator.table} · Row ${locator.rowid} · ${locator.column}`:fallback;
      case 'pdf-text-item': return number(locator.page)?`Page ${locator.page}${number(locator.item)?` · Text excerpt ${locator.item}`:''}`:fallback;
      case 'pdf-ocr-line': return number(locator.page)?`Page ${locator.page} · Machine-read line${number(locator.line)?` ${locator.line}`:''}`:'Machine-read PDF excerpt';
      case 'json-pointer': {
        if(typeof locator.pointer!=='string')return fallback;
        if(locator.pointer==='')return 'Document value';
        // Array indices remain zero-based; do not invent human paragraph/row positions.
        return 'JSON value: '+locator.pointer;
      }
      case 'html-text-offset': return 'HTML text excerpt';
      case 'xml-text': return typeof locator.path==='string'?`XML element: ${locator.path}`:'XML text excerpt';
      default:return fallback;
    }
  }
  // Key order is not part of a JSON locator's identity. Keep every value exact.
  function citationLocatorKey(locator){
    try{
      const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
      if(!plain(locator))return null;
      const type=Object.getOwnPropertyDescriptor(locator,'type');
      if(!type||!Object.hasOwn(type,'value')||typeof type.value!=='string'||!type.value.trim())return null;
      const state={nodes:0,characters:0,parents:new Set()};
      const token=value=>{state.characters+=value.length;if(state.characters>4096)throw Error('Locator character budget exceeded.');return value;};
      function encode(value,depth){
        if(++state.nodes>512||depth>12)throw Error('Locator complexity budget exceeded.');
        if(value===null)return token('null');
        if(typeof value==='string'){if(value.length>4096)throw Error('Locator string budget exceeded.');return token(JSON.stringify(value));}
        if(typeof value==='boolean')return token(value?'true':'false');
        if(typeof value==='number'&&Number.isFinite(value))return token(JSON.stringify(value));
        if(typeof value!=='object'||state.parents.has(value))throw Error('Invalid JSON locator.');
        if(!Array.isArray(value)&&!plain(value))throw Error('Locator values must be plain JSON.');
        state.parents.add(value);let result;
        if(Array.isArray(value)){
          if(value.length>512)throw Error('Locator array budget exceeded.');
          token('[]');const parts=[];
          for(let i=0;i<value.length;i++){const entry=Object.getOwnPropertyDescriptor(value,String(i));if(!entry||!Object.hasOwn(entry,'value'))throw Error('Sparse or active locator array.');if(i)token(',');parts.push(encode(entry.value,depth+1));}
          result='['+parts.join(',')+']';
        }else{
          const keys=Object.keys(value).sort();if(keys.length>512)throw Error('Locator key budget exceeded.');
          token('{}');const parts=[];
          for(let i=0;i<keys.length;i++){const key=keys[i];if(key.length>4096)throw Error('Locator key budget exceeded.');const entry=Object.getOwnPropertyDescriptor(value,key);if(!entry||!Object.hasOwn(entry,'value'))throw Error('Active locator property.');if(i)token(',');const name=token(JSON.stringify(key));token(':');parts.push(name+':'+encode(entry.value,depth+1));}
          result='{'+parts.join(',')+'}';
        }
        state.parents.delete(value);return result;
      }
      return encode(locator,0);
    }catch(_){return null;}
  }
  function findCitationRecordIndex(records,citation){
    try{
      if(!Array.isArray(records)||records.length>50000||!citation||typeof citation!=='object'||Array.isArray(citation))return -1;
      const data=(object,key)=>{const entry=Object.getOwnPropertyDescriptor(object,key);return entry&&Object.hasOwn(entry,'value')?entry.value:undefined;};
      const locators=data(citation,'locators');if(!Array.isArray(locators)||!locators.length||locators.length>200)return -1;
      const cache=new WeakMap(),keyFor=locator=>{if(!locator||typeof locator!=='object')return null;if(cache.has(locator))return cache.get(locator);const key=citationLocatorKey(locator);cache.set(locator,key);return key;};
      const keys=new Set();for(let i=0;i<locators.length;i++){const key=keyFor(data(locators,String(i)));if(key!==null)keys.add(key);}if(!keys.size)return -1;
      // A table field opens its value cell, even when a distant heading is also
      // cited. The anchor must be both the validated focus and a cited locator.
      const primary=data(citation,'primaryLocator');
      if(primary!==undefined){
        const meta=data(citation,'tableEvidence'),focus=meta&&data(meta,'focus'),primaryKey=keyFor(primary);
        if(data(citation,'evidenceKind')!=='table-field-v1'||!primaryKey||!keys.has(primaryKey)||primaryKey!==keyFor(focus&&data(focus,'locator')))return -1;
        for(let i=0;i<records.length;i++){const record=data(records,String(i));if(record&&keyFor(data(record,'locator'))===primaryKey)return i;}
        return -1;
      }
      const quotes=data(citation,'quotes'),needles=[];let quoteCharacters=0;
      if(Array.isArray(quotes)&&quotes.length<=36)for(let i=0;i<quotes.length;i++){const quote=data(quotes,String(i));if(typeof quote==='string'&&quote.trim()&&quote.length<=2000&&quoteCharacters+quote.length<=16000){needles.push(quote);quoteCharacters+=quote.length;}}
      const value=data(citation,'excerpt'),excerpt=typeof value==='string'&&value.trim()&&value.length<=12000?value:null;
      let first=-1,excerptMatch=-1;
      for(let i=0;i<records.length;i++){
        const record=data(records,String(i));if(!record||typeof record!=='object')continue;
        const key=keyFor(data(record,'locator'));if(key===null||!keys.has(key))continue;
        if(first<0)first=i;
        const text=data(record,'text');
        // Text preference is allowed only after an exact cited locator matches.
        // Quote count and text sizes are fixed bounds, never a locator cross-product.
        if(typeof text==='string'&&text.length<=2000000){if(needles.some(quote=>text.includes(quote)))return i;if(excerpt!==null&&excerptMatch<0&&text.includes(excerpt))excerptMatch=i;}
      }
      return excerptMatch>=0?excerptMatch:first;
    }catch(_){return -1;}
  }
  return {formatLocation,findCitationRecordIndex};
});
