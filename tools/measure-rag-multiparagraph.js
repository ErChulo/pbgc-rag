#!/usr/bin/env node
'use strict';
// Real-model documentary verification. Not part of the offline application runtime.
// Run serially only after the separately coordinated scale/model workload ends.
// Synthetic documentary evidence only; no official plan or actuarial authority.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'..');
const BASE_AUDIT_COMMIT='a987a6e6db1aa8b4ee85e4f984e01aeafc920f91';
const DEADLINE_MS=120000,OPTIONS=Object.freeze({contextCharacters:2600,maxChunks:3,maxTokens:384,timeoutMs:DEADLINE_MS,groundingMode:'synthesis'});
const AGE='Normal retirement age is 65 only if service is at least 10 years and the participant is vested.';
const FACTOR='Early retirement factors at age 60 equal 0.85 only if the participant elects early retirement.';
const AGE_QUESTION='What is the normal retirement age?';
const FACTOR_QUESTION='What is the early retirement factor (ERF) at age 60?';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function git(...args){const result=spawnSync('git',args,{cwd:ROOT,encoding:'utf8'});if(result.status!==0)throw Error('Git identity check failed.');return result.stdout.trim();}
function buildFixture(){
 const base=JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/rag-multiparagraph-audit.json'),'utf8'));
 const descriptors=structuredClone(base.sources),main=descriptors.find(source=>source.id==='cedar-plan');
 assert.equal(main.paragraphs.length,8);assert.equal(descriptors.length,9);
 assert.ok(main.paragraphs[1].includes(base.expected.retirementAge));assert.ok(main.paragraphs[3].includes(base.expected.earlyFactors));
 main.paragraphs[1]=main.paragraphs[1].replace(base.expected.retirementAge,AGE);
 main.paragraphs[3]=main.paragraphs[3].replace(base.expected.earlyFactors,FACTOR);
 const document=source=>({id:source.id,name:source.name,text:source.paragraphs.join('\n\n'),paragraphs:source.paragraphs.length});
 const documents=descriptors.map(document).map(source=>({...source,hash:digest(Buffer.from(source.text,'utf8')),bytes:Buffer.byteLength(source.text,'utf8')}));
 const contrary={id:'contrary-plan',name:'synthetic-contrary-plan.txt',paragraphs:[
  'SYNTHETIC CONTRARY PLAN. This invented document tests an unresolved source conflict; it is not an amendment or an authority decision.',
  AGE.replace('65','67'),
  'The archive retains the complete instrument and correspondence. A reviewer must resolve the conflicting documentary provisions.'
 ]};
 const conflict=document(contrary);Object.assign(conflict,{hash:digest(Buffer.from(conflict.text,'utf8')),bytes:Buffer.byteLength(conflict.text,'utf8')});
 return{documents,conflict,mainSourceId:main.id,ageQuote:AGE,factorQuote:FACTOR,fixtureSha256:digest(JSON.stringify({documents,conflict})),baseFixtureSha256:digest(fs.readFileSync(path.join(ROOT,'fixtures/rag-multiparagraph-audit.json')))};
}
function runtimeFingerprint(){
 const names=['index.html'];
 for(const directory of ['assets','vendor']){
  const visit=relative=>{for(const entry of fs.readdirSync(path.join(ROOT,relative),{withFileTypes:true})){if(entry.isSymbolicLink())continue;const name=relative+'/'+entry.name;if(entry.isDirectory())visit(name);else if(entry.isFile()&&/\.(?:js|json|css|wasm)$/.test(entry.name))names.push(name);}};visit(directory);
 }
 return Object.fromEntries(names.sort().map(name=>[name,digest(fs.readFileSync(path.join(ROOT,name)))]));
}
function argumentsFor(argv){
 const options={profile:'file',expectedCommit:git('rev-parse','HEAD'),modelPath:null,chromiumPath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',output:null};
 for(let at=0;at<argv.length;at++){
  const value=argv[at];if(value==='--http')options.profile='http';else if(value==='--file')options.profile='file';
  else if(value==='--model')options.modelPath=path.resolve(argv[++at]||'');
  else if(value==='--chromium')options.chromiumPath=argv[++at];
  else if(value==='--output')options.output=path.resolve(argv[++at]||'');
  else if(value==='--expected-commit')options.expectedCommit=argv[++at];
  else if(value==='--help')options.help=true;else throw Error('Unknown argument: '+value);
 }
 if(!/^[a-f0-9]{12,40}$/.test(options.expectedCommit))throw Error('Use an explicit 12–40 character expected commit identity.');
 options.output=options.output||path.join(ROOT,'test-results','audit-real-multiparagraph-'+options.profile+'.json');
 return options;
}
function verifyCitation(citation,corpus){
 const source=corpus.sources.find(source=>source.id===citation.sourceId),chunk=corpus.chunks.find(chunk=>chunk.id===citation.chunkId);
 assert.ok(source,'Citation source must resolve to an independently hashed original.');assert.ok(chunk,'Citation chunk must resolve to the actual browser chunker output.');
 assert.equal(citation.sourceName,source.name);assert.equal(citation.sourceHash,source.hash);assert.equal(chunk.sourceId,source.id);assert.equal(chunk.sourceHash,source.hash);
 assert.deepEqual(citation.locators,chunk.locators,'Citation locators must equal the verified source chunk locators.');
 for(const locator of citation.locators)assert.ok(source.records.some(record=>{try{assert.deepEqual(record.locator,locator);return true;}catch(_){return false;}}),'Each locator must exist in an original parsed record.');
 for(const quote of citation.quotes||[])assert.ok(chunk.text.includes(quote),'Every accepted quotation must be an exact chunk substring.');
}
function checkPositive(item,fixture,corpus){
 assert.equal(item.result.status,'answered',JSON.stringify({id:item.id,reason:item.result.diagnostics?.reason,validation:item.result.diagnostics?.validationError}));
 assert.equal(item.calls.length,1,'One actual Qwen call is required for each accepted factual question.');
 const expected=item.id==='normal-age'?fixture.ageQuote:fixture.factorQuote;
 assert.equal(item.result.citations.length,1);const citation=item.result.citations[0];verifyCitation(citation,corpus);
 assert.equal(citation.sourceId,fixture.mainSourceId);assert.deepEqual(citation.quotes,[expected],'The complete literal qualification must survive; a short numeric answer is insufficient.');
 assert.equal(item.result.answer,expected+' ['+citation.label+']');
 const original=fixture.documents.find(source=>source.id===fixture.mainSourceId);assert.equal(citation.sourceHash,original.hash);assert.ok(original.text.includes(expected));
 assert.ok(citation.locators.some(locator=>corpus.sources.find(source=>source.id===original.id).records.some(record=>{try{assert.deepEqual(record.locator,locator);return record.text.includes(expected);}catch(_){return false;}})),'A cited locator must resolve to the independently expected complete source statement.');
 assert.equal(item.result.official,false);assert.equal(item.result.officialReleaseAllowed,false);assert.equal(item.result.diagnostics.modelOutputAccepted,true);
 assert.equal(item.result.diagnostics.sourceSupport.singleSource,true);assert.match(item.result.diagnostics.sourceSupport.message,/Only one source is cited/);
 const profile=item.result.diagnostics.answerProfile;assert.equal(profile.format,'source-selection-v1');assert.equal(profile.completeCoverage,true);assert.equal(profile.modelEmittedClaims,false);assert.equal(profile.modelEmittedCitations,false);
 const call=item.calls[0];assert.equal(call.responseFormat,'source-selection-v1');assert.ok(call.maxTokens<=64);assert.equal(call.temperature,0);assert.ok(call.elapsedMs<=DEADLINE_MS+3000,'The unchanged deadline must remain effective.');assert.equal(call.state,'completed');
}
async function main(argv=process.argv.slice(2)){
 const options=argumentsFor(argv);if(options.help){process.stdout.write('Prepared real-Qwen probe. Run after other model/scale jobs finish.\nUsage: node tools/measure-rag-multiparagraph.js [--file | --http] [--model /absolute/model.gguf] [--chromium /absolute/chromium] [--output /absolute/report.json] [--expected-commit SHA]\nDefault is actual file://. --http starts an owned loopback server and reports supplementary HTTP only. No automatic fallback or policy flags.\n');return 0;}
 const fixture=buildFixture(),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'vendor/local-llm/bundled.manifest.json'),'utf8'));
 const modelPath=options.modelPath||process.env.PBGC_MODEL_PATH||process.env.PBGC_LLM_MODEL||path.join(ROOT,'dist/models',manifest.files[0].name);
 const started=Date.now(),report={schemaVersion:1,kind:'real-qwen-multiparagraph-documentary-probe',status:'RUNNING',startedAt:new Date().toISOString(),preparedForCommit:BASE_AUDIT_COMMIT,expectedCommit:options.expectedCommit,commit:git('rev-parse','HEAD'),profile:options.profile==='file'?'actual offline file://':'supplementary HTTP only',options:OPTIONS,providerGenerationDeadlineMs:DEADLINE_MS,modelLoadDeadlineMs:DEADLINE_MS,stagesMs:{},cases:[],corpus:{...fixture,purpose:'Nine synthetic documents, including one eight-paragraph plan, unrelated numeric/unit distractions, exact 65/0.85 facts with complete conditions, and one separate contrary-age source.'},scope:'Two actual ordinary factual Qwen calls and two unsafe/unrelated zero-generation checks. Real isolated parsing, answer-corpus chunking and learned hybrid retrieval. All verified <=64 synthetic chunks remain in the safety inventory; prompt keeps three ranked chunks. This is not a scale, general quality, legal applicability, official actuarial, PDF/OCR or complete-package acceptance test.',externalRequests:[],pageErrors:[]};
 let browser,context,page,server,deadline,timedOut=false;
 const save=async()=>{await fsp.mkdir(path.dirname(options.output),{recursive:true});const temporary=options.output+'.tmp-'+process.pid;await fsp.writeFile(temporary,JSON.stringify(report,null,2)+'\n');await fsp.rename(temporary,options.output);};
 const stage=async(name,operation)=>{report.stage=name;await save();process.stdout.write(name+'\n');const at=Date.now();const value=await operation();report.stagesMs[name]=Date.now()-at;await save();return value;};
 try{
  assert.ok(report.commit.startsWith(options.expectedCommit),'The current commit must match the selected immutable runtime.');
  assert.equal(git('status','--porcelain','--untracked-files=no'),'','Tracked runtime/source changes must be saved before this quality probe.');
  assert.equal(fs.statSync(modelPath).size,manifest.files[0].bytes,'The pinned local GGUF is required.');
  report.runtimeSha256=runtimeFingerprint();report.scriptSha256=digest(fs.readFileSync(__filename));
  const {chromium}=require('playwright');
  const target=options.profile==='http'?(server=await require('../tools/verify-browser.js').startLoopbackServer(ROOT)).url:pathToFileURL(path.join(ROOT,'index.html')).href;
  const allowedOrigin=options.profile==='http'?new URL(target).origin:null;report.fileProfileAcceptance=options.profile==='http'?'NOT_ESTABLISHED_BY_HTTP':'NOT_YET_ESTABLISHED';
  browser=await chromium.launch({executablePath:options.chromiumPath,headless:true,args:['--no-sandbox']});
  context=await browser.newContext({serviceWorkers:'block'});if(options.profile==='file')await context.setOffline(true);
  const external=url=>/^(?:https?|wss?):/i.test(url)&&(!allowedOrigin||new URL(url).origin!==allowedOrigin);
  context.on('request',request=>{if(external(request.url()))report.externalRequests.push(request.url());});
  await context.route(/^(?:https?|wss?):\/\//,route=>external(route.request().url())?route.abort():route.continue());
  if(typeof context.routeWebSocket==='function')await context.routeWebSocket(/.*/,socket=>{report.externalRequests.push(socket.url());socket.close();});
  page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error.message).slice(0,1000)));
  deadline=setTimeout(()=>{timedOut=true;browser?.close().catch(()=>{});},15*60*1000);
  await stage('browser-entry',async()=>{await page.goto(target);await page.waitForFunction(()=>['parseIsolatedBytes','buildAnswerCorpus','createEmbeddingProvider','retrieveHybrid','answerQuestion','createLocalLlmProvider'].every(name=>typeof PBGCRag?.[name]==='function'));if(!await page.evaluate(()=>!!globalThis.PBGCRagWllama))await page.addScriptTag({url:new URL('vendor/local-llm/wllama-classic.js',target).href});});
  await stage('model-file-handoff',async()=>{await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='audit-multiparagraph-model';document.body.append(input);});await page.locator('#audit-multiparagraph-model').setInputFiles(modelPath,{timeout:180000});});
  report.model=await stage('real-model-hash-and-load',()=>page.evaluate(async({manifest,deadline})=>{globalThis.__auditMulti={};__auditMulti.model=await PBGCRag.createLocalLlmProvider({files:document.querySelector('#audit-multiparagraph-model').files,manifest,contextSize:2048,timeoutMs:deadline,generationTimeoutMs:deadline});return __auditMulti.model.info();},{manifest,deadline:DEADLINE_MS}));
  assert.equal(report.model.sha256,manifest.files[0].sha256);assert.equal(report.model.modelBytes,manifest.files[0].bytes);assert.equal(report.model.cpuOnly,true);assert.equal(report.model.threads,1);assert.equal(report.model.loaded,true);
  report.encoder=await stage('learned-encoder-load',()=>page.evaluate(async()=>{__auditMulti.embedding=await PBGCRag.createEmbeddingProvider();const e=__auditMulti.embedding;return{id:e.id,kind:e.kind,dimension:e.dimension,manifest:e.manifest};}));
  assert.equal(report.encoder.kind,'learned-sentence-embedding');assert.equal(report.encoder.dimension,384);assert.match(report.encoder.id,/ternlight/);
  report.browserCorpus=await stage('real-parser-chunker-and-retrieval-index',()=>page.evaluate(async fixture=>{
   const api=PBGCRag,parse=async documents=>{const sources=[];for(const document of documents){const bytes=new TextEncoder().encode(document.text),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==document.hash)throw Error('Synthetic original bytes failed their independent SHA-256.');const parsed=await api.parseIsolatedBytes(document.name,bytes);sources.push({id:document.id,name:document.name,hash,parserVersion:parsed.parserVersion,records:parsed.records});}return sources;};
   const sources=await parse(fixture.documents),contrary=(await parse([fixture.conflict]))[0];
   const create=async originals=>{const built=await api.buildAnswerCorpus(originals),coverage=await __auditMulti.embedding.inspectTextCoverage(built.chunks.map(chunk=>chunk.text));if(!coverage.every(item=>item.embeddable))throw Error('A synthetic passage is not readable by the actual encoder.');if(built.chunks.length>64)throw Error('The bounded safety inventory exceeds 64 chunks.');const index=await api.buildSemanticIndex(built.chunks,__auditMulti.embedding);return{sources:originals,chunks:built.chunks,index,coverage};};
   __auditMulti.positive=await create(sources);__auditMulti.conflicting=await create([...sources,contrary]);
   const compact=corpus=>({sources:corpus.sources,chunks:corpus.chunks,coverage:corpus.coverage});
   return{positive:compact(__auditMulti.positive),conflicting:compact(__auditMulti.conflicting),chunker:api.CHUNKER_PROFILE,topicProfile:api.RAG_TOPIC_PROFILE,aliases:{singular:api.normalizeQuestionTopics('What is the early retirement factor at age 60?'),acronym:api.normalizeQuestionTopics('What is the ERF at age 60?')}};
  },fixture));
  assert.ok(report.browserCorpus.positive.chunks.length>fixture.documents.length,'Actual multi-paragraph chunk boundaries must be exercised.');
  assert.deepEqual(report.browserCorpus.aliases.singular,report.browserCorpus.aliases.acronym);
  const {parseText}=require('../assets/core.js');
  for(const descriptor of [...fixture.documents,fixture.conflict]){const browserSource=report.browserCorpus.conflicting.sources.find(source=>source.id===descriptor.id);assert.equal(browserSource.hash,descriptor.hash);assert.deepEqual(browserSource.records,parseText(descriptor.name,descriptor.text).records,'Real isolated parser locators must match the independently parsed original text.');}
  const cases=[
   {id:'conflicting-age',question:AGE_QUESTION,corpus:'conflicting',expected:'conflict'},
   {id:'unsupported-mortality',question:'Which mortality table is documented?',corpus:'positive',expected:'abstained'},
   {id:'normal-age',question:AGE_QUESTION,corpus:'positive',expected:'answered'},
   {id:'singular-erf',question:FACTOR_QUESTION,corpus:'positive',expected:'answered'}
  ];
  for(const specification of cases){
   const item=await stage('case-'+specification.id,()=>page.evaluate(async({specification,options})=>{
    const corpus=__auditMulti[specification.corpus],api=PBGCRag,started=performance.now(),ranked=await api.retrieveHybrid(corpus.index,specification.question,__auditMulti.embedding,{topK:6});
    // Match the large-case source-selection contract: real rank order controls
    // the three-chunk prompt, while no bounded verified safety fact disappears.
    const seen=new Set(ranked.results.map(entry=>(entry.chunk||entry).id));
    const retrieval={...ranked,results:[...ranked.results,...corpus.chunks.filter(chunk=>!seen.has(chunk.id))],diagnostics:{...ranked.diagnostics,rankedCandidates:ranked.results.length,exactEvidenceCandidates:corpus.chunks.length}};
    const calls=[],provider={id:__auditMulti.model.id,answerFormat:'source-selection-grounded-v1',generate:async request=>{
     const at=performance.now(),call={responseFormat:request.responseFormat,maxTokens:request.maxTokens,temperature:request.temperature,promptCharacters:request.prompt.length,firstTokenMs:null,state:'running'};calls.push(call);
     try{const raw=await __auditMulti.model.generate({...request,onToken:piece=>{if(piece&&call.firstTokenMs===null)call.firstTokenMs=Math.round(performance.now()-at);request.onToken?.(piece);}});call.state='completed';call.raw=raw.slice(0,128);return raw;}
     catch(error){call.state='failed';call.error={name:error.name,code:error.code||null,message:String(error.message).slice(0,500)};throw error;}
     finally{call.elapsedMs=Math.round(performance.now()-at);}
    }};
    const result=await api.answerQuestion({question:specification.question,chunks:corpus.chunks,retrieval,provider,options});
    return{...specification,result,calls,elapsedMs:Math.round(performance.now()-started),rankedSourceIds:ranked.results.map(entry=>(entry.chunk||entry).sourceId),rankedChunkIds:ranked.results.map(entry=>(entry.chunk||entry).id),retrievalDiagnostics:retrieval.diagnostics};
   },{specification,options:OPTIONS}));
   report.cases.push(item);await save();
   if(specification.expected==='answered')checkPositive(item,fixture,report.browserCorpus.positive);
   else{assert.equal(item.result.status,specification.expected,JSON.stringify({id:item.id,result:item.result}));assert.equal(item.calls.length,0,'Unsafe/unrelated evidence must stop before actual generation.');assert.equal(item.result.diagnostics.modelOutputAccepted,false);if(item.id==='conflicting-age'){assert.equal(item.result.diagnostics.reason,'possible-source-conflict');assert.ok(item.result.diagnostics.conflicts?.length);for(const citation of item.result.citations)verifyCitation(citation,report.browserCorpus.conflicting);const cited=new Set(item.result.citations.map(citation=>citation.sourceId));assert.ok(cited.has(fixture.mainSourceId)&&cited.has(fixture.conflict.id),'Both independently hashed conflicting originals must remain visible.');}}
   process.stdout.write(specification.id+': '+item.result.status+'; real generation calls '+item.calls.length+'\n');
  }
  assert.equal(report.cases.reduce((total,item)=>total+item.calls.length,0),2);assert.deepEqual(report.externalRequests,[],'No external request may be attempted, even if aborted.');assert.deepEqual(report.pageErrors,[]);assert.equal(timedOut,false);
  assert.equal(git('rev-parse','HEAD'),report.commit);assert.equal(git('status','--porcelain','--untracked-files=no'),'');assert.deepEqual(runtimeFingerprint(),report.runtimeSha256,'Frozen runtime bytes must not change during the probe.');
  report.status='PASS';report.fileProfileAcceptance=options.profile==='file'?'PASS_FOR_THIS_BOUNDED_SYNTHETIC_PROBE':'NOT_ESTABLISHED_BY_HTTP';
 }catch(error){report.status=options.profile==='file'&&/ERR_BLOCKED_BY_ADMINISTRATOR/.test(String(error.message))?'BLOCKED':'FAIL';report.error={name:error.name||'Error',code:error.code||null,message:String(error.message||error).slice(0,2500)};}
 finally{
  clearTimeout(deadline);if(page&&!page.isClosed())try{await page.evaluate(async()=>{globalThis.__auditMulti?.embedding?.dispose();await globalThis.__auditMulti?.model?.dispose();});}catch(_){}
  if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(server)await server.close();
  report.finishedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;report.externalRequestCount=report.externalRequests.length;await save();
 }
 process.stdout.write(JSON.stringify({status:report.status,profile:report.profile,commit:report.commit,cases:report.cases.map(item=>({id:item.id,status:item.result.status,realGenerationCalls:item.calls.length,elapsedMs:item.elapsedMs})),externalRequests:report.externalRequestCount,report:options.output,error:report.error||null})+'\n');
 return report.status==='PASS'?0:report.status==='BLOCKED'?2:1;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
module.exports={buildFixture,argumentsFor,verifyCitation,checkPositive,main};
