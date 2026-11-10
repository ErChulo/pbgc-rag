'use strict';
// Synthetic source-selection acceptance. Retrieval uses the actual local encoder.
// Named delayed-retrieval tests verify UI races, not model accuracy.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {openManualModel}=require('./helpers/ui.js');
const ROOT=path.resolve(__dirname,'..');
const APP_ROOT=process.env.PBGC_SCOPE_ROOT?path.resolve(process.env.PBGC_SCOPE_ROOT):ROOT;
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(APP_ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const QUESTION='What is the normal retirement age?';
const SOURCE_A={name:'plan-a.txt',text:'Normal retirement age is 65.',fact:65};
const SOURCE_B={name:'plan-b.txt',text:'Normal retirement age is 67.',fact:67};
const fixture=source=>({name:source.name,mimeType:'text/plain',buffer:Buffer.from(source.text)});
const idle=page=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled,null,{timeout:120000});
async function session(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 if(target.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage(),external=[],errors=[];
 context.on('request',request=>{if(/^(?:https?|wss?):/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
 page.on('pageerror',error=>errors.push(error.message));
 return{browser,context,page,external,errors};
}
async function documents(page,files=[fixture(SOURCE_A),fixture(SOURCE_B)]){
 await page.goto(target);await idle(page);
 await page.locator('#guide-start').click();await page.locator('#qwen-skip').click();await idle(page);
 await page.locator('#files').setInputFiles(files);await idle(page);
 await page.locator('#continue-ask').click();
 await page.locator('#rag-question').waitFor({state:'visible'});
 await page.locator('#rag-question').fill(QUESTION);
}
async function sourceChoice(page,index,name){
 const options=page.locator('#rag-source-options-'+index);
 if(!await options.evaluate(node=>node.open))await options.locator(':scope > summary').click();
 await page.locator('#rag-source-'+index).selectOption(name?{label:name}:'');
}
async function secondQuestion(page){await page.locator('#add-rag-question').click();await page.locator('#rag-question-2').fill(QUESTION);}
async function ask(page){await page.locator('#ask-question').click();await idle(page);}
async function clean(run){assert.deepEqual(run.external,[]);assert.deepEqual(run.errors,[]);}
async function close(run){await run.context.close();await run.browser.close();}
async function capture(page,name){await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results',name),fullPage:true,animations:'disabled'});}

test(`${profile} REAL learned retrieval answers equal questions within their selected documents`,{timeout:240000},async t=>{
 const run=await session(),{page}=run;
 try{
  await documents(page);
  assert.equal(await page.locator('#rag-source-1').inputValue(),'','All documents is the initial selection');
  assert.equal(await page.locator('#rag-source-options-1').evaluate(node=>node.open),false,'Source selection starts collapsed');
  await sourceChoice(page,1,SOURCE_A.name);await secondQuestion(page);await sourceChoice(page,2,SOURCE_B.name);
  assert.notEqual(await page.locator('#rag-source-1').inputValue(),await page.locator('#rag-source-2').inputValue(),'The options bind distinct source IDs');
  await ask(page);
  const results=page.locator('#rag-answer article.rag-question-result');
  assert.equal(await results.count(),2,'Equal question text is allowed for different documents');
  for(const [index,source,other] of [[0,SOURCE_A,SOURCE_B],[1,SOURCE_B,SOURCE_A]]){
   const result=results.nth(index);
   assert.equal(await result.locator('h3').first().innerText(),QUESTION);
   assert.match(await result.locator('.question-source-scope').innerText(),new RegExp(source.name.replace(/\./g,'\\.')));
   const evidence=result.locator('.question-sources');
   assert.ok((await evidence.innerText()).includes(source.text),'The selected source provides this question\'s passage');
   assert.ok(!(await evidence.innerText()).includes(other.text),'The other document is excluded from this question');
   assert.doesNotMatch(await evidence.innerText(),/\b[a-f0-9]{64}\b|UTF-16|"offset"/,'Technical provenance stays outside the reading view');
   await evidence.getByRole('button',{name:'View evidence',exact:true}).first().click();
   await page.locator('#source-view').waitFor({state:'visible'});
   assert.ok((await page.locator('#source-records').innerText()).includes(source.text));
   assert.ok(!(await page.locator('#source-records').innerText()).includes(other.text),'Evidence opens the selected document, not the other result');
   await page.locator('#source-close').click();
  }
  await capture(page,'rag-source-scope-desktop.png');
  for(const width of [1280,375]){
   await page.setViewportSize({width,height:width===375?812:900});
   for(const theme of ['dark','light']){
    const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));
    if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${theme}: scoped questions and result labels do not overflow`);
   }
  }
  await capture(page,'rag-source-scope-mobile-light.png');
  const labels=await page.locator('#panel-ask').evaluate(panel=>[...panel.querySelectorAll('select')].filter(node=>node.getClientRects().length&&!node.labels?.length&&!node.getAttribute('aria-label')).map(node=>node.id));
  assert.deepEqual(labels,[],'Visible source selectors have accessible labels');
  await clean(run);t.diagnostic(JSON.stringify({profile,realLearnedRetrieval:true,questions:2,sameQuestion:true,selectedSources:2,generatedAnswers:false,externalRequests:0}));
 }finally{await close(run);}
});

test(`${profile} all-document conflicts remain visible and duplicate effective selections are rejected`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  await documents(page);await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/conflict/i,'All documents still exposes the incompatible ages');
  assert.doesNotMatch(await page.locator('#rag-status').innerText(),/^Generated answer/);
  const searched=page.locator('#panel-ask .question-source-scope').first();await searched.waitFor({state:'visible'});
  assert.match(await searched.innerText(),/all 2 documents/i,'The result states that the conflicting documents were both searched');
  await sourceChoice(page,1,SOURCE_A.name);await secondQuestion(page);await sourceChoice(page,2,SOURCE_A.name);await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/different question|different.*document|same.*selection/i,'The same question over the same source is not a second comparison');
  assert.equal(await page.locator('#rag-answer').innerText(),'');
  assert.equal(await page.locator('#rag-citations').innerText(),'');
  await clean(run);
 }finally{await close(run);}
});

test(`${profile} selection changes, question removal and case switches clear private scope state`,{timeout:240000},async()=>{
 const run=await session(),{page}=run;
 try{
  await documents(page);await sourceChoice(page,1,SOURCE_A.name);await secondQuestion(page);await sourceChoice(page,2,SOURCE_B.name);await ask(page);
  assert.equal(await page.locator('#rag-answer article.rag-question-result').count(),2);
  await sourceChoice(page,2,'');
  assert.equal(await page.locator('#rag-answer').innerText(),'','Changing the document selection clears the prior results');
  assert.equal(await page.locator('#rag-citations').innerText(),'');
  await page.locator('#add-rag-question').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'rag-question-3');
  await page.locator('#rag-question-3').fill('Which mortality table is documented?');await sourceChoice(page,3,SOURCE_A.name);
  const thirdSource=await page.locator('#rag-source-3').inputValue();
  await page.locator('#remove-rag-question-2').click();
  assert.equal(await page.locator('#rag-question-2').inputValue(),'Which mortality table is documented?');
  assert.equal(await page.locator('#rag-source-2').inputValue(),thirdSource,'Removing a middle question carries its replacement\'s selected document');
  assert.equal(await page.locator('#rag-source-3').inputValue(),'','Hidden removed rows retain no source selection');
  await page.locator('#remove-rag-question-2').click();
  assert.equal(await page.locator('#rag-source-2').inputValue(),'');
  assert.notEqual(await page.locator('#rag-source-1').inputValue(),'','Removing extra questions does not widen the first question');
  await page.locator('#guide-skip').click();
  await page.locator('#flow-case').click();await page.locator('#case-name').fill('Synthetic new source-selection case');
  await page.locator('#create-case').click();await idle(page);await page.locator('#flow-ask').click();
  for(let index=1;index<=3;index++)assert.equal(await page.locator('#rag-source-'+index).inputValue(),'','New cases reset every source selection');
  assert.equal(await page.locator('#rag-answer').innerText(),'');assert.equal(await page.locator('#rag-citations').innerText(),'');
  await clean(run);
 }finally{await close(run);}
});

test(`${profile} unreadable and MOCK stale selections never fall back to another document`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  await documents(page,[fixture(SOURCE_A),fixture(SOURCE_B),{name:'empty-note.txt',mimeType:'text/plain',buffer:Buffer.from(' \n')}]);
  await sourceChoice(page,1,'empty-note.txt');await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/no searchable text|no readable|no text|document.*text/i);
  assert.equal(await page.locator('#rag-answer').innerText(),'');assert.equal(await page.locator('#rag-citations').innerText(),'');
  await page.evaluate(()=>{
   const select=document.querySelector('#rag-source-1'),option=new Option('MOCK unavailable document','MOCK-stale-source');select.append(option);select.value=option.value;select.dispatchEvent(new Event('change'));
   const retrieve=PBGCRag.retrieveHybrid;globalThis.__staleSourceRetrievals=0;PBGCRag.retrieveHybrid=async(...args)=>{globalThis.__staleSourceRetrievals++;return retrieve(...args);};
  });
  await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/no longer|not available|unavailable|unknown|changed|selected.*document/i);
  assert.equal(await page.evaluate(()=>globalThis.__staleSourceRetrievals),0,'An absent source never triggers retrieval over the other documents');
  assert.equal(await page.locator('#rag-answer').innerText(),'');assert.equal(await page.locator('#rag-citations').innerText(),'');
  await clean(run);
 }finally{await close(run);}
});

test(`${profile} MOCK delayed retrieval cannot publish a result after the selected document changes`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  await documents(page);await sourceChoice(page,1,SOURCE_A.name);
  const second=await page.locator('#rag-source-1 option').filter({hasText:SOURCE_B.name}).getAttribute('value');
  await page.evaluate(()=>{
   const retrieve=PBGCRag.retrieveHybrid;globalThis.__scopeWaiting=false;
   PBGCRag.retrieveHybrid=async(...args)=>{const result=await retrieve(...args);globalThis.__scopeWaiting=true;await new Promise(resolve=>{globalThis.__releaseScopeRetrieval=resolve;});return result;};
  });
  await page.locator('#ask-question').click();await page.waitForFunction(()=>globalThis.__scopeWaiting===true,null,{timeout:120000});
  await page.evaluate(value=>{const select=document.querySelector('#rag-source-1');select.value=value;select.dispatchEvent(new Event('change'));globalThis.__releaseScopeRetrieval();},second);
  await idle(page);
  assert.match(await page.locator('#rag-status').innerText(),/selection changed|document selection changed|questions.*changed/i);
  assert.equal(await page.locator('#rag-answer').innerText(),'','The first document\'s delayed result is not released under the second selection');
  assert.equal(await page.locator('#rag-citations').innerText(),'');await clean(run);
 }finally{await close(run);}
});

test(`${profile} MOCK index preparation cannot widen a pending selected-document question`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  await documents(page);await sourceChoice(page,1,SOURCE_A.name);
  await page.evaluate(()=>{
   const build=PBGCRag.buildSemanticIndex,retrieve=PBGCRag.retrieveHybrid;
   globalThis.__scopeIndexWaiting=false;globalThis.__preparationRetrievals=0;
   PBGCRag.buildSemanticIndex=async(...args)=>{const index=await build(...args);globalThis.__scopeIndexWaiting=true;await new Promise(resolve=>{globalThis.__releaseScopeIndex=resolve;});return index;};
   PBGCRag.retrieveHybrid=async(...args)=>{globalThis.__preparationRetrievals++;return retrieve(...args);};
  });
  await page.locator('#ask-question').click();await page.waitForFunction(()=>globalThis.__scopeIndexWaiting===true,null,{timeout:120000});
  await page.evaluate(()=>{const select=document.querySelector('#rag-source-1');select.value='';select.dispatchEvent(new Event('change'));globalThis.__releaseScopeIndex();});
  await idle(page);
  assert.equal(await page.evaluate(()=>globalThis.__preparationRetrievals),0,'Changing to All while the index is prepared cannot widen the pending retrieval');
  assert.match(await page.locator('#rag-status').innerText(),/selection changed|document selection changed|questions.*changed/i);
  assert.equal(await page.locator('#rag-answer').innerText(),'');assert.equal(await page.locator('#rag-citations').innerText(),'');
  await clean(run);
 }finally{await close(run);}
});

if(process.env.PBGC_REQUIRE_SCOPE_MODEL==='1')test(`${profile} REAL Qwen answers the same question from two conflicting documents only within explicit selections`,{timeout:540000},async t=>{
 const manifest=require('../vendor/local-llm/bundled.manifest.json'),packaged=APP_ROOT!==ROOT;
 const modelPath=process.env.PBGC_LLM_MODEL||process.env.PBGC_MODEL_PATH||path.join(ROOT,'dist','models',manifest.files[0].name);
 if(!packaged)assert.ok(fsSync.existsSync(modelPath),'The pinned real local model is required.');
 const run=await session(),{page}=run,start=performance.now();let report;
 try{
  await page.goto(target);await idle(page);
  await page.evaluate(()=>{
   globalThis.__scopeCalls=[];
   const create=PBGCRag.createLocalLlmProvider;
   PBGCRag.createLocalLlmProvider=async options=>{
    const provider=await create(options),generate=provider.generate.bind(provider);globalThis.__scopeModel=provider.info();
    provider.generate=async request=>{
     const started=performance.now(),call={state:'running',partial:'',elapsedMs:0,responseFormat:request.responseFormat,promptCharacters:request.prompt.length};globalThis.__scopeCalls.push(call);
     try{const raw=await generate({...request,onToken:token=>{call.partial=(call.partial+String(token)).slice(0,1600);call.elapsedMs=Math.round(performance.now()-started);request.onToken?.(token);}});Object.assign(call,{state:'completed',raw,elapsedMs:Math.round(performance.now()-started)});return raw;}
     catch(error){Object.assign(call,{state:'failed',errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||error).slice(0,500),elapsedMs:Math.round(performance.now()-started)});throw error;}
    };return provider;
   };
   const batch=PBGCRag.answerQuestions;
   PBGCRag.answerQuestions=async input=>{try{const result=await batch(input);globalThis.__scopeResult=result;return result;}catch(error){globalThis.__scopeError={errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||error).slice(0,500)};throw error;}};
  });
  await page.locator('#guide-start').click();
  if(packaged){await page.locator('#start-qwen').click();await idle(page);assert.equal(await page.locator('#qwen-success').isVisible(),true);await page.locator('#qwen-next').click();await idle(page);}
  else{await page.locator('#qwen-skip').click();await idle(page);}
  await page.locator('#files').setInputFiles([fixture(SOURCE_A),fixture(SOURCE_B)]);await idle(page);await page.locator('#continue-ask').click();await page.locator('#rag-question').waitFor({state:'visible'});
  if(!packaged){await page.locator('#guide-skip').click();await openManualModel(page);await page.locator('#rag-model-files').setInputFiles(modelPath);await page.locator('#rag-model-manifest').setInputFiles(path.join(ROOT,'vendor/local-llm/bundled.manifest.json'));await page.locator('#load-rag-model').click();await idle(page);assert.match(await page.locator('#rag-model-status').textContent(),/loaded/i);}
  await page.locator('#rag-question').fill(QUESTION);await sourceChoice(page,1,SOURCE_A.name);await secondQuestion(page);await sourceChoice(page,2,SOURCE_B.name);
  await page.locator('#ask-question').click();await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:360000});
  const observed=await page.evaluate(()=>({batch:globalThis.__scopeResult,error:globalThis.__scopeError,calls:globalThis.__scopeCalls,model:globalThis.__scopeModel,ragStatus:document.querySelector('#rag-status').textContent,globalStatus:document.querySelector('#status').textContent}));
  const rows=observed.batch?.results||[];
  report={kind:'real-qwen-per-question-document-scope',profile,packagedBundledStartup:packaged,manifestId:manifest.id,modelSha256:manifest.files[0].sha256,model:observed.model,batchStatus:observed.batch?.status??null,batchError:observed.error??null,ragStatus:observed.ragStatus,globalStatus:observed.globalStatus,questions:rows.map(row=>({index:row.index,question:row.question,scope:row.scope,searchedSources:row.searchedSources,status:row.result.status,answer:row.result.answer,citations:row.result.citations,reason:row.result.diagnostics?.reason})),realGenerationCalls:observed.calls.length,modelOutputs:observed.calls,elapsedMs:Math.round(performance.now()-start),externalRequests:run.external.length,limitations:'Two fixed synthetic document facts with explicit selections; not a combined answer, authority decision or general model-quality evaluation.'};
  await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});const json=JSON.stringify(report,null,2)+'\n';await fs.writeFile(path.join(ROOT,'test-results','rag-source-scope-real.json'),json);await fs.writeFile(path.join(ROOT,'test-results',`rag-source-scope-real-${target.startsWith('file:')?'file':'http'}.json`),json);
  assert.equal(observed.batch?.status,'answered',JSON.stringify(report));assert.equal(rows.length,2);assert.equal(observed.calls.length,2,'Each selected document gets a separate real inference');assert.ok(observed.calls.every(call=>call.state==='completed'));
  assert.equal(observed.model.sha256,manifest.files[0].sha256,'The actual model identity matches the pinned profile');
  for(const [index,source,other] of [[0,SOURCE_A,SOURCE_B],[1,SOURCE_B,SOURCE_A]]){
   const row=rows[index],expectedHash=crypto.createHash('sha256').update(source.text).digest('hex');
   assert.equal(row.question,QUESTION);assert.equal(row.result.status,'answered');assert.match(row.result.answer,new RegExp('\\b'+source.fact+'\\b'));assert.doesNotMatch(row.result.answer,new RegExp('\\b'+other.fact+'\\b'));
   assert.equal(row.searchedSources.length,1);assert.equal(row.searchedSources[0].sourceName,source.name);assert.equal(row.searchedSources[0].sourceHash,expectedHash);
   assert.ok(row.result.citations.some(citation=>citation.sourceName===source.name&&citation.sourceHash===expectedHash&&citation.quotes?.includes(source.text)),'The answer cites the independently expected original source sentence');
   assert.ok(row.result.citations.every(citation=>citation.sourceName===source.name&&citation.sourceHash===expectedHash),'No citation from the excluded document can support this answer');
   const card=page.locator('#rag-answer article.rag-question-result').nth(index);assert.ok((await card.locator('.question-source-scope').innerText()).includes(source.name));
   const evidence=card.locator('.question-sources');if(!await evidence.evaluate(node=>node.open))await evidence.locator(':scope > summary').click();assert.ok((await evidence.innerText()).includes(source.text));
  }
  await capture(page,'rag-source-scope-real.png');
  await page.locator('#remove-rag-question-2').click();await sourceChoice(page,1,'');await ask(page);
  const allStatus=await page.locator('#rag-status').innerText(),callsAfterAll=await page.evaluate(()=>globalThis.__scopeCalls.length);
  Object.assign(report,{allDocumentsStatus:allStatus.slice(0,240),realGenerationCallsAfterAllDocuments:callsAfterAll,allDocumentsConflictBlocked:/conflict/i.test(allStatus)&&callsAfterAll===2});
  const completeJson=JSON.stringify(report,null,2)+'\n';await fs.writeFile(path.join(ROOT,'test-results','rag-source-scope-real.json'),completeJson);await fs.writeFile(path.join(ROOT,'test-results',`rag-source-scope-real-${target.startsWith('file:')?'file':'http'}.json`),completeJson);
  assert.match(allStatus,/conflict/i,'Searching all documents still reports their disagreement');
  assert.equal(callsAfterAll,2,'The all-document conflict is blocked before another model call');
  await clean(run);t.diagnostic(JSON.stringify({profile,manifestId:manifest.id,packagedBundledStartup:packaged,accepted:2,total:2,conflictingAllDocumentsBlocked:true,realGenerationCalls:2,elapsedMs:report.elapsedMs,externalRequests:0}));
 }catch(error){
  if(process.env.GITHUB_ACTIONS){const message='Document-scope browser acceptance failed: '+String(error.message||error).split('\n')[0].slice(0,180);process.stdout.write('::error title=Synthetic document-scope acceptance::'+message.replace(/%/g,'%25').replace(/\r/g,'%0D')+'\n');}
  throw error;
 }finally{await close(run);}
});


test(`${profile} REAL learned citation beyond forty records opens its bound source page`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  const targetText='Normal retirement age is 65.';
  const filler='The archive team stores scanned office correspondence in cabinets. Staff organize paper forms by department and maintain the catalog. A librarian checks catalog descriptions and verifies shelf labels. ';
  const text=Array.from({length:90},(_,index)=>index===74?targetText:`Archive record ${index+1}: ${filler.repeat(2)}`).join('\n');
  await documents(page,[{name:'synthetic-long-citation.txt',mimeType:'text/plain',buffer:Buffer.from(text)}]);
  await ask(page);
  const citation=page.locator('#rag-citations .rag-citation').filter({hasText:targetText}).first();await citation.waitFor({state:'visible'});
  assert.match(await citation.innerText(),/Line 75/,'The returned citation contains the actual target locator');
  await citation.getByRole('button',{name:'View evidence',exact:true}).click();await page.locator('#source-view').waitFor({state:'visible'});
  assert.equal(await page.locator('#source-page').innerText(),'Records 41–80 of 90','Canonical locator matching must not fall back to the first source page');
  assert.ok((await page.locator('#source-records').innerText()).includes(targetText),'The actual cited passage is visible in the opened source page');
  assert.notEqual(await page.locator('#source-records article.selected h3').innerText(),'Line 1');
  await clean(run);await capture(page,'rag-source-scope-long-citation.png');
 }finally{await close(run);}
});
