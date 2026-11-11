/* Explicit column-name setup. Source values remain unchanged. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const API=()=>typeof module==='object'&&module.exports?require('./table-query.js'):root.PBGCRag;
function tableGuideModels(workspace){
 if(!workspace)return [];
 const headers=workspace.workbench?.tableHeaders||[],tables=API().buildTables(workspace.sources,{headers:[]});
 // Validate saved choices as well; a stale choice must never become an inferred one.
 const configured=API().buildTables(workspace.sources,{headers});
 return tables.filter(table=>['excel-cells','delimited-cells'].includes(table.kind)).map(table=>{
  const actual=configured.find(item=>item.sourceId===table.sourceId&&item.name===table.name),rows=new Map();
  for(const item of table.rows){const row=item.values.row;if(!rows.has(row))rows.set(row,[]);rows.get(row).push({column:item.values.column,text:item.values.text,formula:item.values.formula!==null});}
  return {workspaceId:workspace.id,sourceId:table.sourceId,sourceName:table.sourceName,sourceHash:table.sourceHash,tableName:table.name,kind:table.kind,headerRow:actual?.headerRow||null,columnNames:actual?.headerRow?actual.columns.map(column=>column.name):[],rows:[...rows].sort((a,b)=>a[0]-b[0]).map(([row,cells])=>({row,cells:cells.sort((a,b)=>a.column-b.column)}))};
 });
}
function tableHeaderPatch(workspace,selection){
 if(!workspace||!selection||workspace.id!==selection.workspaceId)throw Error('The case changed. Check the column names again.');
 const model=tableGuideModels(workspace).find(item=>item.sourceId===selection.sourceId&&item.tableName===selection.tableName);
 if(!model||model.sourceHash!==selection.sourceHash)throw Error('The document changed. Check the column names again.');
 if(!Number.isInteger(selection.headerRow)||selection.headerRow<1||selection.headerRow>1048576)throw Error('Enter a valid row number.');
 const tableHeaders=(workspace.workbench?.tableHeaders||[]).filter(item=>!(item.sourceId===model.sourceId&&item.tableName===model.tableName)).map(item=>({...item}));
 tableHeaders.push({sourceId:model.sourceId,tableName:model.tableName,headerRow:selection.headerRow});
 API().buildTables(workspace.sources,{headers:tableHeaders});
 return {tableHeaders};
}
function mountTableGuide(host){
 const doc=root.document,container=doc.getElementById('table-reading-guide');
 if(!container)return {refresh(){}};
 const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 let signature='',selectedKey='',models=[],selectionVersion=0;
 const key=model=>JSON.stringify([model.sourceId,model.tableName]);
 function refresh(){
  const workspace=host.getWorkspace(),next=JSON.stringify([workspace?.id,(workspace?.sources||[]).map(source=>[source.id,source.hash,source.parserVersion,source.processing||null]),workspace?.workbench?.tableHeaders||[]]);
  if(next===signature)return;signature=next;selectionVersion++;container.replaceChildren();
  try{models=tableGuideModels(workspace);}catch(error){container.hidden=false;container.append(el('p','Could not read the column names. '+error.message));return;}
  container.hidden=!models.length;if(!models.length)return;
  container.append(el('h3','Check column names'),el('p','Choose the row that contains column names. This helps answers use the right cells.'));
  const picker=el('select'),label=el('label','Sheet or table');picker.id='table-guide-select';label.htmlFor=picker.id;
  for(const model of models){const option=el('option',model.sourceName+(model.tableName!==model.sourceName?' · '+model.tableName:'')+(model.headerRow?' · Ready':''));option.value=key(model);picker.append(option);}
  if(!models.some(model=>key(model)===selectedKey))selectedKey=key(models.find(model=>!model.headerRow)||models[0]);picker.value=selectedKey;
  const content=el('div');container.append(label,picker,content);
  function show(){
   selectedKey=picker.value;selectionVersion++;content.replaceChildren();const model=models.find(item=>key(item)===selectedKey);if(!model)return;
   if(model.headerRow)content.append(el('p','Column names saved from row '+model.headerRow+': '+model.columnNames.join(', ')+'.'));
   const rowLabel=el('label',model.headerRow?'Change the column-name row':'Row with column names'),rowInput=el('input');rowInput.type='number';rowInput.min='1';rowInput.max='1048576';rowInput.step='1';rowInput.id='table-guide-header-row';rowLabel.htmlFor=rowInput.id;rowInput.value=String(model.headerRow||model.rows[0]?.row||1);
   const preview=el('div'),feedback=el('p'),save=el('button','Use this row as column names');save.type='button';save.className='secondary';save.id='table-guide-confirm';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
   function updatePreview(){
    selectionVersion++;preview.replaceChildren();feedback.textContent='';const wanted=Number(rowInput.value),candidate=model.rows.find(item=>item.row===wanted);save.disabled=!Number.isInteger(wanted)||!candidate;
    if(save.disabled){feedback.textContent='Enter a row that is in this sheet or table.';return;}
    const showing=model.rows.filter(item=>item.row>=wanted).slice(0,4),columns=[...new Set(showing.flatMap(item=>item.cells.map(cell=>cell.column)))].sort((a,b)=>a-b).slice(0,8),table=el('table'),caption=el('caption','Preview of row '+wanted+' and the next rows'),head=el('thead'),heading=el('tr'),body=el('tbody');
    const rowHeading=el('th','Row');rowHeading.scope='col';heading.append(rowHeading);for(const column of columns){const th=el('th','Column '+column);th.scope='col';heading.append(th);}head.append(heading);
    for(const item of showing){const tr=el('tr'),th=el('th',String(item.row)+(item.row===wanted?' (column names)':''));th.scope='row';tr.append(th);for(const column of columns){const cell=item.cells.find(cell=>cell.column===column),text=cell?.text||'',td=el('td',text.length>200?text.slice(0,200)+'…':text);if(cell?.formula)td.append(el('span',' (formula)'));tr.append(td);}body.append(tr);}
    table.append(caption,head,body);preview.append(table);if(model.rows.some(item=>item.cells.some(cell=>!columns.includes(cell.column))))preview.append(el('p','Preview shows the first eight columns. All columns are checked when you save.'));
   }
   rowInput.addEventListener('input',updatePreview);
   save.addEventListener('click',()=>{
    const choice={workspaceId:model.workspaceId,sourceId:model.sourceId,sourceHash:model.sourceHash,tableName:model.tableName,headerRow:Number(rowInput.value)},version=selectionVersion;save.disabled=true;feedback.textContent='Checking column names…';
    const pending=host.operation(async()=>{
     try{if(version!==selectionVersion)throw Error('The selection changed. Check the column names again.');const patch=tableHeaderPatch(host.getWorkspace(),choice);await host.updateWorkbench(patch);host.status?.('Column names saved. You can ask a question about this table.');signature='';refresh();}
     catch(error){feedback.textContent=error.message||'Could not save column names.';save.disabled=false;throw error;}
    });
    // The host reports operation errors; retain the nearby message when it rejects.
    if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
   });
   if(model.headerRow){const change=el('details');change.append(el('summary','Change column names'),rowLabel,rowInput,preview,save,feedback);content.append(change);}else content.append(rowLabel,rowInput,preview,save,feedback);updatePreview();
  }
  picker.addEventListener('change',show);show();
 }
 return {refresh};
}
return {tableGuideModels,tableHeaderPatch,mountTableGuide};
});
