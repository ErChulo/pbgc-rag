'use strict';
// Synthetic user-facing acceptance: use the guided path, never the all-tools shortcut.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const views=['case','documents','ask','search','save'];
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';

test(`${profile} guided first answer, model discovery, case backup and responsive task navigation`,{timeout:240000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
 if(target.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage(),external=[],errors=[];
 context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());
 page.on('pageerror',error=>errors.push(error.message));
 const idle=()=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
 const capture=async name=>{await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.screenshot({path:path.join(ROOT,'test-results','ux-flow-'+name+'.png'),fullPage:true});};
 async function onlyPanel(view){
  for(const candidate of views)assert.equal(await page.locator('#panel-'+candidate).isVisible(),candidate===view,`Only ${view} task is shown; checked ${candidate}`);
  const nav=page.locator('#flow-'+view);
  assert.ok(['step','page','true'].includes(await nav.getAttribute('aria-current')||await nav.getAttribute('aria-selected')),`${view} navigation exposes current task`);
  assert.equal(await page.locator('#all-tools').getAttribute('aria-pressed'),'false');
 }
 try{
  await page.goto(target);await idle();await onlyPanel('case');
  assert.equal(await page.locator('#rag-question').isVisible(),false,'The question form does not compete with starting a case');
  assert.equal(await page.locator('#continue-ask').isDisabled(),true,'A case without documents cannot continue to asking');
  await capture('01-start');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip');
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  await page.locator('#case-name').fill('Synthetic guided acceptance');await page.locator('#create-case').click();await idle();await onlyPanel('documents');
  await page.locator('#files').setInputFiles({name:'guided-synthetic-plan.txt',mimeType:'text/plain',buffer:Buffer.from('Normal retirement age is 65.\nSynthetic test information only.')});await idle();
  assert.match(await page.locator('#sources').innerText(),/guided-synthetic-plan\.txt/);
  assert.equal(await page.locator('#continue-ask').isEnabled(),true);await capture('02-documents');
  await page.locator('#continue-ask').click();await onlyPanel('ask');
  assert.equal(await page.locator('#rag-question').isVisible(),true);
  await page.locator('#rag-answer-mode').selectOption('generated');
  assert.equal(await page.locator('#model-setup').isVisible(),true);
  assert.equal(await page.locator('#model-setup').evaluate(node=>node.open),true,'The included-model guidance is immediately available');
  assert.match(await page.locator('#model-setup').innerText(),/qwen2\.5-0\.5b-instruct-q4_k_m\.gguf/i,'The instructions identify the exact included model file');
  assert.match(await page.locator('#model-setup').innerText(),/models.*folder/i,'The instructions identify the model folder');
  assert.equal(await page.getByLabel('Choose the included model file',{exact:true}).isVisible(),true);
  assert.equal(await page.locator('#load-rag-model').innerText(),'Enable offline answers');await capture('03-ask-and-setup');
  await page.locator('#rag-answer-mode').selectOption('extractive');
  await page.locator('#rag-question').fill('What is the normal retirement age?');await page.locator('#ask-question').click();
  await page.waitForFunction(()=>!document.querySelector('#ask-question').disabled,null,{timeout:180000});
  assert.match(await page.locator('#rag-citations').innerText(),/Normal retirement age is 65\./);
  assert.doesNotMatch(await page.locator('#rag-citations').innerText(),/\b[a-f0-9]{64}\b|UTF-16|"offset"/);
  await page.locator('#rag-citations').getByRole('button',{name:'View evidence',exact:true}).first().click();
  assert.equal(await page.locator('#source-view').isVisible(),true);assert.match(await page.locator('#source-records').innerText(),/Normal retirement age is 65\./);
  await page.locator('#source-close').click();await capture('04-first-answer');
  await page.locator('#flow-save').click();await onlyPanel('save');
  const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;await idle();
  const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(exported.sources.length,1);assert.equal(exported.name,'Synthetic guided acceptance');
  await page.locator('#import-case').setInputFiles({name:'guided-case-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await idle();
  assert.equal(await page.locator('#restore-feedback').isVisible(),true,'Restore confirms the selected file through a visible result');
  assert.match(await page.locator('#restore-feedback').innerText(),/guided-case-backup\.json/);
  await page.locator('#flow-case').click();await page.locator('#case-name').fill('Synthetic separate empty case');await page.locator('#create-case').click();await idle();
  await page.locator('#flow-ask').click();await onlyPanel('ask');
  assert.equal(await page.locator('#rag-question').inputValue(),'','Changing cases removes the prior private question');
  assert.doesNotMatch(await page.locator('#rag-citations').innerText(),/guided-synthetic-plan|retirement age is 65/);
  for(const viewport of [{width:1280,height:900},{width:375,height:812}]){
   await page.setViewportSize(viewport);
   for(const theme of ['dark','light']){
    const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));
    if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
    for(const view of views){await page.locator('#flow-'+view).click();await onlyPanel(view);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} ${theme} ${viewport.width}px has no horizontal overflow`);}
   }
  }
  await page.locator('#flow-case').click();await capture('05-mobile-light');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({profile,mainFlow:'case→documents→question→source→backup→restore',themes:2,viewportWidths:[1280,375],externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});
