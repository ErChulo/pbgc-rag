'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const dictionary=require('../assets/dictionary.js');
const evidence=require('../assets/evidence.js');
const tableQuery=require('../assets/table-query.js');
const digest=text=>createHash('sha256').update(text).digest('hex');

test('0.3 independent module contracts preserve exact fields, human-review boundaries and int64 cell provenance',()=>{
  const source={id:'synthetic-dictionary',name:'data_dictionary_complete.xlsm',hash:digest('synthetic workbook fixture'),parserVersion:'test-only-1',format:'xlsm',records:[
    {text:'Synthetic field name',locator:{type:'excel-cell',sheet:'Fields',cell:'A1',part:'xl/worksheets/sheet1.xml'}},
    {text:'SYNTHETIC_AMOUNT',locator:{type:'excel-cell',sheet:'Fields',cell:'A2',part:'xl/worksheets/sheet1.xml'}},
    {text:'__proto__',locator:{type:'excel-cell',sheet:'Fields',cell:'A3',part:'xl/worksheets/sheet1.xml'}}
  ]};
  const config={mode:'official-candidate',sheet:'Fields',column:'A',headerRow:1,version:'Synthetic-v1'};
  const proposed=dictionary.buildDictionary(source,config);
  const checked=dictionary.buildDictionary(source,{...config,review:{status:'reviewed',reviewer:'Synthetic reviewer',reviewedAt:'2026-10-30T00:00:00.000Z',binding:proposed.reviewBinding}});
  assert.deepEqual(checked.fieldNames,['SYNTHETIC_AMOUNT','__proto__']);
  assert.equal(checked.officialValidated,false);assert.equal(checked.releaseBlocked,true);
  assert.match(checked.limitations.join(' '),/unauthenticated|No types/);
  const fields=dictionary.validateFieldValues(checked,JSON.parse('{"SYNTHETIC_AMOUNT":1250,"__proto__":1,"INVENTED_FIELD":7}'),{source});
  assert.deepEqual(fields.unknownFields,['INVENTED_FIELD']);assert.equal(fields.valid,false);assert.equal(fields.typeValidation,'not-performed');assert.equal({}.polluted,undefined);
  assert.throws(()=>dictionary.validateDictionary({...checked,officialValidated:true},source),/differ|verified/);
  assert.throws(()=>dictionary.buildDictionary(source,{...config,version:'Changed',review:checked.review}),/review.*bind/i);
  assert.throws(()=>dictionary.buildDictionary({...source,name:'DD.csv'},config),/exact|dictionary/i);
  const created=evidence.createEvidenceAnnotation({id:'synthetic-fact',kind:'fact',subject:'Synthetic plan',predicate:'Synthetic amount',value:'1250',sources:[{sourceHash:source.hash,locator:source.records[1].locator}],authority:{label:'Synthetic test fixture',reference:null},applicability:'all-dates',validity:{from:null,to:null},group:'*'},[source]);
  const reviewed=evidence.reviewEvidenceAnnotation(created,{reviewer:'Synthetic reviewer',at:'2026-10-30',version:created.version,contentKey:evidence.evidenceContentKey(created)},[source]);
  assert.equal(evidence.reconcileEvidence([reviewed],[source]).status,'reviewed-consistent');
  const edited=evidence.updateEvidenceAnnotation(reviewed,{value:'1300'},[source]);assert.equal(edited.status,'proposed');assert.equal(edited.review,null);assert.equal(edited.version,2);assert.equal(evidence.reconcileEvidence([edited],[source]).status,'abstain');
  assert.equal(evidence.validateEvidenceAnnotation({...reviewed,value:'1300'},[source]).valid,false);
  assert.equal(evidence.validateEvidenceAnnotation(reviewed,[{...source,hash:digest('changed original')}]).valid,false);
  const database={id:'synthetic-db',name:'synthetic.sqlite',hash:digest('synthetic database fixture'),records:[
    {text:'9223372036854775807',value:'9223372036854775807',valueType:'integer',locator:{type:'sqlite-cell',table:'synthetic',rowid:'7',column:'amount'}},
    {text:'literal value',value:'literal value',valueType:'text',locator:{type:'sqlite-cell',table:'synthetic',rowid:'7',column:'__proto__'}}
  ]};
  const table=tableQuery.buildTables([database])[0];
  const result=tableQuery.queryTable(table,'SELECT amount, "__proto__" FROM synthetic WHERE amount = 9223372036854775807 LIMIT 1');
  assert.equal(result.rows[0].values.amount,'9223372036854775807');assert.equal(result.rows[0].values.__proto__,'literal value');
  assert.equal(result.rows[0].evidence.cells.amount.sourceHash,database.hash);assert.equal(result.rows[0].evidence.cells.amount.locator.rowid,'7');assert.equal(result.rows[0].evidence.cells.amount.valueType,'integer');
  assert.throws(()=>tableQuery.queryTable(table,'SELECT * FROM synthetic WHERE amount = 9223372036854775807.0'),/int64|floating/i);
  assert.throws(()=>tableQuery.queryTable(table,'DELETE FROM synthetic'),/SELECT/);
  assert.match(result.warnings.join(' '),/No official field validation/);
});

