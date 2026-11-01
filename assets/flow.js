/* Task-focused shell. All processing and source validation remain in the app. */
(function(root){'use strict';
root.PBGCRag=root.PBGCRag||{};
root.PBGCRag.mountFlow=function(){
 const $=id=>document.getElementById(id),names=['case','documents','ask','search','save'];
 let selected='case',expanded=false,previousId=null,active=null,busy=false,pendingFocus=false;
 const hints={case:'Create a case, or continue one you already opened.',documents:'Add documents, then continue to questions.',ask:'Ask a question. Check the sources alongside each answer.',search:'Find a specific word or passage in this case.',save:'Save a case file so you can reopen your work later.'};
 function paint(){
  for(const name of names){$('panel-'+name).hidden=!expanded&&name!==selected;const button=$('flow-'+name);if(!expanded&&name===selected)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
  $('all-tools').setAttribute('aria-pressed',String(expanded));$('all-tools').textContent=expanded?'Return to guided view':'Show all tools';
  $('flow-hint').textContent=expanded?'All workspace tools are shown. Return to guided view for one task at a time.':hints[selected];
  const count=active?.sources.length||0;
  $('flow-context').textContent=active?`${active.name} · ${count} ${count===1?'document':'documents'}`:'Start a case to keep your documents together.';
  $('close-case').hidden=!active;$('documents-empty').hidden=!!count;$('ask-empty').hidden=!!count;
  $('documents-ready').textContent=count?`${count} ${count===1?'document is':'documents are'} ready. Next, ask a question.`:'Add documents to continue.';
  if(!busy){$('continue-ask').disabled=!count;$('files').disabled=!active;$('pdf-ocr').disabled=!active;$('ask-question').disabled=!count;$('export-case').disabled=!active;}
 }
 function go(name,focus=true){if(!names.includes(name))return;selected=name;pendingFocus=false;if(location.hash&&location.hash!=='#workspace')location.hash='workspace';paint();if(focus&&!expanded){const heading=$('panel-'+name).querySelector('h2');heading?.focus({preventScroll:true});$('panel-'+name).scrollIntoView({block:'start'});}}
 document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.view)));
 $('all-tools').addEventListener('click',()=>{expanded=!expanded;paint();});
 return {go,refresh(value,isBusy){active=value;busy=isBusy;const id=value?.id||null;if(id!==previousId){pendingFocus=true;selected=value?(value.sources.length?'ask':'documents'):'case';previousId=id;}paint();if(pendingFocus&&!busy&&!expanded){pendingFocus=false;$('panel-'+selected).querySelector('h2')?.focus({preventScroll:true});}}};
};
})(globalThis);
