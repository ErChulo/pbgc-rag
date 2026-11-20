'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const runtimeFiles=['assets/case-vault.js','assets/case-term-index.js','assets/case-collection.js','assets/chunking.js','assets/rag.js','assets/core.js','tests/case-vault-persistence-browser.test.js'];
async function fingerprint(){return Object.fromEntries(await Promise.all(runtimeFiles.map(async file=>[file,sha(await fs.readFile(path.join(ROOT,file)))])));}

test(`${profile} a real five MiB collection survives a full persistent-browser restart`,{timeout:180000},async t=>{
  const directory=path.join(ROOT,'test-results');await fs.mkdir(directory,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(directory,'persistent-vault-')),userDataDir=path.join(temporary,'browser-profile'),original=path.join(temporary,'persisted-plan.txt');
  const marker='The persistentclosinganchor amount is 875 dollars.';
  const paragraph='Synthetic plan archive. The administrator retains the signed instrument and each dated amendment. A reviewer checks the participant group, effective date and benefit form before applying a provision. Source quotations identify documentary statements. They do not establish legal applicability or external truth. The original file remains available for review. This paragraph is synthetic workload text only.\n';
  const size=5*1024**2,tail='\n'+marker+'\n',body=Buffer.from((paragraph.repeat(Math.ceil(size/paragraph.length))).slice(0,size-tail.length)+tail),expectedHash=sha(body),expectedOffset=body.indexOf(marker);
  await fs.writeFile(original,body);
  const evidence={schemaVersion:1,kind:'pbgc-rag-persistent-profile-verification',profile,status:'FAIL',startedAt:new Date().toISOString(),commit:spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),runtimeSha256:await fingerprint(),scope:'Five MiB text source imported through the real collection/parser/chunker/vault. Original bytes, source metadata, authenticated derived passages and the nonextractable authentication key must survive closing the entire browser and opening the same on-disk profile. This is not the one GiB durability gate.',sourceBytes:size,sourceSha256:expectedHash,externalRequests:0,browserPids:[]};
  let context;const external=[],errors=[];
  async function open(){
    context=await chromium.launchPersistentContext(userDataDir,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    if(target.startsWith('file:'))await context.setOffline(true);
    context.on('request',request=>{const url=request.url();if(/^(?:https?|wss?):/.test(url)&&(!process.env.PBGC_TEST_URL||!url.startsWith(new URL('.',target).href)))external.push(url);});
    await context.route(/^(?:https?|wss?):\/\//,route=>process.env.PBGC_TEST_URL&&route.request().url().startsWith(new URL('.',target).href)?route.continue():route.abort());
    const page=context.pages()[0]||await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(target);await page.waitForFunction(()=>typeof PBGCRag?.createCaseCollection==='function');
    const session=await context.browser().newBrowserCDPSession();try{const info=await session.send('SystemInfo.getProcessInfo');evidence.browserPids.push(Number(info.processInfo.find(process=>process.type==='browser').id));}finally{await session.detach();}
    return page;
  }
  try{
    let page=await open();
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='persistent-source-file';document.body.append(input);});
    await page.locator('#persistent-source-file').setInputFiles(original);
    evidence.import=await page.evaluate(async()=>{
      const vault=await PBGCRag.createCaseVault(),collection=await PBGCRag.createCaseCollection({vault});
      try{await vault.createCase({id:'persistent-case',name:'Synthetic persistent collection'});const results=await collection.importFiles('persistent-case',document.getElementById('persistent-source-file').files);return{results:results.map(item=>({status:item.status,error:item.error,hash:item.source?.hash})),manifest:await vault.getCase('persistent-case')};}finally{vault.close();}
    });
    assert.equal(evidence.import.results.length,1);assert.equal(evidence.import.results[0].status,'imported',evidence.import.results[0].error);assert.equal(evidence.import.results[0].hash,expectedHash);assert.equal(evidence.import.manifest.originalBytes,size);
    await context.close();context=null;
    page=await open();
    evidence.reopened=await page.evaluate(async()=>{
      const vault=await PBGCRag.createCaseVault(),collection=await PBGCRag.createCaseCollection({vault});
      try{const manifest=await vault.getCase('persistent-case'),sources=await collection.sources('persistent-case'),source=await vault.getSource('persistent-case',sources[0].id),summary=await vault.getShard('persistent-case',source.id,'records','summary'),found=await collection.search('persistent-case','persistentclosinganchor');return{manifest,source:{hash:source.hash,bytes:source.blob.size},summaryVerification:summary.verification,results:found.results.map(chunk=>({hash:chunk.sourceHash,text:chunk.text,locators:chunk.locators})),diagnostics:found.diagnostics};}finally{vault.close();}
    });
    assert.notEqual(evidence.browserPids[0],evidence.browserPids[1],'The entire browser must restart.');assert.equal(evidence.reopened.manifest.sourceCount,1);assert.equal(evidence.reopened.manifest.originalBytes,size);assert.equal(evidence.reopened.source.hash,expectedHash);assert.equal(evidence.reopened.source.bytes,size);assert.equal(evidence.reopened.summaryVerification,'authenticated-local-derived-v1');
    const found=evidence.reopened.results.find(chunk=>chunk.hash===expectedHash&&chunk.text.includes(marker));assert.ok(found,'A source-bound fact must remain searchable after the full browser restart.');assert.ok(found.locators.some(locator=>locator.type==='text-line'&&locator.offset===expectedOffset),'The original text offset must remain exact.');
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);evidence.runtimeSha256After=await fingerprint();assert.deepEqual(evidence.runtimeSha256After,evidence.runtimeSha256,'Repeat verification if the runtime changes during the test.');evidence.status='PASS';t.diagnostic(JSON.stringify({profile,sourceBytes:size,browserPids:evidence.browserPids,authenticatedAfterFullRestart:true,externalRequests:external.length}));
  }catch(error){evidence.status=/ERR_BLOCKED_BY_ADMINISTRATOR/.test(error.message)?'BLOCKED':'FAIL';evidence.error=error.message;throw error;}
  finally{if(context)await context.close().catch(()=>{});evidence.externalRequests=external.length;evidence.finishedAt=new Date().toISOString();await fs.writeFile(path.join(directory,'case-vault-persistent-'+(target.startsWith('file:')?'file':'http')+'.json'),JSON.stringify(evidence,null,2)+'\n');await fs.rm(temporary,{recursive:true,force:true});}
});
