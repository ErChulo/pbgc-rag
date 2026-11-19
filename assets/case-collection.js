/* Large-case orchestration. Original Blobs and authenticated derived shards stay
 * in IndexedDB; only one input and bounded retrieval candidates are resident.
 * Full-text candidate search covers every selected shard. Learned reranking is
 * over that shortlist, not a claim of a global dense index of the entire case. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const MiB=1024*1024,PROFILE='large-case-corpus-v1',AUTH='authenticated-local-derived-v1';
const COLLECTION_LIMITS=Object.freeze({sourceBytes:64*MiB,caseBytes:1024*MiB,sources:2000,batchCharacters:512*1024,batchRecords:4000,candidates:64,questionCharacters:1000});
// The measured domain corpus favours these defaults over 800-character chunks.
const CHUNK_OPTIONS=Object.freeze({maxChars:1800,maxTokens:400,overlapChars:250});
const chunkProfile=()=>[api().CHUNKER_PROFILE?.id||'source-boundary-v1',api().CHUNKER_PROFILE?.version||1,CHUNK_OPTIONS.maxChars,CHUNK_OPTIONS.maxTokens,CHUNK_OPTIONS.overlapChars].join(':');
const abort=signal=>{if(signal?.aborted){const e=Error('Large-case operation cancelled.');e.name='AbortError';throw e;}};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const api=()=>root.PBGCRag;
function sourceName(value){if(typeof value!=='string'||!value.trim()||value.length>255||/[\x00-\x1f/\\]/.test(value))throw Error('Use a source file with a bounded plain file name.');return value;}
function plainRecord(record){if(!record||typeof record.text!=='string'||record.text.length>2000000||!record.locator||typeof record.locator.type!=='string')throw Error('A parser returned an invalid evidence record.');return record;}
const tableRecord=record=>['excel-cell','delimited-cell','sqlite-cell','word-table-cell'].includes(record.locator.type)||(record.locator.type==='word-paragraph'&&record.locator.table!==undefined);
function tablePosition(record,sourceName){const loc=record.locator;if(loc.type==='delimited-cell')return{name:sourceName,row:loc.row};if(loc.type==='excel-cell'){const match=/^[A-Z]+([1-9][0-9]*)$/.exec(loc.cell||'');if(match&&typeof loc.sheet==='string')return{name:loc.sheet,row:Number(match[1])};}return null;}
function checkedHeaders(value){if(!Array.isArray(value)||value.length>1000)throw Error('Use at most 1,000 explicit table column-name choices.');const seen=new Set();return value.map(header=>{if(!header||typeof header!=='object'||Array.isArray(header)||Object.keys(header).some(key=>!['tableName','headerRow'].includes(key))||typeof header.tableName!=='string'||!header.tableName.trim()||header.tableName.length>255||/[\x00-\x1f\x7f]/.test(header.tableName)||!Number.isInteger(header.headerRow)||header.headerRow<1||header.headerRow>50000||seen.has(header.tableName))throw Error('Use one valid column-name row for each selected table or sheet.');seen.add(header.tableName);return{tableName:header.tableName,headerRow:header.headerRow};});}
async function digest(bytes){return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function encode64(bytes){let result='';for(let at=0;at<bytes.length;at+=8192)result+=String.fromCharCode(...bytes.subarray(at,at+8192));return root.btoa(result);}
async function* lineBatches(blob,{signal,name}={}){
 const reader=blob.stream().getReader(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let pending='',offset=0,line=1,batch=[],characters=0,priorCutMidSentence=false;
 try{while(true){abort(signal);const next=await reader.read();pending+=decoder.decode(next.value||new Uint8Array(),{stream:!next.done});if(pending.includes('\0'))throw Error('Null-containing text is not supported.');
   while(pending.length){const match=/[\r\n]/.exec(pending);let end=match?.index??-1;if(end>=0&&pending[end]==='\r'&&end===pending.length-1&&!next.done)break;
    const continued=(end<0?pending.length:end)>COLLECTION_LIMITS.batchCharacters;let safeCut=false;if(end<0&&!next.done&&!continued)break;if(continued){end=COLLECTION_LIMITS.batchCharacters;const prefix=pending.slice(0,end);let match;for(const boundary of prefix.matchAll(/[.!?]["')\]]*\s+/g))match=boundary;if(match){end=match.index+match[0].length;safeCut=true;}}else if(end<0)end=pending.length;
    if(end>0&&end<pending.length&&pending.charCodeAt(end-1)>=0xd800&&pending.charCodeAt(end-1)<=0xdbff)end--;
    const text=pending.slice(0,end),newline=match&&end===match.index?(pending[end]==='\r'&&pending[end+1]==='\n'?2:1):0;
    const endsMidSentence=continued&&!safeCut;batch.push({text,locator:{type:'text-line',line,offset,length:text.length,offsetUnit:'UTF-16 code units',...(continued?{continuation:true}:{})},...(priorCutMidSentence||endsMidSentence?{sourceFragment:{startsMidSentence:priorCutMidSentence,endsMidSentence}}:{})});priorCutMidSentence=endsMidSentence;characters+=text.length;offset+=end+newline;pending=pending.slice(end+newline);if(newline){line++;priorCutMidSentence=false;}
    if(characters>=COLLECTION_LIMITS.batchCharacters||batch.length>=COLLECTION_LIMITS.batchRecords){yield{format:'text',parserVersion:'collection-text-lines-v1',records:batch,warnings:[]};batch=[];characters=0;abort(signal);}
    if(!end&&!newline)break;
   }
   if(next.done)break;
  }if(batch.length)yield{format:'text',parserVersion:'collection-text-lines-v1',records:batch,warnings:[]};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function* csvBatches(blob,name,{signal}={}){
 const reader=blob.stream().getReader(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let buffer='',scan=0,quoted=false,offset=0,rowBase=0,lineBase=0,rows=0;
 try{while(true){abort(signal);const next=await reader.read();buffer+=decoder.decode(next.value||new Uint8Array(),{stream:!next.done});if(buffer.includes('\0'))throw Error('Null-containing text is not supported.');
   let cut=0;
   for(;scan<buffer.length;scan++){const c=buffer[scan];if(c==='"')quoted=!quoted;if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&scan===buffer.length-1&&!next.done)break;const n=c==='\r'&&buffer[scan+1]==='\n'?2:1;scan+=n-1;rows++;if(scan+1>=COLLECTION_LIMITS.batchCharacters){cut=scan+1;break;}}}
   if(next.done)cut=buffer.length;
   if(cut){const text=buffer.slice(0,cut),parsed=api().parseText(name,text);for(const record of parsed.records){record.locator.offset+=offset;record.locator.row+=rowBase;record.locator.line+=lineBase;}
    yield parsed;offset+=text.length;rowBase+=rows;lineBase+=(text.match(/\r\n|\r|\n/g)||[]).length;buffer=buffer.slice(cut);scan=0;rows=0;quoted=false;
   }
   if(buffer.length>2000000)throw Error('A CSV row exceeds the bounded text budget. Split that row before importing.');
   if(next.done)break;
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function* parsedBatches(name,blob,bytes,options={}){
 const signal=options.signal,ext=name.toLowerCase().split('.').pop();
 if(['txt','md'].includes(ext)){yield*lineBatches(blob,{signal,name});return;}
 if(['csv','tsv'].includes(ext)){yield*csvBatches(blob,name,{signal});return;}
 if(ext==='pdf'){
  let start=1,total=1;
  do{abort(signal);let parsed=await api().parsePdfBytes(bytes,{signal,maxInputBytes:COLLECTION_LIMITS.sourceBytes,pages:{start,end:start+199},allowPartial:true});
   total=parsed.extractionCoverage?.totalPages||parsed.pageCoverage?.length||200;
   yield parsed;start+=200;await pause();
  }while(start<=total);return;
 }
 if(['png','jpg','jpeg','webp'].includes(ext)){yield await api().parseImageBytes(name,bytes,{signal,maxInputBytes:COLLECTION_LIMITS.sourceBytes});return;}
 yield await api().parseIsolatedBytes(name,bytes,{signal,maxInputBytes:COLLECTION_LIMITS.sourceBytes});
}
async function* recordBatches(parsed){
 let records=[],characters=0,lastRow=null;
 for(const record of parsed.records){plainRecord(record);const position=tablePosition(record,''),row=position?JSON.stringify([position.name,position.row]):record.locator.type==='sqlite-cell'?JSON.stringify([record.locator.table,record.locator.rowid]):null,limit=tableRecord(record)?1000:COLLECTION_LIMITS.batchRecords;
  if(records.length&&(!row||row!==lastRow)&&(records.length>=limit||characters+record.text.length>COLLECTION_LIMITS.batchCharacters)){yield records;records=[];characters=0;}
  if(records.length>=COLLECTION_LIMITS.batchRecords||characters+record.text.length>2000000)throw Error('One source table row exceeds the bounded record or text budget.');
  records.push(record);characters+=record.text.length;
  lastRow=row;
 }if(records.length)yield records;
}
function requireAuthenticated(shard){if(!shard||shard.verification!==AUTH||shard.payload?.profile!==PROFILE)throw Error('Stored passages failed their authenticated source binding. Reimport the source.');return shard.payload;}
async function createCaseCollection({vault}={}){
 if(!vault||typeof vault.iterateShards!=='function')throw Error('A large-case vault is required.');
 async function sources(caseId,signal){const all=[];let afterId;while(true){abort(signal);const batch=await vault.listSources(caseId,{afterId,limit:200,signal});all.push(...batch);if(batch.length<200)break;afterId=batch.at(-1).id;if(all.length>COLLECTION_LIMITS.sources)throw Error('Large-case source-count limit exceeded.');}return all;}
 async function summary(caseId,sourceId,signal){const shard=await vault.getShard(caseId,sourceId,'records','summary',{signal});return shard?requireAuthenticated(shard):null;}
 async function buildSource(caseId,file,options={}){
  abort(options.signal);sourceName(file.name);if(!(file instanceof root.Blob)||file.size>COLLECTION_LIMITS.sourceBytes)throw Error('Large-case files must be no larger than 64 MiB.');
  const choices=checkedHeaders(options.tableHeaders??(options.headerRow===undefined?[]:[{tableName:file.name,headerRow:options.headerRow}]));
  const bytes=new Uint8Array(await file.arrayBuffer());abort(options.signal);const hash=await digest(bytes),existing=(await sources(caseId,options.signal)).find(s=>s.hash===hash);
  if(options.expectedHash!==undefined&&hash!==options.expectedHash)throw Error('A backup source does not match its recorded SHA-256.');
  if(existing&&!options.replaceId){const previous=await summary(caseId,existing.id,options.signal);if(previous?.ready)return{source:existing,duplicate:true};throw Error('An incomplete copy of this source is stored. Remove it and import the original again.');}
  const id=options.replaceId||root.crypto.randomUUID(),blob=new root.Blob([bytes]);
  const source=options.replaceId?await vault.getSource(caseId,id,{includeBlob:false,signal:options.signal}):await vault.putSource(caseId,{id,name:file.name,hash,parserVersion:PROFILE,blob},{signal:options.signal});
  if(!source||source.hash!==hash)throw Error('The original source changed before its index could be rebuilt.');
  const previousSummary=options.replaceId?await summary(caseId,id,options.signal):null,generation=root.crypto.randomUUID();let caseRevision=source.caseRevision||(await vault.getCase(caseId,options.signal)).revision;
  async function saveShard(kind,shardId,payload){const saved=await vault.putShard(caseId,id,{id:shardId,kind,sourceHash:hash,sourceRevision:source.revision,payload:{...payload,generation}},{signal:options.signal,expectedRevision:caseRevision});caseRevision=saved.caseRevision;}
  const headerRows=new Map(choices.map(choice=>[choice.tableName,choice.headerRow])),headersByTable=new Map(),tableNames=new Set(),tablePreviews=new Map();let previewCells=0,ordinal=0,totalRecords=0,totalChunks=0,characters=0;const warnings=new Set(),pages=new Map();let format='',preview=[];
  try{
   for await(const parsed of parsedBatches(file.name,blob,bytes,options)){
    format=parsed.format||file.name.toLowerCase().split('.').pop();for(const warning of parsed.warnings||[])if(!/^Native text was extracted only from pages .* other pages were not processed in this window\.$/.test(String(warning)))warnings.add(String(warning));
    const range=parsed.extractionCoverage?.selectedRange||parsed.selectedRange;
    for(const page of parsed.pageCoverage||[])if(!range||page.page>=range.start&&page.page<=range.end)pages.set(page.page,page);
    for await(const batch of recordBatches(parsed)){
     abort(options.signal);if(preview.length<30)preview.push(...batch.slice(0,30-preview.length).map(r=>({text:r.text,locator:r.locator})));
     const presentTables=new Set();for(const record of batch){const position=tablePosition(record,file.name);if(!position)continue;tableNames.add(position.name);presentTables.add(position.name);if(tableNames.size>1000)throw Error('This source exceeds the 1,000-table limit.');let examples=tablePreviews.get(position.name);if(!examples&&previewCells<200){examples=[];tablePreviews.set(position.name,examples);}if(examples&&examples.length<20&&previewCells<200){examples.push({text:record.text,locator:record.locator});previewCells++;}if(position.row===headerRows.get(position.name)){if(!headersByTable.has(position.name))headersByTable.set(position.name,[]);headersByTable.get(position.name).push(record);}}
     const availableChoices=choices.filter(choice=>presentTables.has(choice.tableName)&&headersByTable.has(choice.tableName)),headers=availableChoices.flatMap(choice=>headersByTable.get(choice.tableName)),locations=new Set(batch.map(record=>JSON.stringify(record.locator))),records=[...headers.filter(header=>!locations.has(JSON.stringify(header.locator))),...batch],bindings=availableChoices.map(choice=>({sourceId:id,...choice}));
     const part={id,name:file.name,hash,parserVersion:parsed.parserVersion,records};
     const chunker=typeof root.Worker==='function'&&api().chunkSourcesInWorker?api().chunkSourcesInWorker:api().chunkSources;
     const raw=await chunker([part],{...CHUNK_OPTIONS,signal:options.signal,...(bindings.length?{headers:bindings}:{})});
     let answerChunks;
     if(records.some(tableRecord)){
      const typedSource={...part,...(/\.xlsx?m?$/i.test(file.name)&&bytes.length<=5*MiB?{bytesBase64:encode64(bytes)}:{})};
      const built=await api().buildAnswerCorpus([typedSource],{signal:options.signal,headers:bindings});answerChunks=built.chunks;
      if(built.unconfiguredTables.length)warnings.add('Table column names must be confirmed before those cells can supply written answers.');
      for(const diagnostic of built.tableDiagnostics||[])warnings.add('Table '+(diagnostic.tableName||file.name)+': '+String(diagnostic.message||'Some source cells cannot supply written answers.').slice(0,300));
     }else answerChunks=raw.chunks;
     const lexical=chunk=>({chunk,terms:api().normalizeEvidenceTopics?api().normalizeEvidenceTopics(chunk.text):chunk.text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]});
     const key=generation+'-'+String(ordinal++).padStart(8,'0');
     await saveShard('records','r-'+key,{profile:PROFILE,parserVersion:parsed.parserVersion,records});
     await saveShard('chunks','c-'+key,{profile:PROFILE,chunkerProfile:chunkProfile(),search:raw.chunks.map(lexical),...(answerChunks===raw.chunks?{answersUseSearch:true}:{answers:answerChunks.map(lexical)})});
     totalRecords+=batch.length;totalChunks+=raw.chunks.length;characters+=batch.reduce((n,r)=>n+r.text.length,0);options.onProgress?.({phase:'indexing',name:file.name,records:totalRecords,chunks:totalChunks,bytes:file.size});await pause();
    }
   }
   for(const choice of choices)if(!tableNames.has(choice.tableName)||!headersByTable.has(choice.tableName))throw Error('The selected column-name row is not present in table '+choice.tableName+'.');
   const pageCoverage=[...pages.values()].sort((a,b)=>a.page-b.page),unreadPages=pageCoverage.filter(p=>p.nativeText==='skipped'||!p.nativeRecords&&!p.ocrRecords).map(p=>p.page);
   if(unreadPages.length)warnings.add('Pages without extracted text: '+unreadPages.slice(0,50).join(', ')+(unreadPages.length>50?`; and ${unreadPages.length-50} more`:'')+'. Their content cannot supply answers. Check the original and add a text layer or import those pages separately.');
   if(format==='pdf')warnings.add('PDF text layers may come from Adobe OCR. Native text does not prove that image content was read. Check original pages when needed.');
   const headerRow=/\.(csv|tsv)$/i.test(file.name)?headerRows.get(file.name):undefined,result={profile:PROFILE,ready:true,format,records:totalRecords,chunks:totalChunks,characters,warnings:[...warnings],pageCoverage,coverageComplete:!unreadPages.length,unreadPages,headerRow:headerRow??null,tableNames:[...tableNames],tableHeaders:choices,tablePreviews:[...tablePreviews].map(([tableName,records])=>({tableName,records})),preview};
   await saveShard('records','summary',result);
   if(options.replaceId&&typeof vault.pruneSourceGeneration==='function')try{const cleaned=await vault.pruneSourceGeneration(caseId,id,{keepGeneration:generation,expectedRevision:caseRevision,signal:options.signal});caseRevision=cleaned.caseRevision;}catch(error){const message='The rebuilt index is saved. Older temporary passages could not be removed: '+String(error.message||error);result.warnings.push(message);options.onProgress?.({phase:'cleanup-warning',message});}
   return{source,summary:{...result,generation},duplicate:false};
  }catch(error){if(!options.replaceId)try{await vault.deleteSource(caseId,id);}catch(_){}else if(previousSummary?.generation&&typeof vault.pruneSourceGeneration==='function')try{await vault.pruneSourceGeneration(caseId,id,{keepGeneration:previousSummary.generation,expectedRevision:caseRevision});}catch(_){}throw error;}
 }
 async function importFiles(caseId,files,options={}){
  const list=Array.from(files);if(list.length>COLLECTION_LIMITS.sources)throw Error('Import at most 2,000 documents per case.');const results=[];
  for(let i=0;i<list.length;i++){abort(options.signal);options.onProgress?.({phase:'source',index:i,total:list.length,name:list[i].name});try{results.push({...await buildSource(caseId,list[i],options),name:list[i].name,status:'imported'});}catch(error){if(error.name==='AbortError')throw error;results.push({name:list[i].name,status:'rejected',error:String(error.message||error)});}await pause();}return results;
 }
 async function search(caseId,question,options={}){
  if(typeof question!=='string'||!question.trim()||question.length>COLLECTION_LIMITS.questionCharacters)throw Error('Use a question with 1–1,000 characters.');abort(options.signal);
  const before=await vault.getCase(caseId,options.signal);if(!before)throw Error('Select a large case first.');const metadata=await sources(caseId,options.signal),allowed=options.sourceIds===undefined?null:new Set(options.sourceIds);
  if(allowed&&(!allowed.size||[...allowed].some(id=>!metadata.some(s=>s.id===id))))throw Error('The selected document is unavailable. Choose it again.');
  const ready=new Set(),generations=new Map(),incomplete=[],partialSources=[];for(const source of metadata){if(allowed&&!allowed.has(source.id))continue;const info=await summary(caseId,source.id,options.signal);if(info?.ready&&typeof info.generation==='string'){ready.add(source.id);generations.set(source.id,info.generation);if(info.coverageComplete===false)partialSources.push({sourceId:source.id,unreadPages:info.unreadPages});}else incomplete.push(source.id);}
  const terms=[...new Set(api().normalizeQuestionTopics?api().normalizeQuestionTopics(question):question.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])];if(!terms.length)throw Error('Use a question with a searchable subject.');
  const strong=[],partial=[];let strongCount=0,scanned=0,scannedCharacters=0,eligible=0;
  const add=(list,item,maximum)=>{list.push(item);list.sort((a,b)=>b.score-a.score||a.chunk.id.localeCompare(b.chunk.id));if(list.length>maximum)list.length=maximum;};
  async function* selectedShards(){if(allowed){for(const sourceId of ready)yield* vault.iterateShards(caseId,{kind:'chunks',sourceId,signal:options.signal});}else yield* vault.iterateShards(caseId,{kind:'chunks',signal:options.signal});}
  for await(const shard of selectedShards()){
   if(!ready.has(shard.sourceId))continue;const payload=requireAuthenticated(shard);if(payload.generation!==generations.get(shard.sourceId))continue;
   if(payload.chunkerProfile!==chunkProfile())throw Error('The passage algorithm changed. Reimport this source before searching.');
   const entries=options.forAnswers?(payload.answersUseSearch?payload.search:payload.answers):payload.search;
   if(!Array.isArray(entries))throw Error('Stored passage list is invalid. Reimport the source.');
   for(const entry of entries){abort(options.signal);const chunk=entry.chunk;if(!chunk||typeof chunk.text!=='string'||chunk.sourceHash!==shard.sourceHash||chunk.sourceId!==shard.sourceId||!Array.isArray(entry.terms))throw Error('Stored passage source binding is invalid.');
    const available=new Set(entry.terms),matches=terms.filter(t=>available.has(t)).length;scanned++;scannedCharacters+=chunk.text.length;eligible++;
    if(matches){const item={chunk,score:matches/terms.length,shardId:shard.id};if(matches===terms.length){strongCount++;add(strong,item,COLLECTION_LIMITS.candidates);}else add(partial,item,COLLECTION_LIMITS.candidates);}
   }
   options.onProgress?.({phase:'searching',scanned,scannedCharacters});await pause();
  }
  abort(options.signal);const after=await vault.getCase(caseId,options.signal);if(after?.revision!==before.revision)throw Error('This case changed during search. Ask again.');
  const selected=strong.length?strong:partial;return{results:selected.map(x=>({...x.chunk,score:x.score})),diagnostics:{method:'full-case-lexical-candidates',weak:!selected.length,indexedChunks:eligible,scannedChunks:scanned,scannedCharacters,strongMatches:strongCount,overflow:strongCount>COLLECTION_LIMITS.candidates,incompleteSources:incomplete,partialSources,caseRevision:before.revision,sourceIds:[...ready],candidateLimit:COLLECTION_LIMITS.candidates,notice:'Every selected authenticated passage shard was searched. Learned reranking, when enabled, covers the bounded lexical shortlist rather than a global dense index.'}};
 }
 async function answer(caseId,question,options={}){
  const found=await search(caseId,question,{...options,forAnswers:true});if(found.diagnostics.overflow||found.diagnostics.incompleteSources.length)return{status:'abstained',answer:found.diagnostics.overflow?'Too many passages match this question. Choose a document or ask a more specific question.':'Some documents were not fully imported. Reimport them before asking for a written answer.',citations:[],retrieved:found.results,diagnostics:found.diagnostics};
  if(!found.results.length)return{status:'abstained',answer:'No matching answer-ready passages were found. Check table column names or use source search.',citations:[],retrieved:[],diagnostics:found.diagnostics};
  let retrieval={results:found.results.slice(0,6),diagnostics:{...found.diagnostics,weak:false}};
  if(options.embedding){let candidates=found.results;if(typeof options.embedding.inspectTextCoverage==='function'){const coverage=await options.embedding.inspectTextCoverage(candidates.map(c=>c.text),{signal:options.signal});candidates=candidates.filter((_,i)=>coverage[i]?.embeddable);if(!candidates.length)return{status:'abstained',answer:'The local encoder cannot read these passage tokens. Use source search and check the originals.',citations:[],retrieved:found.results,diagnostics:found.diagnostics};}const index=await api().buildSemanticIndex(candidates,options.embedding,{signal:options.signal});retrieval=question.length>500?await api().retrieveSemantic(index,question,options.embedding,{signal:options.signal,topK:6}):await api().retrieveHybrid(index,question,options.embedding,{signal:options.signal,topK:6});}
  const model=options.model,provider=model?{id:model.id,answerFormat:'auto-grounded-v2',generate:request=>model.generate(request)}:undefined;
  const result=await api().answerQuestion({question,chunks:found.results,retrieval,provider,signal:options.signal,options:{contextCharacters:2600,maxChunks:3,maxTokens:384,timeoutMs:120000}});
  const current=await vault.getCase(caseId,options.signal);if(current?.revision!==found.diagnostics.caseRevision)throw Error('This case changed while the answer was being checked. Ask again.');
  for(const citation of result.citations||[]){const original=await vault.getSource(caseId,citation.sourceId,{signal:options.signal});if(!original||original.hash!==citation.sourceHash)throw Error('An answer source changed. No answer was released.');}
  if((await vault.getCase(caseId,options.signal))?.revision!==found.diagnostics.caseRevision)throw Error('This case changed during source verification. Ask again.');
  result.diagnostics={...result.diagnostics,collectionSearch:found.diagnostics};return result;
 }
 async function configureHeader(caseId,sourceId,row,options={}){if(!Number.isInteger(row)||row<1||row>50000)throw Error('Use a whole column-name row number.');const source=await vault.getSource(caseId,sourceId,{signal:options.signal});if(!source)throw Error('The selected document is unavailable.');const previous=await summary(caseId,sourceId,options.signal),names=previous?.tableNames||(/\.(csv|tsv)$/i.test(source.name)?[source.name]:[]),tableName=options.tableName??(names.length===1?names[0]:undefined);if(!tableName||!names.includes(tableName))throw Error('Choose the source table or sheet before selecting its column-name row.');const tableHeaders=checkedHeaders([...(previous?.tableHeaders||[]).filter(choice=>choice.tableName!==tableName),{tableName,headerRow:row}]),file=new root.File([source.blob],source.name);return buildSource(caseId,file,{...options,replaceId:sourceId,tableHeaders});}
 return{profile:PROFILE,vault,sources,summary,importFiles,search,answer,configureHeader};
}
return{createCaseCollection,COLLECTION_LIMITS,COLLECTION_PROFILE:PROFILE};
});
