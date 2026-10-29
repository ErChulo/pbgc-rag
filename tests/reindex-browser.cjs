'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');let server,browser,base='file://'+path.join(root,'index.html');
 try{
  if(process.env.PBGC_HTTP_CHECK==='1'){
   server=http.createServer((req,res)=>{
    let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/index.html`;
  }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-crash-reporter','--disable-crashpad','--disable-breakpad']});
  const context=await browser.newContext(),external=[],errors=[];
  await context.route(/https?:\/\//,route=>{if(server&&new URL(route.request().url()).origin===new URL(base).origin)return route.continue();external.push(route.request().url());return route.abort();});
  await context.routeWebSocket(/.*/,socket=>{external.push(socket.url());socket.close();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByRole('heading',{name:'Your case workspace',exact:true}).waitFor();
  const initial=await page.evaluate(async()=>{
   const source=await PBGC.parseFile(new File(['Alpha cited fact\nBeta cited fact\n'],'synthetic-reindex.txt'));
   source.parserVersion='synthetic-legacy-parser';source.records.reverse();source.records.forEach((r,i)=>r.id=`${source.id}:${i+1}`);
   const c={schemaVersion:1,id:'synthetic-reindex-ui',name:'Synthetic parser upgrade',createdAt:'2026-10-28T00:00:00.000Z',sources:[source],graph:{nodes:source.records.map(r=>({id:r.id,recordId:r.id,sourceId:source.id,label:r.text})),edges:[{id:'synthetic-edge',from:source.records[0].id,to:source.records[1].id,type:'supports',recordId:source.records[0].id,sourceId:source.id,status:'proposed'}]},rules:[],calculations:[]};
   PBGC.proposeRule(c,{id:'synthetic-proposal',title:'Synthetic citation mapping',effectiveDate:'2026-01-01',sourceRecordIds:[source.records[0].id]});
   const store=await PBGC.createCaseStore();try{await store.put(c);}finally{store.close();}
   return {sourceId:source.id,hash:source.hash,original:source.originalBase64};
  });
  await page.reload();await page.getByRole('button',{name:'Open Synthetic parser upgrade',exact:true}).click();
  await page.getByRole('link',{name:'2 · Import',exact:true}).click();
  await page.getByRole('button',{name:'Review parser update for synthetic-reindex.txt',exact:true}).click();
  await page.getByText('Parser review status: review-required. No case changes have been applied.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Apply reviewed parser update',exact:true}).click();
  await page.getByText('Review the comparison and confirm the technical update first.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=>{const store=await PBGC.createCaseStore();try{return(await store.get('synthetic-reindex-ui')).sources[0].parserVersion;}finally{store.close();}}),'synthetic-legacy-parser');
  await page.getByLabel('I reviewed the parser changes and exact citation mappings.',{exact:true}).check();
  await page.getByRole('button',{name:'Apply reviewed parser update',exact:true}).click();
  await page.getByRole('heading',{name:'Import original documents',exact:true}).waitFor();
  const after=await page.evaluate(async()=>{const store=await PBGC.createCaseStore();try{return{c:await store.get('synthetic-reindex-ui'),manifest:await store.getImportCheckpoint('synthetic-reindex-ui')};}finally{store.close();}});
  assert.equal(after.c.sources[0].parserVersion,'1.1.0');assert.equal(after.c.sources[0].hash,initial.hash);assert.equal(after.c.sources[0].originalBase64,initial.original);
  assert.equal(after.c.graph.nodes[0].recordId,initial.sourceId+':2');assert.equal(after.c.graph.nodes[0].id,initial.sourceId+':2');assert.equal(after.c.graph.edges[0].from,initial.sourceId+':2');
  assert.deepEqual(after.c.rules[0].sourceRecordIds,[initial.sourceId+':2']);assert.equal(after.c.rules[0].status,'proposed');assert.equal(after.c.sources[0].reindexProvenance.history.length,1);assert.equal(after.manifest,null);
  await page.getByRole('button',{name:'Review parser update for synthetic-reindex.txt',exact:true}).click();
  await page.getByText('Parser review status: unchanged. No case changes have been applied.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Apply reviewed parser update',exact:true}).count(),0);
  await page.evaluate(async()=>{
   const source=await PBGC.parseFile(new File(['Original authoritative synthetic excerpt'],'synthetic-blocked.txt'));
   source.parserVersion='synthetic-legacy-parser';source.records[0].text='Different historical extraction';
   const c={schemaVersion:1,id:'synthetic-blocked-ui',name:'Synthetic blocked parser update',createdAt:'2026-10-28T00:00:00.000Z',sources:[source],graph:{nodes:[],edges:[]},rules:[],calculations:[]};
   PBGC.proposeRule(c,{id:'blocked-rule',title:'Synthetic existing citation',effectiveDate:'2026-01-01',sourceRecordIds:[source.records[0].id]});
   const store=await PBGC.createCaseStore();try{await store.put(c);}finally{store.close();}
  });
  await page.goto(base.split('#')[0]+'#case');await page.reload();await page.getByRole('button',{name:'Open Synthetic blocked parser update',exact:true}).click();
  await page.getByRole('link',{name:'2 · Import',exact:true}).click();await page.getByRole('button',{name:'Review parser update for synthetic-blocked.txt',exact:true}).click();
  await page.getByText('Parser review status: blocked. No case changes have been applied.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Apply reviewed parser update',exact:true}).count(),0);
  await page.getByRole('link',{name:'Return to source inventory',exact:true}).click();
  await page.getByLabel('Select source files',{exact:true}).setInputFiles(path.join(root,'tests/fixtures/sqlite-overflow-mixed.db'));
  await page.getByRole('button',{name:'Import and index',exact:true}).click();await page.getByText('1 files imported. 0 skipped or rejected.',{exact:true}).waitFor();
  const sqlite=await page.evaluate(async()=>{const store=await PBGC.createCaseStore();try{return(await store.get('synthetic-blocked-ui')).sources.find(s=>s.format==='sqlite');}finally{store.close();}});
  assert.equal(sqlite.parserVersion,'1.1.0');assert.ok(sqlite.records.some(r=>r.locator.payloadSegments.length>1));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(`PASS: ${server?'HTTP secondary reindex check (file acceptance remains BLOCKED)':'file:// reindex'}; explicit review required; exact citations and graph endpoints remap; originals/proposals unchanged; no-op and mismatched evidence refuse; SQLite overflow imports with segment provenance; zero external requests.`);
  await context.close();
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
