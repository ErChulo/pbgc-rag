"""Development-only deterministic classic-script wrapper for pinned Ternlight.
Usage: python vendor/embeddings/build-model.py /path/to/base-0.1.1.tgz
No downloads or training. Original learned weights and tokenizer remain byte-exact in WASM.
"""
import base64,hashlib,json,re,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent;path=Path(sys.argv[1])
expected='G+/awDQq6AdLGR7GaIq7RCTdriR+DlqpSjiqfYdev6mCDR0HKLhlp5ZF2GiXX3CM6ZwY8g2AI8937IERqTxIkQ=='
if base64.b64encode(hashlib.sha512(path.read_bytes()).digest()).decode()!=expected:raise SystemExit('Pinned npm integrity mismatch')
with tarfile.open(path)as archive:
 wasm=archive.extractfile('package/pkg-bundler/tern_engine_bg.wasm').read()
 glue=archive.extractfile('package/pkg-bundler/tern_engine_bg.js').read().decode()
 (root/'LICENSE').write_bytes(archive.extractfile('package/LICENSE').read())
 (root/'upstream-bindgen.js').write_text(glue)
 (root/'UPSTREAM-README.md').write_bytes(archive.extractfile('package/README.md').read())
exports=re.findall(r'export function ([A-Za-z0-9_]+)\(',glue)
if 'embed'not in exports or '__wbg_set_wasm'not in exports:raise SystemExit('Unexpected glue API')
classic=glue.replace('export function ','function ')
manifest={'schemaVersion':1,'kind':'learned-sentence-embedding-pack','model':'@ternlight/base','version':'0.1.1','dimension':384,'tokenLimit':128,'tokenizer':'embedded BERT-base-uncased WordPiece,30522 entries','architecture':'MiniLM-distilled 2-layer transformer; ternary projections,int4 embeddings; CPU WASM SIMD','source':'https://registry.npmjs.org/@ternlight/base/-/base-0.1.1.tgz','sourceRevision':'c6d2c0a35d14c574ed2898b3dbf95977bca07208','npmIntegrity':'sha512-'+expected,'license':'MIT','wasmSha256':hashlib.sha256(wasm).hexdigest(),'wasmBytes':len(wasm),'upstreamGlueSha256':hashlib.sha256(glue.encode()).hexdigest(),'requires':['WebAssembly SIMD','WebAssembly reference types','CSP wasm-unsafe-eval'],'threads':1,'sharedMemory':False,'runtimeNetwork':False}
manifest['id']='ternlight-base-v0.1.1-'+manifest['wasmSha256'][:16]
pack={'manifest':manifest,'wasmBase64':base64.b64encode(wasm).decode()}
source='/* Ternlight0.1.1 MIT Copyright2026 Wenshu Tang; see LICENSE and manifest.json. */\n(function(root){\'use strict\';const pack='+json.dumps(pack,separators=(',',':'))+';\npack.createEngine=function(module){\n'+classic+'\nconst bindings={'+','.join(exports)+'};\nconst instance=new WebAssembly.Instance(module,{"./tern_engine_bg.js":bindings});\n__wbg_set_wasm(instance.exports);instance.exports.__wbindgen_start();\nreturn {embed,tokenize,configSummary:config_summary,memoryBytes:()=>instance.exports.memory.buffer.byteLength};\n};\nif(typeof module===\'object\'&&module.exports)module.exports=pack;root.PBGCRag=root.PBGCRag||{};root.PBGCRag.embeddingModelPack=pack;})(globalThis);\n'
(root/'model.js').write_text(source)
manifest['modelScriptSha256']=hashlib.sha256(source.encode()).hexdigest();manifest['modelScriptBytes']=len(source.encode())
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'ACKNOWLEDGEMENT.md').write_text('Bundled runtime, tokenizer and trained weights: @ternlight/base0.1.1,MIT,Copyright2026 Wenshu Tang. Source https://github.com/soycaporal/ternlight at '+manifest['sourceRevision']+'. Upstream documents a MiniLM-distilled trained sentence encoder, not a GloVe model. See UPSTREAM-README.md and docs/EMBEDDINGS.md for independently tested limits.\n')
print(json.dumps(manifest,indent=2))
