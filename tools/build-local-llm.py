#!/usr/bin/env python3
"""Build/check pinned local-only classic single-thread wllama assets. No network."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'vendor' / 'local-llm'
INPUTS = {'upstream/index.js': '1a4c0b01578eeaf6b10ab290037d34fa727b362bb27bd6a60bfa5786c8d160fc', 'upstream/single-thread.wasm': '529c780d43cb57cb9ac7ef4c42e16463afb0b2dec4ecaae9a6df8179c435fd71'}


def generate():
    sources = {}
    for name, expected in INPUTS.items():
        content = (DIRECTORY / name).read_bytes()
        actual = hashlib.sha256(content).hexdigest()
        if actual != expected:
            raise SystemExit(f'Pinned upstream hash mismatch: {name}')
        sources[name] = content
    source = sources['upstream/index.js'].decode('utf-8')
    wasm = base64.b64encode(sources['upstream/single-thread.wasm']).decode('ascii')
    pattern = r'var LLAMA_CPP_WORKER_CODE = ("(?:\\.|[^"\\])*");'
    matches = list(re.finditer(pattern, source))
    if len(matches) != 1:
        raise SystemExit('Expected one pinned worker-code declaration')
    worker = json.loads(matches[0].group(1))
    anchor = 'return {\n    noInitialRun: true,'
    if worker.count(anchor) != 1:
        raise SystemExit('Worker module-config anchor changed')
    worker = worker.replace(anchor, 'return {\n    wasmBinary: Uint8Array.from(atob(' + json.dumps(wasm) + '), c => c.charCodeAt(0)),\n    noInitialRun: true,')
    # Browser CSP remains a second boundary. These local workers never fetch.
    worker = ('globalThis.fetch=()=>Promise.reject(new Error("Network disabled in local model worker"));\n'
              'globalThis.XMLHttpRequest=class{constructor(){throw Error("Network disabled in local model worker");}};\n'
              'globalThis.importScripts=()=>{throw Error("Runtime imports disabled in local model worker");};\n') + worker
    source = source[:matches[0].start()] + 'var LLAMA_CPP_WORKER_CODE = ' + json.dumps(worker, ensure_ascii=True) + ';' + source[matches[0].end():]
    # True classic Blob workers avoid file-origin module imports. Store the URL
    # on the worker so cancellation/disposal can deterministically revoke it.
    anchor = 'return new Worker(workerURL, { type: "module" });'
    if source.count(anchor) != 1:
        raise SystemExit('Expected one pinned worker creation anchor')
    source = source.replace(anchor, 'const worker = new Worker(workerURL); worker.__pbgcBlobURL = workerURL; return worker;')
    exports = re.search(r'export \{\n[\s\S]*?\n\};\s*$', source)
    if not exports:
        raise SystemExit('Expected final ESM export block')
    source = source[:exports.start()]
    source += '\nfor(const method of ["loadModelFromUrl","loadModelFromHF","downloadModel"]) if(Wllama.prototype[method]) Wllama.prototype[method]=function(){return Promise.reject(new Error("Only explicitly selected local GGUF blobs are supported"));};\n'
    source += 'globalThis.PBGCRagWllama=Object.freeze({Wllama,version:"2.3.7",libllamaVersion:"b7179-4abef75",singleThread:true,embeddedWasm:true});\n'
    content = ('/* Generated from pinned MIT wllama 2.3.7. See LICENSE.wllama and docs/LOCAL-LLM.md.\n'
               ' * Local modifications: embedded ST wasm, classic Blob worker, disabled network/import entrypoints. */\n'
               '(function(){\n' + source + '\n})();\n').encode('utf-8')
    manifest = {'schemaVersion': 1, 'kind': 'pbgc-local-llm-runtime', 'runtime': '@wllama/wllama', 'version': '2.3.7',
                'source': 'https://registry.npmjs.org/@wllama/wllama/-/wllama-2.3.7.tgz',
                'license': 'MIT', 'llamaCpp': 'b7179-4abef75', 'cpuOnly': True, 'singleThread': True,
                'inputs': [{'path': name, 'sha256': sha} for name, sha in INPUTS.items()],
                'output': {'path': 'wllama-classic.js', 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()},
                'modifications': ['Embed single-thread WASM in module config; no runtime binary fetch', 'Use classic Blob worker and expose its URL for disposal', 'Disable network/import worker entrypoints and model URL/HF loaders']}
    return content, (json.dumps(manifest, indent=2) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    bundle, manifest = generate()
    for filename, content in [('wllama-classic.js', bundle), ('runtime-manifest.json', manifest)]:
        output = DIRECTORY / filename
        if args.check:
            if not output.exists() or output.read_bytes() != content:
                raise SystemExit(f'Local model runtime asset is stale: {filename}')
        else:
            output.write_bytes(content)
    print('Pinned local model runtime assets verified' if args.check else 'Built pinned local model runtime assets')


if __name__ == '__main__':
    main()
