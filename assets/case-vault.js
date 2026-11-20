/* Bounded IndexedDB storage for large local cases. Originals stay in Blob rows,
 * never in the legacy JSON recovery catalog. Derived data is a cache, not proof:
 * reparse verified originals before releasing answers or restoring review state. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const MiB=1024*1024,GiB=1024*MiB;
  const CASE_VAULT_LIMITS=Object.freeze({caseBytes:GiB,sourceBytes:64*MiB,shardBytes:20*MiB,derivedBytes:8*GiB,sources:2000,cases:128,shards:200000,pageSize:200});
  const DB_NAME='pbgc-rag-case-vault',VERSION=2,KINDS=['records','chunks','terms','vectors'],CACHE_PROFILE='authenticated-local-derived-v1';
  const HASH=/^[a-f0-9]{64}$/;
  class CaseVaultError extends Error{constructor(code,message,cause){super(message);this.name=code==='ABORTED'?'AbortError':'CaseVaultError';this.code=code;if(cause)this.cause=cause;}}
  const error=(code,message,cause)=>new CaseVaultError(code,message,cause);
  const fail=(code,message)=>{throw error(code,message);};
  const capability=(options,key)=>Object.hasOwn(options,key)?options[key]:root[key];
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
  const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=255&&!/[\x00-\x1f]/.test(value);
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  function checkId(value,label){if(!id(value))fail('INVALID_INPUT','Use a bounded '+label+' ID.');}
  function abort(signal){if(signal?.aborted)throw error('ABORTED','Large-case storage operation was cancelled.');}
  function signalChecked(signal){if(signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))fail('INVALID_INPUT','Invalid storage cancellation signal.');abort(signal);}
  function boundedJSON(value,maximum,label){
    let nodes=0;
    function check(item,depth){if(++nodes>500000||depth>32)fail('SIZE_LIMIT',label+' metadata is too complex.');if(item===null||typeof item==='string'||typeof item==='boolean')return;if(typeof item==='number'&&Number.isFinite(item))return;if(Array.isArray(item)){for(let i=0;i<item.length;i++){if(!Object.hasOwn(item,i))fail('INVALID_INPUT',label+' contains a sparse array.');check(item[i],depth+1);}return;}if(plain(item)){for(const key of Object.keys(item)){if(key==='__proto__'||key==='constructor'||key==='prototype')fail('INVALID_INPUT',label+' has an unsafe metadata key.');check(item[key],depth+1);}return;}fail('INVALID_INPUT',label+' must contain plain JSON data.');}
    check(value,0);let text;try{text=JSON.stringify(value);}catch(cause){throw error('INVALID_INPUT',label+' is not serializable.',cause);}
    if(text.length>maximum||new TextEncoder().encode(text).byteLength>maximum)fail('SIZE_LIMIT',label+' exceeds its bounded byte budget.');
    return{value:JSON.parse(text),bytes:new TextEncoder().encode(text).byteLength};
  }
  function configuration(options){
    if(!plain(options))fail('INVALID_OPTIONS','Large-case options must be a plain object.');
    const limits={};
    for(const [key,defaultValue]of Object.entries({maxCaseBytes:CASE_VAULT_LIMITS.caseBytes,maxSourceBytes:CASE_VAULT_LIMITS.sourceBytes,maxShardBytes:CASE_VAULT_LIMITS.shardBytes,maxDerivedBytes:CASE_VAULT_LIMITS.derivedBytes,maxSources:CASE_VAULT_LIMITS.sources})){
      const value=options[key]??defaultValue;if(!Number.isSafeInteger(value)||value<1||value>defaultValue)fail('INVALID_OPTIONS','Invalid '+key+' large-case budget.');limits[key]=value;
    }
    const timeoutMs=options.timeoutMs??30000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail('INVALID_OPTIONS','Storage timeout must be from one to 120000 milliseconds.');
    const now=options.now??(()=>new Date().toISOString());if(typeof now!=='function')fail('INVALID_OPTIONS','Invalid large-case clock.');
    return{...limits,timeoutMs,now};
  }
  async function createCaseVault(options={}){
    const config=configuration(options),indexed=capability(options,'indexedDB'),crypto=capability(options,'crypto'),BlobType=root.Blob;
    if(!indexed||typeof indexed.open!=='function')fail('UNAVAILABLE','Large cases need IndexedDB. No memory or localStorage fallback was selected.');
    if(typeof crypto?.subtle?.digest!=='function'||typeof BlobType!=='function')fail('UNAVAILABLE','Large cases need local SHA-256 and native Blob support.');
    let closed=false,queue=Promise.resolve(),signingKey,pending=0;const active=new Set();
    function timestamp(){const value=config.now();if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('INVALID_DATE','Invalid large-case timestamp.');return value;}
    function ensureOpen(){if(closed)fail('CLOSED','The large-case store is closed.');}
    const db=await new Promise((resolve,reject)=>{
      let request,settled=false;const timer=setTimeout(()=>{settled=true;reject(error('TIMEOUT','Large-case storage could not open within its time budget.'));},config.timeoutMs);
      const rejectOnce=cause=>{if(settled)return;settled=true;clearTimeout(timer);reject(error('UNAVAILABLE','Large-case IndexedDB is unavailable. No memory fallback was selected.',cause));};
      try{request=indexed.open(DB_NAME,VERSION);}catch(cause){rejectOnce(cause);return;}
      request.onupgradeneeded=()=>{const value=request.result;
        if(!value.objectStoreNames.contains('cases'))value.createObjectStore('cases',{keyPath:'id'});
        const sourceMeta=value.objectStoreNames.contains('sourceMeta')?request.transaction.objectStore('sourceMeta'):value.createObjectStore('sourceMeta',{keyPath:['caseId','id']});
        if(!sourceMeta.indexNames.contains('byCase'))sourceMeta.createIndex('byCase','caseId',{unique:false});
        const originals=value.objectStoreNames.contains('originals')?request.transaction.objectStore('originals'):value.createObjectStore('originals',{keyPath:['caseId','sourceId']});
        if(!originals.indexNames.contains('byCase'))originals.createIndex('byCase','caseId',{unique:false});
        const shards=value.objectStoreNames.contains('shards')?request.transaction.objectStore('shards'):value.createObjectStore('shards',{keyPath:['caseId','sourceId','kind','id']});
        for(const [index,key]of [['byCase','caseId'],['bySource',['caseId','sourceId']],['byCaseKind',['caseId','kind']]])if(!shards.indexNames.contains(index))shards.createIndex(index,key,{unique:false});
        if(!value.objectStoreNames.contains('keys'))value.createObjectStore('keys',{keyPath:'id'});
      };
      request.onerror=()=>rejectOnce(request.error);request.onblocked=()=>rejectOnce(Error('A different tab blocks the database version.'));
      request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);};
    });
    db.onversionchange=()=>{closed=true;for(const tx of active)try{tx.abort();}catch(_){}db.close();};
    function capacity(){ensureOpen();if(pending>=4)fail('BUSY','Wait for a pending large-case operation before adding more work.');}
    function serialize(fn){capacity();pending++;const result=queue.then(()=>{ensureOpen();return fn();}).finally(()=>{pending--;});queue=result.catch(()=>{});return result;}
    function failure(cause){if(cause instanceof CaseVaultError)return cause;if(cause?.name==='QuotaExceededError')return error('QUOTA','The browser has no room for this large-case write. Existing committed data was kept.',cause);return error('STORAGE_FAILED','Large-case storage failed. Existing committed data was kept.',cause);}
    function run(stores,mode,work,signal){
      ensureOpen();signalChecked(signal);
      return new Promise((resolve,reject)=>{let tx,settled=false,result,cause;
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);if(tx)active.delete(tx);};
        const rejectOnce=value=>{if(settled)return;settled=true;cleanup();reject(failure(value));};
        const stop=value=>{cause=value;try{tx?.abort();}catch(_){}rejectOnce(value);};
        const onAbort=()=>stop(error('ABORTED','Large-case storage operation was cancelled.'));
        const timer=setTimeout(()=>stop(error('TIMEOUT','Large-case storage exceeded its transaction time budget.')),config.timeoutMs);
        signal?.addEventListener('abort',onAbort,{once:true});
        try{tx=db.transaction(stores,mode);active.add(tx);const api={store:key=>tx.objectStore(key),result:value=>{result=value;},fail:stop,request:(request,callback)=>{request.onsuccess=()=>{if(settled)return;try{callback?.(request.result,request);}catch(value){stop(value);}};request.onerror=()=>{cause=request.error;};return request;}};
          tx.oncomplete=()=>{if(settled)return;settled=true;cleanup();resolve(result);};tx.onerror=()=>rejectOnce(cause||tx.error);tx.onabort=()=>rejectOnce(cause||tx.error||error('ABORTED','Large-case transaction was aborted.'));
          work(api);
        }catch(value){stop(value);}
      });
    }
    async function initializeKey(){
      if(typeof crypto.subtle.generateKey!=='function'||typeof crypto.subtle.sign!=='function'||typeof crypto.subtle.verify!=='function')fail('UNAVAILABLE','Large-case derived storage needs local HMAC support.');
      let row=await run(['keys'],'readonly',api=>api.request(api.store('keys').get(CACHE_PROFILE),value=>api.result(value)));
      if(!row){const key=await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'},false,['sign','verify']);row=await run(['keys'],'readwrite',api=>api.request(api.store('keys').get(CACHE_PROFILE),existing=>{if(existing){api.result(existing);return;}const next={id:CACHE_PROFILE,key};api.store('keys').add(next);api.result(next);}));}
      const key=row?.key;
      if(!key||key.type!=='secret'||key.extractable!==false||key.algorithm?.name!=='HMAC'||key.algorithm?.hash?.name!=='SHA-256'||!key.usages?.includes('sign')||!key.usages?.includes('verify'))fail('INTEGRITY','The local derived-cache key is missing or invalid. Rebuild the case cache from original files.');
      // Read the persisted clone, rather than trusting only the generated object.
      const persisted=await run(['keys'],'readonly',api=>api.request(api.store('keys').get(CACHE_PROFILE),value=>api.result(value)));
      const challenge=new TextEncoder().encode(CACHE_PROFILE),proof=await crypto.subtle.sign('HMAC',key,challenge);
      if(!persisted?.key||!await crypto.subtle.verify('HMAC',persisted.key,proof,challenge))fail('UNAVAILABLE','This browser cannot persist the local derived-cache key. Large-case caching is unavailable.');
      signingKey=persisted.key;
    }
    function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(stable).join(',')+']';return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';}
    function authenticationInput(shard,payload){return new TextEncoder().encode(JSON.stringify([CACHE_PROFILE,shard.caseId,shard.sourceId,shard.sourceHash,shard.sourceRevision,shard.parserVersion,shard.kind,shard.id,shard.bytes])+'\n'+stable(payload));}
    async function signed(shard,signal){abort(signal);const signature=await crypto.subtle.sign('HMAC',signingKey,authenticationInput(shard,shard.payload));abort(signal);ensureOpen();return new Uint8Array(signature);}
    async function verified(shard,signal){
      if(shard.authenticationProfile!==CACHE_PROFILE||!(shard.signature instanceof Uint8Array)||shard.signature.length!==32)fail('INTEGRITY','A derived cache record has no valid local authentication. Rebuild it from the original source.');
      const payload=boundedJSON(shard.payload,config.maxShardBytes,'Stored derived shard');if(payload.bytes!==shard.bytes)fail('INTEGRITY','Stored derived shard byte count changed.');abort(signal);
      if(!await crypto.subtle.verify('HMAC',signingKey,shard.signature,authenticationInput(shard,payload.value)))fail('INTEGRITY','A derived cache record was changed. Rebuild it from the original source.');
      abort(signal);ensureOpen();return payload.value;
    }
    try{await initializeKey();}catch(cause){closed=true;db.close();if(cause instanceof CaseVaultError)throw cause;throw error('UNAVAILABLE','Local authenticated cache initialization failed. No unauthenticated fallback was selected.',cause);}
    function caseChecked(value){if(!value||value.kind!=='pbgc-case-vault'||value.schemaVersion!==1||!id(value.id)||!name(value.name)||!Number.isSafeInteger(value.revision)||value.revision<1||!['sourceCount','originalBytes','derivedBytes','shardCount'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)||value.originalBytes>config.maxCaseBytes||value.derivedBytes>config.maxDerivedBytes||value.sourceCount>config.maxSources||value.shardCount>CASE_VAULT_LIMITS.shards)fail('CORRUPT','Large-case manifest is invalid.');return value;}
    function sourceChecked(value){if(!value||!id(value.id)||!id(value.caseId)||!name(value.name)||!HASH.test(value.hash)||typeof value.parserVersion!=='string'||!value.parserVersion||value.parserVersion.length>160||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>config.maxSourceBytes||!Number.isSafeInteger(value.revision)||value.revision<1||!Number.isSafeInteger(value.derivedBytes)||value.derivedBytes<0||!Number.isSafeInteger(value.shardCount)||value.shardCount<0)fail('CORRUPT','Stored source metadata is invalid.');return value;}
    function expected(caseValue,revision){if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<1))fail('INVALID_INPUT','Invalid expected large-case revision.');if(revision!==undefined&&revision!==caseValue.revision)fail('CONFLICT','This case changed in another operation. Refresh the case before saving.');}
    function bump(value,patch){if(value.revision>=Number.MAX_SAFE_INTEGER)fail('REVISION_LIMIT','Large-case revision limit reached.');return{...value,...patch,revision:value.revision+1,updatedAt:timestamp()};}
    async function checkedBlob(blob,hash,signal){
      signalChecked(signal);if(!(blob instanceof BlobType)||!Number.isSafeInteger(blob.size)||blob.size<0||blob.size>config.maxSourceBytes)fail('SIZE_LIMIT','A large-case source must be a native Blob no larger than its source budget.');
      const bytes=await BlobType.prototype.arrayBuffer.call(blob);abort(signal);ensureOpen();const digest=await crypto.subtle.digest('SHA-256',bytes);abort(signal);ensureOpen();const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(actual!==hash)fail('INTEGRITY','Original source bytes do not match their SHA-256.');return BlobType.prototype.slice.call(blob,0,blob.size,blob.type);
    }
    function cursorDelete(api,store,index,key,done){let count=0,bytes=0;return api.request(store.index(index).openCursor(key),cursor=>{if(!cursor){done({count,bytes});return;}const value=cursor.value;count++;bytes+=value.bytes||0;cursor.delete();cursor.continue();});}
    // Whole-case deletion needs only primary keys. Keep large originals and
    // derived payloads out of cursor results when their totals are discarded.
    function deleteByKey(api,store,index,key,done){return api.request(store.index(index).openKeyCursor(key),cursor=>{if(!cursor){done();return;}api.request(store.delete(cursor.primaryKey));cursor.continue();});}
    function readCase(caseId,signal){checkId(caseId,'case');return run(['cases'],'readonly',api=>api.request(api.store('cases').get(caseId),value=>api.result(value?caseChecked(value):null)),signal);}
    function page(index,key,{afterId,limit=100,signal}={}){
      if(afterId!==undefined&&!id(afterId))fail('INVALID_INPUT','Invalid source pagination cursor.');
      if(!Number.isInteger(limit)||limit<1||limit>CASE_VAULT_LIMITS.pageSize)fail('INVALID_INPUT','Source page size must be from one to 200.');
      return run(['sourceMeta'],'readonly',api=>{
        const values=[],request=api.store('sourceMeta').index(index).openCursor(key);
        request.onsuccess=()=>{const cursor=request.result;if(!cursor){api.result(values);return;}
          try{const item=sourceChecked(cursor.value);
            if(afterId!==undefined&&item.id<=afterId){if(item.id<afterId&&typeof cursor.continuePrimaryKey==='function')cursor.continuePrimaryKey(cursor.key,[key,afterId]);else cursor.continue();return;}
            values.push(item);if(values.length>=limit){api.result(values);return;}cursor.continue();
          }catch(cause){api.fail(cause);}
        };
      },signal);
    }
    const vault={
      info(){return{kind:'IndexedDB',persistent:true,persistence:'browser-managed',encrypted:false,cacheAuthentication:CACHE_PROFILE,closed,limits:{...config,now:undefined},warnings:['Stored unencrypted on this computer. Browser storage can be cleared; keep original files and a portable backup.']};},
      createCase(input,options={}){return serialize(()=>{if(!plain(input)||!id(input.id)||!name(input.name))fail('INVALID_INPUT','Provide a case ID and name.');const savedAt=timestamp(),value={schemaVersion:1,kind:'pbgc-case-vault',id:input.id,name:input.name.trim(),revision:1,sourceCount:0,originalBytes:0,derivedBytes:0,shardCount:0,createdAt:savedAt,updatedAt:savedAt};return run(['cases'],'readwrite',api=>api.request(api.store('cases').count(),count=>{if(count>=CASE_VAULT_LIMITS.cases)fail('SIZE_LIMIT','Large-case storage supports at most 128 cases.');api.request(api.store('cases').get(input.id),existing=>{if(existing)fail('ALREADY_EXISTS','A large case with that ID already exists.');api.store('cases').add(value);api.result(value);});}),options.signal);});},
      listCases(options={}){return run(['cases'],'readonly',api=>{const values=[],request=api.store('cases').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){api.result(values);return;}try{if(values.length>=CASE_VAULT_LIMITS.cases)fail('CORRUPT','Stored case count exceeds its limit.');values.push(caseChecked(cursor.value));cursor.continue();}catch(cause){api.fail(cause);}};},options.signal);},
      // Accept the direct signal used by early collection callers as well as the
      // options object used by the rest of this API.
      getCase(caseId,options={}){return readCase(caseId,options&&typeof options.aborted==='boolean'?options:options.signal);},
      listSources(caseId,options={}){checkId(caseId,'case');return page('byCase',caseId,options);},
      async putSource(caseId,input,options={}){
        capacity();checkId(caseId,'case');
        if(!plain(input)||!id(input.id)||!name(input.name)||!HASH.test(input.hash)||typeof input.parserVersion!=='string'||!input.parserVersion||input.parserVersion.length>160)fail('INVALID_INPUT','Provide exact source ID, name, parser version and SHA-256.');
        const metadata=boundedJSON({warnings:input.warnings??[],...(input.processing===undefined?{}:{processing:input.processing})},MiB,'Source');
        const snapshot={id:input.id,name:input.name,hash:input.hash,parserVersion:input.parserVersion,blob:input.blob},settings={signal:options.signal,expectedRevision:options.expectedRevision};
        return serialize(async()=>{
          const blob=await checkedBlob(snapshot.blob,snapshot.hash,settings.signal);
          return run(['cases','sourceMeta','originals','shards'],'readwrite',api=>api.request(api.store('cases').get(caseId),rawCase=>{
            if(!rawCase)fail('NOT_FOUND','Large case was not found.');const c=caseChecked(rawCase);expected(c,settings.expectedRevision);
            api.request(api.store('sourceMeta').get([caseId,snapshot.id]),rawSource=>{
              const old=rawSource?sourceChecked(rawSource):null,total=c.originalBytes-(old?.bytes||0)+blob.size;
              if(total>config.maxCaseBytes||(!old&&c.sourceCount>=config.maxSources))fail('SIZE_LIMIT','Large case exceeds its original-byte or source-count budget.');
              cursorDelete(api,api.store('shards'),'bySource',[caseId,snapshot.id],removed=>{
                const now=timestamp(),revision=(old?.revision||0)+1;if(!Number.isSafeInteger(revision))fail('REVISION_LIMIT','Source revision limit reached.');
                const source={caseId,id:snapshot.id,name:snapshot.name,hash:snapshot.hash,parserVersion:snapshot.parserVersion,bytes:blob.size,revision,derivedBytes:0,shardCount:0,createdAt:old?.createdAt||now,updatedAt:now,...metadata.value};
                const next=bump(c,{sourceCount:c.sourceCount+(old?0:1),originalBytes:total,derivedBytes:c.derivedBytes-removed.bytes,shardCount:c.shardCount-removed.count});
                if(next.derivedBytes<0||next.shardCount<0)fail('CORRUPT','Stored derived totals are inconsistent.');
                api.store('sourceMeta').put(source);api.store('originals').put({caseId,sourceId:snapshot.id,hash:snapshot.hash,revision,blob});api.store('cases').put(next);api.result({...source,caseRevision:next.revision});
              });
            });
          }),settings.signal);
        });
      },
      async getSource(caseId,sourceId,options={}){
        checkId(caseId,'case');checkId(sourceId,'source');const withBlob=options.includeBlob!==false,signal=options.signal;
        return serialize(async()=>{
          const value=await run(withBlob?['sourceMeta','originals']:['sourceMeta'],'readonly',api=>api.request(api.store('sourceMeta').get([caseId,sourceId]),raw=>{
            if(!raw){api.result(null);return;}const source=sourceChecked(raw);if(!withBlob){api.result(source);return;}
            api.request(api.store('originals').get([caseId,sourceId]),original=>{if(!original||original.hash!==source.hash||original.revision!==source.revision||!(original.blob instanceof BlobType)||original.blob.size!==source.bytes)fail('INTEGRITY','Original source row is missing or inconsistent.');api.result({...source,blob:original.blob});});
          }),signal);
          if(value&&withBlob){value.blob=await checkedBlob(value.blob,value.hash,signal);const current=await run(['sourceMeta'],'readonly',api=>api.request(api.store('sourceMeta').get([caseId,sourceId]),row=>api.result(row?sourceChecked(row):null)),signal);if(!current||current.hash!==value.hash||current.revision!==value.revision||current.parserVersion!==value.parserVersion)fail('CONFLICT','Source changed while original bytes were being verified.');}
          return value;
        });
      },
      async putShard(caseId,sourceId,input,options={}){
        capacity();checkId(caseId,'case');checkId(sourceId,'source');
        if(!plain(input)||!id(input.id)||!KINDS.includes(input.kind)||!HASH.test(input.sourceHash)||!Number.isSafeInteger(input.sourceRevision)||input.sourceRevision<1)fail('INVALID_INPUT','A derived shard needs its kind, ID, source hash and source revision.');
        const encoded=boundedJSON(input.payload,config.maxShardBytes,'Derived shard'),snapshot={id:input.id,kind:input.kind,sourceHash:input.sourceHash,sourceRevision:input.sourceRevision},settings={signal:options.signal,expectedRevision:options.expectedRevision};
        return serialize(async()=>{
          const source=await run(['sourceMeta'],'readonly',api=>api.request(api.store('sourceMeta').get([caseId,sourceId]),value=>api.result(value?sourceChecked(value):null)),settings.signal);
          if(!source)fail('NOT_FOUND','Source was not found.');
          if(source.hash!==snapshot.sourceHash||source.revision!==snapshot.sourceRevision)fail('CONFLICT','The source changed before its derived shard was saved.');
          const shard={caseId,sourceId,...snapshot,parserVersion:source.parserVersion,bytes:encoded.bytes,payload:encoded.value,authenticationProfile:CACHE_PROFILE,updatedAt:timestamp()};
          shard.signature=await signed(shard,settings.signal);
          return run(['cases','sourceMeta','shards'],'readwrite',api=>api.request(api.store('cases').get(caseId),rawCase=>{
            if(!rawCase)fail('NOT_FOUND','Large case was not found.');const c=caseChecked(rawCase);expected(c,settings.expectedRevision);
            api.request(api.store('sourceMeta').get([caseId,sourceId]),rawSource=>{
              if(!rawSource)fail('NOT_FOUND','Source was not found.');const latest=sourceChecked(rawSource);
              if(latest.hash!==source.hash||latest.revision!==source.revision||latest.parserVersion!==source.parserVersion)fail('CONFLICT','The source changed while its cache was being authenticated.');
              const key=[caseId,sourceId,shard.kind,shard.id];api.request(api.store('shards').get(key),old=>{
                if(old&&(!Number.isSafeInteger(old.bytes)||old.bytes<0||old.bytes>config.maxShardBytes))fail('INTEGRITY','Stored derived shard metadata is invalid. Rebuild it from the original source.');
                const total=c.derivedBytes-(old?.bytes||0)+encoded.bytes;
                if(total>config.maxDerivedBytes||(!old&&c.shardCount>=CASE_VAULT_LIMITS.shards))fail('SIZE_LIMIT','Large-case derived storage exceeds its budget.');
                const next=bump(c,{derivedBytes:total,shardCount:c.shardCount+(old?0:1)});
                api.store('shards').put(shard);api.store('sourceMeta').put({...latest,derivedBytes:latest.derivedBytes-(old?.bytes||0)+encoded.bytes,shardCount:latest.shardCount+(old?0:1)});api.store('cases').put(next);
                api.result({id:shard.id,kind:shard.kind,sourceHash:shard.sourceHash,sourceRevision:shard.sourceRevision,bytes:shard.bytes,authenticationProfile:CACHE_PROFILE,caseRevision:next.revision});
              });
            });
          }),settings.signal);
        });
      },
      async getShard(caseId,sourceId,kind,shardId,options={}){
        if(plain(kind)){options=shardId||{};shardId=kind.id;kind=kind.kind;}
        checkId(caseId,'case');checkId(sourceId,'source');checkId(shardId,'shard');if(!KINDS.includes(kind))fail('INVALID_INPUT','Unsupported derived shard kind.');const signal=options.signal;
        return serialize(async()=>{
          const row=await run(['sourceMeta','shards'],'readonly',api=>api.request(api.store('sourceMeta').get([caseId,sourceId]),rawSource=>{
            if(!rawSource){api.result(null);return;}const source=sourceChecked(rawSource);
            api.request(api.store('shards').get([caseId,sourceId,kind,shardId]),shard=>{
              if(!shard){api.result(null);return;}
              if(shard.sourceHash!==source.hash||shard.sourceRevision!==source.revision||shard.parserVersion!==source.parserVersion)fail('INTEGRITY','Derived shard source binding is stale.');api.result(shard);
            });
          }),signal);
          if(!row)return null;const payload=await verified(row,signal);
          const current=await run(['sourceMeta'],'readonly',api=>api.request(api.store('sourceMeta').get([caseId,sourceId]),value=>api.result(value?sourceChecked(value):null)),signal);
          if(!current||current.hash!==row.sourceHash||current.revision!==row.sourceRevision||current.parserVersion!==row.parserVersion)fail('CONFLICT','Source changed while its cache was being read.');
          const {signature,...metadata}=row;return{...metadata,payload,verification:CACHE_PROFILE};
        });
      },
      async *iterateShards(caseId,options={}){
        checkId(caseId,'case');const settings={sourceId:options.sourceId,kind:options.kind,signal:options.signal};
        if(settings.sourceId!==undefined)checkId(settings.sourceId,'source');if(settings.kind!==undefined&&!KINDS.includes(settings.kind))fail('INVALID_INPUT','Unsupported derived shard kind.');let after;
        while(true){
          abort(settings.signal);
          const row=await run(['shards'],'readonly',api=>{
            const store=api.store('shards'),index=settings.sourceId?store.index('bySource'):settings.kind?store.index('byCaseKind'):store.index('byCase'),key=settings.sourceId?[caseId,settings.sourceId]:settings.kind?[caseId,settings.kind]:caseId,request=index.openCursor(key);
            request.onsuccess=()=>{const cursor=request.result;if(!cursor){api.result(null);return;}
              try{const comparison=after===undefined?1:indexed.cmp(cursor.primaryKey,after);
                if(comparison<=0){if(comparison<0&&typeof cursor.continuePrimaryKey==='function')cursor.continuePrimaryKey(cursor.key,after);else cursor.continue();return;}
                const value=cursor.value;if(settings.kind&&value.kind!==settings.kind){cursor.continue();return;}
                api.result({sourceId:value.sourceId,kind:value.kind,id:value.id,primaryKey:cursor.primaryKey});
              }catch(cause){api.fail(cause);}
            };
          },settings.signal);
          if(!row)return;after=row.primaryKey;const shard=await vault.getShard(caseId,row.sourceId,row.kind,row.id,settings);if(shard)yield shard;
        }
      },
      async pruneSourceGeneration(caseId,sourceId,options={}){
        capacity();checkId(caseId,'case');checkId(sourceId,'source');
        if(!plain(options)||!id(options.keepGeneration))fail('INVALID_INPUT','Choose the exact committed source generation to keep.');
        const settings={keepGeneration:options.keepGeneration,signal:options.signal,expectedRevision:options.expectedRevision};signalChecked(settings.signal);
        // Read and authenticate bounded rows before opening the write transaction:
        // awaiting WebCrypto inside an IndexedDB transaction can close it early.
        const before=await readCase(caseId,settings.signal);if(!before)fail('NOT_FOUND','Large case was not found.');expected(before,settings.expectedRevision);
        const source=await vault.getSource(caseId,sourceId,{includeBlob:false,signal:settings.signal});if(!source)fail('NOT_FOUND','Source was not found.');
        const summary=await run(['shards'],'readonly',api=>api.request(api.store('shards').get([caseId,sourceId,'records','summary']),row=>api.result(row)),settings.signal);
        if(!summary||summary.sourceHash!==source.hash||summary.sourceRevision!==source.revision||summary.parserVersion!==source.parserVersion)fail('CONFLICT','A committed summary bound to the current source is required before pruning.');
        const summaryPayload=await verified(summary,settings.signal);
        if(summaryPayload.ready!==true||summaryPayload.generation!==settings.keepGeneration)fail('CONFLICT','Only the source generation in its authenticated committed summary can be kept.');
        const summaryProof=stable(summaryPayload),summarySignature=Array.from(summary.signature).join(','),candidates=[];
        for(const kind of ['records','chunks','terms'])for await(const shard of vault.iterateShards(caseId,{sourceId,kind,signal:settings.signal})){
          if(kind==='records'&&shard.id==='summary')continue;
          if(!id(shard.payload?.generation))fail('INTEGRITY','A source cache row has no valid generation. Rebuild it before pruning.');
          if(shard.payload.generation===settings.keepGeneration)continue;
          if(candidates.length>=CASE_VAULT_LIMITS.shards)fail('SIZE_LIMIT','Too many source cache rows to prune within the bounded operation.');
          candidates.push({kind:shard.kind,id:shard.id,bytes:shard.bytes,updatedAt:shard.updatedAt});
        }
        return serialize(()=>run(['cases','sourceMeta','shards'],'readwrite',api=>api.request(api.store('cases').get(caseId),rawCase=>{
          if(!rawCase)fail('NOT_FOUND','Large case was not found.');const c=caseChecked(rawCase);expected(c,before.revision);
          api.request(api.store('sourceMeta').get([caseId,sourceId]),rawSource=>{
            if(!rawSource)fail('NOT_FOUND','Source was not found.');const latest=sourceChecked(rawSource);
            if(latest.hash!==source.hash||latest.revision!==source.revision||latest.parserVersion!==source.parserVersion)fail('CONFLICT','The source changed while old cache rows were checked.');
            api.request(api.store('shards').get([caseId,sourceId,'records','summary']),current=>{
              if(!current||current.sourceHash!==summary.sourceHash||current.sourceRevision!==summary.sourceRevision||current.parserVersion!==summary.parserVersion||current.bytes!==summary.bytes||current.authenticationProfile!==CACHE_PROFILE||!(current.signature instanceof Uint8Array)||Array.from(current.signature).join(',')!==summarySignature||stable(current.payload)!==summaryProof)fail('CONFLICT','The committed source summary changed before cache cleanup.');
              let at=0,removedBytes=0;
              function next(){
                if(at===candidates.length){
                  if(!at){api.result({removedShards:0,removedBytes:0,caseRevision:c.revision});return;}
                  const nextCase=bump(c,{derivedBytes:c.derivedBytes-removedBytes,shardCount:c.shardCount-at}),nextSource={...latest,derivedBytes:latest.derivedBytes-removedBytes,shardCount:latest.shardCount-at};
                  if(nextCase.derivedBytes<0||nextCase.shardCount<0||nextSource.derivedBytes<0||nextSource.shardCount<0)fail('CORRUPT','Stored source cache totals are inconsistent.');
                  api.store('cases').put(nextCase);api.store('sourceMeta').put(nextSource);api.result({removedShards:at,removedBytes,caseRevision:nextCase.revision});return;
                }
                const target=candidates[at],key=[caseId,sourceId,target.kind,target.id];
                api.request(api.store('shards').get(key),row=>{
                  if(!row||row.sourceHash!==source.hash||row.sourceRevision!==source.revision||row.parserVersion!==source.parserVersion||row.bytes!==target.bytes||row.updatedAt!==target.updatedAt||!id(row.payload?.generation)||row.payload.generation===settings.keepGeneration)fail('CONFLICT','A cache row changed before cleanup.');
                  api.store('shards').delete(key);removedBytes+=target.bytes;at++;next();
                });
              }
              next();
            });
          });
        }),settings.signal));
      },
      deleteSource(caseId,sourceId,options={}){return serialize(()=>{checkId(caseId,'case');checkId(sourceId,'source');return run(['cases','sourceMeta','originals','shards'],'readwrite',api=>api.request(api.store('cases').get(caseId),rawCase=>{if(!rawCase)fail('NOT_FOUND','Large case was not found.');const c=caseChecked(rawCase);expected(c,options.expectedRevision);api.request(api.store('sourceMeta').get([caseId,sourceId]),rawSource=>{if(!rawSource){api.result(false);return;}const source=sourceChecked(rawSource);cursorDelete(api,api.store('shards'),'bySource',[caseId,sourceId],removed=>{const next=bump(c,{sourceCount:c.sourceCount-1,originalBytes:c.originalBytes-source.bytes,derivedBytes:c.derivedBytes-removed.bytes,shardCount:c.shardCount-removed.count});if(next.originalBytes<0||next.derivedBytes<0||next.shardCount<0)fail('CORRUPT','Stored case totals are inconsistent.');api.store('sourceMeta').delete([caseId,sourceId]);api.store('originals').delete([caseId,sourceId]);api.store('cases').put(next);api.result(true);});});}),options.signal);});},
      deleteCase(caseId,options={}){return serialize(()=>{
        checkId(caseId,'case');return run(['cases','sourceMeta','originals','shards'],'readwrite',api=>api.request(api.store('cases').get(caseId),rawCase=>{
          if(!rawCase){api.result(false);return;}const c=caseChecked(rawCase);expected(c,options.expectedRevision);
          deleteByKey(api,api.store('sourceMeta'),'byCase',caseId,()=>deleteByKey(api,api.store('originals'),'byCase',caseId,()=>deleteByKey(api,api.store('shards'),'byCase',caseId,()=>{api.store('cases').delete(caseId);api.result(true);})));
        }),options.signal);
      });},
      close(){if(closed)return;closed=true;for(const tx of active)try{tx.abort();}catch(_){}db.close();}
    };
    return vault;
  }
  return{createCaseVault,CaseVaultError,CASE_VAULT_LIMITS};
});
