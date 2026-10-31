'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const model=process.env.PBGC_LLM_MODEL||path.resolve(__dirname,'../dist/models/qwen2.5-0.5b-instruct-q4_k_m.gguf');
const profile=target.startsWith('file:')?'actual file://':'supplementary HTTP only';
async function launch(){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();const page=await context.newPage();const external=[],errors=[];
  context.on('request',r=>{if(/^https?:|^wss?:/.test(r.url())&&!r.url().startsWith(process.env.PBGC_TEST_URL||'file:'))external.push(r.url());});
  await context.route(/^https?:\/\//,route=>route.request().url().startsWith(process.env.PBGC_TEST_URL||'file:')?route.continue():route.abort());
  page.on('pageerror',e=>errors.push(e.message));await page.goto(target);
  await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
  return{browser,page,external,errors};
}
async function addCase(page,name,text){
  await page.locator('#case-name').fill(name);await page.locator('#create-case').click();
  await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
  await page.locator('#files').setInputFiles({name:'synthetic-rag-plan.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
  assert.match(await page.locator('#sources').innerText(),/synthetic-rag-plan.txt/);
}
async function ask(page,question){
  await page.locator('#rag-question').fill(question);await page.locator('#ask-question').click();
  await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:180000});
}
test(`${profile} REAL learned retrieval UI: readable source evidence, case isolation and no external network`,{timeout:240000},async()=>{
  const{browser,page,external,errors}=await launch();
  try{
    await addCase(page,'Synthetic RAG retrieval','Normal retirement age is 65.\nA surviving spouse receives monthly income after the participant dies.');
    await page.locator('#rag-answer-mode').selectOption('extractive');
    await ask(page,'What money is available to a widow?');
    assert.match(await page.locator('#rag-citations').innerText(),/surviving spouse|monthly income/i);
    assert.match(await page.locator('#rag-citations').innerText(),/synthetic-rag-plan.txt/);
    const visible=await page.locator('#rag-citations').innerText();assert.doesNotMatch(visible,/\b[a-f0-9]{64}\b|UTF-16|"offset"/,'technical metadata stays behind details');
    await page.locator('#rag-citations').getByRole('button',{name:/view evidence|view source/i}).first().click();
    assert.match(await page.locator('#source-view').innerText(),/surviving spouse|monthly income/i);
    await page.getByRole('button',{name:'Close evidence',exact:true}).click();
    await page.locator('#case-name').fill('Synthetic empty separate case');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    assert.doesNotMatch(await page.locator('#rag-answer').innerText(),/surviving spouse|monthly income/i);
    await ask(page,'What money is available to a widow?');
    assert.doesNotMatch(await page.locator('#rag-citations').innerText(),/surviving spouse|synthetic-rag-plan.txt/i);
    await page.locator('#files').setInputFiles([
      {name:'synthetic-old.txt',mimeType:'text/plain',buffer:Buffer.from('The retirement age is 65.')},
      {name:'synthetic-new.txt',mimeType:'text/plain',buffer:Buffer.from('The retirement age is 67.')}
    ]);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await ask(page,'What is the retirement age?');
    assert.match(await page.locator('#rag-status').innerText(),/conflict/i);
    assert.doesNotMatch(await page.locator('#rag-status').innerText(),/^Generated answer/);
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test(`${profile} REAL Qwen grounded generation UI, cancellation and model unload`,{timeout:480000,skip:!fs.existsSync(model)&&process.env.PBGC_REQUIRE_MODEL!=='1'&&'Local Qwen GGUF absent; real generation is not established by this run.'},async t=>{
  assert.ok(fs.existsSync(model),'Required real Qwen model is absent; prepare the pinned local model pack.');
  const{browser,page,external,errors}=await launch();
  try{
    await addCase(page,'Synthetic RAG generation','Normal retirement age is 65.');
    await page.evaluate(()=>{const create=PBGCRag.createLocalLlmProvider;PBGCRag.createLocalLlmProvider=async options=>{const provider=await create(options);const generate=provider.generate.bind(provider);provider.generate=async request=>{try{globalThis.__realQwenPartial='';const output=await generate({...request,onToken:token=>{globalThis.__realQwenPartial+=token;request.onToken?.(token);}});globalThis.__realQwenOutput=output;return output;}catch(error){globalThis.__realQwenOutput=error.message+'; partial: '+globalThis.__realQwenPartial;throw error;}};return provider;};});
    await page.getByText('Local model settings',{exact:true}).click();
    await page.getByText('Use another compatible model',{exact:true}).click();
    await page.locator('#rag-model-files').setInputFiles(model);
    await page.locator('#rag-model-manifest').setInputFiles(path.resolve(__dirname,'../vendor/local-llm/qwen2.5-0.5b-instruct.manifest.json'));
    const started=performance.now();await page.locator('#load-rag-model').click();
    await page.waitForFunction(()=>!document.querySelector('#load-rag-model').disabled,null,{timeout:180000});
    assert.match(await page.locator('#rag-model-status').innerText(),/Qwen.*loaded/i);
    await page.locator('#rag-answer-mode').selectOption('generated');
    await ask(page,'What is the normal retirement age?');
    assert.match(await page.locator('#rag-answer').innerText(),/65/,(await page.locator('#rag-status').innerText())+'; real model output: '+await page.evaluate(()=>globalThis.__realQwenOutput));
    assert.match(await page.locator('#rag-citations').innerText(),/Normal retirement age is 65\./);
    assert.match(await page.locator('#rag-status').innerText(),/^Generated answer\./);
    const raw=await page.evaluate(()=>globalThis.__realQwenOutput);assert.equal(typeof raw,'string');assert.match(raw,/65/);assert.doesNotMatch(raw,/^[{\[]|```/,'local model emits a plain answer; code selects its exact supporting source sentence');
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../test-results/rag-ui.png'),fullPage:true});
    t.diagnostic(JSON.stringify({model:'Qwen2.5-0.5B-Instruct-Q4_K_M',loadAndAnswerMs:Math.round(performance.now()-started),profile,scope:'One synthetic factual answer; not production actuarial quality.'}));
    await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();
    await page.waitForFunction(()=>document.querySelector('#rag-status').textContent.includes('Drafting'),null,{timeout:30000});
    await page.locator('#rag-cancel').click();await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:30000});
    assert.match(await page.locator('#rag-status').innerText(),/cancelled|no grounded answer/i);
    assert.doesNotMatch(await page.locator('#rag-answer').innerText(),/65/,'cancelled generation releases no partial answer');
    await page.locator('#unload-rag-model').click();await page.waitForFunction(()=>!document.querySelector('#unload-rag-model').disabled);
    assert.match(await page.locator('#rag-model-status').innerText(),/unloaded|not loaded|no (?:generation )?model/i);
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
