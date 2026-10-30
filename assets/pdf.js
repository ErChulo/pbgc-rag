(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PDF_LIMITS=Object.freeze({bytes:5242880,pages:200,records:50000,characters:2000000,pageItems:10000,timeout:15000});
// Dedicated classic Blob worker only. PDF.js and its internal fake worker live
// entirely in that isolated worker. No synchronous/main-thread fallback exists.
// options.timeoutMs can lower (never increase) the hard 15-second deadline.
async function parsePdfBytes(bytes,options={}){
 if(!(bytes instanceof Uint8Array)||bytes.length>PDF_LIMITS.bytes)throw Error('PDF exceeds the 5 MB byte limit or has invalid bytes.');
 if(new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-')throw Error('Invalid PDF header.');
 const source=root.PBGCRag?.pdfWorkerSource;
 if(typeof source!=='string'||!source)throw Error('Local PDF parser assets are unavailable.');
 if(typeof root.Worker!=='function'||typeof root.Blob!=='function'||typeof root.URL?.createObjectURL!=='function')throw Error('PDF parsing is unavailable because isolated workers are blocked or unsupported.');
 const timeout=options.timeoutMs??PDF_LIMITS.timeout;
 if(!Number.isInteger(timeout)||timeout<1||timeout>PDF_LIMITS.timeout)throw Error('PDF timeout must be between 1 and 15,000 milliseconds.');
 if(options.signal?.aborted)throw Error('PDF extraction cancelled.');
 return new Promise((resolve,reject)=>{
  let worker,url,timer,settled=false;
  const abort=()=>finish(Error('PDF extraction cancelled.'));
  function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(worker)worker.terminate();if(url)root.URL.revokeObjectURL(url);if(error)reject(error);else resolve(result);}
  try{
   url=root.URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
   worker=new root.Worker(url,{name:'pbgc-pdf-parser'});
   worker.onmessage=event=>{if(event.data?.ok===true&&event.data.result?.format==='pdf'&&Array.isArray(event.data.result.records))finish(null,event.data.result);else finish(Error(event.data?.error||'PDF worker returned invalid output.'));};
   worker.onerror=event=>{event.preventDefault();finish(Error('Isolated PDF worker failed or was blocked by browser policy.'));};
   worker.onmessageerror=()=>finish(Error('PDF worker returned unreadable output.'));
   options.signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>finish(Error('PDF extraction exceeded its hard time limit. The isolated worker was terminated.')),timeout);
   const copied=bytes.slice();worker.postMessage({bytes:copied.buffer},[copied.buffer]);
  }catch(error){finish(Error('Isolated PDF parsing is unavailable: '+String(error.message||error)));}
 });
}
return {parsePdfBytes,PDF_LIMITS};
});
