/* Offline byte-parser isolation. The worker source is generated from our own
 * classic parser modules; documents are never executed as code. One worker is
 * active at a time. Queued requests are bounded and cancellation is immediate.
 */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const INGEST_LIMITS=Object.freeze({input:5*1024*1024,fallback:128*1024,queue:8,timeoutMs:15000});
  const TEXT_FORMATS=new Set(['txt','md','csv','tsv','json','html','htm','xml']);
  const queue=[];let active=null,sequence=0;
  const failure=message=>new Error(message);
  function abortError(){const error=failure('Import cancelled. No parsed data was committed.');error.name='AbortError';return error;}
  function cleanup(job){
    if(job.timer!==null)root.clearTimeout(job.timer);
    if(job.signal&&job.abort)job.signal.removeEventListener('abort',job.abort);
    if(job.worker){try{job.worker.terminate();}catch(_){}job.worker=null;}
    if(job.url){try{root.URL.revokeObjectURL(job.url);}catch(_){}job.url=null;}
  }
  function finish(job,error,result){
    if(job.done)return;job.done=true;cleanup(job);
    const position=queue.indexOf(job);if(position!==-1)queue.splice(position,1);
    if(active===job)active=null;
    if(error)job.reject(error);else job.resolve(result);
    pump();
  }
  async function fallback(job,reason){
    if(!TEXT_FORMATS.has(job.ext)||job.bytes.length>INGEST_LIMITS.fallback||typeof root.PBGCRag?.parseBytes!=='function'){
      finish(job,failure('Isolated parser is unavailable. This format requires local Blob workers permitted by browser policy. '+reason));return;
    }
    // Yield once so an already-requested cancellation wins before bounded work.
    await new Promise(resolve=>root.setTimeout(resolve,0));
    if(job.done)return;
    if(job.signal?.aborted){finish(job,abortError());return;}
    try{const result=await root.PBGCRag.parseBytes(job.name,job.bytes);if(job.signal?.aborted)finish(job,abortError());else finish(job,null,result);}catch(error){finish(job,error);}
  }
  function start(job){
    active=job;
    if(job.signal?.aborted){finish(job,abortError());return;}
    const source=root.PBGCRagIngestWorkerSource;
    if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function'||typeof source!=='string'||!source){fallback(job,'Worker assets or APIs are missing.');return;}
    job.timer=root.setTimeout(()=>finish(job,failure('Isolated parser exceeded its '+job.timeoutMs+' ms time limit. No parsed data was committed.')),job.timeoutMs);
    try{
      job.url=root.URL.createObjectURL(new root.Blob([source],{type:'text/javascript'}));
      job.worker=new root.Worker(job.url);
    }catch(error){
      cleanup(job);job.timer=null;
      if(job.signal&&job.abort&&!job.done)job.signal.addEventListener('abort',job.abort,{once:true});
      // Constructor blocking may reflect enterprise policy; only small text can
      // use the explicitly bounded fallback. Binary formats remain unavailable.
      fallback(job,'Worker creation failed.');return;
    }
    job.worker.onmessage=event=>{
      if(job.done)return;const data=event.data;
      if(!data||data.requestId!==job.requestId)return;
      if(data.type==='error')finish(job,failure(typeof data.message==='string'?data.message:'Isolated parser rejected the document.'));
      else if(data.type==='result'){
        if(!data.result||typeof data.result.parserVersion!=='string'||!Array.isArray(data.result.records)||data.result.records.length>50000||!Array.isArray(data.result.warnings))finish(job,failure('Isolated parser returned invalid records.'));
        else finish(job,null,data.result);
      }
    };
    job.worker.onerror=event=>{if(event&&typeof event.preventDefault==='function')event.preventDefault();finish(job,failure('Isolated parser worker failed or was blocked by browser policy. No parsed data was committed.'));};
    job.worker.onmessageerror=()=>finish(job,failure('Isolated parser result could not be transferred.'));
    try{const copied=job.bytes.slice();job.worker.postMessage({type:'parse',requestId:job.requestId,name:job.name,bytes:copied.buffer},[copied.buffer]);}catch(error){finish(job,failure('Could not transfer source bytes to the isolated parser.'));}
  }
  function pump(){if(active||!queue.length)return;start(queue.shift());}
  function parseIsolatedBytes(name,bytes,options={}){
    return new Promise((resolve,reject)=>{
      if(typeof name!=='string'||!name.trim()||name.length>255||!(bytes instanceof Uint8Array)||bytes.length>INGEST_LIMITS.input){reject(failure('Provide a source name and bytes no larger than 5 MB.'));return;}
      if(!options||typeof options!=='object'||Array.isArray(options)){reject(failure('Invalid isolated parser options.'));return;}
      const timeoutMs=options.timeoutMs===undefined?INGEST_LIMITS.timeoutMs:options.timeoutMs;
      if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>INGEST_LIMITS.timeoutMs){reject(failure('Parser timeout must be an integer from one to 15,000 ms.'));return;}
      const signal=options.signal;
      if(signal&&(typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'||typeof signal.aborted!=='boolean')){reject(failure('Invalid import cancellation signal.'));return;}
      if(signal?.aborted){reject(abortError());return;}
      if(active&&queue.length>=INGEST_LIMITS.queue){reject(failure('Parser queue is full. Wait for the active imports to finish.'));return;}
      const job={name,bytes:bytes.slice(),ext:name.toLowerCase().split('.').pop(),requestId:String(++sequence),timeoutMs,signal,resolve,reject,worker:null,url:null,timer:null,abort:null,done:false};
      if(signal){job.abort=()=>finish(job,abortError());signal.addEventListener('abort',job.abort,{once:true});}
      queue.push(job);pump();
    });
  }
  return {parseIsolatedBytes,INGEST_LIMITS};
});
