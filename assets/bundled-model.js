/* Classic local scripts make the supplied Qwen weights readable under file://.
 * Only pinned package paths are loaded. This is not a model download. */
(function(root){'use strict';
const API=root.PBGCRag,MODEL_BYTES=491400032,MODEL_SHA='74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db';
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
 if(pack?.schemaVersion!==1||pack.totalBytes!==MODEL_BYTES||pack.model?.files?.length!==1||pack.model.files[0].bytes!==MODEL_BYTES||pack.model.files[0].sha256!==MODEL_SHA||pack.model.files[0].name!=='qwen2.5-0.5b-instruct-q4_k_m.gguf'||!Array.isArray(pack.chunks)||pack.chunks.length!==59)throw Error('The included Qwen pack does not match this application. Use the complete office ZIP.');
 let total=0;pack.chunks.forEach((part,i)=>{if(part.path!==`models/qwen-part-${String(i).padStart(3,'0')}.js`||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>8388608||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('The included Qwen pack has an invalid part.');total+=part.bytes;});
 if(total!==MODEL_BYTES)throw Error('The included Qwen pack is incomplete.');return pack;
}
API.loadBundledQwen=async function({signal,onProgress=()=>{}}={}){
 if(loading)throw Error('Qwen setup is already running.');loading=true;const buffers=[];
 try{
  delete root.PBGCQwenPack;delete root.PBGCQwenPart;onProgress({phase:'opening',message:'Opening the included Qwen assistant…'});await script('models/qwen-pack.js',signal);const pack=validate(root.PBGCQwenPack);delete root.PBGCQwenPack;
  for(let i=0;i<pack.chunks.length;i++){
   if(signal?.aborted)throw abort();delete root.PBGCQwenPart;await script(pack.chunks[i].path,signal);const part=root.PBGCQwenPart;delete root.PBGCQwenPart;
   if(part?.index!==i||typeof part.data!=='string'||part.data.length!==4*Math.ceil(pack.chunks[i].bytes/3))throw Error('One of the included Qwen files is incomplete. Extract the office ZIP again.');
   let binary;try{binary=atob(part.data);}catch{throw Error('An included Qwen file is damaged. Extract the complete office ZIP again.');}const bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);part.data='';
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==pack.chunks[i].bytes||hash!==pack.chunks[i].sha256)throw Error('An included Qwen file failed its integrity check. Extract the office ZIP again.');
   buffers.push(bytes);onProgress({phase:'reading',completed:i+1,total:pack.chunks.length,message:`Reading the included assistant · ${i+1} of ${pack.chunks.length} parts`});await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(signal?.aborted)throw abort();const file=new File(buffers,pack.model.files[0].name,{type:'application/octet-stream'});return {files:[file],manifest:pack.model};
 }finally{buffers.length=0;delete root.PBGCQwenPack;delete root.PBGCQwenPart;loading=false;}
};
})(globalThis);
