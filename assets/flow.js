/* First-run wizard and task-focused workspace. No document processing here. */
(function(root){'use strict';root.PBGCRag=root.PBGCRag||{};
root.PBGCRag.mountFlow=function(host){
 const $=id=>document.getElementById(id),names=['case','documents','ask','search','save'];
 let selected='welcome',guided=true,sample=false,expanded=false,previousId=null,active=null,busy=false,pendingFocus=false,ready=false,sampleCreated=false;
 const hints={case:'Create a case, or continue one you already opened.',documents:'Choose your documents. Then continue to your first question.',ask:'Ask a question. Open the source to check each answer.',search:'Find a specific word or passage in this case.',save:'Save a case file so you can reopen your work later.'};
 function paint(){
  $('guide').dataset.step=selected;$('welcome').hidden=selected!=='welcome';$('panel-qwen').hidden=selected!=='qwen';
  $('workspace-shell').hidden=['welcome','qwen'].includes(selected);
  for(const name of names){$('panel-'+name).hidden=!expanded&&name!==selected;const button=$('flow-'+name);if(!expanded&&name===selected)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
  document.body.classList.toggle('is-guided',guided);$('guide-banner').hidden=!guided||selected==='welcome';$('guide-back').hidden=!guided||selected==='welcome';$('guide-skip').hidden=!guided;
  const steps=['qwen','documents','ask'],index=steps.indexOf(selected);$('guide-step-text').textContent=`Step ${Math.max(1,index+1)} of 3 · ${selected==='ask'?'Your first answer':selected==='documents'?'Add documents':'Start Qwen'}`;
  steps.forEach((step,i)=>{const node=$('guide-dot-'+step);node.classList.toggle('complete',i<index);if(i===index)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
  $('all-tools').setAttribute('aria-pressed',String(expanded));$('all-tools').textContent=expanded?'Return to guided view':'Show all tools';$('flow-hint').textContent=expanded?'All workspace tools are shown.':hints[selected]||'';
  $('guide-case-context').hidden=!guided||!active||!['documents','ask'].includes(selected);$('guide-case-context').textContent=active?`Case: ${active.name}`:'';const count=active?.sources.length||0;$('flow-context').textContent=active?`${active.name} · ${count} ${count===1?'document':'documents'}`:'Start a case to keep your documents together.';
  $('close-case').hidden=!active;$('documents-empty').hidden=!!count;$('ask-empty').hidden=!!count;
  $('documents-ready').textContent=count?`${count} ${count===1?'document is':'documents are'} ready. Next, ask a question.`:'Add at least one document to continue.';
  const needsAssistant=guided&&selected==='ask'&&!ready&&$('rag-answer-mode').value==='generated';$('guide-qwen-recovery').hidden=!needsAssistant;$('suggested-question').hidden=!sample;$('first-answer-next').hidden=!guided||!$('rag-answer').textContent;
  $('qwen-success').hidden=!ready;$('qwen-next').hidden=!ready;$('start-qwen').hidden=ready;$('qwen-skip').hidden=ready;
  if(!busy){$('qwen-next').disabled=!ready;$('continue-ask').disabled=!count;$('files').disabled=!active;$('pdf-ocr').disabled=!active;$('ask-question').disabled=!count||needsAssistant;$('export-case').disabled=!active;if(needsAssistant)requestAnimationFrame(()=>{if(!$('guide-qwen-recovery').hidden&&!$('guide-restart-qwen').disabled)$('guide-restart-qwen').focus();});}
 }
 function focus(){const panel=selected==='welcome'?$('welcome'):$('panel-'+selected);panel?.querySelector('h2')?.focus({preventScroll:true});panel?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 function go(name,moveFocus=true){if(!names.includes(name)&&!['welcome','qwen'].includes(name))return;if(['welcome','qwen'].includes(name))guided=true;selected=name;pendingFocus=false;if(location.hash&&location.hash!=='#workspace')location.hash='workspace';paint();if(moveFocus&&!expanded)focus();}
 async function documents(){await host.start(sample&&!sampleCreated);if(sample)sampleCreated=true;if(guided)$('pdf-ocr').checked=true;$('rag-answer-mode').value=ready?'generated':'extractive';$('rag-answer-mode').dispatchEvent(new Event('change'));go('documents');}
 document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.view)));
 $('all-tools').addEventListener('click',()=>{expanded=!expanded;paint();});
 $('guide-start').addEventListener('click',()=>{sample=false;go('qwen');});$('guide-sample').addEventListener('click',()=>{sample=true;sampleCreated=false;go('qwen');});
 $('guide-restart').addEventListener('click',()=>{expanded=false;go('welcome');});
 $('guide-skip').addEventListener('click',()=>{guided=false;expanded=false;go(active?(active.sources.length?'ask':'documents'):'case');});
 $('guide-back').addEventListener('click',()=>go(selected==='ask'?'documents':selected==='documents'?'qwen':'welcome'));
 $('qwen-next').addEventListener('click',documents);$('qwen-skip').addEventListener('click',documents);
 $('qwen-cancel').addEventListener('click',()=>host.cancel());
 $('guide-read-passages').addEventListener('click',()=>{$('rag-answer-mode').value='extractive';$('rag-answer-mode').dispatchEvent(new Event('change'));paint();$('rag-question').focus();});
 $('finish-guide').addEventListener('click',()=>{guided=false;go('ask');});
 $('suggested-question').addEventListener('click',()=>{$('rag-question').value='What is the normal retirement age?';$('rag-question').dispatchEvent(new Event('input'));$('rag-question').focus();});
 addEventListener('pbgc-model-state',event=>{const state=event.detail;ready=state.state==='ready';$('assistant-state').textContent=ready?'Qwen · Ready':state.state==='loading'?'Qwen · Starting…':'Qwen · Not started';$('qwen-cancel').hidden=state.state!=='loading';$('qwen-cancel').disabled=false;$('qwen-progress').hidden=state.state!=='loading';if(state.total){$('qwen-progress').max=state.total;$('qwen-progress').value=state.completed;}else $('qwen-progress').removeAttribute('value');if(state.message)$('qwen-progress-label').textContent=state.message;$('qwen-error').hidden=state.state!=='error';if(state.state==='error')$('qwen-error').textContent=state.message;paint();if(ready&&guided&&selected==='qwen')requestAnimationFrame(()=>{if(!$('qwen-next').disabled)$('qwen-next').focus();});});
 return {go,exit(){if(!guided)return;guided=false;expanded=false;selected=active?(active.sources.length?'ask':'documents'):'case';paint();},refresh(value,isBusy){active=value;busy=isBusy;const id=value?.id||null;if(id!==previousId){if(!guided){pendingFocus=true;selected=value?(value.sources.length?'ask':'documents'):'case';}previousId=id;}paint();if(pendingFocus&&!busy&&!expanded){pendingFocus=false;focus();}}};
};})(globalThis);
