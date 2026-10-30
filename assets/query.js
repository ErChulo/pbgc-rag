(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PBGCRag=Object.assign(root.PBGCRag||{},api);})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const QUERY_LIMITS=Object.freeze({query:1000,pattern:256,atoms:128,records:50000,characters:20000000,steps:20000000});
const error=message=>{throw Error(message);};
const lower=value=>String(value).toLowerCase();
function budget(){let steps=0;return n=>{steps+=n;if(steps>QUERY_LIMITS.steps)error('Query exceeds the deterministic operation budget. Narrow the case or pattern.');};}
function escapeAtom(pattern,state){if(state.i>=pattern.length)error('Incomplete regex escape.');const c=pattern[state.i++];if(c==='d')return ch=>ch>='0'&&ch<='9';if(c==='w')return ch=>(ch>='a'&&ch<='z')||(ch>='0'&&ch<='9')||ch==='_';if(c==='s')return ch=>' \t\r\n\f\v'.includes(ch);if(c==='n')return ch=>ch==='\n';if(c==='r')return ch=>ch==='\r';if(c==='t')return ch=>ch==='\t';if('0123456789'.includes(c)||/[A-Za-z]/.test(c))error('Unsupported regex escape. Backreferences and Unicode escapes are unavailable.');return ch=>ch===lower(c);}
// Safe regex v1: case-insensitive literals, dot (except newline), classes/ranges,
// \d \w \s, escaped punctuation, atom ? * +, and outer ^ $. No groups,
// alternation, braces, lookaround, backreferences or flags. Thompson-style
// bounded state simulation never invokes a user-created native RegExp.
function compileRegex(pattern){
 if(typeof pattern!=='string'||pattern.length>QUERY_LIMITS.pattern)error('Regex exceeds 256 characters.');
 const state={i:0},atoms=[];let start=false,end=false;
 if(pattern[0]==='^'){start=true;state.i++;}
 while(state.i<pattern.length){let c=pattern[state.i++],test;
  if(c==='$'&&state.i===pattern.length){end=true;break;}
  if('()|{}^$*+?'.includes(c))error('Unsupported regex syntax. Use literals, classes and atom quantifiers only.');
  if(c==='\\')test=escapeAtom(pattern,state);
  else if(c==='.')test=ch=>ch!=='\n'&&ch!=='\r';
  else if(c==='['){let negate=false;const tests=[];if(pattern[state.i]==='^'){negate=true;state.i++;}let closed=false;
   while(state.i<pattern.length){if(pattern[state.i]===']'){state.i++;closed=true;break;}let first=pattern[state.i++];if(first==='\\'){tests.push(escapeAtom(pattern,state));continue;}if(pattern[state.i]==='-'&&pattern[state.i+1]!==']'&&state.i+1<pattern.length){state.i++;const last=pattern[state.i++];if(last==='\\')error('Escaped range endpoints are unsupported.');first=lower(first);const finish=lower(last);if(first>finish)error('Invalid regex range.');tests.push(ch=>ch>=first&&ch<=finish);}else{const literal=lower(first);tests.push(ch=>ch===literal);}}
   if(!closed||!tests.length)error('Invalid or empty regex character class.');test=(ch,spend)=>{let found=false;for(const fn of tests){spend(1);if(fn(ch)){found=true;break;}}return negate!==found;};
  }else{const literal=lower(c);test=ch=>ch===literal;}
  const quantifier=pattern[state.i];if(quantifier==='*'||quantifier==='?'||quantifier==='+'){state.i++;if(quantifier==='+')atoms.push({test,kind:'one'});atoms.push({test,kind:quantifier==='+'?'*':quantifier});}else atoms.push({test,kind:'one'});
  if(atoms.length>QUERY_LIMITS.atoms)error('Regex exceeds the 128-state limit.');
 }
 return {atoms,start,end};
}
function matches(compiled,text,spend){const {atoms,start,end}=compiled,n=atoms.length;let active=new Set();
 function close(states){for(let i=0;i<n;i++){spend(1);if(states.has(i)&&(atoms[i].kind==='*'||atoms[i].kind==='?'))states.add(i+1);}return states;}
 active=close(new Set([0]));if(active.has(n)&&(!end||text.length===0))return true;
 for(let index=0;index<text.length;index++){if(!start)active=close(new Set([...active,0]));const next=new Set(),ch=lower(text[index]);for(const pos of active){spend(1);if(pos<n&&atoms[pos].test(ch,spend)){if(atoms[pos].kind==='*')next.add(pos);else next.add(pos+1);}}active=close(next);if(active.has(n)&&(!end||index===text.length-1))return true;}
 if(!start)active=close(new Set([...active,0]));return active.has(n);
}
const FIELDS=Object.freeze(['text','sourceName','sourceHash','sourceId','score','line','row','column']);
function field(record,name){return ['line','row','column'].includes(name)?record.locator?.[name]:record[name];}
function sqlTokens(input){const tokens=[];let i=0;while(i<input.length){const c=input[i];if(/\s/.test(c)){i++;continue;}if(c==="'"){let value='',closed=false;i++;while(i<input.length){if(input[i]==="'"){i++;if(input[i]==="'"){value+="'";i++;}else{closed=true;break;}}else value+=input[i++];}if(!closed)error('Unclosed SQL string.');tokens.push({kind:'string',value});continue;}if(/[A-Za-z_]/.test(c)){let value='';while(i<input.length&&/[A-Za-z0-9_]/.test(input[i]))value+=input[i++];tokens.push({kind:'word',value});continue;}if(/[0-9]/.test(c)){let value='';while(i<input.length&&/[0-9]/.test(input[i]))value+=input[i++];tokens.push({kind:'number',value:Number(value)});continue;}if(c==='*'||c==='='){tokens.push({kind:'symbol',value:c});i++;continue;}if((c==='!'&&input[i+1]==='=')||(c==='<'&&input[i+1]==='>')){tokens.push({kind:'symbol',value:'!='});i+=2;continue;}if(c===';'&&input.slice(i+1).trim()===''){i++;continue;}error('Unsupported SQL token. Use the documented read-only SELECT subset.');}return tokens;}
// SQL v1: SELECT * FROM records [WHERE field (=|!=|CONTAINS|LIKE) literal
// [AND ...]] [ORDER BY field [ASC|DESC]] [LIMIT 0..50000]. Field names are
// text/sourceName/sourceHash/sourceId/score/line/row/column; no joins, expressions,
// comments, mutations or SQL extensions. LIKE supports only % and _ wildcards.
function compileSQL(query){const tokens=sqlTokens(query);let index=0;const peek=()=>tokens[index],take=()=>tokens[index++],is=value=>peek()&&String(peek().value).toUpperCase()===value;function expect(value){if(!is(value))error('Expected SQL '+value+'.');take();}function column(){const token=take();if(!token||token.kind!=='word'||!FIELDS.includes(token.value))error('Unknown SQL field.');return token.value;}
 expect('SELECT');expect('*');expect('FROM');expect('RECORDS');const predicates=[];let order=null,descending=false,limit=50000;
 if(is('WHERE')){take();do{const name=column(),operator=take();if(!operator||!['=','!=','CONTAINS','LIKE'].includes(String(operator.value).toUpperCase()))error('Unsupported SQL comparison.');const literal=take();if(!literal||!['string','number'].includes(literal.kind))error('Expected SQL string or integer literal.');const op=String(operator.value).toUpperCase();if(['CONTAINS','LIKE'].includes(op)&&literal.kind!=='string')error('Text comparison needs a quoted string.');let like=null;if(op==='LIKE'){const atoms=[];for(const c of lower(literal.value)){if(c==='%')atoms.push({test:()=>true,kind:'*'});else if(c==='_')atoms.push({test:()=>true,kind:'one'});else atoms.push({test:ch=>ch===c,kind:'one'});}if(atoms.length>256)error('SQL LIKE pattern exceeds 256 characters.');like={atoms,start:true,end:true};}predicates.push({name,op,value:literal.value,like});if(!is('AND'))break;take();}while(true);}
 if(is('ORDER')){take();expect('BY');order=column();if(is('ASC')||is('DESC'))descending=String(take().value).toUpperCase()==='DESC';}
 if(is('LIMIT')){take();const token=take();if(!token||token.kind!=='number'||!Number.isSafeInteger(token.value)||token.value>50000)error('SQL LIMIT must be an integer from zero to 50,000.');limit=token.value;}
 if(index!==tokens.length)error('Unsupported SQL clause or extra statement.');return {predicates,order,descending,limit};
}
function queryRecords(records,query,mode){if(!Array.isArray(records)||records.length>QUERY_LIMITS.records)error('Query supports at most 50,000 records.');if(typeof query!=='string'||query.length>QUERY_LIMITS.query)error('Query exceeds 1,000 characters.');let chars=0;for(const record of records){if(!record||typeof record.text!=='string')error('Invalid query record.');chars+=record.text.length;if(chars>QUERY_LIMITS.characters)error('Query text exceeds 20,000,000 characters.');}if(!query.trim())return [];const spend=budget();
 if(mode==='regex'){const compiled=compileRegex(query);return records.filter(record=>matches(compiled,record.text,spend)).map(record=>({...record,score:1}));}
 if(mode!=='sql')error('Unsupported advanced query mode.');const plan=compileSQL(query);let result=records.filter(record=>plan.predicates.every(predicate=>{spend(1);const value=field(record,predicate.name);if(value===undefined||value===null)return false;if(predicate.op==='=')return value===predicate.value;if(predicate.op==='!=')return value!==predicate.value;if(predicate.op==='CONTAINS'){spend(String(value).length);return lower(value).includes(lower(predicate.value));}return matches(predicate.like,String(value),spend);}));
 if(plan.order){const sortField=plan.order;result=result.map((record,index)=>({record,index})).sort((a,b)=>{spend(1);const av=field(a.record,sortField),bv=field(b.record,sortField);let comparison=av===bv?0:av===undefined?1:bv===undefined?-1:typeof av==='number'&&typeof bv==='number'?av-bv:String(av)<String(bv)?-1:1;return comparison?(plan.descending?-comparison:comparison):a.index-b.index;}).map(item=>item.record);}return result.slice(0,plan.limit).map(record=>({...record}));
}
return {queryRecords,compileRegex,QUERY_LIMITS};
});
