#!/usr/bin/env python3
"""Create and validate a portable workplace ZIP. Development-only, no publishing."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=root / 'dist' / 'PBGC-RAG-0.4.zip')
args = parser.parse_args()
paths = [root / 'index.html', root / 'README.md', root / 'ACCEPTANCE.md', root / 'BLOCKERS.md']
paths += sorted((root / 'assets').glob('*.js')) + sorted((root / 'assets').glob('*.css'))
paths += sorted((root / 'docs').glob('*.md'))
paths += sorted((root / 'vendor').rglob('*'))
# GGUF weights are distributed separately, never copied into the core ZIP.
paths = sorted({p for p in paths if p.is_file() and p.suffix.lower() != '.gguf'})
for path in paths:
    if not path.resolve().is_relative_to(root):
        raise SystemExit(f'Package path escapes the repository: {path}')
for match in re.finditer(r'(?:src|href)="([^"#]+)"', (root / 'index.html').read_text()):
    ref = match[1]
    if '://' in ref or not (root / ref).is_file():
        raise SystemExit(f'Invalid or missing local entry asset: {ref}')
manifest = {'schemaVersion': 1, 'kind': 'pbgc-rag-workplace-build', 'version': '0.4',
            'official': False, 'fileProfileAcceptance': 'BLOCKED for workplace approval; see browser-specific evidence in ACCEPTANCE.md',
            'files': [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size,
                       'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
args.out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.out, 'w', compression=zipfile.ZIP_DEFLATED) as package:
    for path in paths:
        package.write(path, path.relative_to(root).as_posix())
    package.writestr('build-manifest.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(args.out) as package:
    if package.testzip():
        raise SystemExit('ZIP integrity validation failed')
    for item in manifest['files']:
        content = package.read(item['path'])
        if hashlib.sha256(content).hexdigest() != item['sha256']:
            raise SystemExit(f"Hash mismatch: {item['path']}")
print(json.dumps({'path': str(args.out), 'files': len(paths), 'bytes': args.out.stat().st_size,
                  'sha256': hashlib.sha256(args.out.read_bytes()).hexdigest()}))
