/* Source-bound, descriptive annotations. Review records a human claim, not an
 * authenticated signature, approved legal interpretation or active rule. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EVIDENCE_LIMITS=Object.freeze({annotations:2000,sources:50,content:20000,value:4000,locator:4096});
  const INTERNAL_EVIDENCE_TERMS=Object.freeze(['NRD','ERD','EURD','RBD','QPSA','DOR','DORNSF','XRD','benefit form','PC category','Title IV','4022(c)','436','survivor case','post-DOPT event','freeze date','plan amendment','service','pension calculation'].map(term=>Object.freeze({term,kind:'internal-topic',officialDefinition:null,notice:'Descriptive topic tag only. No official definition or rule is supplied.'})));
  const CONTENT=['id','version','kind','subject','predicate','value','sources','authority','applicability','validity','group'];
  const EDITABLE=CONTENT.filter(key=>!['id','version'].includes(key));
  const ALLOWED=['schemaVersion',...CONTENT,'status','review'];
  const fail=message=>{throw Error(message);};
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
  function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)fail('Invalid evidence '+label+'.');return value;}
  function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Evidence dates must use YYYY-MM-DD.');const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('Invalid evidence calendar date.');return value;}
  function keys(value,allowed,label){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Invalid '+label+' fields.');}
  function canonical(value,depth=0,state={count:0}){
    if(++state.count>2048||depth>12)fail('Evidence JSON exceeds its complexity limit.');
    if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
    if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(item=>canonical(item,depth+1,state)).join(',')+']';
    if(!plain(value))fail('Evidence must contain plain JSON values.');
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],depth+1,state)).join(',')+'}';
  }
  const copy=value=>JSON.parse(canonical(value));
  function locator(value){if(!plain(value)||typeof value.type!=='string'||!value.type)fail('Evidence needs an exact typed source locator.');const encoded=canonical(value);if(encoded.length>EVIDENCE_LIMITS.locator)fail('Evidence locator exceeds its size limit.');return encoded;}
  function sourceIndex(sources){
    if(!Array.isArray(sources)||sources.length>200)fail('Provide the verified source set for this workspace.');
    const index=new Set();let count=0;
    for(const source of sources){if(!plain(source)||typeof source.hash!=='string'||!/^[a-f0-9]{64}$/.test(source.hash)||!Array.isArray(source.records))fail('Invalid verified evidence source.');
      for(const record of source.records){if(++count>50000)fail('Evidence source set exceeds the record limit.');if(!plain(record)||typeof record.text!=='string')fail('Invalid verified source record.');index.add(source.hash+'\0'+locator(record.locator));}
    }return index;
  }
  function evidenceContentKey(annotation){if(!plain(annotation))fail('Provide an evidence annotation.');const content={schemaVersion:1};for(const key of CONTENT)content[key]=annotation[key];const value=canonical(content);if(value.length>EVIDENCE_LIMITS.content)fail('Evidence content exceeds its size limit.');return value;}
  function check(annotation,index,requireReviewed){
    keys(annotation,ALLOWED,'evidence annotation');if(annotation.schemaVersion!==1)fail('Unsupported evidence annotation schema.');
    text(annotation.id,'ID',100);if(!Number.isSafeInteger(annotation.version)||annotation.version<1||annotation.version>1000000)fail('Invalid evidence version.');
    if(!['fact','provision','event'].includes(annotation.kind))fail('Unsupported evidence kind.');text(annotation.subject,'subject',200);text(annotation.predicate,'predicate',200);
    if(annotation.value!==null)text(annotation.value,'value',EVIDENCE_LIMITS.value);
    if(!Array.isArray(annotation.sources)||!annotation.sources.length||annotation.sources.length>EVIDENCE_LIMITS.sources)fail('Evidence requires one to 50 exact source references.');
    const seen=new Set();for(const ref of annotation.sources){keys(ref,['sourceHash','locator'],'evidence source');if(typeof ref.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(ref.sourceHash))fail('Invalid evidence source hash.');const key=ref.sourceHash+'\0'+locator(ref.locator);if(!index.has(key))fail('Evidence reference does not resolve in the verified workspace sources.');if(seen.has(key))fail('Duplicate evidence source reference.');seen.add(key);}
    keys(annotation.authority,['label','reference'],'evidence authority');text(annotation.authority.label,'authority label',200);if(annotation.authority.reference!==null)text(annotation.authority.reference,'authority reference',500);
    if(!['unknown','all-dates','period'].includes(annotation.applicability))fail('Unsupported evidence applicability.');
    keys(annotation.validity,['from','to'],'evidence validity');for(const endpoint of ['from','to'])if(annotation.validity[endpoint]!==null)date(annotation.validity[endpoint]);
    if(annotation.validity.from!==null&&annotation.validity.to!==null&&annotation.validity.from>annotation.validity.to)fail('Evidence validity end precedes start.');
    if(annotation.applicability==='period'&&annotation.validity.from===null&&annotation.validity.to===null)fail('Period applicability needs at least one date boundary.');
    if(annotation.applicability!=='period'&&(annotation.validity.from!==null||annotation.validity.to!==null))fail('Only explicit period applicability can carry validity dates.');
    if(annotation.group!==null)text(annotation.group,'group',200);
    if(!['proposed','reviewed'].includes(annotation.status))fail('Unsupported evidence review status.');
    const contentKey=evidenceContentKey(annotation);
    if(annotation.status==='proposed'){if(annotation.review!==null)fail('A proposed annotation cannot carry a review.');if(requireReviewed)fail('Evidence has not been reviewed.');}
    else{keys(annotation.review,['reviewer','at','version','contentKey'],'evidence review');text(annotation.review.reviewer,'reviewer',120);date(annotation.review.at);if(annotation.review.version!==annotation.version||annotation.review.contentKey!==contentKey)fail('Evidence review does not match its exact content and version.');}
    return true;
  }
  function validateEvidenceAnnotation(annotation,verifiedSources,options={}){try{keys(options,['requireReviewed'],'evidence validation options');if(options.requireReviewed!==undefined&&typeof options.requireReviewed!=='boolean')fail('Invalid reviewed-status requirement.');check(annotation,sourceIndex(verifiedSources),options.requireReviewed===true);return{valid:true,errors:[]};}catch(error){return{valid:false,errors:[error.message]};}}
  function validateEvidenceAnnotations(annotations,verifiedSources){
    try{
      if(!Array.isArray(annotations)||annotations.length>EVIDENCE_LIMITS.annotations)fail('Provide at most 2,000 evidence annotations.');
      const index=sourceIndex(verifiedSources),ids=new Set();
      for(const annotation of annotations){check(annotation,index,false);if(ids.has(annotation.id))fail('Duplicate evidence annotation ID.');ids.add(annotation.id);}
      return{valid:true,errors:[]};
    }catch(error){return{valid:false,errors:[error.message]};}
  }
  function checked(annotation,verifiedSources){const validation=validateEvidenceAnnotation(annotation,verifiedSources);if(!validation.valid)fail(validation.errors.join(' '));return annotation;}
  function createEvidenceAnnotation(input,verifiedSources){
    keys(input,['schemaVersion','id','version','kind','subject','predicate','value','sources','authority','applicability','validity','group','status','review'],'new evidence');
    if(input.schemaVersion!==undefined&&input.schemaVersion!==1)fail('Unsupported new evidence schema.');
    if(input.version!==undefined&&input.version!==1)fail('New evidence starts at version one.');if(input.status!==undefined&&input.status!=='proposed'||input.review!==undefined&&input.review!==null)fail('New evidence cannot arrive reviewed.');
    const annotation={schemaVersion:1,id:input.id,version:1,kind:input.kind,subject:input.subject,predicate:input.predicate,value:input.value===undefined?null:input.value,sources:input.sources,authority:input.authority||{label:'unknown',reference:null},applicability:input.applicability||'unknown',validity:input.validity||{from:null,to:null},group:input.group===undefined?null:input.group,status:'proposed',review:null};
    checked(annotation,verifiedSources);return copy(annotation);
  }
  function updateEvidenceAnnotation(annotation,patch,verifiedSources){
    checked(annotation,verifiedSources);keys(patch,EDITABLE,'evidence edit');if(!Object.keys(patch).length)fail('Provide at least one evidence content edit.');
    const updated={...annotation,...patch,version:annotation.version+1,status:'proposed',review:null};checked(updated,verifiedSources);return copy(updated);
  }
  function reviewEvidenceAnnotation(annotation,review,verifiedSources){
    checked(annotation,verifiedSources);keys(review,['reviewer','at','version','contentKey'],'human evidence review');
    const reviewed={...annotation,status:'reviewed',review:{reviewer:review.reviewer,at:review.at,version:review.version,contentKey:review.contentKey}};checked(reviewed,verifiedSources);return copy(reviewed);
  }
  function overlapping(a,b){if(a.group!==null&&b.group!==null&&a.group!=='*'&&b.group!=='*'&&a.group!==b.group)return false;if(a.applicability==='unknown'||b.applicability==='unknown')return true;return !(a.validity.to&&b.validity.from&&a.validity.to<b.validity.from||b.validity.to&&a.validity.from&&b.validity.to<a.validity.from);}
  function reconcileEvidence(annotations,verifiedSources,query={}){
    if(!Array.isArray(annotations)||annotations.length>EVIDENCE_LIMITS.annotations)fail('Provide at most 2,000 evidence annotations.');keys(query,['subject','predicate','asOf','group'],'evidence query');
    if(query.subject!==undefined)text(query.subject,'query subject',200);if(query.predicate!==undefined)text(query.predicate,'query predicate',200);if(query.asOf!==undefined)date(query.asOf);if(query.group!==undefined)text(query.group,'query group',200);
    const index=sourceIndex(verifiedSources),ids=new Set();for(const annotation of annotations){check(annotation,index,false);if(ids.has(annotation.id))fail('Duplicate evidence annotation ID.');ids.add(annotation.id);}
    const candidates=annotations.filter(a=>(query.subject===undefined||a.subject===query.subject)&&(query.predicate===undefined||a.predicate===query.predicate)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const possibleConflicts=[];for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.subject===b.subject&&a.predicate===b.predicate&&a.value!==null&&b.value!==null&&a.value!==b.value&&overlapping(a,b)){if(possibleConflicts.length>=2000)fail('Possible-conflict comparison exceeds its result budget. Refine the evidence scope.');possibleConflicts.push({annotationIds:[a.id,b.id],reason:'Different recorded values may apply to the same subject, predicate, period and group. Human review must resolve applicability and authority.'});}}
    const warnings=['Review metadata is an unauthenticated human-review claim. No legal priority or actuarial rule activation is inferred.'];
    const base={status:'abstain',value:null,reason:'No source-bound annotations match the requested scope.',annotationIds:[],possibleConflicts,warnings};
    if(!candidates.length)return base;
    const selected=candidates.filter(a=>!(query.group!==undefined&&a.group!==null&&a.group!=='*'&&a.group!==query.group)&&!(query.asOf!==undefined&&a.applicability==='period'&&(a.validity.from&&a.validity.from>query.asOf||a.validity.to&&a.validity.to<query.asOf)));
    base.annotationIds=selected.map(a=>a.id);if(!selected.length)return{...base,reason:'No annotation explicitly applies to the requested period and group.'};
    if(new Set(selected.map(a=>canonical([a.subject,a.predicate]))).size!==1)return{...base,reason:'The scope contains more than one subject or predicate. Refine the query.'};
    if(selected.some(a=>a.applicability==='unknown'||a.group===null||query.asOf===undefined&&a.applicability==='period'||query.group===undefined&&a.group!=='*'))return{...base,reason:'Applicability, date or group is unknown. Supply and review the missing scope before using a value.'};
    if(selected.some(a=>a.status!=='reviewed'))return{...base,reason:'At least one applicable annotation has not been reviewed for its exact content and version.'};
    if(selected.some(a=>a.value===null||a.authority.label.trim().toLowerCase()==='unknown'))return{...base,reason:'A value or source authority is unknown. Evidence remains insufficient.'};
    if(new Set(selected.map(a=>a.value)).size!==1)return{...base,reason:'Applicable reviewed annotations disagree. Legal priority is not resolved automatically.'};
    return{...base,status:'reviewed-consistent',value:selected[0].value,reason:'Reviewed annotations agree for this explicit scope. This is descriptive evidence agreement, not an official determination.'};
  }
  return{EVIDENCE_LIMITS,INTERNAL_EVIDENCE_TERMS,evidenceContentKey,createEvidenceAnnotation,updateEvidenceAnnotation,validateEvidenceAnnotation,validateEvidenceAnnotations,reviewEvidenceAnnotation,reconcileEvidence};
});
