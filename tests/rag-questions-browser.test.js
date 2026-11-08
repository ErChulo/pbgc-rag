'use strict';
// Multi-question UI acceptance. Retrieval uses the actual local embedding model.
// The cancellation test adds a named artificial delay; it is not model-quality evidence.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const {openManualModel}=require('./helpers/ui.js');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const APP_ROOT=process.env.PBGC_QUESTIONS_ROOT?path.resolve(process.env.PBGC_QUESTIONS_ROOT):ROOT;
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(APP_ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const AGE='What is the normal retirement age?';
const RETENTION='How long are case files retained?';
const fixtures=[
 {name:'synthetic-retirement.txt',mimeType:'text/plain',buffer:Buffer.from('Normal retirement age is 65.')},
 {name:'synthetic-retention.txt',mimeType:'text/plain',buffer:Buffer.from('Case files are retained for seven years.')}
];
const idle=page=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled,null,{timeout:120000});
async function session(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 if(target.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage(),external=[],errors=[];
 context.on('request',request=>{if(/^(?:https?|wss?):/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
 page.on('pageerror',error=>errors.push(error.message));
 return {browser,context,page,external,errors};
}
async function questionsPage(page,documents=fixtures){
 await page.goto(target);await idle(page);
 await page.locator('#guide-start').click();
 await page.locator('#qwen-skip').click();await idle(page);
 await page.locator('#files').setInputFiles(documents);await idle(page);
 await page.locator('#continue-ask').click();
 await page.waitForFunction(()=>document.querySelector('#guide').dataset.step==='ask');
 assert.equal(await page.locator('#rag-answer-mode').inputValue(),'extractive');
 assert.match(await page.locator('#rag-response-summary').innerText(),/Source passages.*Qwen is not needed/i,'The response mode is clear even when the guide hides advanced options');
 await page.locator('#rag-question').fill(AGE);
}
async function addSecond(page){
 await page.locator('#add-rag-question').click();
 await page.locator('#rag-question-2').fill(RETENTION);
}
async function ask(page){await page.locator('#ask-question').click();await idle(page);}
async function clean(session){assert.deepEqual(session.external,[]);assert.deepEqual(session.errors,[]);}

test(`${profile} REAL learned retrieval keeps separate questions, sources and evidence together`,{timeout:240000},async t=>{
 const run=await session(),{page}=run;
 try{
  await questionsPage(page);
  assert.equal(await page.locator('#rag-question-2').isVisible(),false,'A new user sees one question box');
  assert.equal(await page.locator('#rag-question-3').isVisible(),false);
  await addSecond(page);assert.equal(await page.locator('#ask-question').innerText(),'Ask questions');
  await ask(page);
  await page.waitForFunction(()=>document.activeElement.id==='rag-results-heading');
  const results=page.locator('#rag-answer article.rag-question-result');
  assert.equal(await results.count(),2,'Each explicit question receives its own result');
  for(const [index,question,source,quote] of [[0,AGE,'synthetic-retirement.txt','Normal retirement age is 65.'],[1,RETENTION,'synthetic-retention.txt','Case files are retained for seven years.']]){
   const result=results.nth(index);
   assert.equal(await result.locator('h3').first().innerText(),question);
   assert.match(await result.locator('.question-result-status').innerText(),/Source passages only/,'Passages are not described as generated answers');
   const citations=result.locator('.question-sources');
   assert.match(await citations.innerText(),new RegExp(source.replace(/\./g,'\\.')));
   assert.ok((await citations.innerText()).includes(quote));
   assert.doesNotMatch(await citations.innerText(),/\b[a-f0-9]{64}\b|UTF-16|"offset"/,'Integrity metadata stays out of the reading flow');
   await citations.locator('.rag-citation').filter({hasText:source}).getByRole('button',{name:'View evidence',exact:true}).first().click();
   assert.equal(await page.locator('#source-view').isVisible(),true);
   assert.ok((await page.locator('#source-records').innerText()).includes(quote),'Evidence opens the source for this question');
   await page.locator('#source-close').click();
  }
  assert.equal(await page.locator('#rag-citations').innerText(),'','Single-question citations do not compete with the question cards');
  await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'test-results','rag-questions-desktop.png'),fullPage:true,animations:'disabled'});
  for(const viewport of [{width:1280,height:900},{width:375,height:812}]){
   await page.setViewportSize(viewport);
   for(const theme of ['dark','light']){
    const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));
    if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${viewport.width}px ${theme}: question cards do not overflow horizontally`);
    assert.equal(await results.nth(1).isVisible(),true);
   }
  }
  await page.screenshot({path:path.join(ROOT,'test-results','rag-questions-mobile-light.png'),fullPage:true,animations:'disabled'});
  await page.locator('#finish-guide').click();
  await page.locator('nav a[href="#help"]').click();
  assert.equal(await page.locator('#help .help-steps').isVisible(),true,'The help route opens with the plain-language document flow');
  assert.equal(await page.locator('#help .help-steps > li').count(),5);
  assert.equal(await page.locator('#query-reference').evaluate(node=>node.open),false,'Advanced query syntax does not compete with the basic guide');
  assert.equal(await page.locator('#help pre').first().isVisible(),false);
  await page.locator('nav a[href="#case-review"]').click();
  assert.equal(await page.locator('#dictionary-tools').evaluate(node=>node.open),false,'A dictionary is an optional advanced tool, not a required RAG step');
  assert.equal(await page.locator('#dictionary-source').isVisible(),false);
  await page.locator('nav a[href="#workspace"]').click();
  await page.locator('#flow-case').click();
  await page.locator('#case-name').fill('Synthetic isolated multi-question case');
  await page.locator('#create-case').click();await idle(page);
  await page.locator('#flow-ask').click();
  for(const id of ['rag-question','rag-question-2','rag-question-3'])assert.equal(await page.locator('#'+id).inputValue(),'','A case switch clears every private question');
  assert.equal(await page.locator('#rag-question-2').isVisible(),false);
  assert.equal(await page.locator('#rag-question-3').isVisible(),false);
  assert.equal(await page.locator('#rag-answer').innerText(),'');
  assert.equal(await page.locator('#rag-citations').innerText(),'');
  assert.equal(await page.locator('#ask-question').isDisabled(),true,'An empty case cannot use the previous case sources');
  await clean(run);
  t.diagnostic(JSON.stringify({profile,questions:2,sourceFiles:2,realLearnedRetrieval:true,generatedAnswers:false,caseIsolation:true,externalRequests:run.external.length}));
 }finally{await run.context.close();await run.browser.close();}
});

test(`${profile} question controls support keyboard focus, clear validation and a three-question limit`,{timeout:180000},async()=>{
 const run=await session(),{page}=run;
 try{
  await questionsPage(page);
  await page.locator('#add-rag-question').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'rag-question-2','Adding a question moves keyboard focus into its box');
  await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/Enter a question in each question box, or remove the empty box\./);
  assert.equal(await page.locator('#rag-answer').innerText(),'','Invalid input does not leave a result from another question');
  await page.locator('#rag-question-2').fill('  WHAT IS THE NORMAL RETIREMENT AGE?  ');
  await ask(page);
  assert.match(await page.locator('#rag-status').innerText(),/Use a different question in each question box\./,'Case and whitespace cannot hide a duplicate');
  await page.locator('#rag-question-2').fill(RETENTION);
  await page.locator('#add-rag-question').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'rag-question-3');
  assert.equal(await page.locator('#add-rag-question').isVisible(),false,'The form stops at three questions');
  await page.locator('#rag-question-3').fill('Which mortality table is documented?');
  const unlabeled=await page.locator('#panel-ask').evaluate(panel=>[...panel.querySelectorAll('textarea')].filter(node=>node.getClientRects().length&&!node.labels?.length&&!node.getAttribute('aria-label')).map(node=>node.id));
  assert.deepEqual(unlabeled,[],'Every question box has a visible or accessible label');
  await page.locator('#remove-rag-question-2').click();
  assert.equal(await page.locator('#rag-question-2').inputValue(),'Which mortality table is documented?','Removing the middle question retains the last question');
  assert.equal(await page.locator('#rag-question-3').isVisible(),false);
  assert.equal(await page.locator('#rag-question-3').inputValue(),'','Removed boxes retain no hidden private question');
  assert.equal(await page.locator('#add-rag-question').isVisible(),true);
  await page.locator('#remove-rag-question-2').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#rag-question-2').isVisible(),false);
  assert.equal(await page.locator('#rag-question-2').inputValue(),'');
  assert.ok(['rag-question','add-rag-question'].includes(await page.evaluate(()=>document.activeElement.id)),'Removing the last extra question leaves focus on a usable control');
  assert.equal(await page.locator('#ask-question').innerText(),'Ask question');
  await clean(run);
 }finally{await run.context.close();await run.browser.close();}
});

test(`${profile} MOCK delayed second retrieval: cancellation releases no partial batch and allows retry`,{timeout:240000},async()=>{
 const run=await session(),{page}=run;
 try{
  await questionsPage(page);await addSecond(page);
  await page.evaluate(()=>{
   const retrieve=PBGCRag.retrieveHybrid;globalThis.__questionsOriginalRetrieve=retrieve;globalThis.__questionsRetrieveCount=0;globalThis.__questionsSecondWaiting=false;
   PBGCRag.retrieveHybrid=async(...args)=>{
    if(++globalThis.__questionsRetrieveCount!==2)return retrieve(...args);
    globalThis.__questionsSecondWaiting=true;
    const signal=args[3]?.signal;
    return new Promise((_,reject)=>{
     const abort=()=>{const error=Error('MOCK delayed retrieval cancelled.');error.name='AbortError';reject(error);};
     if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
   };
  });
  await page.locator('#ask-question').click();
  await page.waitForFunction(()=>globalThis.__questionsSecondWaiting===true,null,{timeout:120000});
  assert.equal(await page.locator('#rag-answer').innerText(),'','The first completed result stays private while the batch is in progress');
  assert.equal(await page.locator('#rag-citations').innerText(),'');
  assert.equal(await page.locator('#rag-cancel').isVisible(),true);
  await page.locator('#rag-cancel').click();await idle(page);
  assert.match(await page.locator('#rag-status').innerText(),/cancelled/i);
  assert.equal(await page.locator('#rag-answer').innerText(),'','Cancellation cannot expose a partial or stale result');
  assert.equal(await page.locator('#rag-citations').innerText(),'');
  await page.evaluate(()=>{PBGCRag.retrieveHybrid=globalThis.__questionsOriginalRetrieve;});
  await ask(page);
  assert.equal(await page.locator('#rag-answer article.rag-question-result').count(),2,'A fresh batch can use the unchanged documents after cancellation');
  await clean(run);
 }finally{await run.context.close();await run.browser.close();}
});


if(process.env.PBGC_REQUIRE_BATCH_MODEL==='1')test(`${profile} REAL Qwen answers two explicit questions with independently checked source citations`,{timeout:540000},async t=>{
 const manifest=require('../vendor/local-llm/bundled.manifest.json');
 const modelPath=process.env.PBGC_LLM_MODEL||process.env.PBGC_MODEL_PATH||path.join(ROOT,'dist','models',manifest.files[0].name);
 const packaged=APP_ROOT!==ROOT;
 if(!packaged)assert.ok(fsSync.existsSync(modelPath),'The pinned real local model is required for batch acceptance.');
 const run=await session(),{page}=run,start=performance.now();
 let report;
 try{
  // This observer delegates unchanged to the actual adapter and records its outputs.
  await page.goto(target);await idle(page);
  await page.evaluate(()=>{
   globalThis.__questionsRealCalls=[];
   const create=PBGCRag.createLocalLlmProvider;
   PBGCRag.createLocalLlmProvider=async options=>{
    const provider=await create(options),generate=provider.generate.bind(provider);
    provider.generate=async request=>{
     const started=performance.now(),call={state:'running',partial:'',elapsedMs:0,responseFormat:request.responseFormat,prompt:request.prompt,promptCharacters:request.prompt.length};
     // Record the attempt before awaiting it, so an outer timeout cannot erase it.
     globalThis.__questionsRealCalls.push(call);
     try{
      const raw=await generate({...request,onToken:token=>{
       call.partial=(call.partial+String(token)).slice(0,1600);
       call.elapsedMs=Math.round(performance.now()-started);
       request.onToken?.(token);
      }});
      Object.assign(call,{state:'completed',raw,elapsedMs:Math.round(performance.now()-started)});
      return raw;
     }catch(error){
      Object.assign(call,{state:'failed',errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||error).slice(0,1000),elapsedMs:Math.round(performance.now()-started)});
      throw error;
     }
    };
    globalThis.__questionsRealInfo=provider.info();
    return provider;
   };
   const batch=PBGCRag.answerQuestions;
   PBGCRag.answerQuestions=async input=>{
    try{const result=await batch(input);globalThis.__questionsRealResult=result;return result;}
    catch(error){globalThis.__questionsRealBatchError={errorName:String(error.name||'Error').slice(0,100),errorMessage:String(error.message||error).slice(0,1000)};throw error;}
   };
  });
  if(packaged){
   // Acceptance of the delivered package must start its included model itself.
   await page.locator('#guide-start').click();await page.locator('#start-qwen').click();await idle(page);
   assert.equal(await page.locator('#qwen-success').isVisible(),true,'The extracted package starts bundled Qwen without a model picker');
   await page.locator('#qwen-next').click();await idle(page);
  }else{
   await page.locator('#guide-start').click();await page.locator('#qwen-skip').click();await idle(page);
  }
  const kept={name:'synthetic-retention.txt',mimeType:'text/plain',buffer:Buffer.from('Case files are kept for seven years.')};
  await page.locator('#files').setInputFiles([fixtures[0],kept]);await idle(page);
  await page.locator('#continue-ask').click();
  if(!packaged){
   await page.locator('#guide-skip').click();await openManualModel(page);
   await page.locator('#rag-model-files').setInputFiles(modelPath);
   await page.locator('#rag-model-manifest').setInputFiles(path.join(ROOT,'vendor','local-llm','bundled.manifest.json'));
   await page.locator('#load-rag-model').click();await idle(page);
   assert.match(await page.locator('#rag-model-status').textContent(),/loaded/i);
  }
  const keptQuestion='How long are case files kept?';
  await page.locator('#rag-question').fill(AGE);await page.locator('#add-rag-question').click();await page.locator('#rag-question-2').fill(keptQuestion);
  await page.locator('#ask-question').click();
  await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:360000});
  const observed=await page.evaluate(()=>({batch:globalThis.__questionsRealResult,batchError:globalThis.__questionsRealBatchError,calls:globalThis.__questionsRealCalls,model:globalThis.__questionsRealInfo,ragStatus:document.querySelector('#rag-status')?.textContent||'',globalStatus:document.querySelector('#status')?.textContent||''}));
  const rows=observed.batch?.results||[];
  report={kind:'real-qwen-explicit-question-batch',profile,packagedBundledStartup:packaged,model:observed.model,manifestId:manifest.id,modelSha256:manifest.files[0].sha256,questions:rows.map(row=>({index:row.index,question:row.question,status:row.result.status,answer:row.result.answer,citations:row.result.citations,reason:row.result.diagnostics?.reason})),batchStatus:observed.batch?.status??null,batchError:observed.batchError??null,ragStatus:observed.ragStatus,globalStatus:observed.globalStatus,realGenerationCalls:observed.calls.length,modelOutputs:observed.calls,elapsedMs:Math.round(performance.now()-start),externalRequests:run.external.length,limitations:'Two fixed synthetic factual questions in one batch; this does not establish general model quality or full cross-document synthesis.'};
  await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});
  const json=JSON.stringify(report,null,2)+'\n';
  await fs.writeFile(path.join(ROOT,'test-results','rag-questions-real.json'),json);
  await fs.writeFile(path.join(ROOT,'test-results',`rag-questions-real-${target.startsWith('file:')?'file':'http'}.json`),json);
  assert.equal(observed.batch?.status,'answered',JSON.stringify(report));
  assert.equal(rows.length,2,'The real model must complete both explicit questions');
  assert.equal(observed.calls.length,2,'Each answer must come from a separate real Qwen inference');
  assert.ok(observed.calls.every(call=>call.state==='completed'),'Both real generation calls must complete successfully');
  for(const [index,question,source,quote,fact] of [[0,AGE,'synthetic-retirement.txt','Normal retirement age is 65.',/\b65\b/],[1,keptQuestion,'synthetic-retention.txt','Case files are kept for seven years.',/\b(?:seven|7) years\b/i]]){
   const row=rows[index];assert.equal(row.question,question);assert.equal(row.result.status,'answered');assert.match(row.result.answer,fact);
   assert.ok(row.result.citations.some(citation=>citation.sourceName===source&&citation.quotes?.includes(quote)),'The accepted answer cites the independently expected source sentence');
   assert.ok(row.result.citations.every(citation=>citation.sourceName===source),'A quote from the other question cannot justify this answer');
   const card=page.locator('#rag-answer article.rag-question-result').nth(index);
   assert.equal(await card.locator('h3').first().innerText(),question);assert.match(await card.locator('.question-result-status').innerText(),/Answer with sources/);
   const sources=card.locator('.question-sources');assert.equal(await sources.evaluate(node=>node.open),false,'A generated answer starts with its sources collapsed');
   await sources.locator(':scope > summary').click();
   assert.ok((await sources.innerText()).includes(quote));
  }
  assert.equal(await page.locator('#rag-model-files').isVisible(),false,'The model picker is closed after setup');
  await page.screenshot({path:path.join(ROOT,'test-results','rag-questions-real.png'),fullPage:true,animations:'disabled'});
  await clean(run);
  t.diagnostic(JSON.stringify({profile,manifestId:manifest.id,packagedBundledStartup:packaged,accepted:2,total:2,realGenerationCalls:observed.calls.length,elapsedMs:report.elapsedMs,externalRequests:run.external.length}));
 }finally{await run.context.close();await run.browser.close();}
});
