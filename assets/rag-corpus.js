/* Answer evidence is rebuilt from verified original records and explicit headings. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function tableRecord(record){const loc=record?.locator;return !!loc&&(['delimited-cell','excel-cell','sqlite-cell','word-table-cell'].includes(loc.type)||['word-paragraph','word-binary-paragraph'].includes(loc.type)&&loc.table!==undefined);}
async function buildAnswerCorpus(sources,options={}){
 const api=typeof module==='object'&&module.exports?{...require('./chunking.js'),...require('./table-evidence.js')}:root.PBGCRag;
 if(!Array.isArray(sources))throw Error('Add readable documents first.');
 // Empty slots retain original record indices. Flattened cells must never bypass
 // the field/header/formula checks through the ordinary prose answer path.
 const proseSources=sources.map(source=>({...source,records:source.records.map(record=>tableRecord(record)?{...record,text:''}:record)}));
 const prose=api.chunkSources(proseSources,{signal:options.signal}),tables=await api.buildTableEvidenceChunks(sources,{headers:options.headers||[],signal:options.signal}),chunks=[...prose.chunks,...tables.chunks];
 if(chunks.length>10000)throw Error('These documents exceed the 10,000-passage answer limit. Use a smaller case.');
 let characters=0,locations=0;for(const chunk of chunks){characters+=chunk.text.length;locations+=JSON.stringify(chunk.locators).length;}
 if(characters>20000000||locations>8*1024*1024)throw Error('These documents exceed the answer evidence limit. Use a smaller case.');
 return {chunks,tableDiagnostics:tables.diagnostics,unconfiguredTables:tables.unconfiguredTables,stats:{proseChunks:prose.chunks.length,tableFields:tables.chunks.length,characters}};
}
return {buildAnswerCorpus};
});
