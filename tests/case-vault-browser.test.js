'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const target=process.env.PBGC_TEST_URL||pathToFileURL(path.join(ROOT,'index.html')).href;
const profile=target.startsWith('file:')?'actual offline file://':'supplementary HTTP only';

test(`${profile} real IndexedDB Blob storage, authenticated shards and bounded case operations`,{timeout:180000},async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext(),external=[],errors=[];
  const scriptURL=new URL('assets/case-vault.js',new URL('.',target)).href;
  if(target.startsWith('file:'))await context.setOffline(true);
  context.on('request',request=>{
    if(/^(?:https?|wss?):/.test(request.url())&&(!target.startsWith('http')||![target,scriptURL].includes(request.url())))external.push(request.url());
  });
  // The supplementary profile isolates this primitive from application startup.
  // It still uses Chromium's real IndexedDB, Blob structured clone and WebCrypto.
  if(target.startsWith('http'))await context.route('**/*',route=>{
    const url=route.request().url();
    if(url===target)return route.fulfill({contentType:'text/html',body:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; connect-src \'none\'; object-src \'none\'"><title>Case vault verification</title>'});
    if(url===scriptURL)return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(ROOT,'assets/case-vault.js'))});
    return route.abort();
  });
  else await context.route(/^(?:https?|wss?):\/\//,route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(target);
    if(!await page.evaluate(()=>typeof globalThis.PBGCRag?.createCaseVault==='function'))await page.addScriptTag({url:scriptURL});
    await page.evaluate(()=>{
      globalThis.vaultTest={
        async hash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');},
        async code(fn){try{await fn();return null;}catch(error){return{code:error.code,name:error.name,message:error.message};}},
        async source(vault,caseId,id,text='Synthetic plan: normal retirement age is 65.',options={}){
          const blob=text instanceof Blob?text:new Blob([text],{type:'text/plain'});
          return vault.putSource(caseId,{id,name:id+'.txt',hash:await this.hash(blob),parserVersion:'synthetic-parser-v1',blob,...options});
        },
        async mutate(storeName,key,change){
          const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pbgc-rag-case-vault',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
          try{await new Promise((resolve,reject)=>{const tx=db.transaction([storeName],'readwrite'),store=tx.objectStore(storeName),request=store.get(key);request.onsuccess=()=>{store.put(change(request.result));};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
        }
      };
    });

    await t.test('version-one databases gain required indexes and persisted authentication keys',async()=>{
      const result=await page.evaluate(async()=>{
        const database='pbgc-rag-case-vault-migration-test';
        await new Promise((resolve,reject)=>{const request=indexedDB.open(database,1);request.onupgradeneeded=()=>{for(const [name,keyPath]of [['cases','id'],['sourceMeta',['caseId','id']],['originals',['caseId','sourceId']],['shards',['caseId','sourceId','kind','id']]])request.result.createObjectStore(name,{keyPath});};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
        const adapter={open:(_name,version)=>indexedDB.open(database,version),cmp:(...args)=>indexedDB.cmp(...args)};
        let vault=await PBGCRag.createCaseVault({indexedDB:adapter});await vault.createCase({id:'migration',name:'Migrated store'});const source=await vaultTest.source(vault,'migration','plan');
        await vault.putShard('migration','plan',{id:'part-1',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{text:'Synthetic persisted cache'}});vault.close();
        vault=await PBGCRag.createCaseVault({indexedDB:adapter});const rows=[];for await(const row of vault.iterateShards('migration',{kind:'records'}))rows.push(row);const sources=await vault.listSources('migration');vault.close();return{rows,sources};
      });
      assert.equal(result.sources.length,1);assert.equal(result.rows.length,1);assert.equal(result.rows[0].verification,'authenticated-local-derived-v1');assert.equal(result.rows[0].payload.text,'Synthetic persisted cache');
    });

    await t.test('five MiB original round-trip is verified and manifests contain metadata only',async()=>{
      const result=await page.evaluate(async()=>{
        const h=vaultTest,vault=await PBGCRag.createCaseVault();await vault.createCase({id:'roundtrip',name:'Synthetic five MiB case'});
        const blob=new Blob(['Synthetic original\n','x'.repeat(5*1024*1024-19)]),hash=await h.hash(blob);
        const saved=await vault.putSource('roundtrip',{id:'large',name:'large.txt',hash,parserVersion:'fixture-v1',blob,warnings:['Synthetic fixture only'],processing:{format:'text'}});
        const original=await vault.getSource('roundtrip','large'),metadata=await vault.getSource('roundtrip','large',{includeBlob:false});
        const cases=await vault.listCases(),sources=await vault.listSources('roundtrip'),manifest=await vault.getCase('roundtrip');
        const mismatch=await h.code(()=>vault.putSource('roundtrip',{id:'bad',name:'bad.txt',hash:'0'.repeat(64),parserVersion:'fixture-v1',blob}));
        const output={saved,metadata,cases,sources,manifest,mismatch,blobSize:original.blob.size,hash:await h.hash(original.blob),originalHash:hash,blobIsNative:original.blob instanceof Blob,limits:vault.info().limits,warnings:vault.info().warnings};vault.close();return output;
      });
      assert.equal(result.blobSize,5*1024*1024);assert.equal(result.blobIsNative,true);assert.equal(result.hash,result.originalHash);
      assert.equal(result.saved.revision,1);assert.equal(result.saved.caseRevision,2);assert.equal(result.manifest.originalBytes,5*1024*1024);
      assert.equal(result.mismatch.code,'INTEGRITY');assert.equal(result.sources.length,1);assert.equal(result.limits.maxCaseBytes,1024**3);
      for(const value of [result.saved,result.metadata,...result.sources,...result.cases,result.manifest])for(const key of ['blob','payload','records','bytesBase64'])assert.equal(Object.hasOwn(value,key),false,key+' must be absent from metadata');
      assert.match(result.warnings.join(' '),/Stored unencrypted/);
    });

    await t.test('original Blob tampering fails SHA-256 verification on read',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'original-tamper',name:'Original tamper'});await vaultTest.source(vault,'original-tamper','plan','Fact 65');
        await vaultTest.mutate('originals',['original-tamper','plan'],row=>({...row,blob:new Blob(['Fact 99'])}));
        const rejected=await vaultTest.code(()=>vault.getSource('original-tamper','plan'));const metadata=await vault.getSource('original-tamper','plan',{includeBlob:false});vault.close();return{rejected,metadata};
      });
      assert.equal(result.rejected.code,'INTEGRITY');assert.equal(result.metadata.bytes,7);
    });

    await t.test('derived payload, source binding and missing authentication cannot be forged',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'authentication',name:'Derived authentication'});const source=await vaultTest.source(vault,'authentication','plan');
        const input={id:'part-1',kind:'chunks',sourceHash:source.hash,sourceRevision:source.revision,payload:{chunks:[{text:'Normal retirement age is 65.',locator:{line:1}}]}};
        await vault.putShard('authentication','plan',input);const trusted=await vault.getShard('authentication','plan',{kind:'chunks',id:'part-1'});
        await vaultTest.mutate('shards',['authentication','plan','chunks','part-1'],row=>({...row,payload:{chunks:[{text:'Normal retirement age is 99.',locator:{line:1}}]}}));
        const changed=await vaultTest.code(()=>vault.getShard('authentication','plan','chunks','part-1'));
        await vault.putShard('authentication','plan',input);await vaultTest.mutate('shards',['authentication','plan','chunks','part-1'],row=>({...row,sourceRevision:row.sourceRevision+1}));
        const rebound=await vaultTest.code(()=>vault.getShard('authentication','plan','chunks','part-1'));
        await vault.putShard('authentication','plan',input);await vaultTest.mutate('shards',['authentication','plan','chunks','part-1'],row=>{delete row.signature;return row;});
        const unsigned=await vaultTest.code(()=>vault.getShard('authentication','plan','chunks','part-1'));vault.close();return{trusted,changed,rebound,unsigned};
      });
      assert.equal(result.trusted.verification,'authenticated-local-derived-v1');assert.equal(Object.hasOwn(result.trusted,'signature'),false);
      for(const key of ['changed','rebound','unsigned'])assert.equal(result[key].code,'INTEGRITY',key);
    });

    await t.test('source replacement invalidates all derived kinds and rejects stale parser output',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'replacement',name:'Source replacement'});const first=await vaultTest.source(vault,'replacement','plan');
        for(const kind of ['records','chunks','vectors'])await vault.putShard('replacement','plan',{id:'part-1',kind,sourceHash:first.hash,sourceRevision:first.revision,payload:{kind}});
        const before=await vault.getCase('replacement');const second=await vaultTest.source(vault,'replacement','plan',undefined,{parserVersion:'synthetic-parser-v2'}),after=await vault.getCase('replacement');
        const stale=await vaultTest.code(()=>vault.putShard('replacement','plan',{id:'old',kind:'chunks',sourceHash:first.hash,sourceRevision:first.revision,payload:{text:'old parse'}}));
        const rows=[];for await(const row of vault.iterateShards('replacement'))rows.push(row);
        const missing=await vault.getShard('replacement','plan','chunks','part-1');vault.close();return{first,second,before,after,stale,rows,missing};
      });
      assert.equal(result.before.shardCount,3);assert.equal(result.second.hash,result.first.hash);assert.equal(result.second.revision,2);
      assert.equal(result.after.shardCount,0);assert.equal(result.after.derivedBytes,0);assert.equal(result.stale.code,'CONFLICT');assert.deepEqual(result.rows,[]);assert.equal(result.missing,null);
    });

    await t.test('case IDs isolate equal source IDs and cascading deletion keeps other cases intact',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();for(const id of ['isolation-a','isolation-b']){await vault.createCase({id,name:id});const source=await vaultTest.source(vault,id,'shared',id);await vault.putShard(id,'shared',{id:'shared',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{text:id}});}
        const first=await vault.getShard('isolation-a','shared','records','shared'),second=await vault.getShard('isolation-b','shared','records','shared');
        await vault.deleteCase('isolation-a');const erased={case:await vault.getCase('isolation-a'),sources:await vault.listSources('isolation-a'),source:await vault.getSource('isolation-a','shared'),shard:await vault.getShard('isolation-a','shared','records','shared')};
        const kept=await vault.getShard('isolation-b','shared','records','shared');vault.close();return{first,second,erased,kept};
      });
      assert.equal(result.first.payload.text,'isolation-a');assert.equal(result.second.payload.text,'isolation-b');assert.equal(result.kept.payload.text,'isolation-b');assert.deepEqual(result.erased,{case:null,sources:[],source:null,shard:null});
    });

    await t.test('two actual database connections reject stale case compare-and-swap writes',async()=>{
      const result=await page.evaluate(async()=>{
        const first=await PBGCRag.createCaseVault(),second=await PBGCRag.createCaseVault();await first.createCase({id:'cas',name:'Stale writer'});
        const blob=new Blob(['Synthetic CAS']),hash=await vaultTest.hash(blob),input={name:'plan.txt',hash,parserVersion:'v1',blob};
        const writes=await Promise.allSettled([first.putSource('cas',{...input,id:'first'},{expectedRevision:1}),second.putSource('cas',{...input,id:'second'},{expectedRevision:1})]);
        const manifest=await first.getCase('cas'),sources=await first.listSources('cas');first.close();second.close();return{outcomes:writes.map(result=>result.status==='fulfilled'?{status:result.status}:{status:result.status,code:result.reason.code}),manifest,sources};
      });
      assert.equal(result.outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);assert.equal(result.outcomes.find(outcome=>outcome.status==='rejected').code,'CONFLICT');assert.equal(result.manifest.revision,2);assert.equal(result.sources.length,1);
    });

    await t.test('logical budgets and quota errors preserve already committed sources and totals',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault({maxCaseBytes:20,maxSourceBytes:20,maxShardBytes:50,maxDerivedBytes:30,maxSources:2});await vault.createCase({id:'budgets',name:'Budgets'});const source=await vaultTest.source(vault,'budgets','first','1234567890'),before=await vault.getCase('budgets');
        const overCase=await vaultTest.code(()=>vaultTest.source(vault,'budgets','second','12345678901'));
        const overSource=await vaultTest.code(()=>vaultTest.source(vault,'budgets','big','x'.repeat(21)));
        const shard={id:'first',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{text:'x'.repeat(25)}};
        const overDerived=await vaultTest.code(()=>vault.putShard('budgets','first',shard));
        const overShard=await vaultTest.code(()=>vault.putShard('budgets','first',{...shard,payload:{text:'x'.repeat(60)}}));
        const put=IDBObjectStore.prototype.put;let quota;
        try{IDBObjectStore.prototype.put=function(...args){if(this.name==='originals')throw new DOMException('Synthetic disk full','QuotaExceededError');return put.apply(this,args);};quota=await vaultTest.code(()=>vaultTest.source(vault,'budgets','first','replacement'));}finally{IDBObjectStore.prototype.put=put;}
        const after=await vault.getCase('budgets'),original=await vault.getSource('budgets','first');vault.close();return{overCase,overSource,overDerived,overShard,quota,before,after,originalText:await original.blob.text()};
      });
      for(const key of ['overCase','overSource','overDerived','overShard'])assert.equal(result[key].code,'SIZE_LIMIT',key);
      assert.equal(result.quota.code,'QUOTA');assert.deepEqual(result.after,result.before);assert.equal(result.originalText,'1234567890');
    });

    await t.test('pre-abort and abort during a real write leave no partial source rows',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'abort',name:'Cancelled writes'});const before=await vault.getCase('abort'),blob=new Blob(['Synthetic abort']),hash=await vaultTest.hash(blob),input={name:'plan.txt',hash,parserVersion:'v1',blob};
        const early=new AbortController();early.abort();const pre=await vaultTest.code(()=>vault.putSource('abort',{...input,id:'pre'},{signal:early.signal}));
        const readWithOptions=await vaultTest.code(()=>vault.getCase('abort',{signal:early.signal})),readWithSignal=await vaultTest.code(()=>vault.getCase('abort',early.signal));
        const during=new AbortController(),put=IDBObjectStore.prototype.put;let mid;
        try{IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==='originals')during.abort();return request;};mid=await vaultTest.code(()=>vault.putSource('abort',{...input,id:'mid'},{signal:during.signal}));}finally{IDBObjectStore.prototype.put=put;}
        const after=await vault.getCase('abort'),sources=await vault.listSources('abort');vault.close();return{pre,mid,readWithOptions,readWithSignal,before,after,sources};
      });
      assert.equal(result.pre.code,'ABORTED');assert.equal(result.mid.code,'ABORTED');assert.equal(result.mid.name,'AbortError');assert.equal(result.readWithOptions.code,'ABORTED');assert.equal(result.readWithSignal.code,'ABORTED');assert.deepEqual(result.after,result.before);assert.deepEqual(result.sources,[]);
    });

    await t.test('paginated metadata and verified shard iteration never call unbounded getAll',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'pagination',name:'Bounded pages'});let getAllCalls=0;const storeAll=IDBObjectStore.prototype.getAll,indexAll=IDBIndex.prototype.getAll;
        IDBObjectStore.prototype.getAll=IDBIndex.prototype.getAll=function(){getAllCalls++;throw Error('Unbounded getAll is forbidden in this test');};
        try{
          for(let i=0;i<9;i++){const id='source-'+String(i).padStart(2,'0'),source=await vaultTest.source(vault,'pagination',id);for(const kind of ['records','chunks'])await vault.putShard('pagination',id,{id:'part-1',kind,sourceHash:source.hash,sourceRevision:source.revision,payload:{index:i,text:'Synthetic bounded payload'}});}
          const pages=[];let afterId;
          while(true){const items=await vault.listSources('pagination',{afterId,limit:4});if(!items.length)break;pages.push(items.map(item=>item.id));afterId=items.at(-1).id;}
          const ids=[],sizes=[],verifications=[];for await(const shard of vault.iterateShards('pagination',{kind:'chunks'})){ids.push(shard.sourceId);sizes.push(shard.bytes);verifications.push(shard.verification);}
          const selected=[];for await(const shard of vault.iterateShards('pagination',{sourceId:'source-03',kind:'records'}))selected.push(shard.kind+':'+shard.payload.index);
          const invalid=await vaultTest.code(()=>vault.listSources('pagination',{limit:201}));
          return{pages,ids,sizes,verifications,selected,invalid,getAllCalls};
        }finally{IDBObjectStore.prototype.getAll=storeAll;IDBIndex.prototype.getAll=indexAll;vault.close();}
      });
      assert.deepEqual(result.pages.map(page=>page.length),[4,4,1]);assert.equal(new Set(result.pages.flat()).size,9);assert.equal(result.ids.length,9);assert.equal(new Set(result.ids).size,9);
      assert.ok(result.sizes.every(size=>size<100));assert.ok(result.verifications.every(value=>value==='authenticated-local-derived-v1'));assert.deepEqual(result.selected,['records:3']);assert.equal(result.invalid.code,'INVALID_INPUT');assert.equal(result.getAllCalls,0);
    });

    await t.test('term postings are source-bound authenticated shards with indexed iteration and tamper rejection',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'term-bindings',name:'Authenticated term postings'});const source=await vaultTest.source(vault,'term-bindings','plan');
        const payload={profile:'large-case-corpus-v1',generation:'active',chunkerProfile:'source-boundary-v3',termIndexProfile:'exact-terms-v1',chunkShardId:'c-active-00000000',search:{schemaVersion:1,kind:'case-term-postings',profile:'exact-terms-v1',count:1,chunkIds:['chunk:synthetic'],postings:[{term:'age',encoding:'sparse',ordinals:[0]}]},answersUseSearch:true};
        const input={id:'t-active-00000000',kind:'terms',sourceHash:source.hash,sourceRevision:source.revision,payload};
        const saved=await vault.putShard('term-bindings','plan',input),trusted=await vault.getShard('term-bindings','plan','terms',input.id),rows=[];
        for await(const shard of vault.iterateShards('term-bindings',{sourceId:'plan',kind:'terms'}))rows.push({kind:shard.kind,id:shard.id,verification:shard.verification});
        const stale=await vaultTest.code(()=>vault.putShard('term-bindings','plan',{...input,id:'stale',sourceRevision:source.revision+1}));
        await vaultTest.mutate('shards',['term-bindings','plan','terms',input.id],row=>({...row,payload:{...row.payload,chunkShardId:'c-forged-00000000'}}));
        const changed=await vaultTest.code(()=>vault.getShard('term-bindings','plan','terms',input.id));
        await vault.putShard('term-bindings','plan',input);await vaultTest.mutate('shards',['term-bindings','plan','terms',input.id],row=>{delete row.signature;return row;});
        const unsigned=await vaultTest.code(()=>vault.getShard('term-bindings','plan','terms',input.id));vault.close();return{saved,trusted,rows,stale,changed,unsigned};
      });
      assert.equal(result.saved.kind,'terms');assert.equal(result.trusted.verification,'authenticated-local-derived-v1');assert.equal(result.trusted.payload.chunkShardId,'c-active-00000000');
      assert.deepEqual(result.rows,[{kind:'terms',id:'t-active-00000000',verification:'authenticated-local-derived-v1'}]);assert.equal(result.stale.code,'CONFLICT');assert.equal(result.changed.code,'INTEGRITY');assert.equal(result.unsigned.code,'INTEGRITY');
    });

    await t.test('generation cleanup authenticates old term postings before deleting any source cache row',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'term-prune-tamper',name:'Term cleanup authentication'});const source=await vaultTest.source(vault,'term-prune-tamper','plan');
        for(const kind of ['records','chunks','terms'])await vault.putShard('term-prune-tamper','plan',{id:'old-'+kind,kind,sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'old',text:'Original metadata'}});
        await vault.putShard('term-prune-tamper','plan',{id:'summary',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',ready:true}});
        const before=await vault.getCase('term-prune-tamper');await vaultTest.mutate('shards',['term-prune-tamper','plan','terms','old-terms'],row=>({...row,payload:{generation:'old',text:'Modified metadata'}}));
        const rejected=await vaultTest.code(()=>vault.pruneSourceGeneration('term-prune-tamper','plan',{keepGeneration:'active',expectedRevision:before.revision})),after=await vault.getCase('term-prune-tamper');
        const oldRecord=await vault.getShard('term-prune-tamper','plan','records','old-records'),oldChunk=await vault.getShard('term-prune-tamper','plan','chunks','old-chunks');vault.close();return{before,after,rejected,oldRecord,oldChunk};
      });
      assert.equal(result.rejected.code,'INTEGRITY');assert.deepEqual(result.after,result.before);assert.equal(result.oldRecord.payload.generation,'old');assert.equal(result.oldChunk.payload.generation,'old');
    });

    await t.test('generation cleanup keeps the authenticated active index, originals and other sources',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'prune-good',name:'Generation cleanup'});
        const source=await vaultTest.source(vault,'prune-good','plan'),other=await vaultTest.source(vault,'prune-good','other');let oldBytes=0;
        for(const generation of ['old','active'])for(const kind of ['records','chunks','terms']){const saved=await vault.putShard('prune-good','plan',{id:generation+'-'+kind,kind,sourceHash:source.hash,sourceRevision:source.revision,payload:{generation,text:generation+' synthetic '+kind}});if(generation==='old')oldBytes+=saved.bytes;}
        await vault.putShard('prune-good','plan',{id:'vectors',kind:'vectors',sourceHash:source.hash,sourceRevision:source.revision,payload:{unversioned:'separate vector cache'}});
        await vault.putShard('prune-good','other',{id:'old-other',kind:'chunks',sourceHash:other.hash,sourceRevision:other.revision,payload:{generation:'old',text:'Other source stays'}});
        await vault.putShard('prune-good','plan',{id:'summary',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',ready:true}});
        const before=await vault.getCase('prune-good'),beforeSource=await vault.getSource('prune-good','plan',{includeBlob:false}),pruned=await vault.pruneSourceGeneration('prune-good','plan',{keepGeneration:'active',expectedRevision:before.revision}),after=await vault.getCase('prune-good'),afterSource=await vault.getSource('prune-good','plan',{includeBlob:false});
        const remaining=[];for await(const shard of vault.iterateShards('prune-good'))remaining.push(shard.sourceId+':'+shard.kind+':'+shard.id);
        const second=await vault.pruneSourceGeneration('prune-good','plan',{keepGeneration:'active',expectedRevision:after.revision}),original=await vault.getSource('prune-good','plan');vault.close();return{before,beforeSource,pruned,after,afterSource,remaining,second,oldBytes,original:await original.blob.text()};
      });
      assert.equal(result.pruned.removedShards,3);assert.equal(result.pruned.removedBytes,result.oldBytes);assert.equal(result.pruned.caseRevision,result.before.revision+1);
      assert.equal(result.after.derivedBytes,result.before.derivedBytes-result.oldBytes);assert.equal(result.after.shardCount,result.before.shardCount-3);assert.equal(result.afterSource.derivedBytes,result.beforeSource.derivedBytes-result.oldBytes);assert.equal(result.afterSource.shardCount,result.beforeSource.shardCount-3);
      assert.equal(result.after.originalBytes,result.before.originalBytes);assert.match(result.original,/normal retirement age is 65/);
      assert.deepEqual(result.remaining.sort(),['other:chunks:old-other','plan:chunks:active-chunks','plan:records:active-records','plan:records:summary','plan:terms:active-terms','plan:vectors:vectors'].sort());
      assert.deepEqual(result.second,{removedShards:0,removedBytes:0,caseRevision:result.after.revision});
    });

    await t.test('generation cleanup refuses wrong generation, stale CAS and unauthenticated summaries',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'prune-guards',name:'Cleanup guards'});const source=await vaultTest.source(vault,'prune-guards','plan');
        for(const generation of ['old','active'])await vault.putShard('prune-guards','plan',{id:generation,kind:'chunks',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation,text:'Fact 65'}});
        await vault.putShard('prune-guards','plan',{id:'summary',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',ready:true}});
        const before=await vault.getCase('prune-guards'),wrong=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-guards','plan',{keepGeneration:'old'})),stale=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-guards','plan',{keepGeneration:'active',expectedRevision:before.revision-1}));
        await vaultTest.mutate('shards',['prune-guards','plan','records','summary'],row=>({...row,payload:{generation:'old',ready:true}}));
        const tampered=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-guards','plan',{keepGeneration:'old'})),after=await vault.getCase('prune-guards'),old=await vault.getShard('prune-guards','plan','chunks','old');vault.close();return{wrong,stale,tampered,before,after,old};
      });
      assert.equal(result.wrong.code,'CONFLICT');assert.equal(result.stale.code,'CONFLICT');assert.equal(result.tampered.code,'INTEGRITY');assert.deepEqual(result.after,result.before);assert.equal(result.old.payload.generation,'old');
    });

    await t.test('cleanup aborts before and during deletion atomically without dropping the committed index',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault();await vault.createCase({id:'prune-abort',name:'Cancelled cleanup'});const source=await vaultTest.source(vault,'prune-abort','plan');
        for(const kind of ['records','chunks'])await vault.putShard('prune-abort','plan',{id:'old-'+kind,kind,sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'old',text:'Old synthetic row'}});
        await vault.putShard('prune-abort','plan',{id:'active',kind:'chunks',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',text:'Active synthetic row'}});
        await vault.putShard('prune-abort','plan',{id:'summary',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',ready:true}});
        const before=await vault.getCase('prune-abort'),preController=new AbortController();preController.abort();const pre=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-abort','plan',{keepGeneration:'active',signal:preController.signal}));
        const controller=new AbortController(),remove=IDBObjectStore.prototype.delete;let mid;
        try{IDBObjectStore.prototype.delete=function(...args){const request=remove.apply(this,args);if(this.name==='shards')controller.abort();return request;};mid=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-abort','plan',{keepGeneration:'active',signal:controller.signal}));}finally{IDBObjectStore.prototype.delete=remove;}
        const after=await vault.getCase('prune-abort'),remaining=[];for await(const shard of vault.iterateShards('prune-abort'))remaining.push(shard.id);vault.close();return{pre,mid,before,after,remaining};
      });
      assert.equal(result.pre.code,'ABORTED');assert.equal(result.mid.code,'ABORTED');assert.deepEqual(result.after,result.before);assert.deepEqual(result.remaining.sort(),['active','old-chunks','old-records','summary'].sort());
    });

    await t.test('cleanup detects a peer write during authentication before any deletion',async()=>{
      const result=await page.evaluate(async()=>{
        const vault=await PBGCRag.createCaseVault(),peer=await PBGCRag.createCaseVault();await vault.createCase({id:'prune-race',name:'Peer cleanup race'});const source=await vaultTest.source(vault,'prune-race','plan');
        await vault.putShard('prune-race','plan',{id:'old',kind:'chunks',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'old',text:'Old row'}});
        await vault.putShard('prune-race','plan',{id:'summary',kind:'records',sourceHash:source.hash,sourceRevision:source.revision,payload:{generation:'active',ready:true}});
        const before=await vault.getCase('prune-race'),verify=crypto.subtle.verify;let changed=false,rejected;
        try{crypto.subtle.verify=async function(...args){if(!changed){changed=true;await peer.putShard('prune-race','plan',{id:'peer',kind:'vectors',sourceHash:source.hash,sourceRevision:source.revision,payload:{text:'Peer write'}});}return verify.apply(this,args);};rejected=await vaultTest.code(()=>vault.pruneSourceGeneration('prune-race','plan',{keepGeneration:'active'}));}finally{crypto.subtle.verify=verify;}
        const after=await vault.getCase('prune-race'),old=await vault.getShard('prune-race','plan','chunks','old');vault.close();peer.close();return{before,after,rejected,old,changed};
      });
      assert.equal(result.changed,true);assert.equal(result.rejected.code,'CONFLICT');assert.equal(result.after.revision,result.before.revision+1);assert.equal(result.after.shardCount,result.before.shardCount+1);assert.equal(result.old.payload.generation,'old');
    });

    await t.test('missing IndexedDB and WebCrypto fail explicitly without storage downgrades',async()=>{
      const result=await page.evaluate(async()=>({missing:await vaultTest.code(()=>PBGCRag.createCaseVault({indexedDB:null})),crypto:await vaultTest.code(()=>PBGCRag.createCaseVault({crypto:null}))}));
      assert.equal(result.missing.code,'UNAVAILABLE');assert.match(result.missing.message,/No memory or localStorage fallback/);assert.equal(result.crypto.code,'UNAVAILABLE');
    });
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    t.diagnostic(JSON.stringify({profile,realIndexedDB:true,realWebCrypto:true,largestOriginalBytes:5*1024*1024,largeCaseCapacityMeasured:false,externalRequests:external.length}));
  }finally{await context.close();await browser.close();}
});
