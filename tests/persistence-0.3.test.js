'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {startLoopbackServer}=require('../tools/verify-browser.js');
const root=path.resolve(__dirname,'..');

test('0.3 observations and actual dictionary bindings survive reload and v2 restore while stale reviews and tampering fail',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-persistence-03-'));let server,browser,context;
  try{
    const workbook=path.join(directory,'data_dictionary_complete.xlsm');
    execFileSync('python',['-c',`import zipfile,sys
parts={'[Content_Types].xml':'<Types/>','xl/workbook.xml':'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fields" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Field name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>SYNTHETIC_AMOUNT</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>SYNTHETIC_SERVICE</t></is></c></row></sheetData></worksheet>'}
with zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED) as archive:
 for name,value in parts.items(): archive.writestr(name,value)
`,workbook]);
    server=await startLoopbackServer(root);browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});context=await browser.newContext({acceptDownloads:true});const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const idle=()=>page.waitForFunction(()=>!document.querySelector('#import-case').disabled);
    let exportNumber=0;
    const exportCase=async()=>{const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;const file=path.join(directory,`case-${++exportNumber}.json`);await download.saveAs(file);await idle();return JSON.parse(await fs.readFile(file,'utf8'));};
    const importCase=async(data,name)=>{const file=path.join(directory,name);await fs.writeFile(file,JSON.stringify(data));await page.locator('#import-case').setInputFiles(file);await idle();};
    await page.goto(server.url);await idle();await page.locator('#demo').click();await idle();await page.locator('#files').setInputFiles(workbook);await idle();
    assert.equal(await page.locator('#sources li').count(),2,await page.locator('#status').innerText());
    await page.locator('a[href="#case-review"]').click();await page.locator('#annotation-source').selectOption({label:'synthetic-plan.txt'});await page.locator('#annotation-record').fill('2');
    for(const [id,value]of Object.entries({'annotation-subject':'Synthetic plan','annotation-predicate':'retirement age','annotation-value':'65','annotation-authority':'Synthetic fixture only','annotation-group':'*'}))await page.locator('#'+id).fill(value);
    await page.locator('#annotation-applicability').selectOption('all-dates');await page.locator('#save-annotation').click();await idle();assert.match(await page.locator('#annotation-status').innerText(),/Proposed/);
    await page.getByText('Record a human review',{exact:true}).click();await page.locator('#annotation-reviewer').fill('Synthetic reviewer');await page.locator('#annotation-review-date').fill('2026-10-30');
    await page.locator('#annotation-group').fill('Unsaved different scope');await page.locator('#review-annotation').click();await idle();assert.match(await page.locator('#status').innerText(),/save.*edit|unsaved/i,'unsaved scope must not review a different persisted observation');assert.match(await page.locator('#annotation-status').innerText(),/Proposed/);
    await page.locator('#annotation-group').fill('*');await page.locator('#review-annotation').click();await idle();assert.match(await page.locator('#annotation-status').innerText(),/Reviewed/);
    await page.locator('#dictionary-source').selectOption({label:'data_dictionary_complete.xlsm'});await page.locator('#dictionary-sheet').fill('Fields');await page.locator('#dictionary-column').fill('A');await page.locator('#dictionary-header').fill('1');await page.locator('#dictionary-version').fill('Synthetic-0.3');await page.locator('#map-dictionary').click();await idle();
    assert.match(await page.locator('#dictionary-results').innerText(),/SYNTHETIC_AMOUNT/);await page.locator('#dictionary-reviewer').fill('Synthetic reviewer');await page.locator('#dictionary-version').fill('Unsaved different version');await page.locator('#review-dictionary').click();await idle();assert.match(await page.locator('#status').innerText(),/Map your changed source or field settings before recording a review/);assert.match(await page.locator('#dictionary-results').innerText(),/Proposed mapping/);await page.locator('#dictionary-version').fill('Synthetic-0.3');await page.locator('#review-dictionary').click();await idle();assert.match(await page.locator('#dictionary-results').innerText(),/Mapping review recorded/);
    await page.locator('#dictionary-values').fill('{"SYNTHETIC_AMOUNT":1250,"INVENTED_FIELD":1}');await page.locator('#validate-fields').click();await idle();assert.match(await page.locator('#field-results').innerText(),/INVENTED_FIELD/);assert.match(await page.locator('#field-results').innerText(),/Unknown field names found/);
    await page.getByRole('link',{name:'Workspace',exact:true}).click();const reviewed=await exportCase();assert.equal(reviewed.schemaVersion,2);assert.equal(reviewed.workbench.annotations.length,1);assert.equal(reviewed.workbench.annotations[0].status,'reviewed');assert.equal(reviewed.workbench.dictionary.officialValidated,false);assert.equal(reviewed.workbench.dictionary.releaseBlocked,true);assert.equal(reviewed.workbench.dictionary.review.status,'reviewed');assert.deepEqual(reviewed.workbench.dictionary.fieldNames,['SYNTHETIC_AMOUNT','SYNTHETIC_SERVICE']);
    const actualWorkbook=reviewed.sources.find(source=>source.name==='data_dictionary_complete.xlsm');assert.equal(actualWorkbook.bytesBase64,(await fs.readFile(workbook)).toString('base64'));assert.equal(reviewed.workbench.dictionary.source.hash,actualWorkbook.hash);
    await page.reload();await idle();assert.equal(await page.locator('#sources li').count(),2,await page.locator('#storage').innerText()+'; '+await page.locator('#status').innerText());const reloaded=await exportCase();assert.deepEqual(reloaded.workbench,reviewed.workbench,'review state revalidates and survives recovery reload');
    await importCase(reviewed,'reviewed-case-v2.json');assert.match(await page.locator('#restore-feedback').innerText(),/Case restored/);const restored=await exportCase();assert.deepEqual(restored.workbench,reviewed.workbench);
    const beforeId=await page.locator('#workspace-select').inputValue(),beforeCount=await page.locator('#workspace-select option').count();
    for(const [label,alter]of [
      ['source-bytes',data=>{data.sources[0].bytesBase64=Buffer.from('altered original').toString('base64');}],
      ['annotation-binding',data=>{data.workbench.annotations[0].sources[0].sourceHash='0'.repeat(64);}],
      ['dictionary-field',data=>{data.workbench.dictionary.fields[0].name='FABRICATED_FIELD';}],
      ['stale-review',data=>{data.workbench.annotations[0].value='67';}]
    ]){
      const tampered=structuredClone(reviewed);alter(tampered);await importCase(tampered,`tampered-${label}.json`);assert.match(await page.locator('#restore-feedback').innerText(),/failed/i,label);assert.equal(await page.locator('#workspace-select').inputValue(),beforeId,label);assert.equal(await page.locator('#workspace-select option').count(),beforeCount,label);assert.deepEqual((await exportCase()).workbench,restored.workbench,label);
    }
    await page.locator('a[href="#case-review"]').click();await page.locator('#annotation-select').selectOption(reviewed.workbench.annotations[0].id);await page.locator('#annotation-value').fill('66');await page.locator('#save-annotation').click();await idle();assert.match(await page.locator('#annotation-status').innerText(),/Proposed/);await page.getByRole('link',{name:'Workspace',exact:true}).click();const edited=await exportCase();assert.equal(edited.workbench.annotations[0].status,'proposed');assert.equal(edited.workbench.annotations[0].review,null);assert.equal(edited.workbench.annotations[0].version,reviewed.workbench.annotations[0].version+1);
    const legacy={...reviewed,schemaVersion:1,name:'Legacy source-only fixture'};delete legacy.workbench;await importCase(legacy,'legacy-v1.json');assert.match(await page.locator('#restore-feedback').innerText(),/Case restored/);const legacyRestored=await exportCase();assert.deepEqual(legacyRestored.sources.map(source=>[source.hash,source.bytesBase64]),reviewed.sources.map(source=>[source.hash,source.bytesBase64]));assert.ok(!legacyRestored.workbench||legacyRestored.workbench.annotations.length===0,'v1 never imports hidden review claims');
    await page.locator('a[href="#case-review"]').click();for(const id of ['annotation-subject','annotation-value','annotation-authority','dictionary-values'])assert.equal(await page.locator('#'+id).inputValue(),'','new workspace clears prior private form: '+id);await page.getByRole('link',{name:'Workspace',exact:true}).click();
    await page.locator('#query').fill('retirement');await page.locator('#search').click();await idle();assert.match(await page.locator('#results').innerText(),/Normal retirement age is 65/);assert.deepEqual(errors,[]);
    t.diagnostic('Synthetic workbook only. Mapping/review claims remain unauthenticated and official release blocked; loopback HTTP does not establish file:// acceptance.');
  }finally{if(context)await context.close();if(browser)await browser.close();if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});}
});
