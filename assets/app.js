/* Workplace runtime: local classic scripts. Never execute imported content. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const API = globalThis.PBGCRag;
  const MAX_FILE = 5 * 1024 * 1024;
  const MAX_CASE = 20 * 1024 * 1024;
  const MAX_PACKAGE = 40 * 1024 * 1024;
  const MAX_CATALOG = 80 * 1024 * 1024;
  const LIBRARY = 'reference-library';
  let catalog = {schemaVersion: 2, activeId: null, cases: [], library: null};
  let recovery, recoveryBlocked = false, busy = false, abortRequested = false, operationAbort;
  let sourceView = null, lastResults = [], review = null;
  let reportLayout = {schemaVersion:1,title:'Source-linked case review',sections:['inventory','evidence','timeline'],maxEvidence:200,timeline:[]};
  let selectedEvidence = null, selectedGraphRecordId = null, graphAssertions = [];
  const viewStates = new Map();
  const status = message => { $('status').textContent = message; };
  const el = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  const workspace = () => catalog.activeId === LIBRARY ? catalog.library : catalog.cases.find(c => c.id === catalog.activeId);
  function requireCase() { const active = workspace(); if (!active) throw Error('Create or select a workspace first.'); return active; }
  function newCase(name, id = crypto.randomUUID()) { return {schemaVersion: 1, id, name, sources: []}; }
  function base64(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(str);
  }
  function decode(str) {
    if (typeof str !== 'string' || str.length > Math.ceil(MAX_FILE / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(str)) throw Error('Invalid source byte encoding.');
    const bytes = Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
    if (bytes.length > MAX_FILE) throw Error('Source exceeds the 5 MB limit.');
    return bytes;
  }
  async function hash(bytes) {
    if (!globalThis.crypto?.subtle) throw Error('SHA-256 is unavailable. Use a browser with local cryptography.');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  function download(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function sourceDetails(hash,locator,parserVersion) {
    const details=el('details','');details.className='source-details';details.append(el('summary','Source details'));
    if(hash)details.append(el('p','File fingerprint (SHA-256)'),el('code',hash));
    if(parserVersion)details.append(el('p',`Parser version: ${parserVersion}`));
    if(locator)details.append(el('p','Exact source locator'),el('pre',JSON.stringify(locator,null,2)));
    return details;
  }
  const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
  function checkCancelled() { if (abortRequested) throw Error('Operation cancelled. Existing sources were kept unchanged.'); }
  async function operation(fn, cancelable = false) {
    if (busy) return;
    busy = true; abortRequested = false; operationAbort = new AbortController();
    document.querySelectorAll('button,input,select').forEach(node => { node.disabled = true; });
    $('cancel-operation').hidden = !cancelable; $('cancel-operation').disabled = false;
    $('progress').hidden = !cancelable;
    try { await fn(); } catch (error) { status(error.message || 'Operation failed.'); }
    finally {
      busy = false; operationAbort = null;
      document.querySelectorAll('button,input,select').forEach(node => { node.disabled = false; });
      $('cancel-operation').hidden = true; $('progress').hidden = true;
      updateViewerButtons(); renderCheckpoint();
    }
  }
  $('cancel-operation').addEventListener('click', () => { abortRequested = true; operationAbort?.abort(); status('Cancellation requested. Waiting for the current file check to finish.'); });
  function checkSources(sources) {
    if (sources.length > 200) throw Error('Maximum 200 sources per workspace.');
    if (sources.reduce((sum, s) => sum + decode(s.bytesBase64).length, 0) > MAX_CASE) throw Error('Workspace exceeds the 20 MB limit.');
    if (sources.reduce((sum, s) => sum + s.records.length, 0) > 50000) throw Error('Workspace exceeds the 50,000 record limit.');
    if (new Blob([JSON.stringify(sources)]).size > 39 * 1024 * 1024) throw Error('Parsed workspace exceeds the portable package budget. Use a smaller workspace.');
  }
  function checkCatalog(candidate) {
    if (candidate.cases.length > 8) throw Error('Maximum eight cases in local recovery. Export and close a case first.');
    if (new Blob([JSON.stringify(candidate)]).size > MAX_CATALOG) throw Error('Recovery catalog exceeds the 80 MB limit. Export and close a case first.');
  }
  async function save() {
    if (!recovery || recoveryBlocked) return;
    try {
      const info = await recovery.save(catalog);
      $('storage').textContent = info.persistent ? `${info.kind} recovery saved. Export a portable backup before closing the browser.` : 'Memory only. Export your case before you close this tab.';
    } catch (error) {
      recoveryBlocked = true;
      $('storage').textContent = `Recovery write failed: ${error.message} Your current work is in memory. Export it before reloading. The last durable snapshot was kept.`;
    }
  }
  async function commit(candidate,rememberView=true) {
    checkCatalog(candidate);
    if(rememberView&&catalog.activeId)viewStates.set(catalog.activeId,{layout:currentLayout(),assertions:graphAssertions.slice()});
    catalog=candidate;await save();render();
  }
  async function sourceFromBytes(name, bytes, id, knownHash) {
    if (typeof name !== 'string' || !name.trim() || name.length > 255) throw Error('Invalid source name.');
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_FILE) throw Error('Source exceeds the 5 MB limit.');
    const parsed = name.toLowerCase().endsWith('.pdf') && API.parsePdfBytes ? await API.parsePdfBytes(bytes,{signal:operationAbort?.signal}) : API.parseIsolatedBytes ? await API.parseIsolatedBytes(name,bytes,{signal:operationAbort?.signal}) : await API.parseBytes(name, bytes);
    return {id: id || crypto.randomUUID(), name, hash: knownHash || await hash(bytes), bytesBase64: base64(bytes), ...parsed};
  }
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && value !== LIBRARY;
  async function validatePackage(data) {
    if (!data || data.schemaVersion !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 || !Array.isArray(data.sources) || data.sources.length > 200) throw Error('Invalid case package schema.');
    const clean = newCase(data.name, validId(data.id) ? data.id : undefined);
    const seenHashes = new Set(), seenIds = new Set(); let total = 0;
    for (let index = 0; index < data.sources.length; index++) {
      checkCancelled();
      const source = data.sources[index];
      if (!source || typeof source !== 'object') throw Error('Invalid source record.');
      const bytes = decode(source.bytesBase64); total += bytes.length;
      if (total > MAX_CASE) throw Error('Workspace exceeds the 20 MB limit.');
      const id = validId(source.id) && !seenIds.has(source.id) ? source.id : crypto.randomUUID();
      const rebuilt = await sourceFromBytes(source.name, bytes, id);
      if (rebuilt.hash !== source.hash) throw Error(`Integrity check failed: ${source.name}`);
      if (seenHashes.has(rebuilt.hash)) throw Error('Duplicate source in package.');
      seenHashes.add(rebuilt.hash); seenIds.add(rebuilt.id); clean.sources.push(rebuilt);
      $('progress').max = Math.max(1, data.sources.length); $('progress').value = index + 1;
      await yieldUI();
    }
    checkSources(clean.sources); return clean;
  }
  async function validateCatalog(data) {
    if (data?.schemaVersion === 1) { const migrated = await validatePackage(data); return {schemaVersion:2,activeId:migrated.id,cases:[migrated],library:null}; }
    if (!data || data.schemaVersion !== 2 || !Array.isArray(data.cases) || data.cases.length > 8) throw Error('Invalid recovery catalog.');
    checkCatalog(data);
    const clean = {schemaVersion:2,activeId:null,cases:[],library:null};
    for (const item of data.cases) { const c = await validatePackage(item); if (clean.cases.some(other => other.id === c.id)) throw Error('Duplicate case ID in recovery.'); clean.cases.push(c); }
    if (data.library) { clean.library = await validatePackage(data.library); clean.library.id = LIBRARY; clean.library.name = 'Reference library'; }
    if (data.activeId === LIBRARY && clean.library || clean.cases.some(c => c.id === data.activeId)) clean.activeId = data.activeId;
    if(data.pending){
      if(typeof data.pending.targetId!=='string'||!(data.pending.targetId===LIBRARY&&clean.library||clean.cases.some(c=>c.id===data.pending.targetId)))throw Error('Import checkpoint has no target workspace.');
      clean.pending={targetId:data.pending.targetId,package:await validatePackage(data.pending.package)};
      const target=clean.pending.targetId===LIBRARY?clean.library:clean.cases.find(c=>c.id===clean.pending.targetId);checkSources(target.sources.concat(clean.pending.package.sources.filter(s=>!target.sources.some(x=>x.hash===s.hash))));
    }
    return clean;
  }
  function renderCheckpoint(){
    const pending=catalog.pending, count=pending?.package?.sources?.length||0;
    $('checkpoint-status').textContent=count?`${count} checked sources are held in an import checkpoint. Reselect remaining files to continue, or keep this checked subset. Sources are not active until committed.`:'';
    $('resume-import').hidden=!count; $('discard-import').hidden=!count;
  }
  async function keepCheckpoint(){
    const pending=catalog.pending;if(!pending)throw Error('No import checkpoint is available.');
    if(pending.targetId!==catalog.activeId)throw Error('Select the checkpoint target workspace first.');
    const active=requireCase(), additions=pending.package.sources.filter(s=>!active.sources.some(x=>x.hash===s.hash));
    const sources=active.sources.concat(additions);checkSources(sources);const updated={...active,sources};
    const next=active.id===LIBRARY?{...catalog,library:updated,pending:null}:{...catalog,cases:catalog.cases.map(c=>c.id===active.id?updated:c),pending:null};
    await commit(next);return additions.length;
  }
  $('resume-import').addEventListener('click',()=>operation(async()=>{const count=await keepCheckpoint();status(`Kept ${count} checked sources. Reselect any remaining files to continue importing.`);}));
  $('discard-import').addEventListener('click',()=>operation(async()=>{await commit({...catalog,pending:null});status('Import checkpoint discarded. Active sources were unchanged.');}));
  function render() {
    const active = workspace();
    $('active-case').textContent = active ? `Active ${catalog.activeId === LIBRARY ? 'library' : 'case'}: ${active.name}` : 'No active case';
    $('case-name').value = '';
    $('workspace-select').replaceChildren(new Option('Select a workspace', ''));
    for (const c of catalog.cases) $('workspace-select').append(new Option(c.name, c.id));
    $('workspace-select').append(new Option('Reference library (separate)', LIBRARY));
    $('workspace-select').value = catalog.activeId || '';
    $('sources').replaceChildren(); $('graph-start').replaceChildren(); $('graph-target').replaceChildren();
    for (const source of active?.sources || []) {
      const item = el('li', `${source.name} · ${source.records.length} records`);
      const details=sourceDetails(source.hash,null,source.parserVersion);
      for(const warning of source.warnings||[])details.append(el('p',String(warning)));
      item.append(details);

      const view = el('button', 'View source'); view.type = 'button'; view.addEventListener('click', () => openSource(source, 0));
      const original = el('button', 'Save original'); original.type = 'button';
      original.addEventListener('click', () => download(source.name, decode(source.bytesBase64), 'application/octet-stream'));
      item.append(el('div','')); item.lastChild.append(view, original); $('sources').append(item);
      $('graph-start').append(new Option(source.name, `document:${encodeURIComponent(source.id)}`));
      $('graph-target').append(new Option(source.name, `document:${encodeURIComponent(source.id)}`));
    }
    lastResults = []; review = null; selectedEvidence = null; selectedGraphRecordId=null;
    const savedView=viewStates.get(catalog.activeId);
    graphAssertions=savedView?.assertions||[];
    $('graph-link-count').textContent=graphAssertions.length?`${graphAssertions.length} proposed links. None approved.`:'No proposed links';
    reportLayout=savedView?.layout||{schemaVersion:1,title:'Source-linked case review',sections:['inventory','evidence','timeline'],maxEvidence:200,timeline:[]};
    $('report-title').value=reportLayout.title;
    $('report-sections').value=reportLayout.sections.join(',');
    if(!$('report-sections').value){const option=new Option(reportLayout.sections.join(', '),reportLayout.sections.join(','));$('report-sections').append(option);$('report-sections').value=option.value;}
    $('timeline-list').replaceChildren(...(reportLayout.timeline||[]).map(item=>el('li',`${item.date}: ${item.label} · Unverified annotation`))); $('report-preview').replaceChildren();
    $('results').replaceChildren(); $('review-results').replaceChildren(); $('graph-results').replaceChildren();
    renderCheckpoint();
    if ($('source-view').open) $('source-view').close(); sourceView = null;
  }
  function openSource(source, index) {
    selectedEvidence = {sourceHash:source.hash,locator:source.records[index]?.locator};
    selectedGraphRecordId=`record:${encodeURIComponent(source.id)}:${index}`;
    sourceView = {source, index, page: Math.floor(index / 40)};
    renderSource();
    if (!$('source-view').open) $('source-view').showModal();
  }
  function updateViewerButtons() {
    if (!sourceView) return;
    $('source-prev').disabled = sourceView.page === 0;
    $('source-next').disabled = (sourceView.page + 1) * 40 >= sourceView.source.records.length;
  }
  function renderSource() {
    const {source,index,page} = sourceView;
    $('source-title').textContent = source.name;
    $('source-meta').textContent='Extracted text. Use Save original to view the document’s original layout.';
    $('source-details').open=false;
    const verification=$('source-verification');verification.replaceChildren(el('p','File fingerprint (SHA-256)'),el('code',source.hash),el('p',`Parser version: ${source.parserVersion}`));
    for(const warning of source.warnings||[])verification.append(el('p',String(warning)));
    const selected=source.records[index];
    if(selected)verification.append(el('p',`Exact locator: ${API.formatLocation(selected.locator)}`),el('pre',JSON.stringify(selected.locator,null,2)));
    $('source-records').replaceChildren();
    for (let i = page * 40; i < Math.min(source.records.length, (page + 1) * 40); i++) {
      const record = source.records[i], article = el('article','');
      if (i === index) article.classList.add('selected');
      article.append(el('h3',API.formatLocation(record.locator,`Excerpt ${i+1}`)),el('pre',record.text));
      if (record.formula !== undefined) article.append(el('p', `Formula (not evaluated): ${record.formula}`));
      $('source-records').append(article);
    }
    $('source-page').textContent = `Records ${source.records.length ? page * 40 + 1 : 0}–${Math.min((page + 1) * 40, source.records.length)} of ${source.records.length}`;
    updateViewerButtons();
    requestAnimationFrame(() => { const selected = $('source-records').querySelector('.selected'); if (selected) selected.scrollIntoView({block:'nearest'}); else $('source-records').scrollTop = 0; });
  }
  $('source-close').addEventListener('click', () => $('source-view').close());
  $('source-prev').addEventListener('click', () => { sourceView.page--; renderSource(); });
  $('source-next').addEventListener('click', () => { sourceView.page++; renderSource(); });
  $('workspace-select').addEventListener('change', event => operation(async () => {
    const id = event.target.value;
    const next = {...catalog,activeId:id || null};
    if (id === LIBRARY && !next.library) next.library = newCase('Reference library', LIBRARY);
    await commit(next); status('Workspace selected. Search is isolated to its own sources.');
  }));
  $('create-case').addEventListener('click', () => operation(async () => {
    const name = $('case-name').value.trim(); if (!name) throw Error('Enter a case name.');
    const c = newCase(name); await commit({...catalog,activeId:c.id,cases:[...catalog.cases,c]}); status('Case created. Add source documents.');
  }));
  $('close-case').addEventListener('click', () => operation(async () => {
    const active = requireCase();
    if (!confirm('Close this workspace and remove its current local recovery copy? Export first to keep your work. A prior recovery snapshot may still contain it.')) return;
    const next = {...catalog,activeId:null};
    if(catalog.pending?.targetId===active.id)next.pending=null;
    if (active.id === LIBRARY) next.library = null; else next.cases = catalog.cases.filter(c => c.id !== active.id);
    await commit(next); viewStates.delete(active.id); status('Case closed. Restore an exported package to reopen it.');
  }));
  $('files').addEventListener('change', event => {
    const files = Array.from(event.target.files); event.target.value='';
    operation(async () => {
      const active = requireCase();
      if(catalog.pending&&catalog.pending.targetId!==active.id)throw Error('Finish or discard the pending import in its target workspace first.');
      const additions = catalog.pending?.package.sources.slice() || [];
      if (files.length + active.sources.length > 200) throw Error('Maximum 200 sources per workspace.');
      let total = active.sources.concat(additions).reduce((sum, s) => sum + decode(s.bytesBase64).length, 0);
      $('progress').max = Math.max(1, files.length); $('progress').value = 0;
      for (let i = 0; i < files.length; i++) {
        checkCancelled(); const file = files[i];
        if (file.size > MAX_FILE) throw Error(`${file.name} exceeds the 5 MB limit.`);
        status(`Checking source ${i + 1} of ${files.length}: ${file.name}`); await yieldUI();
        const bytes=new Uint8Array(await file.arrayBuffer()), sourceHash=await hash(bytes);checkCancelled();
        if(!active.sources.concat(additions).some(s=>s.hash===sourceHash)){
          const source=await sourceFromBytes(file.name,bytes,undefined,sourceHash);checkCancelled();total+=file.size;if(total>MAX_CASE)throw Error('Workspace exceeds the 20 MB limit.');
          checkSources(active.sources.concat(additions,source));additions.push(source);
          const candidate={...catalog,pending:{targetId:active.id,package:{schemaVersion:1,id:crypto.randomUUID(),name:'Pending checked sources',sources:additions.slice()}}};
          checkCatalog(candidate);catalog=candidate;await save();
        }
        $('progress').value = i + 1; await yieldUI();
      }
      const sources = active.sources.concat(additions); checkSources(sources); checkCancelled();
      const updated = {...active,sources};
      const next = active.id === LIBRARY ? {...catalog,library:updated,pending:null} : {...catalog,cases:catalog.cases.map(c => c.id === active.id ? updated : c),pending:null};
      await commit(next); $('files').value = ''; status(`Imported ${additions.length} sources. Duplicate bytes were skipped.`);
    }, true);
  });
  $('demo').addEventListener('click', () => operation(async () => {
    const c = newCase('Synthetic example');
    c.sources.push(await sourceFromBytes('synthetic-plan.txt', new TextEncoder().encode('SYNTHETIC PLAN — test data only\nNormal retirement age is 65.\nThis example is not an official plan provision.\n')));
    await commit({...catalog,activeId:c.id,cases:[...catalog.cases,c]}); status('Synthetic example loaded. Search for retirement.');
  }));
  function flatRecords(active) {
    return active.sources.flatMap(source => source.records.map((record,index) => ({...record,sourceId:source.id,sourceName:source.name,sourceHash:source.hash,recordIndex:index})));
  }
  function resultArticle(record) {
    const article = el('article',''); article.append(el('h3',record.sourceName),el('p',API.formatLocation(record.locator)),el('pre',record.text));
    const view = el('button','View evidence');
    view.addEventListener('click', () => { const source = requireCase().sources.find(s => s.id === record.sourceId); if (source) openSource(source, record.recordIndex ?? source.records.findIndex(r => JSON.stringify(r.locator) === JSON.stringify(record.locator))); });
    article.append(view);
    const details=sourceDetails(record.sourceHash,record.locator);
    if(record.explanation)details.append(el('p',`BM25 lexical score ${record.score.toFixed(4)}; matching terms: ${record.explanation.matchedTerms.map(term=>term.term).join(', ')}`));
    article.append(details);return article;
  }
  $('search').addEventListener('click', () => operation(async () => {
    const records = flatRecords(requireCase()), mode = $('search-mode').value;
    status('Searching…'); await yieldUI();
    lastResults = mode==='ranked'?API.rankRecords(records,$('query').value,{limit:100}):['regex','sql'].includes(mode)?API.queryRecords(records,$('query').value,mode):API.search(records,$('query').value,mode);
    $('results').replaceChildren(el('p',`${lastResults.length} ${lastResults.length===1?'result':'results'}`));
    for (const record of lastResults.slice(0,100)) $('results').append(resultArticle(record));
    status(lastResults.length > 100 ? 'Showing the first 100 results. Refine your query.' : 'Search complete. Verify evidence in the original source.');
  }));
  $('query').addEventListener('keydown', event => { if (event.key === 'Enter') $('search').click(); });
  $('graph-search').addEventListener('click', () => operation(async () => {
    const active = requireCase(), graph = currentGraph(); API.validateGraph(graph,active.sources);
    const result = API.queryGraph(graph,{startId:$('graph-start').value,maxDepth:Number($('graph-depth').value),asOf:$('graph-date').value || undefined,maxNodes:100,direction:$('graph-direction').value});
    $('graph-results').replaceChildren(el('p',`${result.nodes.length} nodes · ${result.edges.length} links${result.truncated ? ' · Result limit reached' : ''}`));
    for (const node of result.nodes) {
      if (node.type === 'record') $('graph-results').append(resultArticle({...node,recordIndex:node.index}));
      else $('graph-results').append(el('h3',`${node.sourceName} · Source node`));
    }
    status('Document graph checked against source records. Effective dates are unknown unless explicitly evidenced.');
  }));
  function currentGraph() {
    const graph=API.buildGraph(requireCase().sources); graph.edges.push(...graphAssertions); API.validateGraph(graph,requireCase().sources); return graph;
  }
  $('graph-link').addEventListener('click', () => operation(async () => {
    const graph=currentGraph();
    if(!selectedEvidence?.locator)throw Error('Open a source record with View evidence first.');
    const node=graph.nodes.find(n=>n.type==='record'&&n.id===selectedGraphRecordId&&n.sourceHash===selectedEvidence.sourceHash);
    if(!node)throw Error('Selected evidence is not in the active workspace.');
    const edge=API.createGraphAssertion(graph,{id:crypto.randomUUID(),from:node.id,to:$('graph-target').value,evidenceRecordId:node.id,label:$('graph-label').value.trim(),author:$('graph-author').value.trim(),recordedOn:$('graph-recorded').value,validity:{from:$('graph-from').value||null,to:$('graph-to').value||null}});
    graphAssertions.push(edge); $('graph-link-count').textContent=`${graphAssertions.length} proposed links. None approved.`;
    status('Proposed link added. Dates and interpretation remain unverified. Export the graph to keep it.');
  }));
  $('export-graph').addEventListener('click', () => operation(async () => { download('proposed-evidence-graph-v1.json',JSON.stringify(currentGraph()),'application/json'); status('Source-bound documentary graph and proposed links exported.'); }));
  $('import-graph').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;event.target.value='';operation(async()=>{
    if(file.size>MAX_PACKAGE)throw Error('Graph exceeds the 40 MB import limit.');const graph=JSON.parse(await file.text());API.validateGraph(graph,requireCase().sources);
    graphAssertions=graph.edges.filter(edge=>edge.type==='user-link');$('graph-link-count').textContent=`${graphAssertions.length} proposed links. None approved.`;$('import-graph').value='';status('Graph restored and checked against active source records. No link was approved.');
  });});
  function buildReview() {
    review = API.buildReview(requireCase());
    $('review-results').replaceChildren(el('h3','Provisional review — official release blocked'), el('p',`${review.totalRecords} source records. ${review.blockers.length} release blockers.`), el('pre',review.r1Draft));
    return review;
  }
  $('build-review').addEventListener('click', () => operation(async () => { buildReview(); status('Draft built from source records. Review all evidence and unresolved items.'); }));
  $('export-review-package').addEventListener('click',()=>operation(async()=>{
    const verified=await validatePackage(requireCase());checkCancelled();
    const draft=API.buildReview(verified),report=API.buildReport(verified,currentLayout()),graph=currentGraph();API.validateGraph(graph,verified.sources);
    const contents=[
      {name:'provisional-r1-draft.txt',type:'text/plain;charset=utf-8',text:draft.r1Draft},
      {name:'provisional-bsrs-internal.json',type:'application/json',text:JSON.stringify(draft.bsrs,null,2)},
      {name:'provisional-case-report.html',type:'text/html;charset=utf-8',text:API.renderReportHTML(report)},
      {name:'report-layout-v1.json',type:'application/json',text:JSON.stringify(report.layout,null,2)},
      {name:'proposed-evidence-graph-v1.json',type:'application/json',text:JSON.stringify(graph)}
    ];
    const artifacts=[];for(const file of contents){checkCancelled();const bytes=new TextEncoder().encode(file.text);artifacts.push({...file,bytes:bytes.length,sha256:await hash(bytes)});}
    const packageData={schemaVersion:1,kind:'provisional-reviewer-package',official:false,officialReleaseAllowed:false,case:verified,artifacts,manifest:{schemaVersion:1,sourceHashes:verified.sources.map(s=>({name:s.name,sha256:s.hash})),artifactHashes:artifacts.map(a=>({name:a.name,bytes:a.bytes,sha256:a.sha256})),validation:{sourceIntegrity:'PASS',derivedRecordsRebuilt:'PASS',graphSourceBinding:'PASS',reportSourceBinding:'PASS',officialRelease:'BLOCKED',actuarialNumericalValidation:'NOT_PERFORMED'},blockers:draft.blockers}};
    const json=JSON.stringify(packageData);if(new Blob([json]).size>MAX_CATALOG)throw Error('Reviewer package exceeds the 80 MB export limit. Export separate files.');
    download('provisional-reviewer-package-v1.json',json,'application/json');status('Reviewer package exported with verified sources, provisional artifacts, hashes and release blockers. No official output released.');
  },true));
  $('import-review-package').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;event.target.value='';operation(async()=>{
    if(file.size>MAX_CATALOG)throw Error('Reviewer package exceeds 80 MB.');
    const data=JSON.parse(await file.text());
    if(!data||data.schemaVersion!==1||data.kind!=='provisional-reviewer-package'||data.official!==false||data.officialReleaseAllowed!==false||!Array.isArray(data.artifacts)||data.artifacts.length!==5)throw Error('Invalid provisional reviewer package.');
    const restored=await validatePackage(data.case);checkCancelled();
    const files=new Map();
    for(const artifact of data.artifacts){
      if(!artifact||typeof artifact.name!=='string'||files.has(artifact.name)||typeof artifact.text!=='string'||artifact.text.length>MAX_PACKAGE)throw Error('Invalid reviewer artifact.');
      const bytes=new TextEncoder().encode(artifact.text);if(bytes.length!==artifact.bytes||await hash(bytes)!==artifact.sha256)throw Error('Reviewer artifact integrity check failed.');files.set(artifact.name,artifact);
    }
    if(!files.has('report-layout-v1.json')||!files.has('proposed-evidence-graph-v1.json'))throw Error('Reviewer package lacks its layout or graph.');
    const layout=JSON.parse(files.get('report-layout-v1.json').text),graph=JSON.parse(files.get('proposed-evidence-graph-v1.json').text);
    API.validateGraph(graph,restored.sources);const draft=API.buildReview(restored),report=API.buildReport(restored,layout);
    const expected=new Map([['provisional-r1-draft.txt',draft.r1Draft],['provisional-bsrs-internal.json',JSON.stringify(draft.bsrs,null,2)],['provisional-case-report.html',API.renderReportHTML(report)]]);
    for(const [name,text]of expected)if(files.get(name)?.text!==text)throw Error('Reviewer artifact does not match rebuilt source evidence.');
    const sourceHashes=restored.sources.map(s=>({name:s.name,sha256:s.hash}));
    const artifactHashes=data.artifacts.map(a=>({name:a.name,bytes:a.bytes,sha256:a.sha256}));
    if(JSON.stringify(data.manifest?.sourceHashes)!==JSON.stringify(sourceHashes)||JSON.stringify(data.manifest?.artifactHashes)!==JSON.stringify(artifactHashes)||data.manifest?.validation?.officialRelease!=='BLOCKED'||data.manifest?.validation?.actuarialNumericalValidation!=='NOT_PERFORMED')throw Error('Reviewer manifest validation failed.');
    if(catalog.cases.some(c=>c.id===restored.id))restored.id=crypto.randomUUID();
    viewStates.set(restored.id,{layout,assertions:graph.edges.filter(e=>e.type==='user-link')});
    await commit({...catalog,activeId:restored.id,cases:[...catalog.cases,restored]});$('import-review-package').value='';status('Reviewer package restored. Original bytes, artifact hashes and rebuilt evidence verified. Official release stays blocked.');
  },true);});
  $('export-r1').addEventListener('click', () => operation(async () => { const data = buildReview(); download('provisional-r1-draft.txt',data.r1Draft,'text/plain;charset=utf-8'); status('Provisional R1 drafting aid exported. Not an official memo.'); }));
  $('export-bsrs').addEventListener('click', () => operation(async () => { const data = buildReview(); download('provisional-bsrs-internal.json',JSON.stringify(data.bsrs,null,2),'application/json'); status('Nonexecutable internal BSRS representation exported. Official syntax is unavailable.'); }));
  function currentLayout() {
    return {...reportLayout,title:$('report-title').value.trim(),sections:$('report-sections').value.split(',')};
  }
  function makeReport() {
    reportLayout = currentLayout();
    const report = API.buildReport(requireCase(),reportLayout);
    $('report-preview').replaceChildren(el('h3',report.title),el('p',`${report.inventory.length} sources; ${report.evidence.length} excerpts; ${report.timeline.length} explicit date annotations. Nonofficial report.`));
    if (report.inventory.length) {
      const table = document.createElement('table'), caption = el('caption','Source coverage'); table.append(caption);
      const head = document.createElement('thead'), row = document.createElement('tr');
      for (const text of ['Source','Records']) { const th=el('th',text); th.scope='col'; row.append(th); } head.append(row); table.append(head);
      const body = document.createElement('tbody');
      for (const source of report.inventory) { const tr=document.createElement('tr'); const count=source.recordCount??0;const cell=el('td',String(count));const meter=document.createElement('meter');meter.min=0;meter.max=Math.max(1,...report.inventory.map(s=>s.recordCount||0));meter.value=count;meter.setAttribute('aria-label',`${source.name}: ${count} records`);cell.append(document.createTextNode(' '),meter);tr.append(el('td',source.name||source.sourceRef),cell); body.append(tr); }
      table.append(body); $('report-preview').append(table);
    }
    return report;
  }
  $('add-timeline').addEventListener('click', () => operation(async () => {
    requireCase(); if (!selectedEvidence?.locator) throw Error('Select View evidence on a source record first.');
    const next = {...currentLayout(),timeline:[...reportLayout.timeline,{date:$('timeline-date').value,label:$('timeline-label').value.trim(),...selectedEvidence}]};
    API.buildReport(requireCase(),next); reportLayout=next;
    const item=el('li',`${next.timeline.at(-1).date}: ${next.timeline.at(-1).label} · Unverified annotation`); $('timeline-list').append(item); makeReport();
    status('Date annotation linked to the selected source record. Export the layout to keep it.');
  }));
  $('export-report').addEventListener('click', () => operation(async () => { download('provisional-case-report.html',API.renderReportHTML(makeReport()),'text/html;charset=utf-8'); status('Nonofficial source-linked report exported.'); }));
  $('export-csv').addEventListener('click', () => operation(async () => { download('source-inventory.csv',API.reportToCSV(makeReport(),'inventory'),'text/csv;charset=utf-8'); status('Inventory CSV exported with formula-prefix protection.'); }));
  $('export-layout').addEventListener('click', () => operation(async () => { const report=makeReport(); download('report-layout-v1.json',JSON.stringify(report.layout,null,2),'application/json'); status('Report layout and source-linked annotations exported.'); }));
  $('import-layout').addEventListener('change', event => { const file=event.target.files[0]; if(!file)return; operation(async () => {
    if(file.size>1024*1024)throw Error('Report layout exceeds 1 MB.');
    const next=JSON.parse(await file.text()); API.buildReport(requireCase(),next); reportLayout=next;
    $('report-title').value=next.title; $('report-sections').value=next.sections.join(',');
    if(!$('report-sections').value) { const option=new Option(next.sections.join(', '),next.sections.join(',')); $('report-sections').append(option); $('report-sections').value=option.value; }
    $('timeline-list').replaceChildren(...(next.timeline||[]).map(item=>el('li',`${item.date}: ${item.label} · Unverified annotation`))); makeReport(); $('import-layout').value=''; status('Report layout restored; annotations resolve to current source records.');
  }); });
  $('export-case').addEventListener('click', () => operation(async () => {
    const verified = await validatePackage(requireCase()); checkCancelled();
    const json = JSON.stringify(verified); if (new Blob([json]).size > MAX_PACKAGE) throw Error('Case package exceeds the export budget.');
    download('pbgc-rag-case-v1.json',json,'application/json'); status('Case package verified and exported. This is not an official artifact.');
  }, true));
  $('import-case').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return; event.target.value='';
    operation(async () => {
      if (file.size > MAX_PACKAGE) throw Error('Package exceeds the 40 MB limit.');
      const restored = await validatePackage(JSON.parse(await file.text())); checkCancelled();
      // A portable case never silently replaces another open case with the same identity.
      if (catalog.cases.some(c => c.id === restored.id)) restored.id = crypto.randomUUID();
      await commit({...catalog,activeId:restored.id,cases:[...catalog.cases,restored]});
      $('import-case').value = ''; status('Case restored. Original byte hashes verified; records rebuilt.');
    },true);
  });
  $('recover-previous').addEventListener('click', () => operation(async () => {
    if (!recovery) throw Error('Recovery storage is unavailable.');
    const previous = await recovery.load({previous:true}); if (!previous) throw Error('No previous recovery snapshot is available.');
    const checked = await validateCatalog(previous); checkCancelled();
    await commit(checked); status('Previous recovery snapshot restored and source hashes verified.');
  },true));
  $('export-catalog').addEventListener('click',()=>operation(async()=>{
    const checked=await validateCatalog(catalog);checkCancelled();download('pbgc-rag-workspaces-v2.json',JSON.stringify(checked),'application/json');status('All-workspace backup exported after source verification. Keep this plaintext file under approved storage controls.');
  },true));
  $('import-catalog').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;event.target.value='';operation(async()=>{
    if(file.size>MAX_CATALOG)throw Error('Workspace backup exceeds 80 MB.');const checked=await validateCatalog(JSON.parse(await file.text()));checkCancelled();
    if(!confirm('Replace local workspaces with this verified backup? Export current work first. The previous recovery snapshot will remain available if storage permits.'))return;
    viewStates.clear();await commit(checked,false);$('import-catalog').value='';status('All-workspace backup restored and original source hashes verified.');
  },true);});
  $('erase-recovery').addEventListener('click',()=>operation(async()=>{
    if(!confirm('Clear every local case, reference library and recovery snapshot in this browser? Export first. Exported files remain on disk.'))return;
    if(!recovery)throw Error('Recovery storage could not be opened. Use browser controls to clear its site data.');
    await recovery.clear();recoveryBlocked=false;catalog={schemaVersion:2,activeId:null,cases:[],library:null};viewStates.clear();render();
    $('storage').textContent='Local recovery cleared. New work will use the available recovery store.';status('Local workspaces and recovery snapshots cleared.');
  }));
  $('theme-toggle').addEventListener('click', () => {
    const light = document.body.classList.toggle('light'); $('theme-toggle').textContent = light ? 'Use dark theme' : 'Use light theme';
  });
  function route() {
    const help = location.hash === '#help'; $('help').hidden = !help; $('workspace').hidden = help;
    document.querySelectorAll('nav a').forEach(a => { if (a.hash === (help ? '#help' : '#workspace')) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  }
  addEventListener('hashchange',route); route();
  for (const text of [
    `SHA-256: ${globalThis.crypto?.subtle ? 'available' : 'unavailable — imports blocked'}`,
    `ZIP decompression: ${typeof DecompressionStream === 'function' ? 'native capability; format support checked on import' : 'unavailable — compressed Office files blocked'}`,
    `Isolated parsers: ${typeof Worker==='function'?'Blob-worker capability detected; policy checked on import':'workers unavailable — binary imports blocked'}`,
    `WebAssembly: ${typeof WebAssembly !== 'undefined' ? 'available; no semantic model loaded' : 'unavailable'}`,
    'Runtime network: blocked by content security policy',
    'Recovery is plaintext and best effort; keep portable exports'
  ]) $('capabilities').append(el('li',text));
  operation(async () => {
    try {
      recovery = await API.createRecoveryStore({maxCaseBytes:MAX_CATALOG});
      const info = recovery.info();
      $('storage').textContent = info.persistent ? `${info.kind} recovery available. Keep a portable backup.` : 'Memory only. Export your case before you close this tab.';
      const saved = await recovery.load();
      if (saved) { catalog = await validateCatalog(saved); status('Local recovery copy restored and verified.'); }
      render();
    } catch (error) {
      recoveryBlocked = true; $('storage').textContent = `Recovery unavailable: ${error.message} Current work will remain in memory. Export it before closing.`;
      status('Recovery validation failed. Restore a verified portable package or a previous snapshot.'); render();
    }
  });
})();
