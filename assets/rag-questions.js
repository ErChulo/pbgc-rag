/* Explicit question sets. Each answer keeps the existing single-question evidence guards. */
(function(root,factory){'use strict';const core=typeof module==='object'&&module.exports?require('./rag.js'):root.PBGCRag;const api=factory(core);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(core){
'use strict';
const QUESTION_SET_LIMITS=Object.freeze({questions:3,questionCharacters:1000,timeoutMs:360000,snapshotCharacters:32*1024*1024});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail(message){throw Error(message);}
function cancelled(){const error=Error('Question set cancelled. No question-set answers were released.');error.name='AbortError';return error;}
function timedOut(perQuestion=false){const error=Error((perQuestion?'A question exceeded its time budget.':'The question set exceeded its time budget.')+' No question-set answers were released.');error.name='TimeoutError';return error;}
function cloneJson(value,state,depth=0){
 if(depth>18)fail('Question-set source metadata is too deep.');
 state.nodes++;if(state.nodes>1000000)fail('Question-set source metadata exceeds its node budget.');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail('Question-set metadata requires finite numbers.');return value;}
 if(typeof value==='string'){state.characters+=value.length;if(state.characters>QUESTION_SET_LIMITS.snapshotCharacters)fail('Question-set source snapshot exceeds its budget.');return value;}
 if(typeof value!=='object')fail('Question-set metadata must be cloneable JSON data.');
 if(state.parents.has(value))fail('Question-set metadata must not contain cycles.');
 const prototype=Object.getPrototypeOf(value);if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)fail('Question-set metadata must be plain JSON data.');
 state.parents.add(value);let result;
 if(Array.isArray(value)){if(value.length>10000)fail('Question-set metadata array exceeds its budget.');result=[];for(let index=0;index<value.length;index++){if(!Object.hasOwn(value,index))fail('Question-set metadata must not contain sparse arrays.');result.push(cloneJson(value[index],state,depth+1));}}
 else{result={};for(const key of Object.keys(value)){state.characters+=key.length;if(state.characters>QUESTION_SET_LIMITS.snapshotCharacters)fail('Question-set source snapshot exceeds its budget.');Object.defineProperty(result,key,{value:cloneJson(value[key],state,depth+1),enumerable:true,writable:false,configurable:false});}}
 state.parents.delete(value);return Object.freeze(result);
}
function snapshot(chunks,scope){
 if(!Array.isArray(chunks)||chunks.length>core.RAG_LIMITS.chunks)fail('Provide a verified source chunk array of at most 10,000 chunks.');
 const state={characters:0,nodes:0,parents:new Set()};let characters=0;
 const sources=chunks.map(chunk=>{
  if(!object(chunk)||typeof chunk.text!=='string'||chunk.text.length>core.RAG_LIMITS.chunkCharacters)fail('Question-set chunks require bounded source text.');
  characters+=chunk.text.length;if(characters>core.RAG_LIMITS.totalCharacters)fail('Question-set source text exceeds its corpus budget.');
  return cloneJson({id:chunk.id,text:chunk.text,sourceId:chunk.sourceId,sourceName:chunk.sourceName,sourceHash:chunk.sourceHash,locators:chunk.locators,recordIndices:Array.isArray(chunk.recordIndices)?chunk.recordIndices.slice(0,200):[]},state);
 });
 return{chunks:Object.freeze(sources),scope:scope===undefined?undefined:cloneJson(scope,state)};
}
/**
 * answerQuestions({questions,chunks,provider?,retrieve?,scope?,signal?,onProgress?,options?})
 * questions are supplied separately by the user; this function never decomposes prose.
 * retrieve({question,index,chunks,scope,signal}) runs independently for every question.
 * options are the existing answerQuestion options plus batchTimeoutMs (at most 360,000).
 * Progress contains counts only. Results become available only after the whole set completes.
 */
async function answerQuestions(input){
 if(!core||typeof core.answerQuestion!=='function'||!core.RAG_LIMITS)fail('Load the single-question RAG module before question sets.');
 if(!object(input)||!Array.isArray(input.questions)||!input.questions.length||input.questions.length>QUESTION_SET_LIMITS.questions)fail('Provide between one and three separate questions.');
 const seen=new Set(),questions=Array.from({length:input.questions.length},(_,index)=>{
  const value=input.questions[index];
  if(typeof value!=='string'||!value.trim()||value.trim().length>QUESTION_SET_LIMITS.questionCharacters)fail('Each question must contain between one and 1,000 characters.');
  const question=value.trim(),key=question.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ');
  if(seen.has(key))fail('Use a different question in each question box.');seen.add(key);return question;
 });
 const {signal,retrieve,onProgress}=input;
 if(signal&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))fail('Invalid question-set cancellation signal.');
 if(signal?.aborted)throw cancelled();
 if(retrieve!==undefined&&typeof retrieve!=='function')fail('Question-set retrieve must be a function.');
 if(onProgress!==undefined&&typeof onProgress!=='function')fail('Question-set onProgress must be a function.');
 const suppliedOptions=input.options===undefined?{}:input.options;if(!object(suppliedOptions))fail('Invalid question-set options.');
 const batchTimeoutMs=suppliedOptions.batchTimeoutMs??QUESTION_SET_LIMITS.timeoutMs;
 if(!Number.isInteger(batchTimeoutMs)||batchTimeoutMs<1||batchTimeoutMs>QUESTION_SET_LIMITS.timeoutMs)fail('Question-set timeout must be between one and 360,000 ms.');
 const allowed=['contextCharacters','maxChunks','maxTokens','timeoutMs','groundingMode'];
 if(Object.keys(suppliedOptions).some(key=>!allowed.includes(key)&&key!=='batchTimeoutMs'))fail('Unknown question-set option.');
 const options={};for(const key of allowed)if(suppliedOptions[key]!==undefined)options[key]=suppliedOptions[key];Object.freeze(options);
 let provider=input.provider;
 if(provider!==undefined&&provider!==null){
  if(!object(provider)||typeof provider.id!=='string'||!provider.id.trim()||provider.id.length>200||typeof provider.generate!=='function')fail('Provide a local generation provider with id and generate().');
  const original=provider,generate=provider.generate;provider=Object.freeze({id:provider.id,answerFormat:provider.answerFormat,generate:args=>generate.call(original,args)});
 }
 const sources=snapshot(input.chunks,input.scope),controller=new AbortController();let deadline=false,timer,abort;
 const cancellation=new Promise((_,reject)=>{
  abort=()=>{controller.abort();reject(cancelled());};signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{deadline=true;controller.abort();reject(timedOut());},batchTimeoutMs);
 });
 // A rejected cancellation promise is always observed, including between awaited stages.
 cancellation.catch(()=>{});
 const check=()=>{if(deadline)throw timedOut();if(signal?.aborted||controller.signal.aborted)throw cancelled();};
 const bounded=async task=>{check();const value=await Promise.race([Promise.resolve().then(()=>{check();return task();}),cancellation]);check();return value;};
 const progress=async(phase,index)=>{if(onProgress)await bounded(()=>onProgress(Object.freeze({phase,index,total:questions.length})));};
 try{
  // Reuse the core's corpus, locator, scope and option validation without generating an answer.
  await bounded(()=>core.answerQuestion({question:questions[0],chunks:sources.chunks,retrieval:[],scope:sources.scope,options,provider:null,signal:controller.signal}));
  const results=[];
  for(let index=0;index<questions.length;index++){
   const question=questions[index];let retrieval;
   await progress('retrieving',index);
   if(retrieve){retrieval=await bounded(()=>retrieve(Object.freeze({question,index,chunks:sources.chunks,scope:sources.scope,signal:controller.signal})));if(retrieval===undefined)fail('Question-set retrieve must return evidence results.');}
   await progress('answering',index);
   const result=await bounded(()=>core.answerQuestion({question,chunks:sources.chunks,retrieval,provider,scope:sources.scope,options,signal:controller.signal}));
   // A timed-out provider may still be unwinding. Do not start a second inference beside it.
   if(result.diagnostics?.generationErrorName==='TimeoutError'||result.diagnostics?.generationErrorCode==='TIMEOUT'||result.diagnostics?.reason?.startsWith('generation-failed:')&&/exceeded the .* time budget/i.test(result.diagnostics.reason))throw timedOut(true);
   results.push({index,question,result});await progress('complete',index);
  }
  check();const answeredCount=results.filter(item=>item.result.status==='answered').length;
  const status=answeredCount===results.length?'answered':answeredCount?'partial':results.some(item=>item.result.status==='conflict')?'conflict':'abstained';
  return{status,results,answeredCount,totalQuestions:questions.length,official:false,officialReleaseAllowed:false,diagnostics:{mode:'independent-grounded-questions-v1',batchTimeoutMs,automaticDecomposition:false,allQuestionsAnswered:answeredCount===results.length}};
 }catch(error){controller.abort();if(deadline)throw timedOut();if(signal?.aborted)throw cancelled();throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
return{answerQuestions,QUESTION_SET_LIMITS};
});
