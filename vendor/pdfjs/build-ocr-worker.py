#!/usr/bin/env python3
"""Generate the local classic PDF raster worker. Development only."""
import hashlib
import json
from pathlib import Path
root=Path(__file__).resolve().parent
prefix="""'use strict';
self.fetch=async function(){throw Error('PDF OCR worker network access is disabled.');};
self.importScripts=function(){throw Error('PDF OCR worker script imports are disabled.');};
self.window=self;
"""
entry="""
self.onmessage=async function(event){try{const result=await self.PBGCPdfOcrRender(event.data);if(result.data)self.postMessage({ok:true,result},[result.data.buffer]);else self.postMessage({ok:true,result});}catch(error){self.postMessage({ok:false,error:String(error.message||error)});}};
"""
source=prefix+(root/'pdf.worker.js').read_text()+"\ndelete self.window;\n"+(root/'pdf.js').read_text()+"\n"+(root/'ocr-render-core.js').read_text()+entry
output="/* Generated PDF OCR raster worker; PDF.js Apache-2.0, see LICENSE. */\n(function(root){'use strict';root.PBGCRag=root.PBGCRag||{};root.PBGCRag.pdfOcrRenderWorkerSource="+json.dumps(source,separators=(',',':'))+";})(globalThis);\n"
(root/'ocr-render-worker-source.js').write_text(output)
manifest={'schemaVersion':1,'kind':'pdf-ocr-raster-worker','pdfjs':'6.4.299','sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['pdf.js','pdf.worker.js','ocr-render-core.js','build-ocr-worker.py']},'output':{'path':'ocr-render-worker-source.js','payloadSha256':hashlib.sha256(output.encode()).hexdigest(),'payloadBytes':len(output.encode())}}
# Manifest stays embedded in the generated source footer rather than changing old PDF metadata.
with (root/'ocr-render-worker-source.js').open('a') as f:f.write('/* Build provenance '+json.dumps(manifest,separators=(',',':'))+' */\n')
print('PDF OCR raster worker generated from pinned local PDF.js bundles.')