test('0.3 browser table workflow retains actual SQLite int64 types and explicit CSV-header provenance',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
  const {startLoopbackServer}=require('../tools/verify-browser.js');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-tables-03-'));let server,browser,context;
  try{
    const database=path.join(directory,'synthetic.sqlite');
    execFileSync('python',['-c',"import sqlite3,sys\nc=sqlite3.connect(sys.argv[1])\nc.execute('CREATE TABLE benefits (amount INTEGER,note TEXT)')\nc.execute('INSERT INTO benefits VALUES (?,?)',(9223372036854775807,'TypedQueryEvidence'))\nc.commit()\nc.close()",database]);
    server=await startLoopbackServer(path.resolve(__dirname,'..'));browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});context=await browser.newContext({acceptDownloads:true});const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&!request.url().startsWith(server.url))external.push(request.url());});await context.route(/^https?:\/\//,route=>route.request().url().startsWith(server.url)?route.continue():route.abort());
    const idle=()=>page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.goto(server.url);await idle();assert.doesNotMatch(await page.locator('#storage').innerText(),/Recovery unavailable/);
    await page.locator('#demo').click();await idle();await page.locator('#files').setInputFiles([{name:'synthetic.sqlite',mimeType:'application/vnd.sqlite3',buffer:await fs.readFile(database)},{name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('__proto__,amount\nliteral,9007199254740993\n')}]);await idle();assert.equal(await page.locator('#sources li').count(),3,await page.locator('#status').innerText());
    await page.locator('a[href="#case-review"]').click();await page.locator('#table-select').selectOption({label:'synthetic.sqlite · benefits'});await page.locator('#table-query').fill('SELECT amount, note FROM benefits WHERE amount = 9223372036854775807 LIMIT 1');await page.locator('#run-table-query').click();await idle();
    assert.match(await page.locator('#table-results').innerText(),/9223372036854775807/);assert.match(await page.locator('#table-results').innerText(),/TypedQueryEvidence/);await page.locator('#table-results details > summary').first().click();assert.match(await page.locator('#table-results').innerText(),/benefits · Row 1 · amount/);
    await page.locator('#table-query').fill('SELECT * FROM benefits WHERE amount = 9223372036854775807.0');await page.locator('#run-table-query').click();await idle();assert.match(await page.locator('#status').innerText(),/int64|floating-point/);
    await page.locator('#table-select').selectOption({label:'synthetic.csv · synthetic.csv'});await page.locator('#table-header').fill('1');await page.locator('#set-table-header').click();await idle();await page.locator('#table-query').fill('SELECT "__proto__", amount FROM "synthetic.csv" WHERE amount = \'9007199254740993\' LIMIT 1');await page.locator('#run-table-query').click();await idle();assert.match(await page.locator('#table-results').innerText(),/literal/);assert.match(await page.locator('#table-results').innerText(),/9007199254740993/);await page.locator('#table-results details > summary').first().click();assert.match(await page.locator('#table-results').innerText(),/Row 2, column 1/);
    await page.getByRole('link',{name:'Workspace',exact:true}).click();const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;const exported=path.join(directory,'case.json');await download.saveAs(exported);const data=JSON.parse(await fs.readFile(exported,'utf8'));assert.equal(data.schemaVersion,2);assert.equal(data.workbench.tableHeaders.length,1);
    const actual=await page.evaluate(sources=>{const table=PBGCRag.buildTables(sources).find(table=>table.name==='benefits');return PBGCRag.queryTable(table,'SELECT amount FROM benefits WHERE amount = 9223372036854775807 LIMIT 1');},data.sources);
    const dbSource=data.sources.find(source=>source.name==='synthetic.sqlite');assert.equal(actual.rows[0].values.amount,'9223372036854775807');assert.equal(actual.rows[0].evidence.cells.amount.valueType,'integer');assert.equal(actual.rows[0].evidence.cells.amount.sourceHash,dbSource.hash);assert.equal(actual.rows[0].evidence.cells.amount.locator.rowid,'1');assert.equal(await page.evaluate(()=>Object.prototype.polluted),undefined);
    await page.reload();await idle();await page.locator('a[href="#case-review"]').click();await page.locator('#table-select').selectOption({label:'synthetic.csv · synthetic.csv'});await page.locator('#table-query').fill('SELECT amount FROM "synthetic.csv" LIMIT 1');await page.locator('#run-table-query').click();await idle();assert.match(await page.locator('#table-results').innerText(),/9007199254740993/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    t.diagnostic('Real synthetic SQLite bytes and CSV parsed locally; exact integers and source locations preserved. Supplementary HTTP only.');
  }finally{if(context)await context.close();if(browser)await browser.close();if(server)await server.close();await fs.rm(directory,{recursive:true,force:true});}
});
