'use strict';
// Synthetic column-name setup through the visible Documents flow. No model load.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href,profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const idle=page=>page.waitForFunction(()=>!document.querySelector('#create-case').disabled,null,{timeout:180000});
async function savedCase(page){await page.locator('#flow-save').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-case').click()]);await idle(page);return JSON.parse(await fs.readFile(await download.path(),'utf8'));}
test(`${profile} guided table preview requires a chosen heading row, preserves original evidence, saves and reopens`,{timeout:180000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}}),page=await context.newPage(),external=[],errors=[];
 if(target.startsWith('file:'))await context.setOffline(true);
 context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&(!process.env.PBGC_TEST_URL||!request.url().startsWith(process.env.PBGC_TEST_URL)))external.push(request.url());});
 await context.route(/^https?:\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(process.env.PBGC_TEST_URL)?route.continue():route.abort());page.on('pageerror',error=>errors.push(error.message));
 const original=Buffer.from('Synthetic participant list\nName,Age\nSynthetic Alice,65\nSynthetic Bob,67');
 try{
  await page.goto(target);await idle(page);await page.locator('#guide-start').click();await page.locator('#qwen-skip').click();await idle(page);assert.equal(await page.locator('#guide').getAttribute('data-step'),'documents');
  await page.locator('#files').setInputFiles({name:'synthetic-participants.csv',mimeType:'text/csv',buffer:original});await idle(page);
  assert.equal(await page.locator('#table-reading-guide').isVisible(),true);assert.match(await page.locator('#table-reading-guide').innerText(),/Check column names/);assert.doesNotMatch(await page.locator('#table-reading-guide').innerText(),/Column names saved/);
  assert.equal(await page.locator('#table-guide-header-row').inputValue(),'1');assert.match(await page.locator('#table-reading-guide table').innerText(),/Synthetic participant list/);
  // Leave setup to inspect the portable state: displaying a candidate row must
  // not save a schema. The original header is on row two, after a title row.
  await page.locator('#guide-skip').click();const baseline=await savedCase(page);assert.deepEqual(baseline.workbench?.tableHeaders||[],[]);assert.equal(baseline.sources[0].hash,createHash('sha256').update(original).digest('hex'));
  await page.locator('#flow-documents').click();await page.locator('#table-guide-confirm').click();await idle(page);assert.match(await page.locator('#table-reading-guide').innerText(),/without an explicit header/);
  await page.locator('#table-guide-header-row').fill('2');assert.match(await page.locator('#table-reading-guide table').innerText(),/2 \(column names\).*Name.*Age/s);await page.locator('#table-guide-confirm').click();await idle(page);
  assert.match(await page.locator('#table-reading-guide').innerText(),/Column names saved from row 2: Name, Age/);assert.doesNotMatch(await page.locator('#table-reading-guide').innerText(),/\b[a-f0-9]{64}\b|SQL|UTF-16/);
  await fs.mkdir(path.join(ROOT,'test-results'),{recursive:true});await page.locator('#table-reading-guide').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(ROOT,'test-results','habemus-table-guide.png'),fullPage:true,animations:'disabled'});
  await page.locator('#sources').getByRole('button',{name:'View source',exact:true}).click();assert.match(await page.locator('#source-records').innerText(),/Name|Age/);const [originalDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#source-save-original').click()]);assert.deepEqual(await fs.readFile(await originalDownload.path()),original);await page.locator('#source-close').click();
  const confirmed=await savedCase(page);assert.deepEqual(confirmed.workbench.tableHeaders,[{sourceId:confirmed.sources[0].id,tableName:'synthetic-participants.csv',headerRow:2}]);assert.deepEqual(confirmed.sources,baseline.sources,'header setup never rewrites the original or its parsed records');
  await page.locator('#import-case').setInputFiles({name:'synthetic-table-case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(confirmed))});await idle(page);assert.match(await page.locator('#restore-feedback').innerText(),/Case restored/);await page.locator('#flow-documents').click();assert.match(await page.locator('#table-reading-guide').innerText(),/Column names saved from row 2/);
  for(const width of [375,1280]){await page.setViewportSize({width,height:900});for(const theme of ['light','dark']){const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));if(light!==(theme==='light'))await page.locator('#theme-toggle').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${theme}: table setup fits the reading surface`);}}
  await page.locator('#flow-case').click();await page.locator('#case-name').fill('Synthetic separate empty case');await page.locator('#create-case').click();await idle(page);await page.locator('#flow-documents').click();assert.equal(await page.locator('#table-reading-guide').isVisible(),false);assert.doesNotMatch(await page.locator('#panel-documents').innerText(),/Synthetic Alice|Column names saved/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({profile,explicitHeaderRow:2,sourceUnchanged:true,restore:true,caseIsolation:true,externalRequests:external.length}));
 }finally{await context.close();await browser.close();}
});
