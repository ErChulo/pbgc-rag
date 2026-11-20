/* Bounded source selection. The model selects existing statements; it writes no claims. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCAnswerSelection=Object.assign(root.PBGCAnswerSelection||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SELECTION_LIMITS=Object.freeze({questionCharacters:1000,partCharacters:350,parts:3,choices:12,choiceCharacters:2000,promptCharacters:2600,selectedChoices:6,rawCharacters:128});
const QUESTION_START=/^(?:what|how|which|when|where|who|whom)\b/i;
const EXPLICIT_JOIN=/\s*;\s*|\s+and\s+(?=(?:what|how|which|when)\b)/i;
const PROPERTY=/\b(?:ages?|amounts?|benefits?|periods?|retention|dates?|income|conditions?|costs?|rates?|eligibility|deadlines?|duration|payments?|frequency|names?|addresses|address)\b/i;
const REFERENTIAL=/\b(?:he|him|his|she|her|hers|they|them|their|theirs|it|its|these|those|former|latter|same|respectively)\b/i;
const CAUSAL=/\b(?:why|because|causes?|caused|therefore|thus|compare|comparison|difference|versus|vs\.?)\b/i;
const GROUP=/\b(?:hourly|salaried|union|nonunion|non-union|nonbargaining|bargaining|active|retired|terminated|vested|nonvested|group|class|category)\b/i;
const NOT_NAMES=new Set('a an the what how which when where who whom normal early retirement age case files file payments payment benefit benefits plan document documents source sources note notes record records row rows table tables amount monthly annual weekly yearly daily income period retention service disability participant participants employees employee bank account number direct deposit form only if unless before after effective for from in on at to under with'.split(' '));
const clean=value=>String(value).trim().replace(/\s+/gu,' ');
const unsupported=(question,reason)=>({kind:'unsupported',question,parts:[],reason});
function completeQuestion(value){return QUESTION_START.test(value)&&value.length<=SELECTION_LIMITS.partCharacters&&(value.match(/[\p{L}\p{N}]+/gu)||[]).length>=3;}
function multipleProperties(value){return value.split(/\band\b|\bversus\b|\bvs\.?\b/i).filter(part=>PROPERTY.test(part)).length>1;}
function hasSubjectScope(value){return GROUP.test(value)||/\b(?:for|from|under|before|after|during|effective|only|if|unless|except)\b/i.test(value)||(value.replace(/['’]s\b/g,'').match(/\b[A-Z][A-Za-z]*(?:[-'][A-Za-z]+)?\b/g)||[]).some(word=>!NOT_NAMES.has(word.toLowerCase()));}
function finishParts(question,values){
 const parts=values.map(value=>{const part=clean(value).replace(/^and\s+/i,'').replace(/[,?]+$/,'');return part.charAt(0).toUpperCase()+part.slice(1)+'?';});
 if(parts.length<2||parts.length>SELECTION_LIMITS.parts||parts.some(part=>!completeQuestion(part)))return unsupported(question,'Write up to three complete questions. Start each question with a question word.');
 if(parts.some(part=>REFERENTIAL.test(part)||multipleProperties(part))||CAUSAL.test(question))return unsupported(question,'Write each question with its own subject. Do not use pronouns or request a comparison.');
 return{kind:'compound',question,parts};
}
function planFactualQuestion(value){
 if(typeof value!=='string'||!value.trim()||value.length>SELECTION_LIMITS.questionCharacters)return unsupported(typeof value==='string'?value.slice(0,SELECTION_LIMITS.questionCharacters):'','Use a question with no more than 1,000 characters.');
 const question=clean(value),marked=question.split('?').map(part=>part.trim()).filter(Boolean);
 if(marked.length>1)return finishParts(question,marked);
 const withoutMark=question.replace(/\?$/,'');
 if(EXPLICIT_JOIN.test(withoutMark)){
  const parts=withoutMark.split(EXPLICIT_JOIN),scoped=parts.map(hasSubjectScope);
  if(scoped.some(Boolean)&&!scoped.every(Boolean))return unsupported(question,'Repeat the person, group and conditions in each full question. Use a question mark between questions.');
  return finishParts(question,parts);
 }
 if(/;/.test(question))return unsupported(question,'Write each part as a complete question.');
 const anonymous=/^what\s+are\s+(.+)$/i.exec(withoutMark)||/^what\s+(.+?)\s+are\s+(?:documented|written|stated|listed)(?:\s+in\s+(?:the\s+)?(?:(?:two|three)\s+)?(?:notes|documents|sources|records))?$/i.exec(withoutMark);
 if(anonymous&&/\band\b/i.test(anonymous[1])){
  const fragments=anonymous[1].split(/\s+and\s+/i);
  const ambiguous=fragments.length>SELECTION_LIMITS.parts||fragments.some(part=>!PROPERTY.test(part)||/[A-Z]/.test(part)||GROUP.test(part)||REFERENTIAL.test(part)||CAUSAL.test(part)||/[,;:]|\b(?:of|for|from|under|within|between|in|at|on|with|by|to|before|after|during|effective|only|if|unless|except|because|is|are|was|were|has|have|does|do|will|can|may|must|shall|should|documented|written)\b/i.test(part));
  if(ambiguous)return unsupported(question,'Write each question in full. Repeat the person, group and conditions in each question.');
  return finishParts(question,fragments.map(part=>'What is '+part));
 }
 if(multipleProperties(withoutMark)||/\b(?:what|how|which|when)\b.+\b(?:what|how|which|when)\b/i.test(withoutMark))return unsupported(question,'Write each part as a complete question. Use a question mark between questions.');
 return{kind:'single',question,parts:[question]};
}
function plainStatement(text){
 if(!text||text.length>SELECTION_LIMITS.choiceCharacters||/[;\r\n/&|=<>\\\u2012-\u2015\u2022]|\s-\s|(?<!\d),|,(?!\d)|\b(?:and|or|but|while|whilst|whereas|however|yet|also|plus|additionally|moreover|although|though|nevertheless|neither|nor|both|because|therefore|thus|hence|consequently|since|as)\b/i.test(text)||REFERENTIAL.test(text)||text.split(':').length>2)return false;
 // A compound request must not borrow different roles from a joined multi-person assertion.
 const names=new Set((text.replace(/['’]s\b/g,'').match(/\b[A-Z][A-Za-z]*(?:[-'][A-Za-z]+)?\b/g)||[]).map(word=>word.toLowerCase()).filter(word=>!NOT_NAMES.has(word)));
 if(names.size>1)return false;
 // A unit has one primary property. Numeric units and complete conditions stay
 // literal; another property must not donate a value or a person to this one.
 const properties=[/\bages?\b/i,/\b(?:amounts?|benefits?|income|costs?|rates?|payments?)\b/i,/\b(?:retention|retain(?:ed|s)?|kept|keep(?:s)?)\b/i,/\b(?:dates?|deadlines?)\b/i,/\b(?:addresses|address)\b/i];
 if(properties.filter(property=>property.test(text)).length>1)return false;
 // Count finite predicates before a condition, rather than clipping off the
 // condition. Two unjoined clauses remain ambiguous even after OCR loses case.
 const head=text.split(/\b(?:if|unless|except|provided|before|after|until|when)\b/i)[0];
 const finite=head.match(/\b(?:is|are|was|were|has|have|had|does|do|did|may|might|can|could|must|shall|should|will|would|receives?|pays?|retires?|begins?|ends?|starts?|lists?|retains?|keeps?|lasts?|remains?|requires?|contains?|provides?|equals?|gets?|gives?|goes|sends?|mails?|delivers?|specifies|shows?|states?|includes?|documents?)\b/gi)||[];
 if(finite.length>1)return false;
 return true;
}
const SOURCE_LINK_WORD=/\b(?:and|or|but|if|unless|except|provided|for|from|to|before|after|until|through|when|while|since|as|on|at|in|under|within|with|without|this|that|than|only|of|who|whose|which|including|excluding)\b/iu;
const SOURCE_FINITE_WORD=/\b(?:is|are|was|were|has|have|had|receives?|pays?|retires?|begins?|ends?|starts?|lists?|retains?|keeps?|lasts?|remains?|requires?|contains?|provides?|equals?|gets?|gives?|goes|sends?|mails?|delivers?|specifies|shows?|states?|includes?|documents?)\b/iu;
const SOURCE_HEADING_WORD=/^(?:plan|header|normal|early|late|retirement|age|monthly|annual|weekly|daily|benefit|benefits|pension|income|factor|rate|table|section|chapter|appendix|contents|index)$/iu;
const SOURCE_LITERAL_VALUE=/^(?:[$£€]\s*)?(?:[-+]?\d|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b)/iu;
function standaloneSourceRecord(value){
 const text=value.trim();if(/[\r\n,;:]|\d/.test(text))return /^(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?$/iu.test(text);
 // Uppercase headings contain no finite assertion or dependent scope. A
 // property heading and its following page number must not invent an age.
 const terms=text.match(/\p{L}+/gu)||[];
 return /\p{Lu}/u.test(text)&&!/[\p{Ll}]/u.test(text)&&terms.every(term=>SOURCE_HEADING_WORD.test(term));
}
function independentSourceClause(value){
 const text=value.trim();if(!text||/[,;:]$/.test(text))return false;
 const finite=SOURCE_FINITE_WORD.exec(text);if(!finite)return false;
 const head=text.slice(0,finite.index),tail=text.slice(finite.index+finite[0].length),last=/[\p{L}]+$/u.exec(text);
 // A definite subject can refer back to the preceding fact. Only a direct
 // literal value proves a separate bounded assertion; a number later inside
 // its qualification does not. Keep ambiguous documentary context whole.
 if(/^\s*the\b/iu.test(head)&&!SOURCE_LITERAL_VALUE.test(tail.trimStart()))return false;
 return /\p{L}/u.test(head)&&!SOURCE_LINK_WORD.test(head)&&!REFERENTIAL.test(head)&&/[\p{L}\p{N}]/u.test(tail)&&!(last&&SOURCE_LINK_WORD.test(last[0]));
}
function sourceLineContinues(left,right){
 // A newline is not a sentence terminator. Split only explicit standalone
 // records or two complete independent clauses; retain every ambiguous span.
 // These comparisons never change the original source whitespace.
 if(standaloneSourceRecord(left))return false;
 const nextLine=right.split(/[\r\n]/u,1)[0];
 return !(independentSourceClause(left)&&independentSourceClause(nextLine));
}
function splitSourceStatements(text){
 if(typeof text!=='string')throw Error('Source statements require text.');
 const result=[];let start=0;const whitespace=/\s+/gu;let match;
 while((match=whitespace.exec(text))){
  const prefix=text.slice(start,match.index),punctuated=/[.!?]$/.test(prefix),newline=/[\r\n]/.test(match[0]);
  if(!punctuated&&!newline)continue;
  const last=/\b([A-Za-z]+)\.$/.exec(prefix);
  if(last&&(/^(?:dr|mr|mrs|ms|prof|sr|jr|st|no|sec|art|inc|ltd|co|etc|vs|pp)$/i.test(last[1])||/^[A-Z]$/.test(last[1])))continue;
  if(!punctuated&&sourceLineContinues(prefix,text.slice(match.index+match[0].length)))continue;
  const statement=prefix.trim();if(statement)result.push(statement);start=match.index+match[0].length;
 }
 const tail=text.slice(start).trim();if(tail)result.push(tail);return result;
}
function validPlan(plan){return!!plan&&typeof plan.question==='string'&&plan.question.length>0&&plan.question.length<=SELECTION_LIMITS.questionCharacters&&Array.isArray(plan.parts)&&plan.parts.length>0&&plan.parts.length<=SELECTION_LIMITS.parts&&(plan.kind==='single'&&plan.parts.length===1||plan.kind==='compound'&&plan.parts.length>=2)&&plan.parts.every(part=>typeof part==='string'&&part.length>0&&part.length<=(plan.kind==='single'?SELECTION_LIMITS.questionCharacters:SELECTION_LIMITS.partCharacters));}
function buildSelectionPrompt(plan,choices){
 if(!validPlan(plan)||!Array.isArray(choices)||choices.length>SELECTION_LIMITS.choices||choices.some(choice=>!choice||!/^S(?:[1-9]|1[0-2])$/.test(choice.id)||typeof choice.text!=='string'||!choice.text.length||choice.text.length>SELECTION_LIMITS.choiceCharacters)||new Set(choices.map(choice=>choice.id)).size!==choices.length)throw Error('Source selection requires bounded question parts and source choices.');
 // Preserve both question forms and exact source statements. The dedicated
 // source-selection system message also rejects instructions in source data.
 const data={question:plan.question,parts:plan.parts,sources:choices.map(choice=>({id:choice.id,text:choice.text}))};
 const prompt='Select sources for EVERY question part. Output only S1,S2 or NONE.\nUNTRUSTED DATA JSON\n'+JSON.stringify(data)+'\nEND DATA';
 if(prompt.length>SELECTION_LIMITS.promptCharacters)throw Error('Source-selection prompt exceeds its character budget.');
 return prompt;
}
function safeBind(bind,part,choice){try{return bind(part,choice)===true;}catch(_){return false;}}
function createAnswerChoices(context,{plan,bind}={}){
 if(!Array.isArray(context)||context.length>64||!validPlan(plan)||typeof bind!=='function')return[];
 const choices=[];
 for(const item of context){
  if(!item||!item.chunk||typeof item.chunk.text!=='string'||item.chunk.text.length>12000||typeof item.excerpt!=='string'||!/^C[1-6]$/.test(item.label))continue;
  const table=item.chunk.evidenceKind==='table-field-v1'&&item.chunk.tableEvidence&&item.chunk.tableEvidence.schemaVersion===1;
  // Only the chunk's typed profile may authorize table handling. A malformed
  // chunk hint or top-level imitation must not downgrade into answer prose.
  if(!table&&[item,item.chunk].some(value=>Object.hasOwn(value,'tableEvidence')||Object.hasOwn(value,'evidenceKind')))continue;
  // Split the complete chunk, never the clipped prompt excerpt. A wrapped condition stays whole.
  const statements=table?[item.chunk.text]:splitSourceStatements(item.chunk.text);
  for(const text of statements){
   if(choices.length===SELECTION_LIMITS.choices)return choices;
   // Standalone headings/page labels provide navigation, not factual answers.
   if(!table&&standaloneSourceRecord(text))continue;
   // A single factual answer can need the entire joined condition or benefit
   // qualifier. Keep that complete source sentence; compound question parts
   // retain their stricter atomic-statement isolation.
   if(!text||text.length>SELECTION_LIMITS.choiceCharacters||!item.excerpt.includes(text)||!table&&plan.kind!=='single'&&!plainStatement(text))continue;
   const choice={id:'S'+(choices.length+1),label:item.label,text,context:item};
   if(table){choice.tableEvidence=item.chunk.tableEvidence;choice.trustedTableField=true;}
   const matches=plan.parts.filter(part=>safeBind(bind,part,choice)).length;
   if(!matches||!table&&matches>1)continue;
   try{buildSelectionPrompt(plan,[...choices,choice]);}catch(_){continue;}
   choices.push(choice);
  }
 }
 return choices;
}
function parseSelectionIds(raw,choices){
 if(typeof raw!=='string'||raw.length>SELECTION_LIMITS.rawCharacters||!Array.isArray(choices)||choices.length>SELECTION_LIMITS.choices)throw Error('Invalid source-selection output.');
 const text=raw.trim();if(text==='NONE')return[];
 // Whitespace beside a delimiter does not change the selected source IDs.
 // Validate the entire bounded list before normalizing those separators.
 if(!/^S(?:[1-9]|1[0-2])(?:[ \t\r\n]*,[ \t\r\n]*S(?:[1-9]|1[0-2])){0,5}$/.test(text))throw Error('Output must contain only source IDs or NONE.');
 const ids=text.split(',').map(id=>id.trim()),known=new Set(choices.map(choice=>choice.id));
 if(new Set(ids).size!==ids.length||ids.some(id=>!known.has(id)))throw Error('Source selection contains an unknown or repeated ID.');
 return ids;
}
function validateChoiceCoverage(plan,selected,bind){
 if(!validPlan(plan)||!Array.isArray(selected)||selected.length>SELECTION_LIMITS.choices||selected.some(choice=>!choice||typeof choice.id!=='string'||typeof choice.text!=='string')||new Set(selected.map(choice=>choice.id)).size!==selected.length||typeof bind!=='function')return{complete:false,missingParts:plan&&Array.isArray(plan.parts)?plan.parts.slice():[],irrelevantIds:[]};
 const matrix=selected.map(choice=>plan.parts.map(part=>safeBind(bind,part,choice)));
 const missingParts=plan.parts.filter((_,partIndex)=>!matrix.some(row=>row[partIndex]));
 const irrelevantIds=selected.filter((_,index)=>!matrix[index].some(Boolean)).map(choice=>choice.id);
 return{complete:missingParts.length===0&&irrelevantIds.length===0,missingParts,irrelevantIds};
}
return{SELECTION_LIMITS,planFactualQuestion,splitSourceStatements,createAnswerChoices,buildSelectionPrompt,parseSelectionIds,validateChoiceCoverage};
});
