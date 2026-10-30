"""Development-only generation; no Python dependency in the delivered app."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
prefix = """'use strict';
self.fetch=async function(){throw Error('PDF worker network access is disabled.');};
self.importScripts=function(){throw Error('PDF worker script imports are disabled.');};
// Suppress PDF.js's auto-binding to the outer worker message port. Its internal
// WorkerMessageHandler will instead run through the in-memory fake-worker port.
self.window=self;
"""
entry = """
self.onmessage=async function(event){
 try {
  const result=await PBGCRag.extractPdfBytes(new Uint8Array(event.data.bytes));
  self.postMessage({ok:true,result});
 } catch(error) {
  self.postMessage({ok:false,error:String(error.message||error)});
 }
};
"""
source = (prefix + (root / "pdf.worker.js").read_text() + "\ndelete self.window;\n"
          + (root / "pdf.js").read_text() + "\n" + (root / "parser-core.js").read_text() + entry)
output = ("/* Generated dedicated-worker source. PDF.js Apache-2.0; see LICENSE and build-info.json. */\n"
          "(function(root){'use strict';root.PBGCRag=root.PBGCRag||{};root.PBGCRag.pdfWorkerSource="
          + json.dumps(source, separators=(",", ":")) + ";})(globalThis);\n")
(root / "parser-worker-source.js").write_text(output)
