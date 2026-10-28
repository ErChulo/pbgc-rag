#!/usr/bin/env python3
"""Build a development-only portable bundle; no network or application data."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'dist' / 'pbgc-rag-development.zip'
EXPLICIT = ['index.html', 'README.md', 'SECURITY.md', 'SPEC.md', 'ARCHITECTURE.md',
            'ACCEPTANCE.md', 'BLOCKERS.md', 'PROGRESS.md']
files = [ROOT / name for name in EXPLICIT]
files += sorted((ROOT / 'js').glob('*.js'))
files += sorted((ROOT / 'assets').glob('*.css'))
files += sorted((ROOT / 'fixtures').glob('synthetic-plan.*'))
entries = {}
for source in files:
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(ROOT):
        raise SystemExit(f'Unsafe or missing bundle input: {source.name}')
    relative = source.relative_to(ROOT).as_posix()
    entries[relative] = source.read_bytes()
manifest = {
    'format': 'pbgc-rag-development-bundle', 'schemaVersion': 1,
    'applicationVersion': '0.1.0', 'status': 'INCOMPLETE-DEVELOPMENT',
    'official': False, 'fileOriginAcceptance': 'BLOCKED in managed cloud browser',
    'fixtures': 'Synthetic only. No official templates or real case records.',
    'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
              for name, data in entries.items()},
}
OUTPUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in entries.items():
        archive.writestr('pbgc-rag/' + name, data)
    archive.writestr('pbgc-rag/MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
with zipfile.ZipFile(OUTPUT) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Bundle ZIP validation failed')
    for name, expected in manifest['files'].items():
        data = archive.read('pbgc-rag/' + name)
        if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise SystemExit(f'Bundle hash validation failed: {name}')
print(f'PASS: {len(entries)} bundle files checked against SHA-256 manifest: {OUTPUT}')
