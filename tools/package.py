#!/usr/bin/env python3
"""Create and validate portable ZIPs. Preparation runs outside the office only."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path)
parser.add_argument('--office', action='store_true',
                    help='Include the verified generation model. No preparation is needed at the office.')
args = parser.parse_args()
if args.out is None:
    args.out = root / 'dist' / ('PBGC-RAG-0.4-office.zip' if args.office else 'PBGC-RAG-0.4.zip')
paths = [root / 'index.html', root / 'README.md', root / 'ACCEPTANCE.md', root / 'BLOCKERS.md']
paths += sorted((root / 'assets').glob('*.js')) + sorted((root / 'assets').glob('*.css'))
paths += sorted((root / 'docs').glob('*.md'))
paths += sorted((root / 'vendor').rglob('*'))
# Runtime weights are added only by the explicit complete-office profile.
paths = sorted({p for p in paths if p.is_file() and p.suffix.lower() != '.gguf'})
entries = {path.relative_to(root).as_posix(): path for path in paths}
model_manifest = None
if args.office:
    manifest_path = root / 'vendor' / 'local-llm' / 'qwen2.5-0.5b-instruct.manifest.json'
    model_manifest = json.loads(manifest_path.read_text())
    if model_manifest.get('schemaVersion') != 1 or len(model_manifest.get('files', [])) != 1:
        raise SystemExit('Office model manifest must identify exactly one supported model.')
    spec = model_manifest['files'][0]
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*\.gguf', spec.get('name', '')):
        raise SystemExit('Office model manifest filename is invalid.')
    model_path = root / 'dist' / 'models' / spec['name']
    if (not model_path.is_file() or model_path.stat().st_size != spec['bytes']
            or sha256_file(model_path) != spec['sha256']):
        raise SystemExit('Office model is missing or failed its pinned size/SHA-256 check. '
                         'Prepare the model outside the office before packaging.')
    entries['models/' + spec['name']] = model_path
    entries['models/' + manifest_path.name] = manifest_path
    entries['models/LICENSE.Qwen2.5'] = root / 'vendor' / 'local-llm' / 'LICENSE.Qwen2.5'
    entries['OFFICE-START.md'] = root / 'docs' / 'OFFICE-START.md'
for archive_path, path in entries.items():
    if not path.is_file() or not path.resolve().is_relative_to(root):
        raise SystemExit(f'Package path missing or escapes the repository: {archive_path}')
for match in re.finditer(r'(?:src|href)="([^"#]+)"', (root / 'index.html').read_text()):
    ref = match[1]
    if '://' in ref or not (root / ref).is_file():
        raise SystemExit(f'Invalid or missing local entry asset: {ref}')
manifest = {'schemaVersion': 1, 'kind': 'pbgc-rag-workplace-build', 'version': '0.4',
            'distribution': 'complete-offline-office' if args.office else 'core-without-generation-weights',
            'official': False, 'fileProfileAcceptance': 'BLOCKED for workplace approval; see browser-specific evidence in ACCEPTANCE.md',
            'files': [{'path': name, 'bytes': path.stat().st_size,
                       'sha256': sha256_file(path)} for name, path in sorted(entries.items())]}
if model_manifest:
    manifest['includedGenerationModel'] = model_manifest
args.out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.out, 'w', compression=zipfile.ZIP_DEFLATED) as package:
    for name, path in sorted(entries.items()):
        # The quantized model is already dense; storing it avoids slow preparation/extraction.
        package.write(path, name, compress_type=zipfile.ZIP_STORED if path.suffix.lower() == '.gguf' else zipfile.ZIP_DEFLATED)
    package.writestr('build-manifest.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(args.out) as package:
    if package.testzip():
        raise SystemExit('ZIP integrity validation failed')
    for item in manifest['files']:
        digest = hashlib.sha256()
        with package.open(item['path']) as content:
            for block in iter(lambda: content.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != item['sha256']:
            raise SystemExit(f"Hash mismatch: {item['path']}")
print(json.dumps({'path': str(args.out), 'distribution': manifest['distribution'],
                  'files': len(entries), 'bytes': args.out.stat().st_size,
                  'sha256': sha256_file(args.out)}))
