#!/usr/bin/env python3
"""Generate the local classic PDF raster worker. Development only."""
import hashlib
import json
import argparse
import re
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check',action='store_true',help='Fail when the generated worker or runtime integrity pin is stale.')
args=parser.parse_args()
root=Path(__file__).resolve().parent
prefix="""'use strict';
self.fetch=async function(){throw Error('PDF OCR worker network access is disabled.');};
self.importScripts=function(){throw Error('PDF OCR worker script imports are disabled.');};
self.window=self;
"""
entry="""
self.onmessage=async function(event){try{const result=await self.PBGCPdfOcrRender(event.data);if(result.data)self.postMessage({ok:true,result},[result.data.buffer]);else self.postMessage({ok:true,result});}catch(error){self.postMessage({ok:false,error:String(error.message||error)});}};
"""
def normalized(name):return (root/name).read_text(encoding='utf-8')
source=prefix+normalized('pdf.worker.js')+"\ndelete self.window;\n"+normalized('pdf.js')+"\n"+normalized('ocr-render-core.js')+entry
output="/* Generated PDF OCR raster worker; PDF.js Apache-2.0, see LICENSE. */\n(function(root){'use strict';root.PBGCRag=root.PBGCRag||{};root.PBGCRag.pdfOcrRenderWorkerSource="+json.dumps(source,separators=(',',':'))+";})(globalThis);\n"
required=('isEvalSupported:false','useWorkerFetch:false','useWasm:false','useSystemFonts:false','disableFontFace:true','enableXfa:false','BinaryDataFactory:NoExternalData')
if any(flag not in normalized('ocr-render-core.js') for flag in required):raise SystemExit('PDF raster isolation flags changed; review the renderer before rebuilding.')
manifest={'schemaVersion':1,'kind':'pdf-ocr-raster-worker','pdfjs':'6.4.299','sourceEncoding':'UTF-8 with normalized LF','sources':{name:hashlib.sha256(normalized(name).encode()).hexdigest() for name in ['pdf.js','pdf.worker.js','ocr-render-core.js','build-ocr-worker.py']},'output':{'path':'ocr-render-worker-source.js','payloadSha256':hashlib.sha256(output.encode()).hexdigest(),'payloadBytes':len(output.encode())}}
# Manifest stays embedded in the generated source footer rather than changing old PDF metadata.
output+='/* Build provenance '+json.dumps(manifest,separators=(',',':'))+' */\n'
target=root/'ocr-render-worker-source.js'
adapter=root.parent.parent/'assets/pdf-ocr.js'
pin=hashlib.sha256(source.encode()).hexdigest()
text=adapter.read_text(encoding='utf-8')
updated,count=re.subn(r"const PDF_OCR_RENDER_SHA256='[a-f0-9]{64}';", "const PDF_OCR_RENDER_SHA256='"+pin+"';",text)
if count!=1:raise SystemExit('PDF OCR adapter must contain exactly one runtime worker integrity pin.')
if args.check:
 if not target.exists() or target.read_text(encoding='utf-8')!=output or text!=updated:raise SystemExit('PDF OCR worker or runtime pin is stale. Run vendor/pdfjs/build-ocr-worker.py.')
 print('PASS: PDF OCR worker and runtime integrity pin are current.')
else:
 target.write_text(output,encoding='utf-8',newline='\n')
 adapter.write_text(updated,encoding='utf-8',newline='\n')
 print('PDF OCR raster worker generated and runtime integrity pin updated from pinned local PDF.js bundles.')
