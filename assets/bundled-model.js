/* Classic local scripts make the supplied Qwen weights readable under file://.
 * Only pinned package paths are loaded. This is not a model download. */
(function(root){'use strict';
const API=root.PBGCRag,MODEL=API.BUNDLED_MODEL,SPEC=MODEL.files[0],MODEL_BYTES=SPEC.bytes,CHUNK_BYTES=8388608,CHUNK_COUNT=Math.ceil(MODEL_BYTES/CHUNK_BYTES);
let loading=false;
function abort(){return new DOMException('Assistant setup cancelled.','AbortError');}
function script(path,signal){return new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(abort());return;}
 const node=document.createElement('script');let timer;
 const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);node.remove();};
 const cancel=()=>{clean();reject(abort());};
 node.src=path;node.onload=()=>{clean();resolve();};node.onerror=()=>{clean();reject(Error('The included Qwen files could not open. Extract the complete office ZIP and keep its folders together.'));};
 signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{clean();reject(Error('Opening the included Qwen files took too long. Try again from the extracted office folder.'));},20000);document.head.append(node);
});}
function validate(pack){
 const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
 if(pack?.schemaVersion!==1||pack.totalBytes!==MODEL_BYTES||canonical(pack.model)!==canonical(MODEL)||!Array.isArray(pack.chunks)||pack.chunks.length!==CHUNK_COUNT)throw Error('The included Qwen pack does not match this application. Use the complete office ZIP.');
 let total=0;pack.chunks.forEach((part,i)=>{const expectedBytes=Math.min(CHUNK_BYTES,MODEL_BYTES-i*CHUNK_BYTES);if(part.path!==`models/qwen-part-${String(i).padStart(3,'0')}.js`||!Number.isSafeInteger(part.bytes)||part.bytes!==expectedBytes||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('The included Qwen pack has an invalid part.');total+=part.bytes;});
 if(total!==MODEL_BYTES)throw Error('The included Qwen pack is incomplete.');return pack;
}
API.loadBundledQwen=async function({signal,onProgress=()=>{}}={}){
 if(loading)throw Error('Qwen setup is already running.');loading=true;let modelBytes=null;
 try{
  delete root.PBGCQwenPack;delete root.PBGCQwenPart;onProgress({phase:'opening',message:'Opening the included Qwen assistant…'});await script('models/qwen-pack.js',signal);const pack=validate(root.PBGCQwenPack);delete root.PBGCQwenPack;modelBytes=new Uint8Array(MODEL_BYTES);
  for(let i=0;i<pack.chunks.length;i++){
   if(signal?.aborted)throw abort();delete root.PBGCQwenPart;await script(pack.chunks[i].path,signal);const part=root.PBGCQwenPart;delete root.PBGCQwenPart;
   if(part?.index!==i||typeof part.data!=='string'||part.data.length!==4*Math.ceil(pack.chunks[i].bytes/3))throw Error('One of the included Qwen files is incomplete. Extract the office ZIP again.');
   let binary;try{binary=atob(part.data);}catch{throw Error('An included Qwen file is damaged. Extract the complete office ZIP again.');}const bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);part.data='';
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==pack.chunks[i].bytes||hash!==pack.chunks[i].sha256)throw Error('An included Qwen file failed its integrity check. Extract the office ZIP again.');
   modelBytes.set(bytes,i*CHUNK_BYTES);onProgress({phase:'reading',completed:i+1,total:pack.chunks.length,message:`Reading the included assistant · ${i+1} of ${pack.chunks.length} parts`});await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(signal?.aborted)throw abort();const modelBuffer=modelBytes.buffer;modelBytes=null;return {modelBuffer,manifest:pack.model};
 }finally{modelBytes=null;delete root.PBGCQwenPack;delete root.PBGCQwenPart;loading=false;}
};
})(globalThis);
