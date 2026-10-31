/* Human review controls. All imported or user-authored text stays inert. */
(function(root){'use strict';
  function mountCaseReview(host){
    const API=root.PBGCRag,$=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
    let editingId='',tables=[],activeId=null;
    const active=()=>{const value=host.getWorkspace();if(!value)throw Error('Select a workspace first.');return value;};
    const state=()=>host.getWorkspace()?.workbench||API.emptyWorkbench();
    const action=fn=>{
      const button=document.activeElement?.tagName==='BUTTON'?document.activeElement:null;
      let message=button?.nextElementSibling?.classList.contains('action-feedback')?button.nextElementSibling:null;
      if(button&&!message){message=el('p','');message.className='action-feedback';message.setAttribute('role','status');button.insertAdjacentElement('afterend',message);}
      if(message)message.textContent='Working…';
      return host.operation(async()=>{try{await fn();if(message)message.textContent=host.getStatus?.()||'Complete.';}catch(error){if(message){message.textContent=error.message||'The operation failed.';message.scrollIntoView({block:'nearest'});}throw error;}});
    };
    const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
    const canonical=value=>JSON.stringify(value,function(key,item){return item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item;});
    function setOptions(id,options,empty){const value=$(id).value;$(id).replaceChildren();if(empty!==undefined)$(id).append(new Option(empty,''));for(const [label,key]of options)$(id).append(new Option(label,key));if(options.some(x=>x[1]===value))$(id).value=value;}
    function preview(){const source=host.getWorkspace()?.sources.find(s=>s.id===$('annotation-source').value),index=Number($('annotation-record').value)-1,record=source?.records[index];$('annotation-record').max=source?.records.length||1;$('annotation-preview').textContent=record?`${API.formatLocation(record.locator)}\n${record.text.slice(0,700)}${record.text.length>700?'…':''}`:'Choose a valid source excerpt.';}
    function currentAnnotation(){return state().annotations.find(a=>a.id===editingId);}
    function populateAnnotation(){const annotation=currentAnnotation();$('annotation-select').value=annotation?.id||'';
      if(annotation){
        for(const [id,value]of Object.entries({'annotation-kind':annotation.kind,'annotation-subject':annotation.subject,'annotation-predicate':annotation.predicate,'annotation-value':annotation.value||'','annotation-authority':annotation.authority.label,'annotation-group':annotation.group||'','annotation-applicability':annotation.applicability,'annotation-from':annotation.validity.from||'','annotation-to':annotation.validity.to||''}))$(id).value=value;
        const ref=annotation.sources[0],source=active().sources.find(s=>s.hash===ref.sourceHash);if(source){$('annotation-source').value=source.id;const key=canonical(ref.locator);const index=source.records.findIndex(r=>canonical(r.locator)===key);if(index>=0)$('annotation-record').value=index+1;}
      }
      $('annotation-status').textContent=annotation?`Version ${annotation.version} · ${annotation.status==='reviewed'?'Reviewed content claim recorded':'Proposed — not reviewed'}`:'New observation. Save it before recording a review.';preview();
    }
    function refreshTables(){const workspace=host.getWorkspace();try{tables=workspace?API.buildTables(workspace.sources,{headers:workspace.workbench?.tableHeaders||[]}):[];setOptions('table-select',tables.map(t=>[`${t.sourceName} · ${t.name}`,t.id]));if(!$('table-query').value||activeId!==workspace?.id)setTableQuery();}catch(error){tables=[];$('table-select').replaceChildren();$('table-results').replaceChildren(el('p',error.message));}}
    function selectedTable(){const table=tables.find(t=>t.id===$('table-select').value);if(!table)throw Error('Choose a supported source table or sheet.');return table;}
    function setTableQuery(){const table=tables.find(t=>t.id===$('table-select').value);if(table)$('table-query').value=`SELECT * FROM "${table.name.replace(/"/g,'""')}" LIMIT 20`;}
    function resetPrivateForm(){
      for(const id of ['annotation-subject','annotation-predicate','annotation-value','annotation-authority','annotation-group','annotation-from','annotation-to','annotation-reviewer','annotation-review-date','reconcile-date','reconcile-group','dictionary-values','template-values'])$(id).value='';
      $('annotation-kind').value='fact';$('annotation-applicability').value='unknown';$('annotation-record').value=1;
    }
    function refresh(){const workspace=host.getWorkspace();$('review-case-context').textContent=workspace?`Active workspace: ${workspace.name} · ${workspace.sources.length} documents`:'Select a workspace to review its evidence.';
      if(activeId!==workspace?.id){editingId='';document.querySelectorAll('#case-review .action-feedback').forEach(n=>n.remove());resetPrivateForm();$('table-query').value='';$('table-results').replaceChildren();$('reconcile-results').replaceChildren();$('field-results').replaceChildren();}
      setOptions('annotation-source',(workspace?.sources||[]).map(s=>[s.name,s.id]));
      setOptions('annotation-select',(workspace?.workbench?.annotations||[]).map(a=>[`${a.subject} · ${a.predicate} · v${a.version} · ${a.status}`,a.id]),'New observation');
      setOptions('dictionary-source',(workspace?.sources||[]).filter(s=>['xlsx','xlsm'].includes(s.format)).map(s=>[s.name,s.id]));
      const dictionary=workspace?.workbench?.dictionary;$('dictionary-results').replaceChildren();
      if(dictionary){const source=workspace.sources.find(s=>s.hash===dictionary.source.hash);if(source)$('dictionary-source').value=source.id;for(const [id,value]of Object.entries({'dictionary-mode':dictionary.mapping.mode,'dictionary-sheet':dictionary.mapping.sheet,'dictionary-column':dictionary.mapping.column,'dictionary-header':dictionary.mapping.headerRow,'dictionary-version':dictionary.mapping.version}))$(id).value=value;
        $('dictionary-results').append(el('p',`${dictionary.fields.length} exact fields · ${dictionary.review.status==='reviewed'?'Mapping review recorded':'Proposed mapping'} · Official release blocked`));const list=document.createElement('ul');for(const field of dictionary.fields.slice(0,100))list.append(el('li',field.name));$('dictionary-results').append(list);
      }else $('dictionary-results').append(el('p','No dictionary mapped. Official field validation is unavailable.'));
      refreshTables();activeId=workspace?.id||null;populateAnnotation();
    }
    function readAnnotationDraft(){
      const workspace=active(),source=workspace.sources.find(s=>s.id===$('annotation-source').value),record=source?.records[Number($('annotation-record').value)-1];if(!record)throw Error('Choose a source excerpt.');
      const applicability=$('annotation-applicability').value,primary={sourceHash:source.hash,locator:record.locator},previous=currentAnnotation();
      const sources=previous?.sources.length?[primary,...previous.sources.slice(1)]:[primary];
      return {kind:$('annotation-kind').value,subject:$('annotation-subject').value.trim(),predicate:$('annotation-predicate').value.trim(),value:$('annotation-value').value.trim()||null,sources,authority:{label:$('annotation-authority').value.trim()||'unknown',reference:previous?.authority.reference||null},applicability,validity:{from:applicability==='period'?$('annotation-from').value||null:null,to:applicability==='period'?$('annotation-to').value||null:null},group:$('annotation-group').value.trim()||null};
    }
    $('annotation-source').addEventListener('change',()=>{$('annotation-record').value=1;preview();});$('annotation-record').addEventListener('input',preview);
    $('annotation-select').addEventListener('change',()=>{editingId=$('annotation-select').value;if(!editingId)resetPrivateForm();populateAnnotation();});
    $('save-annotation').addEventListener('click',()=>action(async()=>{
      const workspace=active(),input=readAnnotationDraft();
      const previous=currentAnnotation(),annotation=previous?API.updateEvidenceAnnotation(previous,input,workspace.sources):API.createEvidenceAnnotation({id:crypto.randomUUID(),...input},workspace.sources);
      editingId=annotation.id;const annotations=state().annotations.filter(a=>a.id!==annotation.id).concat(annotation);await host.updateWorkbench({annotations});populateAnnotation();host.status('Observation saved with its source. A prior review is invalid after an edit.');
    }));
    $('review-annotation').addEventListener('click',()=>action(async()=>{
      const annotation=currentAnnotation();if(!annotation)throw Error('Save and select an observation first.');
      // Persisted content, not unsaved form edits, is the exact version being reviewed.
      const draftChanged=API.evidenceContentKey({...annotation,...readAnnotationDraft()})!==API.evidenceContentKey(annotation);if(draftChanged)throw Error('Save your edits before reviewing the observation.');
      const reviewed=API.reviewEvidenceAnnotation(annotation,{reviewer:$('annotation-reviewer').value.trim(),at:$('annotation-review-date').value,version:annotation.version,contentKey:API.evidenceContentKey(annotation)},active().sources);
      await host.updateWorkbench({annotations:state().annotations.map(a=>a.id===reviewed.id?reviewed:a)});populateAnnotation();host.status('Review claim recorded for this exact version. No actuarial rule was activated.');
    }));
    $('reconcile-evidence').addEventListener('click',()=>action(async()=>{
      const result=API.reconcileEvidence(state().annotations,active().sources,{subject:$('annotation-subject').value.trim(),predicate:$('annotation-predicate').value.trim(),asOf:$('reconcile-date').value||undefined,group:$('reconcile-group').value.trim()||undefined});
      $('reconcile-results').replaceChildren(el('h4',result.status==='abstain'?'Insufficient evidence for a conclusion':'Reviewed observations agree within the selected scope'),el('p',result.reason));
      if(result.value!==null&&result.value!==undefined)$('reconcile-results').append(el('p',`Recorded value: ${result.value}`));
      $('reconcile-results').append(el('p',`${result.possibleConflicts.length} possible conflicts flagged. No legal priority was inferred.`));for(const warning of result.warnings)$('reconcile-results').append(el('p',warning));
    }));
    $('map-dictionary').addEventListener('click',()=>action(async()=>{
      const source=active().sources.find(s=>s.id===$('dictionary-source').value);if(!source)throw Error('Import and select the dictionary workbook first.');
      const dictionary=API.buildDictionary(source,{mode:$('dictionary-mode').value,sheet:$('dictionary-sheet').value,column:$('dictionary-column').value,headerRow:Number($('dictionary-header').value),version:$('dictionary-version').value});
      await host.updateWorkbench({dictionary});host.status('Exact field names mapped from source cells. Official release remains blocked.');
    }));
    $('review-dictionary').addEventListener('click',()=>action(async()=>{
      const dictionary=state().dictionary;if(!dictionary)throw Error('Map the dictionary first.');
      const chosenSource=active().sources.find(s=>s.id===$('dictionary-source').value);
      const draft=API.buildDictionary(chosenSource,{mode:$('dictionary-mode').value,sheet:$('dictionary-sheet').value,column:$('dictionary-column').value,headerRow:Number($('dictionary-header').value),lastRow:dictionary.mapping.lastRow,version:$('dictionary-version').value});
      if(draft.reviewBinding!==dictionary.reviewBinding)throw Error('Map your changed source or field settings before recording a review.');
      const source=active().sources.find(s=>s.hash===dictionary.source.hash);
      const reviewed=API.buildDictionary(source,{...dictionary.mapping,review:{status:'reviewed',reviewer:$('dictionary-reviewer').value.trim(),reviewedAt:new Date().toISOString(),binding:dictionary.reviewBinding}});
      await host.updateWorkbench({dictionary:reviewed});host.status('Mapping review recorded for the exact source and field map. Official validation remains unavailable.');
    }));
    $('validate-fields').addEventListener('click',()=>action(async()=>{
      const dictionary=state().dictionary;if(!dictionary)throw Error('Map a dictionary first.');if($('dictionary-values').value.length>1024*1024)throw Error('Field values exceed 1 MB.');
      const source=active().sources.find(s=>s.hash===dictionary.source.hash),result=API.validateFieldValues(dictionary,JSON.parse($('dictionary-values').value),{source});
      $('field-results').replaceChildren(el('h4',result.valid?'All field names match the selected dictionary':'Unknown field names found'),el('p',`${result.matchedFields.length} matched; ${result.unknownFields.length} unknown. Field values and official validity were not evaluated.`));if(result.unknownFields.length){const list=document.createElement('ul');for(const name of result.unknownFields)list.append(el('li',name));$('field-results').append(list);}host.status('Field names checked against the exact source map. Values were not interpreted.');
    }));
    $('table-select').addEventListener('change',setTableQuery);
    $('set-table-header').addEventListener('click',()=>action(async()=>{
      const table=selectedTable(),headers=state().tableHeaders.filter(h=>!(h.sourceId===table.sourceId&&h.tableName===table.name));
      if($('table-header').value)headers.push({sourceId:table.sourceId,tableName:table.name,headerRow:Number($('table-header').value)});
      API.buildTables(active().sources,{headers});await host.updateWorkbench({tableHeaders:headers});setTableQuery();host.status('Explicit table header mapping saved. Source values remain unchanged.');
    }));
    $('run-table-query').addEventListener('click',()=>action(async()=>{
      const result=API.queryTable(selectedTable(),$('table-query').value);$('table-results').replaceChildren(el('p',`${result.rows.length} rows`));
      const table=document.createElement('table'),head=document.createElement('thead'),row=document.createElement('tr');for(const column of result.columns){const th=el('th',typeof column==='string'?column:column.name);th.scope='col';row.append(th);}head.append(row);table.append(head);const body=document.createElement('tbody');
      for(const entry of result.rows.slice(0,200)){const tr=document.createElement('tr');for(const column of result.columns){const key=typeof column==='string'?column:column.name;const value=own(entry.values,key)?entry.values[key]:null;const td=el('td',value===null?'NULL':String(value));const ref=entry.evidence?.cells?.[key];if(ref){const details=document.createElement('details');details.append(el('summary','Source location'),el('p',API.formatLocation(ref.locator)));td.append(details);}tr.append(td);}body.append(tr);}table.append(body);$('table-results').append(table);host.status(result.rows.length>200?'Showing the first 200 rows. Refine the query.':'Read-only query complete. Source values were not changed.');
    }));
    $('render-template').addEventListener('click',()=>action(async()=>{
      const file=$('template-file').files[0],manifestFile=$('template-manifest').files[0];if(!file||!manifestFile)throw Error('Select the template and its explicit mapping file.');if(file.size>5*1024*1024||manifestFile.size>1024*1024||$('template-values').value.length>1024*1024)throw Error('Template or mapping exceeds the local size limit.');
      const result=await API.renderTemplateIsolated(new Uint8Array(await file.arrayBuffer()),JSON.parse(await manifestFile.text()),JSON.parse($('template-values').value));if(!result.validation.valid||result.official!==false)throw Error('Template output did not pass validation.');
      const manifest=JSON.parse(await manifestFile.text()),url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=`mapped-test-output.${manifest.format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('template-results').textContent='Mapped test output passed the configured structural and numerical checks. Official release remains blocked.';host.status($('template-results').textContent);
    }));
    return {refresh};
  }
  root.PBGCRag=Object.assign(root.PBGCRag||{},{mountCaseReview});
})(globalThis);
