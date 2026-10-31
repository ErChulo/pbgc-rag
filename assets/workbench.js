/* Case-review state is accepted only after binding it to verified originals. */
(function(root,factory){'use strict';const deps=typeof module==='object'&&module.exports?Object.assign({},require('./evidence.js'),require('./dictionary.js'),require('./graph.js'),require('./reports.js')):root.PBGCRag;const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(API){
  'use strict';
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function emptyWorkbench(){return {schemaVersion:1,annotations:[],dictionary:null,reportLayout:null,graphAssertions:[],tableHeaders:[]};}
  function caseForReview(workspace){return {...workspace,schemaVersion:1};}
  function validateWorkbench(input,workspace){
    if(!plain(input)||input.schemaVersion!==1||Object.keys(input).some(k=>!['schemaVersion','annotations','dictionary','reportLayout','graphAssertions','tableHeaders'].includes(k)))throw Error('Unsupported case review state.');
    const encoded=JSON.stringify(input);if(new TextEncoder().encode(encoded).length>8*1024*1024)throw Error('Case review state exceeds 8 MB.');
    const state=clone(input),sources=workspace.sources;
    if(!Array.isArray(state.annotations)||state.annotations.length>1000)throw Error('Case review supports at most 1,000 annotations.');
    if(state.annotations.length){const result=API.validateEvidenceAnnotations(state.annotations,sources);if(!result.valid)throw Error(result.errors.join(' '));}
    if(state.dictionary!==null){const source=sources.find(s=>s.hash===state.dictionary?.source?.hash);if(!source)throw Error('Dictionary source is missing from this case.');state.dictionary=API.validateDictionary(state.dictionary,source);}
    if(state.reportLayout!==null)API.buildReport(caseForReview(workspace),state.reportLayout);
    if(!Array.isArray(state.graphAssertions)||state.graphAssertions.length>2000||state.graphAssertions.some(edge=>edge.type!=='user-link'))throw Error('Invalid proposed graph links.');
    const graph=API.buildGraph(sources);graph.edges.push(...state.graphAssertions);API.validateGraph(graph,sources);
    if(!Array.isArray(state.tableHeaders)||state.tableHeaders.length>200)throw Error('Invalid table header mappings.');
    const seen=new Set();for(const header of state.tableHeaders){
      if(!plain(header)||Object.keys(header).some(k=>!['sourceId','tableName','headerRow'].includes(k))||typeof header.sourceId!=='string'||typeof header.tableName!=='string'||header.tableName.length>255||!Number.isInteger(header.headerRow)||header.headerRow<1||header.headerRow>1048576)throw Error('Invalid explicit table header mapping.');
      const source=sources.find(s=>s.id===header.sourceId);if(!source)throw Error('Table header source is missing.');const key=header.sourceId+'\0'+header.tableName;if(seen.has(key))throw Error('Duplicate table header mapping.');seen.add(key);
      if(!source.records.some(r=>(r.locator.type==='excel-cell'&&r.locator.sheet===header.tableName)||r.locator.type==='delimited-cell'))throw Error('Table header mapping does not resolve to a tabular source.');
    }
    return state;
  }
  return {emptyWorkbench,validateWorkbench,caseForReview};
});
