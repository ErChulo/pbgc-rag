/* Offline question flow. Model files are never imported as case documents. */
(function(root){'use strict';const API=root.PBGCRag;
const DEFAULT_MODEL=API.BUNDLED_MODEL;
let runtimePromise;
function loadRuntime(){if(root.PBGCRagWllama)return Promise.resolve();if(!runtimePromise)runtimePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/local-llm/wllama-classic.js';script.onload=resolve;script.onerror=()=>{runtimePromise=null;script.remove();reject(Error('The bundled local generation runtime could not load.'));};document.head.append(script);});return runtimePromise;}
API.mountRag=function(host){const $=id=>document.getElementById(id),el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};let model=null,embedding=null,index=null,chunks=[],key='',scopeId;
function fingerprint(){const active=host.getWorkspace();return JSON.stringify([active?.id,(active?.sources||[]).map(source=>[source.id,source.hash,source.parserVersion,source.processing||null]),active?.workbench?.tableHeaders||[]]);}
function announce(state,message,extra={}){root.dispatchEvent(new CustomEvent('pbgc-model-state',{detail:{state,message,...extra}}));}
function modelStatus(){if(model&&!model.info().loaded)model=null;$('rag-model-status').textContent=model?`${model.info().model} loaded · local CPU processing`:'No model loaded. Source passages work without setup.';updateSetup();announce(model?'ready':'idle',model?'Qwen is ready. Continue to your documents.':'Qwen is not started. Click Start Qwen, or continue with source passages.');if($('rag-response-summary'))updateQuestions();}
function updateSetup(){const wasReady=!$('offline-ready').hidden;const ready=!!model?.info().loaded;if(wasReady&&!ready)$('model-setup').open=true;$('unload-rag-model').hidden=!ready;$('start-qwen-inline').hidden=ready;$('offline-ready').hidden=!ready;$('model-setup').querySelector('summary').textContent=ready?'Qwen assistant · Ready':'Qwen assistant · Not started';$('rag-answer-mode').options[1].textContent=ready?'Write an answer with sources':'Write an answer · setup required';}
let questionCount=1,sourceSelections=[null,null,null];
function sourceLabel(source){
 const sources=host.getWorkspace()?.sources||[];
 return sources.filter(item=>item.name===source.name).length>1?`${source.name} (document ${sources.findIndex(item=>item.id===source.id)+1})`:source.name;
}
function selectionText(i){const selection=sourceSelections[i-1];return selection?selection.label:'All documents';}
function refreshSourceChoices(){
 const sources=host.getWorkspace()?.sources||[];
 for(let i=1;i<=3;i++){
  const select=$('rag-source-'+i),selection=sourceSelections[i-1];select.replaceChildren();const all=el('option','All documents');all.value='';select.append(all);
  for(const source of sources){const option=el('option',sourceLabel(source));option.value=source.id;select.append(option);}
  if(selection){const current=sources.find(source=>source.id===selection.sourceId&&source.hash===selection.sourceHash);if(current)select.value=selection.sourceId;else{const stale=el('option','Selected document changed or is unavailable — choose again');stale.value='__unavailable__';stale.disabled=true;select.append(stale);select.value=stale.value;}}
  $('rag-source-options-'+i).hidden=sources.length<2&&!selection;
  $('rag-source-options-'+i).querySelector('summary').textContent='Documents: '+selectionText(i);
 }
}
function requestSignature(){return JSON.stringify([questionCount,$('rag-answer-mode').value,Array.from({length:questionCount},(_,index)=>[$('rag-question'+(index?'-'+(index+1):'')).value,$('rag-source-'+(index+1)).value,sourceSelections[index]?.sourceHash||null])]);}
function readQuestionScopes(){
 const sources=host.getWorkspace()?.sources||[];
 return Array.from({length:questionCount},(_,index)=>{
  const selection=sourceSelections[index],value=$('rag-source-'+(index+1)).value;
  if(!selection){if(value)throw Error('The selected document is unavailable. Choose it again.');return{};}
  if(value!==selection.sourceId||!sources.some(source=>source.id===selection.sourceId&&source.hash===selection.sourceHash))throw Error('The selected document changed or is no longer available. Choose it again.');
  return{sourceIds:[selection.sourceId]};
 });
}
for(let i=1;i<=3;i++)$('rag-source-'+i).addEventListener('change',()=>{
 const value=$('rag-source-'+i).value,source=host.getWorkspace()?.sources.find(item=>item.id===value);
 sourceSelections[i-1]=!value?null:source?{sourceId:source.id,sourceHash:source.hash,label:sourceLabel(source)}:{sourceId:value,sourceHash:null,label:'Unavailable document'};
 $('rag-source-options-'+i).querySelector('summary').textContent='Documents: '+selectionText(i);
 clearAnswer();$('rag-status').textContent='';
});
function searchSummary(searchedSources){
 const sources=host.getWorkspace()?.sources||[],indexedIds=new Set(index?.chunks.map(chunk=>chunk.sourceId)||[]);
 const searched=(searchedSources||[]).filter(source=>indexedIds.has(source.sourceId));
 const names=searched.map(item=>{const source=sources.find(value=>value.id===item.sourceId&&value.hash===item.sourceHash);return source?sourceLabel(source):item.sourceName;});
 if(names.length===1)return'Searched: '+names[0];
 if(names.length===sources.length)return`Searched: all ${names.length} documents`;
 return`Searched: ${names.length} of ${sources.length} documents with text available for questions`;
}
function currentSearchSources(){const seen=new Set();return(index?.chunks||[]).filter(chunk=>{if(seen.has(chunk.sourceId))return false;seen.add(chunk.sourceId);return true;}).map(chunk=>({sourceId:chunk.sourceId,sourceName:chunk.sourceName,sourceHash:chunk.sourceHash}));}
function requestStillCurrent(scopeKey,signature,signal){
 if(scopeKey!==fingerprint()||signal.aborted)return false;
 if(signature!==requestSignature()){clearAnswer();$('rag-status').textContent='The questions or document selection changed. Ask again.';return false;}
 return true;
}

function updateQuestions(){
 $('add-rag-question').hidden=questionCount===3;
 $('ask-question').textContent=questionCount===1?'Ask question':'Ask questions';
 const generated=$('rag-answer-mode').value==='generated';
 $('rag-response-summary').textContent=generated?'Qwen · Answers with sources, on this computer.':'Source passages · Qwen is not needed.';
 $('rag-time-help').textContent=generated?`Each answer can take up to two minutes. ${questionCount>1?'Questions run one at a time. ':''}You can cancel at any time.`:'Find related passages without starting Qwen.';
}
function clearAnswer(){$('rag-answer').replaceChildren();$('rag-citations').replaceChildren();$('rag-results-heading').hidden=true;$('first-answer-next').hidden=true;}
function resetQuestions(){questionCount=1;sourceSelections=[null,null,null];for(let i=1;i<=3;i++)$('rag-question'+(i===1?'':'-'+i)).value='';for(let i=2;i<=3;i++)$('rag-question-row-'+i).hidden=true;for(let i=1;i<=3;i++)$('rag-source-options-'+i).open=false;refreshSourceChoices();updateQuestions();}
$('add-rag-question').addEventListener('click',()=>{if(questionCount===3)return;questionCount++;$('rag-question-row-'+questionCount).hidden=false;clearAnswer();$('rag-status').textContent='';updateQuestions();$('rag-question-'+questionCount).focus();});
for(let i=2;i<=3;i++)$('remove-rag-question-'+i).addEventListener('click',()=>{
 if(i>questionCount)return;
 for(let n=i;n<questionCount;n++){$('rag-question-'+n).value=$('rag-question-'+(n+1)).value;sourceSelections[n-1]=sourceSelections[n];}
 $('rag-question-'+questionCount).value='';sourceSelections[questionCount-1]=null;$('rag-question-row-'+questionCount).hidden=true;questionCount--;refreshSourceChoices();
 clearAnswer();$('rag-status').textContent='';updateQuestions();$('rag-question'+(i<=questionCount?'-'+i:questionCount===1?'':'-'+questionCount)).focus();
});
for(let i=1;i<=3;i++)$('rag-question'+(i===1?'':'-'+i)).addEventListener('input',()=>{clearAnswer();$('rag-status').textContent='';});
function refresh(){const activeId=host.getWorkspace()?.id||null;if(activeId!==scopeId){resetQuestions();scopeId=activeId;}const next=fingerprint();if(next!==key){key=next;index=null;chunks=[];clearAnswer();refreshSourceChoices();$('rag-index-status').textContent='Documents are prepared when you ask your first question.';$('rag-status').textContent='';}modelStatus();updateQuestions();}
$('rag-model-files').addEventListener('change',()=>{const file=$('rag-model-files').files[0];$('model-selection').textContent=file?`Selected: ${file.name}. Click Load selected model to continue.`:'';});
$('rag-answer-mode').addEventListener('change',()=>{clearAnswer();$('rag-status').textContent='';updateQuestions();if($('rag-answer-mode').value==='generated'&&!model){$('model-setup').open=true;$('start-qwen-inline').focus();}});
function run(task){return host.operation(async()=>{$('cancel-operation').hidden=true;$('progress').hidden=true;$('rag-cancel').hidden=false;$('rag-cancel').disabled=false;try{await task(host.getSignal());}catch(error){$('rag-status').textContent=error.name==='AbortError'?'Cancelled. No new answer was released.':error.message;throw error;}finally{$('rag-cancel').hidden=true;modelStatus();}},true);}
$('rag-cancel').addEventListener('click',()=>host.cancel());
$('load-rag-model').addEventListener('click',()=>run(async signal=>{const files=Array.from($('rag-model-files').files);if(files.length!==1)throw Error('Select one local GGUF model file.');let manifest=DEFAULT_MODEL;const custom=$('rag-model-manifest').files[0];if(custom){if(custom.size>16384)throw Error('The model manifest exceeds 16 KB.');manifest=JSON.parse(await custom.text());}if(model){await model.dispose();model=null;}$('rag-status').textContent='Loading the local generation runtime…';await loadRuntime();model=await API.createLocalLlmProvider({files,manifest,signal,contextSize:2048,onProgress:progress=>{$('rag-status').textContent=progress.phase==='hashing'?'Checking the selected model file…':progress.phase==='ready'?'Local model ready.':'Loading the model into memory…';}});$('rag-answer-mode').value='generated';modelStatus();$('model-setup').open=false;$('model-selection').textContent='';requestAnimationFrame(()=>{if(!$('rag-question').disabled)$('rag-question').focus();});}));
async function startIncluded(event){const trigger=event.currentTarget;let failure;await run(async signal=>{try{
 announce('loading','Opening the included Qwen assistant…');const bundled=await API.loadBundledQwen({signal,onProgress:progress=>announce('loading',progress.message,progress)});
 if(model){await model.dispose();model=null;}await loadRuntime();model=await API.createLocalLlmProvider({modelBuffer:bundled.modelBuffer,manifest:bundled.manifest,signal,contextSize:2048,onProgress:progress=>announce('loading',progress.phase==='hashing'?'Checking the included assistant…':'Starting Qwen on this computer…')});
 $('rag-answer-mode').value='generated';$('rag-status').textContent='Qwen is ready. Ask a question about your documents.';modelStatus();$('model-setup').open=false;
 }catch(error){failure=error;throw error;}});if(failure){announce('error',failure.name==='AbortError'?'Setup cancelled. You can try again or continue with source passages.':failure.message);requestAnimationFrame(()=>{if(trigger.getClientRects().length&&!trigger.disabled)trigger.focus();});}else requestAnimationFrame(()=>{if($('rag-question').getClientRects().length&&!$('rag-question').disabled)$('rag-question').focus();});}
$('start-qwen').addEventListener('click',startIncluded);$('start-qwen-inline').addEventListener('click',startIncluded);
$('unload-rag-model').addEventListener('click',()=>run(async()=>{if(model)await model.dispose();model=null;clearAnswer();$('rag-status').textContent='Generation model unloaded.';}));
function fieldTable(citation){
 const table=el('table','');table.className='answer-table';table.append(el('caption',`Table values · ${citation.label||'Source'}`));const body=el('tbody','');
 for(const cell of [...citation.tableEvidence.identity,citation.tableEvidence.focus]){const row=el('tr',''),name=el('th',cell.columnName);name.scope='row';row.append(name,el('td',cell.rawText));body.append(row);}table.append(body);return table;
}
function appendAnswer(target,result,fallback){
 if(result.status!=='answered'||!result.citations.some(item=>item.evidenceKind==='table-field-v1')){const text=el('p',fallback||result.answer);text.className='question-answer';target.append(text);return;}
 for(const unit of result.answer.split('\n\n')){
  const source=result.citations.find(item=>item.evidenceKind==='table-field-v1'&&(item.quotes||[]).some(quote=>unit===quote+' ['+item.label+']'));
  if(source)target.append(fieldTable(source));else{const text=el('p',unit);text.className='question-answer';target.append(text);}
 }
}
function showCitations(citations,target=$('rag-citations')){target.replaceChildren();for(const citation of citations){const item=el('article','');item.className='rag-citation';const displayLocators=citation.primaryLocator?[citation.primaryLocator]:citation.locators||[],location=displayLocators.map(locator=>API.formatLocation(locator)).join('; ');if(citation.evidenceKind==='table-field-v1')item.append(el('p','Table values. Labels and values are copied from the saved cells.'));if((citation.locators||[]).some(locator=>locator.type==='pdf-ocr-line'))item.append(el('p','Machine-read source (OCR). Check the original page before using words or numbers.'));item.append(el('h3',`${citation.label||'Source'} · ${citation.sourceName}`),el('p',location),citation.evidenceKind==='table-field-v1'?fieldTable(citation):el('blockquote',citation.excerpt));const source=host.getWorkspace()?.sources.find(value=>value.id===citation.sourceId&&value.hash===citation.sourceHash);if(source){const button=el('button','View evidence');button.type='button';button.className='secondary';button.addEventListener('click',()=>{const current=host.getWorkspace()?.sources.find(value=>value.id===source.id&&value.hash===source.hash);if(!current)return;const recordIndex=API.findCitationRecordIndex(current.records,citation);if(recordIndex<0){$('rag-status').textContent='The cited passage is no longer available. Ask the question again.';return;}host.openSource(current,recordIndex);});item.append(button);}target.append(item);}}
function revealResults(){
 $('rag-results-heading').hidden=false;
 requestAnimationFrame(()=>{$('rag-results-heading').focus({preventScroll:true});$('rag-results-heading').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
}
function showQuestionResults(batch,generated){
 for(const entry of batch.results){
  const result=entry.result,card=el('article','');card.className='rag-question-result';
  card.append(el('h3',entry.question));const selection=el('p',searchSummary(entry.searchedSources));selection.className='question-source-scope';card.append(selection);
  const status=el('p',result.status==='conflict'?'Possible source conflict':!generated?'Source passages only':result.status==='answered'?'Answer with sources':'No supported answer');status.className='question-result-status';card.append(status);
  appendAnswer(card,result,!generated&&result.diagnostics?.reason==='generation-provider-unavailable'?'Read the related passages below.':undefined);
  const citations=result.citations.length?result.citations:result.retrieved;
  if(citations.length){const sources=el('details','');sources.className='question-sources';sources.open=!generated||result.status!=='answered';sources.append(el('summary',`Sources for this question (${citations.length})`));const list=el('div','');showCitations(citations,list);sources.append(list);card.append(sources);}
  $('rag-answer').append(card);
 }
 $('rag-status').textContent=!generated?`Source passages for ${batch.totalQuestions} questions. No answers were generated.`:batch.status==='answered'?`${batch.answeredCount} of ${batch.totalQuestions} questions answered with sources. Check each answer.`:`${batch.answeredCount} of ${batch.totalQuestions} questions answered. Review each result below.`;
}
$('ask-question').addEventListener('click',()=>run(async signal=>{
 refresh();clearAnswer();
 const active=host.getWorkspace(),questions=Array.from({length:questionCount},(_,i)=>$('rag-question'+(i===0?'':'-'+(i+1))).value.trim());
 if(!active?.sources.length)throw Error('Select a workspace and add source documents first.');
 if(questions.some(question=>!question))throw Error('Enter a question in each question box, or remove the empty box.');
 const questionScopes=readQuestionScopes(),sourceSet=scope=>(scope.sourceIds||active.sources.map(source=>source.id)).slice().sort().join('\n');
 const duplicateKeys=questions.map((question,index)=>JSON.stringify([question.normalize('NFKC').replace(/\s+/g,' ').toLowerCase(),sourceSet(questionScopes[index])]));
 if(new Set(duplicateKeys).size!==questions.length)throw Error('Use a different question in each question box.');
 modelStatus();const generated=$('rag-answer-mode').value==='generated';
 if(generated&&!model)throw Error('Start included Qwen above, or choose Show source passages to continue without setup.');
 const scopeKey=key,signature=requestSignature();$('rag-status').textContent='Preparing your documents…';
 if(!embedding)embedding=await API.createEmbeddingProvider({signal});
 if(!index){
  const corpus=await API.buildAnswerCorpus(active.sources,{signal,headers:active.workbench?.tableHeaders||[]});chunks=corpus.chunks;
  if(!chunks.length)throw Error(corpus.unconfiguredTables.length?'Open Documents and check the column names before asking about this table.':'No answer-ready text was found. Open Documents to check the file or use Search to read the source.');
  const usable=typeof embedding.coverage==='function'?chunks.filter(chunk=>embedding.coverage(chunk.text).embeddable):chunks;
  if(!usable.length)throw Error('These passages could not be prepared. Use Search to find words in your documents.');
  index=await API.buildSemanticIndex(usable,embedding,{signal,onProgress:progress=>{$('rag-status').textContent=`Preparing passages: ${progress.completed} of ${progress.total}`;}});
  $('rag-index-status').textContent=corpus.unconfiguredTables.length?'Some tables need column names. Open Documents to check them.':corpus.tableDiagnostics.some(item=>['unsupported-layout','excel-layout-unverified','word-table-unsupported'].includes(item.code))?'Some table layouts need source review. Use Search to inspect them.':'Your documents are ready for questions.';
 }
 if(!requestStillCurrent(scopeKey,signature,signal))return;
 for(let i=0;i<questions.length;i++)if(questionScopes[i].sourceIds&&!index.chunks.some(chunk=>questionScopes[i].sourceIds.includes(chunk.sourceId)))throw Error(`No searchable text was found in ${selectionText(i+1)}. Use Search or check the original file.`);
 const options={contextCharacters:2600,maxChunks:6,maxTokens:384,timeoutMs:120000,groundingMode:'synthesis'};
 if(questions.length===1&&!questionScopes[0].sourceIds){
  $('rag-status').textContent='Finding related passages…';const retrieval=await API.retrieveHybrid(index,questions[0],embedding,{signal,topK:6});
  if(!requestStillCurrent(scopeKey,signature,signal))return;
  modelStatus();$('rag-status').textContent=generated?'Drafting and checking the answer against its sources…':'Preparing source passages…';
  const result=await API.answerQuestion({question:questions[0],chunks,retrieval,provider:generated?{id:model.id,answerFormat:'auto-grounded-v2',generate:request=>model.generate(request)}:undefined,signal,options});
  if(!requestStillCurrent(scopeKey,signature,signal))return;
  const selection=el('p',searchSummary(currentSearchSources()));selection.className='question-source-scope';$('rag-answer').append(selection);
  appendAnswer($('rag-answer'),result,!generated&&result.diagnostics?.reason==='generation-provider-unavailable'?'Here are the source passages related to your question. Open the evidence to read more.':undefined);
  showCitations(result.citations.length?result.citations:result.retrieved);
  $('rag-status').textContent=result.status==='answered'?'Generated answer. Check each claim against its cited source.':result.status==='conflict'?'Possible source conflict. Review the excerpts.':generated?'No grounded answer was released.':'Source excerpts only. No answer was generated.';
 }else{
  const batch=await API.answerQuestions({questions,questionScopes,chunks,provider:generated?{id:model.id,answerFormat:'auto-grounded-v2',generate:request=>model.generate(request)}:undefined,signal,options,retrieve:({question,scope,searchedSources,signal})=>API.retrieveHybrid(index,question,embedding,{signal,topK:6,...(scope.sourceIds||scope.sourceHashes?{sourceIds:searchedSources.map(source=>source.sourceId)}:{})}),onProgress:progress=>{
   if(progress.phase==='complete')return;
   $('rag-status').textContent=`Question ${progress.index+1} of ${progress.total} · ${progress.phase==='retrieving'?'Finding related passages…':generated?'Drafting and checking the answer…':'Preparing source passages…'}`;
  }});
  if(!requestStillCurrent(scopeKey,signature,signal))return;
  showQuestionResults(batch,generated);
 }
 revealResults();
}));
refresh();return{refresh};};
})(globalThis);
