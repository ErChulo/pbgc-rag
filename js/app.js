/* Offline application coordinator. All user content is rendered as text. */
(function () {
'use strict';
const P = globalThis.PBGC;
let active = null, memory = new Map(), storage = false, busy = false, caseStore = null, saveQueue = Promise.resolve(), pendingSaves = 0, initialized = false, damagedCases = [], recoveryCaseId = null, storeWritable = true, viewEpoch = 0, importController = null, importManifests = new Map(), referenceStore = null, libraries = new Map(), activeLibraryId = null, damagedLibraries = [], reindexSelection = null, opfsOpenPromise = null;
const $ = id => document.getElementById(id);
function el(tag, text, attrs = {}) { const n = document.createElement(tag); if (text != null) n.textContent = text; for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); return n; }
function add(parent, ...children) { children.flat().forEach(c => parent.append(c)); return parent; }
function button(text, action, cls) { const b = el('button', text, {type:'button'}); if(cls)b.className=cls; b.addEventListener('click', async () => { try { await action(); } catch(e){notice(e.message);} }); return b; }
function notice(text) { $('notice').textContent = text; }
function id() { return crypto.randomUUID ? crypto.randomUUID() : `case-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function makeCase(name) { return {schemaVersion:1,id:id(),name:name.trim(),createdAt:new Date().toISOString(),sources:[],graph:{nodes:[],edges:[]},rules:[],calculations:[]}; }
function checkName(name) { if(!name.trim() || name.length > 120) throw Error('Enter a case name of 1–120 characters.'); }
function persist() {
 if(!active)return; importManifests.delete(active.id); memory.set(active.id,active);
 if(caseStore && storeWritable){const snapshot=JSON.parse(JSON.stringify(active));pendingSaves++;saveQueue=saveQueue.then(()=>caseStore.put(snapshot)).catch(()=>{storeWritable=false;storage=false;notice('Browser storage could not save this revision. Export the active case now.');}).finally(()=>{pendingSaves--;status();});}
 status();
}
function commitCaseCandidate(candidate) {
 const validation = P.validateCase(candidate);
 if (!validation.valid) { notice(validation.errors.join(' ')); return false; }
 if (JSON.stringify(candidate).length > 32 * 1024 * 1024) { notice('Case exceeds the 32 MiB working limit. Export or use a separate case.'); return false; }
 active = candidate; persist(); return true;
}
function status(){ $('case-status').textContent=active?`${active.name} · ${active.sources.length} sources`:'No active case'; $('storage-status').textContent=pendingSaves?'Saving case checkpoint…':storage?'IndexedDB available · export for backup':'Memory only · export before closing'; }
function allRecords(){return active?active.sources.flatMap(s=>s.records):[];}
function requireCase(){if(active)return true;notice('Create or open a case first.');location.hash='case';return false;}
function input(label,idValue,type='text'){const wrap=el('div');const field=el('input',null,{id:idValue,type});add(wrap,el('label',label,{for:idValue}),field);return {wrap,field};}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a',null,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function heading(title, description){viewEpoch++;const v=$('view');v.removeAttribute('aria-busy');v.replaceChildren(el('h1',title,{id:'view-title'}));if(description)v.append(el('p',description));return v;}
function caseView(){const v=heading('Your case workspace','Keep each plan in its own case. Import only synthetic records in this cloud development environment.');
 const f=el('form');const name=input('Case name','case-name');name.field.required=true;name.field.maxLength=120;
 add(f,name.wrap,el('button','Create case',{type:'submit'}));f.addEventListener('submit',e=>{e.preventDefault();try{checkName(name.field.value);if(busy)throw Error('Wait for the import to finish.');active=makeCase(name.field.value);persist();render();notice('Case created. Import source files next.');}catch(e){notice(e.message);}});v.append(f);
 const list=el('div');for(const c of memory.values())list.append(add(el('div',null,{class:'actions'}),button(`Open ${c.name}`,()=>{if(busy)throw Error('Wait for import to finish.');active=c;status();render();}),button(`Checkpoints for ${c.name}`,()=>{recoveryCaseId=c.id;location.hash='recovery';render();},'secondary')));add(v,el('h2','Saved cases'),list);
 for(const damaged of damagedCases){
  const card=el('div',null,{class:'card blocked'});
  add(card,el('strong',`Damaged saved case: ${damaged.id||'unknown identity'}`),el('p',damaged.error));
  if(damaged.id)card.append(button(`Recover checkpoints for ${damaged.id}`,()=>{recoveryCaseId=damaged.id;location.hash='recovery';render();}));
  v.append(card);
 }
 const packageInput=input('Restore a portable case package','restore','file');packageInput.field.accept='.json';packageInput.field.addEventListener('change',async()=>{const file=packageInput.field.files[0];if(!file)return;if(busy){notice('Wait for the active operation to finish.');return;}busy=true;try{if(file.size>65*1024*1024)throw Error('Package exceeds the 65 MiB working-profile limit.');const c=await P.importCase(await file.text());if(!commitCaseCandidate(c))return;render();notice('Case integrity and schema verified.');}catch(e){notice(`Restore failed: ${e.message}`);}finally{busy=false;}});v.append(packageInput.wrap);
 const reviewerInput=input('Restore an internal reviewer ZIP','restore-reviewer-zip','file');reviewerInput.field.accept='.zip';
 reviewerInput.field.addEventListener('change',async()=>{
  const file=reviewerInput.field.files[0];if(!file)return;
  if(busy){notice('Wait for the active operation to finish.');return;}
  busy=true;
  try{
   if(file.size>128*1024*1024)throw Error('Reviewer ZIP exceeds the 128 MiB limit.');
   const verified=await P.verifyReviewBundle(new Uint8Array(await file.arrayBuffer()));
   if(!commitCaseCandidate(verified.caseData))return;
   render();notice('Internal reviewer ZIP verified and restored. Official release remains blocked.');
  }catch(error){notice(`Reviewer ZIP refused: ${error.message}`);}finally{busy=false;}
 });v.append(reviewerInput.wrap);
 v.append(button('Load synthetic demonstration',loadDemo,'secondary'));
 if(active)v.append(button('Delete active case from this browser',async()=>{if(busy)throw Error('Wait for the active operation to finish.');if(!confirm('Delete this case from browser storage? Export a backup first.'))return;busy=true;const target=active;try{await saveQueue;if(caseStore)await caseStore.remove(target.id);memory.delete(target.id);importManifests.delete(target.id);if(active===target)active=null;status();render();}catch{throw Error('Browser storage refused deletion. The case was kept.');}finally{busy=false;}},'secondary'));
}
async function recoveryView(){
 const v=heading('Verified checkpoints','Restore a verified checkpoint as a new revision. Damaged revisions remain available for diagnosis. Export a backup before you remove older history.');
 if(!caseStore || !recoveryCaseId){v.append(el('p','Choose a case from the Case step first.'));return;}
 const selectedId=recoveryCaseId, epoch=viewEpoch;
 await saveQueue;
 const inspected=await caseStore.inspectVersions(selectedId);
 if(location.hash!=='#recovery' || selectedId!==recoveryCaseId || epoch!==viewEpoch)return;
 for(const version of inspected.versions){
  const card=el('div',null,{class:'card'});
  add(card,el('strong',`Checkpoint ${version.revision} · ${version.name}`),el('p',`${version.sourceCount} sources · ${version.recordCount} records · ${version.updatedAt}`,{class:'small'}),button(`Restore checkpoint ${version.revision}`,async()=>{
   if(busy)throw Error('Wait for the active operation to finish.');
   busy=true;
   try{
    await saveQueue;
    const recovered=await caseStore.get(selectedId,version.revision);
    if(!recovered)throw Error('That checkpoint is no longer available.');
    await caseStore.put(recovered);
    storeWritable=true;storage=caseStore.mode==='indexeddb';
    active=recovered;importManifests.delete(recovered.id);memory.set(recovered.id,recovered);
    damagedCases=damagedCases.filter(c=>c.id!==recovered.id);
    status();location.hash='case';render();notice('Checkpoint verified and restored as a new revision.');
   }finally{busy=false;}
  }));v.append(card);
 }
 for(const damaged of inspected.damaged)v.append(el('p',`Checkpoint ${damaged.revision??'unknown'} is damaged: ${damaged.error}`,{class:'blocked'}));
 if(!inspected.versions.length)v.append(el('p','No verified checkpoints are available. Restore a portable case package.'));
 async function pruneTo(keepLast){
  if(busy)throw Error('Wait for the active operation to finish.');
  if(!confirm('Permanently remove older checkpoints? Export a verified case backup first. The current revision will remain.'))return;
  busy=true;
  try{
   await saveQueue;
   const latest=(await caseStore.scan()).cases.find(c=>c.id===selectedId);
   if(!latest)throw Error('Restore a verified checkpoint before pruning damaged current data.');
   const result=await caseStore.pruneHistory(selectedId,{keepLast,expectedRevision:latest.revision});
   storeWritable=true;storage=caseStore.mode==='indexeddb';
   if(active?.id===selectedId)persist();
   status();notice(`${result.removed} older checkpoints removed. Current data kept.`);
   recoveryView().catch(e=>notice(e.message));
  }finally{busy=false;}
 }
 const retained=inspected.versions.length+inspected.damaged.length;
 if(retained>3)v.append(button('Keep latest 3 checkpoints',()=>pruneTo(3),'secondary'));
 if(retained>1)v.append(button('Keep current checkpoint only',()=>pruneTo(1),'secondary'));
}
async function loadDemo(){if(busy)throw Error('Wait for import to finish.');busy=true;const target=makeCase('Synthetic training plan');try{const text='SYNTHETIC TRAINING DOCUMENT — NOT AN OFFICIAL PLAN\nNormal retirement age is 65 for this fictional example.\nAn amendment proposed age 67 effective January 1, 2030. Approval is unresolved.\nParticipant A has a synthetic monthly accrued benefit input of 1200.00.\nNo legal or actuarial determination is made.';
 const f=new File([text],'synthetic-plan.txt',{type:'text/plain'});target.sources.push(await P.parseFile(f));active=target;persist();location.hash='search';render();notice('Synthetic demonstration loaded.');}finally{busy=false;}}
async function backupsView() {
 const v=heading('Local recovery backups','Optional browser-local backups keep two generations per case. They are separate from case checkpoints, but can be lost with browser storage. Keep verified portable packages outside the browser.');
 const epoch=viewEpoch;v.setAttribute('aria-busy','true');
 const loading=el('p','Checking browser backup access…',{role:'status'});v.append(loading);
 let backups;
 try{
  if(!opfsOpenPromise)opfsOpenPromise=P.createOPFSBackupStore();
  backups=await opfsOpenPromise;
  if(epoch!==viewEpoch)return;
  if(!backups.available){loading.textContent=`Local backups unavailable: ${backups.reason}`;v.append(el('p','Use Report and export to download a verified case package. Case checkpoints and deterministic search remain available.'));v.append(button('Retry browser backup access',()=>{opfsOpenPromise=null;render();},'secondary'));return;}
  loading.textContent=backups.writable?'Browser backup storage is available. Every save is verified by reading it back.':`Backup storage is read-only: ${backups.reason}`;
  if(active){
   const save=button('Save active case recovery backup (keeps two)',async()=>{
    if(busy)throw Error('Wait for the active operation to finish.');
    busy=true;
    try{await saveQueue;const snapshot=JSON.parse(JSON.stringify(active));const saved=await backups.save(snapshot);notice(`Verified local backup generation ${saved.generation} saved for ${snapshot.name}. Keep a portable export too.`);render();}finally{busy=false;}
   });save.disabled=!backups.writable;v.append(save);
  }else v.append(el('p','Create or open a case to save a new backup.'));
  const listing=await backups.list();
  if(epoch!==viewEpoch)return;
  if(!listing.cases.length)v.append(el('p','No verified local case backups are present.'));
  for(const c of listing.cases){
   const card=el('div',null,{class:'card'});add(card,el('h2',c.name),el('p',`Case ${c.caseId} · ${c.status}`,{class:'meta'}));
   for(const generation of c.generations){
    const restore=button(`Restore local backup ${c.name} generation ${generation.generation}`,async()=>{
     if(busy)throw Error('Wait for the active operation to finish.');
     busy=true;
     try{
      const restored=await backups.restore(c.caseId,{generation:generation.generation});
      if(!restored)throw Error('This verified backup is no longer available.');
      const existing=memory.get(c.caseId);
      if(existing&&JSON.stringify(existing)!==JSON.stringify(restored.caseData)&&!confirm('Restore this backup as a new case checkpoint? Existing checkpoint history will remain.'))return;
      if(!commitCaseCandidate(restored.caseData))return;
      await saveQueue;
      notice(storeWritable?`Verified backup generation ${restored.generation} restored as a case checkpoint.${restored.recoveredFromDamage?' Another backup slot is damaged and has been kept.':''}`:'Verified backup restored in memory only. Export a portable package before closing.');
      location.hash='case';
     }finally{busy=false;}
    });restore.disabled=c.status==='conflict';
    add(card,el('p',`Generation ${generation.generation} · ${generation.savedAt}`,{class:'small'}),restore);
   }
   const remove=button(`Remove local backups for ${c.name}`,async()=>{
    if(busy)throw Error('Wait for the active operation to finish.');
    if(!confirm('Delete both local backup slots for this case? The active case and normal checkpoint history will remain.'))return;
    busy=true;
    try{const removed=await backups.remove(c.caseId);notice(`${removed.removedSlots} local backup slots removed. Case checkpoints were kept.`);render();}finally{busy=false;}
   },'secondary');remove.disabled=!backups.writable;card.append(remove);v.append(card);
  }
  if(active && !listing.cases.some(c=>c.caseId===active.id) && listing.damaged.length){
   const selected={id:active.id,name:active.name};
   const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(selected.id)))),b=>b.toString(16).padStart(2,'0')).join('');
   if(epoch!==viewEpoch)return;
   if(listing.damaged.some(d=>d.caseKey===key)){
    const clear=button('Remove damaged backups for active case',async()=>{
     if(busy)throw Error('Wait for the active operation to finish.');
     if(!confirm(`Delete the damaged local backup slots for ${selected.name}? Keep a portable export first. The active case and normal checkpoints will remain.`))return;
     busy=true;
     try{const removed=await backups.remove(selected.id);notice(`${removed.removedSlots} damaged local backup slots removed. The active case and checkpoints were kept.`);render();}finally{busy=false;}
    },'secondary');clear.disabled=!backups.writable;v.append(clear);
   }
  }
  for(const damaged of listing.damaged)v.append(el('p',`Damaged backup ${damaged.caseKey}, slot ${damaged.slot}: ${damaged.reason}`,{class:'blocked'}));
  for(const conflict of listing.conflicts)v.append(el('p',`Conflicting backup ${conflict.caseKey}: ${conflict.reason}. No generation will be chosen automatically.`,{class:'blocked'}));
  if(listing.ignoredEntries.length)v.append(el('p',`${listing.ignoredEntries.length} unrelated storage entries were left untouched.`,{class:'small'}));
 }catch(error){if(epoch===viewEpoch)loading.textContent=`Local backup access failed: ${error.message}. Portable case exports remain available.`;}finally{if(epoch===viewEpoch)v.removeAttribute('aria-busy');}
}
function libraryView() {
 const v = heading('Reference libraries', 'Keep authorized shared references separate from case records. Copy selected sources into a case explicitly; later library changes never rewrite that case.');
 const epoch = viewEpoch;
 const create = el('form'), name = input('Reference library name', 'library-name');
 name.field.required = true; name.field.maxLength = 120;
 add(create, name.wrap, el('button', 'Create reference library', { type: 'submit' }));
 create.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) { notice('Wait for the active operation to finish.'); return; }
  busy = true;
  try {
   checkName(name.field.value);
   const library = P.createReferenceLibrary({ id: `library-${id()}`, name: name.field.value.trim() });
   await referenceStore.put(library); libraries.set(library.id, library); activeLibraryId = library.id;
   render(); notice('Separate reference library created. Export a portable backup after adding references.');
  } catch (error) { notice(error.message); } finally { busy = false; }
 });
 v.append(create);
 for (const library of libraries.values()) v.append(button(`Open reference library ${library.name}`, () => {
  if (busy) throw Error('Wait for the active operation to finish.');
  activeLibraryId = library.id; render();
 }, 'secondary'));
 const consent = el('input', null, { id: 'reference-consent', type: 'checkbox' });
 add(v, el('label', 'I may share these references. They contain no confidential case records.', { for: 'reference-consent' }), consent);
 const restore = input('Restore a reference library package', 'restore-library', 'file');
 restore.field.accept = '.json';
 restore.field.addEventListener('change', async () => {
  const selected = restore.field.files[0]; if (!selected) return;
  if (busy) { notice('Wait for the active operation to finish.'); return; }
  if (!consent.checked) { notice('Confirm that these are authorized reference documents first.'); return; }
  busy = true;
  try {
   if (selected.size > 49 * 1024 * 1024) throw Error('Reference package exceeds the 49 MiB limit.');
   const library = await P.importReferenceLibrary(await selected.text());
   const existing = libraries.get(library.id);
   if (existing && JSON.stringify(existing) !== JSON.stringify(library) && !confirm('This package replaces the current library snapshot. Stored checkpoints will remain. Continue?')) return;
   await referenceStore.put(library); libraries.set(library.id, library); activeLibraryId = library.id;
   render(); notice('Reference library schema and original-byte integrity verified.');
  } catch (error) { notice(`Reference restore refused: ${error.message}`); } finally { busy = false; }
 });
 v.append(restore.wrap);
 for (const damaged of damagedLibraries) v.append(el('p', `Reference library ${damaged.id || 'unknown'} needs recovery: ${damaged.error}. Restore a verified library package.`, { class: 'blocked' }));
 const library = libraries.get(activeLibraryId);
 if (!library) { v.append(el('p', 'Create or restore a separate reference library.')); return; }
 add(v, el('h2', library.name), el('p', `Reference revision ${library.revision} · ${library.sources.length} sources · ${referenceStore.mode === 'indexeddb' ? 'Separate IndexedDB storage; keep a portable backup.' : 'Memory only; export before closing.'}`, { class: 'small' }));
 const edition = input('Reference version label', 'reference-version');
 edition.field.value = `Reference edition ${library.revision + 1}`; edition.field.maxLength = 120;
 const files = input('Select authorized reference originals', 'reference-originals', 'file'); files.field.multiple = true;
 add(v, edition.wrap, files.wrap);
 v.append(button('Add originals to reference library', async () => {
  if (busy) throw Error('Wait for the active operation to finish.');
  if (!consent.checked) throw Error('Confirm that these are authorized reference documents first.');
  const selected = Array.from(files.field.files);
  if (!selected.length || selected.length > 100) throw Error('Select 1–100 reference originals.');
  if (selected.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) throw Error('Add at most 16 MiB of original reference bytes per batch.');
  busy = true;
  try {
   const sources = [], errors = [];
   for (const file of selected) {
    notice(`Reading reference original: ${file.name}`);
    try { sources.push(await P.parseFile(file)); } catch (error) { errors.push(`${file.name}: ${error.message}`); }
   }
   if (sources.length) {
    const next = await P.addLibrarySources(library, sources, { versionLabel: edition.field.value });
    await referenceStore.put(next); libraries.set(next.id, next);
   }
   if (epoch === viewEpoch) render();
   notice(`${sources.length} reference files processed. ${errors.join(' · ')}`);
  } finally { busy = false; }
 }));
 const selectedIds = new Set();
 for (const source of library.sources) {
  const checkId = `reference-source-${source.hash}`, checkbox = el('input', null, { id: checkId, type: 'checkbox' });
  checkbox.addEventListener('change', () => { if (checkbox.checked) selectedIds.add(source.id); else selectedIds.delete(source.id); });
  const card = el('div', null, { class: 'card' });
  add(card, el('label', `Select reference ${source.name}`, { for: checkId }), checkbox, el('p', `${source.records.length} records · SHA-256 ${source.hash}`, { class: 'meta' })); v.append(card);
 }
 v.append(button('Copy selected references into active case', async () => {
  if (busy) throw Error('Wait for the active operation to finish.');
  if (!active) throw Error('Create or open a case first.');
  if (!selectedIds.size) throw Error('Select at least one reference source.');
  busy = true;
  try {
   const updated = await P.copyReferenceSources(active, library, Array.from(selectedIds));
   if (JSON.stringify(updated).length > 32 * 1024 * 1024) throw Error('The case exceeds the 32 MiB working limit.');
   active = updated; persist(); await saveQueue;
   notice(`Selected references copied into ${updated.name}. Library revision ${library.revision} is pinned; no case rules or approvals were copied.`);
  } finally { busy = false; }
 }));
 v.append(button('Export verified reference library', async () => {
  const encoded = await P.exportReferenceLibrary(library);
  await P.importReferenceLibrary(encoded);
  download(`pbgc-reference-${library.id}-r${library.revision}.json`, encoded);
  notice('Reference package verified and downloaded. Case packages remain separate.');
 }, 'secondary'));
 const history = el('details'); history.append(el('summary', 'Reference edition history'));
 for (const version of library.revisions) history.append(el('p', `Revision ${version.revision} · ${version.versionLabel} · ${version.sourceIds.length} sources`));
 v.append(history);
}
function importView() {
 if (!requireCase()) return;
 const v = heading('Import original documents', 'Original bytes and precise supported locators stay with the case. Completed files form verified checkpoints. Re-select files to resume; unchanged bytes are skipped.');
 const epoch = viewEpoch, targetId = active.id;
 const file = input('Select source files', 'sources', 'file');
 file.field.multiple = true;
 const folder = input('Select a source folder (where supported)', 'source-folder', 'file');
 folder.field.multiple = true;
 folder.field.setAttribute('webkitdirectory', '');
 file.field.addEventListener('change', () => { folder.field.value = ''; });
 folder.field.addEventListener('change', () => { file.field.value = ''; });
 const resume = el('input', null, { id: 'resume-import', type: 'checkbox' });
 const resumeStatus = el('p', 'Checking saved import checkpoint…', { class: 'small' });
 const progress = el('progress', null, { max: '1', value: '0', 'aria-label': 'File import progress' });
 const details = el('p', '', { class: 'small' });
 add(v, file.wrap, folder.wrap, el('label', 'Resume the verified import checkpoint', { for: 'resume-import' }), resume, resumeStatus, progress, details);
 const cancel = button('Cancel import', () => {
  importController?.abort(); notice('Import will stop after the current file.');
 }, 'secondary');
 cancel.disabled = true;
 const start = button('Import and index', async () => {
  if (busy) throw Error('An operation is already running.');
  const selected = Array.from(folder.field.files.length ? folder.field.files : file.field.files);
  if (!selected.length) throw Error('Select files first.');
  const target = active;
  if (target.id !== targetId) throw Error('The selected case changed. Open Import again.');
  busy = true; importController = new AbortController();
  $('cancel-active-import').hidden = false; start.disabled = true; cancel.disabled = false;
  progress.max = selected.length; progress.value = 0;
  let result, failure;
  try {
   await saveQueue;
   result = await P.importFiles(target, selected, {
    signal: importController.signal,
    ...(resume.checked && importManifests.has(targetId) ? { previousManifest: importManifests.get(targetId) } : {}),
    onProgress(event) {
     progress.value = event.processed;
     details.textContent = event.file ? `${event.stage}: ${event.file.relativePath}` : `${event.imported} imported · ${event.skipped} unchanged · ${event.rejected} rejected`;
    },
    async onCheckpoint(checkpoint) {
     active = checkpoint.caseData;
     memory.set(targetId, active);
     importManifests.set(targetId, checkpoint.manifest);
     if (caseStore && storeWritable) {
      pendingSaves++; status();
      try { await caseStore.put(checkpoint.caseData, { importManifest: checkpoint.manifest }); }
      catch (error) { storeWritable = false; storage = false; throw error; }
      finally { pendingSaves--; status(); }
     }
     status();
    }
   });
  } catch (error) {
   result = error.result; failure = error;
  } finally {
   if (result) {
    active = result.caseData; memory.set(targetId, active); importManifests.set(targetId, result.manifest);
    details.textContent = `${result.imported} files imported. ${result.errors.map(e => `${e.name}: ${e.message}`).join(' · ')}`;
   }
   busy = false; importController = null; $('cancel-active-import').hidden = true;
   start.disabled = false; cancel.disabled = true; status();
   if (failure) notice(`Import stopped: ${failure.message}. Completed memory state is retained; export a backup. Checkpoint persistence may be unconfirmed.`);
   else notice(result.cancelled ? 'Import cancelled. Completed sources were saved.' : `${result.imported} files imported. ${result.skipped + result.errors.length} skipped or rejected.`);
   if (location.hash === '#import' && epoch === viewEpoch) sourceTable(v);
  }
 });
 start.disabled = true;
 add(v, add(el('div', null, { class: 'actions' }), start, cancel));
 const restoreManifest = input('Restore a separate import checkpoint manifest', 'restore-import-manifest', 'file');
 restoreManifest.field.accept = '.json';
 restoreManifest.field.addEventListener('change', async () => {
  const selected = restoreManifest.field.files[0]; if (!selected) return;
  if (busy) { notice('Wait for the active operation to finish.'); return; }
  busy = true;
  try {
   if (selected.size > 3 * 1024 * 1024) throw Error('Import manifest exceeds limits.');
   const parsed = JSON.parse(await selected.text());
   const verified = await P.importFiles(active, [], { previousManifest: parsed });
   await saveQueue;
   if (caseStore && storeWritable) await caseStore.put(verified.caseData, { importManifest: verified.manifest });
   importManifests.set(targetId, verified.manifest);
   notice('Import checkpoint matches this exact case snapshot. Select files to resume.');
   render();
  } catch (error) { notice(`Checkpoint refused: ${error.message}`); }
  finally { busy = false; }
 });
 add(v, restoreManifest.wrap, button('Export import checkpoint manifest', () => {
  const manifest = importManifests.get(targetId);
  if (!manifest) throw Error('No import checkpoint is available.');
  download(`pbgc-import-${targetId}.json`, JSON.stringify(manifest));
  notice('Save the matching case package too. The manifest must remain separate from the case it verifies.');
 }, 'secondary'));
 sourceTable(v);
 (async () => {
  if (!importManifests.has(targetId) && caseStore) {
   await saveQueue;
   const saved = await caseStore.getImportCheckpoint(targetId);
   if (saved) importManifests.set(targetId, saved);
  }
  const saved = importManifests.get(targetId);
  resume.checked = !!saved;
  resumeStatus.textContent = saved ? `Checkpoint ${saved.checkpoint} available. Actual source hashes will be checked again.` : 'New import session. Folder selection uses relative paths only; manual file selection remains available.';
 })().catch(error => { resumeStatus.textContent = `Saved checkpoint unavailable: ${error.message}. Start a new import or restore a verified manifest.`; })
 .finally(() => { if (epoch === viewEpoch) start.disabled = false; });
}
async function reindexView() {
 if (!requireCase()) return;
 const v = heading('Review source reindex', 'Reparse retained originals with the current local parser. Originals never change. Existing citations must map uniquely by exact text, locator and structured fields. This is a technical parser review, not an actuarial approval.');
 const epoch = viewEpoch;
 if (!reindexSelection || reindexSelection.caseId !== active.id) {
  v.append(el('p', 'Choose Review parser update beside a source in the Import step.')); return;
 }
 if (busy) { v.append(el('p', 'Wait for the active operation to finish, then reopen this review.')); return; }
 const selectedIds = [...reindexSelection.sourceIds], target = active;
 let preview;
 busy = true;
 const working = el('p', 'Verifying originals and preparing the current-parser comparison…', { role: 'status' });
 v.append(working);
 try { await saveQueue; preview = await P.reindexSources(target, selectedIds, { apply: false }); }
 catch (error) { if (epoch === viewEpoch) working.textContent = error.message; return; }
 finally { busy = false; }
 if (epoch !== viewEpoch || active !== target) return;
 working.textContent = `Parser review status: ${preview.status}. No case changes have been applied.`;
 const summary = { changes: preview.changes, unresolved: preview.unresolved.slice(0, 100), recordMappings: preview.recordMappings.slice(0, 100) };
 const encoded = JSON.stringify(summary, null, 2);
 v.append(el('pre', encoded.slice(0, 40000)));
 if (encoded.length > 40000 || preview.recordMappings.length > 100 || preview.unresolved.length > 100) v.append(el('p', 'The on-screen comparison is abbreviated. The apply operation still verifies the complete plan.', { class: 'small' }));
 add(v, el('p', `Original case hash: ${preview.caseHash}`, { class: 'meta' }), el('p', `Parser plan hash: ${preview.planHash}`, { class: 'meta' }));
 if (preview.status === 'blocked') {
  v.append(el('p', 'Update blocked: cited evidence is missing, ambiguous or changed. Keep the current parser output and review the original citations. No automatic substitution is permitted.', { class: 'blocked' }));
 } else if (preview.status === 'unchanged') {
  v.append(el('p', 'This source already matches the current parser. No reindex checkpoint is needed.'));
 } else {
  const reviewed = el('input', null, { id: 'review-reindex', type: 'checkbox' });
  add(v, el('label', 'I reviewed the parser changes and exact citation mappings.', { for: 'review-reindex' }), reviewed);
  v.append(button('Apply reviewed parser update', async () => {
   if (busy) throw Error('Wait for the active operation to finish.');
   if (!reviewed.checked) throw Error('Review the comparison and confirm the technical update first.');
   busy = true;
   const current = active;
   try {
    await saveQueue;
    const applied = await P.reindexSources(current, selectedIds, { apply: true, reviewed: true, expectedCaseHash: preview.caseHash, expectedPlanHash: preview.planHash });
    if (active !== current) throw Error('The active case changed. Reopen the parser review.');
    if (!applied.applied) { notice('The current parser output is unchanged.'); return; }
    if (!commitCaseCandidate(applied.candidateCase)) return;
    await saveQueue;
    location.hash = 'import';
    notice(storeWritable ? 'Parser update applied with exact citation mappings. Original bytes and existing approvals remain unchanged.' : 'Parser update applied in memory only. Export a verified backup before closing.');
   } finally { busy = false; }
  }));
 }
 v.append(el('a', 'Return to source inventory', { href: '#import' }));
}
function sourceTable(v){v.querySelector('#source-table')?.remove();const box=el('div',null,{id:'source-table'});box.append(el('h2','Source inventory'));if(!active.sources.length)box.append(el('p','No sources yet.'));for(const s of active.sources){const card=el('div',null,{class:'card'});add(card,el('strong',s.name),el('p',`${s.format} · ${s.records.length} records · ${s.size} bytes`,{class:'small'}),el('p',`SHA-256 ${s.hash}`,{class:'meta'}),button(`Review parser update for ${s.name}`,()=>{if(busy)throw Error('Wait for the active operation to finish.');reindexSelection={caseId:active.id,sourceIds:[s.id]};location.hash='reindex';},'secondary'),button('Save original bytes',()=>{const bytes=Uint8Array.from(atob(s.originalBase64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes]));const a=el('a',null,{href:url,download:s.name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},'secondary'));if(s.format==='pdf' && s.records[0]?.fields.pagesWithoutNativeText?.length)card.append(el('p',`No native text on pages ${s.records[0].fields.pagesWithoutNativeText.join(', ')}. These pages need OCR and are not searchable. Original bytes remain intact.`,{class:'blocked'}));if(s.referenceOrigin)card.append(el('p',`Reference library ${s.referenceOrigin.libraryId} · pinned revision ${s.referenceOrigin.revision} · ${s.referenceOrigin.versionLabel}`,{class:'meta'}));box.append(card);}v.append(box);}
function recordPreview(text, query, focusTerms) {
 const box=el('div');
 if(text.length<=6000){box.append(el('p',text));return box;}
 const lower=text.toLocaleLowerCase(), terms=(focusTerms || query.trim().split(/\s+/)).filter(Boolean).slice().sort((a,b)=>b.length-a.length);
 const found=terms.map(term=>lower.indexOf(term.toLocaleLowerCase())).find(index=>index>=0);
 const start=Math.max(0,(found??0)-200),end=Math.min(text.length,start+6000);
 add(box,el('p',text.slice(start,end)),el('p',`Showing parsed record characters ${start+1}–${end} of ${text.length}. The source locator applies to the full record.`,{class:'small'}));
 const more=el('details');more.append(el('summary',`Show full parsed record (${text.length} characters)`));
 more.addEventListener('toggle',()=>{if(more.open&&!more.querySelector('pre'))more.append(el('pre',text));});
 box.append(more);return box;
}
function searchRecordDetails(record,reason){
 const details=el('details');
 add(details,el('summary','Source details'),el('p',reason,{class:'meta'}),el('p',`Record ID: ${record.id}`,{class:'meta'}));
 return details;
}
function evidenceGraphAction(record) {
 const group=el('div'), feedback=el('p','',{role:'status'});
 const link=el('a','View this evidence in graph',{href:'#graph',hidden:''});
 const action=button('Add to evidence graph',()=>{
  try {
   if(busy)throw Error('Wait for the active operation to finish.');
   const exists=active.graph.nodes.some(n=>n.sourceId===record.sourceId&&n.recordId===record.id);
   if(!exists){
    if(active.graph.nodes.some(n=>n.id===record.id))throw Error('A different graph node uses this record ID.');
    const candidate={...active,graph:{...active.graph,nodes:[...active.graph.nodes,{id:record.id,type:'evidence',label:record.text.slice(0,100),sourceId:record.sourceId,recordId:record.id,locator:record.locator}]}};
    if(!commitCaseCandidate(candidate))throw Error($('notice').textContent||'Case validation failed.');
   }
   feedback.textContent=exists?'Already in evidence graph.':'Added to evidence graph.';
   link.hidden=false;
   notice(feedback.textContent);
  }catch(error){feedback.textContent=`Could not add evidence: ${error.message}`;notice(feedback.textContent);}
  group.scrollIntoView({block:'nearest'});
 },'secondary');
 add(group,action,feedback,link);return group;
}
function searchView(){if(!requireCase())return;const v=heading('Search source evidence','Search the source text. Each result shows its source and location.');const f=el('form'),q=input('Search text or query','query');q.field.required=true;
 const mode=el('select',null,{id:'mode'});for(const [value,label]of [['keyword','Keywords'],['exact','Exact text'],['question','Question (source excerpts)'],['regex','Bounded regex'],['sql','Read-only SQL']])mode.append(el('option',label,{value}));add(f,q.wrap,el('label','Search mode',{for:'mode'}),mode,el('button','Search',{type:'submit'}));const scope=el('select',null,{id:'search-source'});scope.append(el('option','All case sources',{value:''}));for(const source of active.sources)scope.append(el('option',source.name,{value:source.id}));f.insertBefore(el('label','Source scope',{for:'search-source'}),f.lastChild);f.insertBefore(scope,f.lastChild);const result=el('div',null,{id:'results','aria-live':'polite'});f.addEventListener('submit',e=>{e.preventDefault();result.replaceChildren();try{const records=scope.value?active.sources.find(s=>s.id===scope.value).records:allRecords();if(mode.value==='sql'){const rows=P.querySQL(records,q.field.value);const serialized=JSON.stringify(rows,null,2);result.append(el('pre',serialized.slice(0,50000)));if(serialized.length>50000){result.append(el('p',`Showing the first 50,000 characters of ${rows.length} query rows. The complete result is available as JSON.`,{class:'small'}));result.append(button('Download complete SQL result',()=>download('query-results.json',serialized),'secondary'));}return;}let hits;
if(mode.value==='question'){
 const scoped={schemaVersion:1,id:active.id,name:active.name,createdAt:active.createdAt,sources:scope.value?active.sources.filter(s=>s.id===scope.value):active.sources,graph:{nodes:[],edges:[]},rules:[],calculations:[]};
 const evidence=P.retrieveQuestionEvidence(scoped,q.field.value);
 result.append(el('p',evidence.notice));
 result.append(el('p',`Retrieval status: ${evidence.status}. Missing terms: ${evidence.missingTerms.join(', ')||'none'}. No answer or determination is generated.`,{class:'small'}));
 hits=evidence.citations.map(c=>({record:records.find(r=>r.id===c.recordId),score:c.score,focusTerms:c.matchedTerms,reason:`Lexical question tokens matched: ${c.matchedTerms.join(', ')}`}));
 result.append(el('p',`${hits.length} source excerpts`));
}else{hits=P.search(records,q.field.value,mode.value);result.append(el('p',`${hits.length} results`));}for(const hit of hits.slice(0,100)){const r=hit.record,s=active.sources.find(s=>s.id===r.sourceId);const card=el('article',null,{class:'result'});add(card,el('h2',s?.name||r.sourceId),el('p',r.locator.label,{class:'meta'}),recordPreview(r.text,q.field.value,hit.focusTerms),searchRecordDetails(r,hit.reason),evidenceGraphAction(r));result.append(card);}}catch(e){result.append(el('p',e.message,{class:'blocked'}));}});add(v,f,result,el('p','Use Help for the supported SQL and regex syntax.',{class:'small'}));}
function graphView(){if(!requireCase())return;const v=heading('Evidence graph','Add source evidence from search. Links express research claims and require review; a link is not an approved interpretation.');
 const diagram=el('div',null,{id:'evidence-diagram'}),selectedEvidence=el('div',null,{id:'selected-graph-evidence',role:'status'});add(v,diagram,selectedEvidence);P.renderEvidenceGraph(diagram,active.graph,{onSelect:nodeId=>{selectedEvidence.replaceChildren();const node=active.graph.nodes.find(n=>n.id===nodeId);const source=active.sources.find(s=>s.id===node?.sourceId),record=source?.records.find(r=>r.id===node?.recordId);if(!record){selectedEvidence.append(el('p','This node has no current-case source evidence attached.'));return;}add(selectedEvidence,el('h2',source.name),el('p',record.text),el('p',`${record.locator.label} · SHA-256 ${source.hash}`,{class:'meta'}),el('code',JSON.stringify(record.locator)));}});const nodes=active.graph.nodes;const f=el('form');const from=el('select',null,{id:'from'}),to=el('select',null,{id:'to'});for(const n of nodes){from.append(el('option',n.label||n.id,{value:n.id}));to.append(el('option',n.label||n.id,{value:n.id}));}const type=el('select',null,{id:'edge-type'});for(const t of ['supports','contradicts','amends','appliesTo'])type.append(el('option',t,{value:t}));const edgeFrom=input('Link valid from (optional)','edge-valid-from','date'),edgeTo=input('Link valid to (optional)','edge-valid-to','date');add(f,el('label','From evidence',{for:'from'}),from,el('label','Link type',{for:'edge-type'}),type,el('label','To evidence',{for:'to'}),to,edgeFrom.wrap,edgeTo.wrap,el('button','Add proposed link',{type:'submit'}));f.addEventListener('submit',e=>{e.preventDefault();if(busy){notice('Wait for the active operation to finish.');return;}if(!from.value||!to.value||from.value===to.value){notice('Choose two different evidence nodes.');return;}const selectedFrom=nodes.find(n=>n.id===from.value);if(!selectedFrom?.recordId || !selectedFrom.sourceId){notice('Choose a starting node linked to source evidence.');return;}const edge={id:id(),from:from.value,to:to.value,type:type.value,sourceId:selectedFrom.sourceId,recordId:selectedFrom.recordId,status:'proposed',...(edgeFrom.field.value?{validFrom:edgeFrom.field.value}:{}),...(edgeTo.field.value?{validTo:edgeTo.field.value}:{})};if(commitCaseCandidate({...active,graph:{...active.graph,edges:[...active.graph.edges,edge]}}))render();});v.append(f);
 const queryForm=el('form'),startNode=el('select',null,{id:'graph-start'});for(const n of nodes)startNode.append(el('option',n.label||n.id,{value:n.id}));const depth=input('Maximum hops (0–8)','graph-depth','number');depth.field.value='2';depth.field.min='0';depth.field.max='8';const asOf=input('Applicable date (optional)','graph-date','date');const traversal=el('pre','No traversal run.');add(queryForm,el('label','Start evidence',{for:'graph-start'}),startNode,depth.wrap,asOf.wrap,el('button','Trace linked evidence',{type:'submit'}));queryForm.addEventListener('submit',e=>{e.preventDefault();try{const result=P.queryGraph(active.graph,{startId:startNode.value,maxDepth:Number(depth.field.value),...(asOf.field.value?{asOf:asOf.field.value}:{}),limit:100});traversal.textContent=JSON.stringify(result,null,2);}catch(e){traversal.textContent=e.message;}});add(v,el('h2','Bounded graph query'),queryForm,traversal);for(const n of nodes)v.append(el('p',`${n.id}: ${n.label}`));for(const e of active.graph.edges)v.append(el('p',`${e.from} → ${e.type} → ${e.to} [proposed]`,{class:'meta'}));if(!nodes.length)v.append(el('p','No graph nodes. Add evidence from search.'));
}
function rulesView(){if(!requireCase())return;const v=heading('Rule review and calculation gates','Documentary facts, proposed interpretations, and calculations remain separate. This build cannot approve official actuarial rules.');v.append(el('p','BLOCKED: the approved field dictionary, authoritative actuarial reference results, and human interpretation approval are not supplied.',{class:'blocked'}));const f=el('form'),title=input('Proposed rule title','rule-title'),evidence=el('select',null,{id:'rule-evidence'});for(const r of allRecords())evidence.append(el('option',`${r.locator.label}: ${r.text.slice(0,60)}`,{value:r.id}));const effective=input('Effective date (proposed applicability)','rule-effective','date');effective.field.required=true;const desc=el('textarea',null,{id:'rule-description',maxlength:'4000'});title.field.required=true;title.field.maxLength=300;desc.required=true;add(f,title.wrap,effective.wrap,el('label','Source evidence',{for:'rule-evidence'}),evidence,el('label','Proposed interpretation (requires human review)',{for:'rule-description'}),desc,el('button','Save proposal',{type:'submit'}));f.addEventListener('submit',e=>{e.preventDefault();if(busy){notice('Wait for the active operation to finish.');return;}if(!evidence.value){notice('Import source evidence first.');return;}try{const next={...active,rules:[...active.rules]};P.proposeRule(next,{id:id(),title:title.field.value,interpretation:desc.value,effectiveDate:effective.field.value,sourceRecordIds:[evidence.value]});if(!commitCaseCandidate(next))return;render();notice('Proposal saved. It is not active.');}catch(e){notice(e.message);}});v.append(f);for(const r of active.rules)v.append(el('div',`${r.title} · ${r.status}\n${r.interpretation}`,{class:'card'}));appendClaims(v);
}
function appendClaims(v){
 add(v,el('h2','Structured claim review'),el('p','Record source-backed claims with an internal label. Screening flags different values with overlapping dates. It does not decide legal priority.'));
 const f=el('form'),subject=input('Claim subject','claim-subject'),group=input('Applicable group','claim-group'),value=input('Claim value','claim-value');subject.field.required=true;group.field.required=true;value.field.required=true;
 const predicate=el('select',null,{id:'claim-predicate'});for(const term of P.ontology.terms)predicate.append(el('option',term.label,{value:term.id}));
 const evidence=el('select',null,{id:'claim-evidence'});for(const r of allRecords())evidence.append(el('option',`${r.locator.label}: ${r.text.slice(0,80)}`,{value:r.id}));
 const from=input('Claim valid from (optional)','claim-from','date'),to=input('Claim valid to (optional)','claim-to','date');
 add(f,subject.wrap,group.wrap,el('label','Internal predicate label',{for:'claim-predicate'}),predicate,value.wrap,from.wrap,to.wrap,el('label','Claim source evidence',{for:'claim-evidence'}),evidence,el('button','Add claim and screen conflicts',{type:'submit'}));
 f.addEventListener('submit',e=>{e.preventDefault();try{if(busy)throw Error('Wait for the active operation to finish.');const claim={id:id(),caseId:active.id,kind:'provision',subjectId:subject.field.value,predicate:predicate.value,group:group.field.value,value:value.field.value,sourceRecordIds:[evidence.value],...(from.field.value?{validFrom:from.field.value}:{}),...(to.field.value?{validTo:to.field.value}:{})};const candidate=[...(active.claims||[]),claim];P.detectConflicts(active,candidate);if(!commitCaseCandidate({...active,claims:candidate}))return;render();notice('Claim saved. Conflict flags require authorized review.');}catch(e){notice(e.message);}});
 v.append(f);try{const screening=P.detectConflicts(active,active.claims||[]);v.append(el('pre',JSON.stringify(screening,null,2)));}catch(e){v.append(el('p',e.message,{class:'blocked'}));}
}
function reportView(){if(!requireCase())return;const v=heading('Report, validate, and export','Export a portable package with original bytes and integrity checks. Reports are research drafts. Official release is blocked.');const validation=P.validateCase(active);v.append(el('p',validation.valid?'Internal case schema: PASS':'Internal case schema: FAIL',{class:'badge'}));for(const e of [...validation.errors,...validation.warnings])v.append(el('p',typeof e==='string'?e:JSON.stringify(e),{class:'small'}));const report=P.buildReport(active);v.append(el('h2','Internal review draft'));v.append(el('p',report.disclaimer));const evidenceBox=el('details');evidenceBox.append(el('summary','Source evidence and precise citations'));for(const source of active.sources){evidenceBox.append(el('h2',source.name));for(const r of source.records.slice(0,200)){add(evidenceBox,el('p',r.text),el('p',`${r.locator.label} · SHA-256 ${source.hash} · ${r.id}`,{class:'meta'}));}if(source.records.length>200)evidenceBox.append(el('p','Display limited to 200 records. The exported report retains every record.'));}v.append(evidenceBox);const timeline=el('div');timeline.append(el('h2','Proposed applicability timeline'));for(const r of [...active.rules].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)))timeline.append(el('p',`${r.effectiveDate} · ${r.title} · ${r.status}`));if(!active.rules.length)timeline.append(el('p','No proposed effective dates.'));v.append(timeline);const machine=el('details');add(machine,el('summary','Inspect machine-readable report'),el('pre',JSON.stringify(report,null,2)));v.append(machine);const actions=el('div',null,{class:'actions'});add(actions,button('Export verified case package',async()=>{if(busy)throw Error('Wait for import to finish.');const target=JSON.parse(JSON.stringify(active));const text=await P.exportCase(target);await P.importCase(text);download(`pbgc-case-${target.id}.json`,text);notice('Package verified and downloaded.');}),button('Export internal research report',()=>download('internal-research-draft.json',JSON.stringify(report,null,2)),'secondary'),button('Export readable review HTML',()=>download('internal-review.html',P.renderResearchReport(active,{layout:'review'}),'text/html'),'secondary'),button('Export evidence layout HTML',()=>download('internal-evidence.html',P.renderResearchReport(active,{layout:'evidence'}),'text/html'),'secondary'),button('Export verified internal reviewer ZIP',async()=>{
 if(busy)throw Error('Wait for the active operation to finish.');
 const snapshot=JSON.parse(JSON.stringify(active));
 const bundle=await P.createReviewBundle(snapshot,{layout:'review'});
 await P.verifyReviewBundle(bundle.bytes);
 const name=snapshot.id.replace(/[^a-z0-9_-]/gi,'_').slice(0,64);
 download(`internal-review-${name}.zip`,bundle.bytes,'application/zip');
 notice('Internal reviewer ZIP verified and downloaded: case, reports, original bytes and checksums. Official release remains blocked.');
},'secondary'));v.append(actions);v.append(el('p','Official R1, BSRS, R5, DEL, PF, V1, and 436 outputs: BLOCKED. No official formats are fabricated.',{class:'blocked'}));}
function helpView(){const v=heading('Search and evidence guide','Pension Benefit Guaranty Corporation (PBGC) terminology does not imply this tool has agency approval.');for(const [h,p]of [['Offline use','Open index.html directly. No web server is needed. All scripts and styles are local. The content policy blocks network connections. Browser storage may differ between file locations; export a backup.'],['Question retrieval','Use Question mode for a natural-language question. It returns source excerpts ranked by exact normalized words, with missing terms and full/partial/insufficient lexical coverage. It uses no model, does not resolve legal priority, and does not generate an answer.'],['Search','Keyword search ranks matching records. Exact mode finds literal phrases. Regex supports only a bounded safe subset; complex or unsafe expressions are rejected. No semantic model is bundled.'],['SQL','Only the documented read-only subset is available. Start with SELECT * FROM records LIMIT 20. Mutation, joins and arbitrary expressions are rejected.'],['Evidence','Locators refer to parsed records, not invented document positions. Save original bytes from the source inventory. Graph links remain proposed claims.'],['Formats','The current parser registry determines supported formats. Unsupported formats fail with an explicit error. Macros, scripts, and embedded HTML never execute.'],['Actuarial use','A proposal is not a rule approval. No official field names or actuarial equivalence are inferred. Official templates, field dictionary, BSRS syntax, and independent reference results are required for official validation.'],['Recovery','Export the case package. Restore verifies schema and integrity. Integrity detects corruption; it does not prove authorship. Keep source documents and backups in an approved local location.']])add(v,el('h2',h),el('p',p));const capability=el('pre','Checking local capabilities…');add(v,el('h2','Measured browser capabilities'),capability);P.inspectCapabilities().then(result=>{capability.textContent=JSON.stringify(result,null,2);}).catch(e=>{capability.textContent=e.message;});}
function render(focusWorkspace=true){if(!initialized){heading('Opening the local workspace','Wait for the storage check to finish.');return;}const route=location.hash.slice(1)||'case';document.querySelectorAll('nav a').forEach(a=>{if(a.hash===`#${route}`)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});try{const outcome=({case:caseView,import:importView,search:searchView,graph:graphView,rules:rulesView,report:reportView,recovery:recoveryView,reindex:reindexView,backups:backupsView,library:libraryView,help:helpView}[route]||caseView)();if(outcome&&typeof outcome.catch==='function')outcome.catch(e=>notice(e.message));if(focusWorkspace){$('main').focus({preventScroll:true});$('main').scrollIntoView({block:'start'});}}catch(e){notice(`Cannot open this step: ${e.message}`);}}
async function initialize(){
 heading('Opening the local workspace','Checking browser storage and portable recovery support.');
 try{caseStore=await P.createCaseStore();storage=caseStore.mode==='indexeddb';const scan=await caseStore.scan();damagedCases=scan.damaged;for(const meta of scan.cases){const c=await caseStore.get(meta.id);if(c)memory.set(c.id,c);}if(damagedCases.length)notice('Some saved cases need recovery. Healthy cases remain available.');}
 catch(e){storage=false;notice(`Stored cases could not be opened: ${e.message}. Restore a verified package.`);}
 try{referenceStore=await P.createReferenceStore();const scan=await referenceStore.scan();damagedLibraries=scan.damaged;for(const meta of scan.cases){const library=await referenceStore.get(meta.id);if(library)libraries.set(library.id,library);}}
 catch(error){notice(`Reference libraries could not be opened: ${error.message}. Case storage remains separate.`);}
 initialized=true;status();render(false);
}
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();$('main').focus({preventScroll:true});$('main').scrollIntoView({block:'start'});});
$('cancel-active-import').addEventListener('click',()=>{importController?.abort();notice('Import will stop after the current file.');});
$('theme').addEventListener('click',()=>{const light=document.body.classList.toggle('light');$('theme').textContent=light?'Use dark theme':'Use light theme';});window.addEventListener('hashchange',()=>render());window.addEventListener('beforeunload',e=>{if((active&&(!storage||pendingSaves))||(referenceStore?.mode==='memory'&&libraries.size)){e.preventDefault();e.returnValue='';}});initialize();
})();
