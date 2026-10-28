#!/usr/bin/env python3
"""Build a development-only portable bundle; no network or application data."""
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
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
files += sorted((ROOT / 'docs').glob('*.md'))
# Ship the self-contained PDF runtime and all required notices, not duplicate build inputs.
vendor = ROOT / 'vendor' / 'pdfjs'
if vendor.exists():
    provenance = json.loads((vendor / 'PROVENANCE.json').read_text())
    for name, expected in provenance['files'].items():
        source = vendor / name
        if not source.resolve().is_relative_to(vendor.resolve()) or source.is_symlink():
            raise SystemExit('Unsafe vendor provenance path')
        data = source.read_bytes()
        if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise SystemExit(f'Vendor provenance hash mismatch: {name}')
    files += [vendor / 'pdfjs-local.js', vendor / 'NOTICE', vendor / 'PROVENANCE.json']
    files += sorted(vendor.glob('LICENSE*'))
entries = {}
for source in files:
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(ROOT):
        raise SystemExit(f'Unsafe or missing bundle input: {source.name}')
    relative = source.relative_to(ROOT).as_posix()
    entries[relative] = source.read_bytes()
class LocalReferences(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        reference = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' else None
        if reference is None:
            return
        url = urlsplit(reference)
        relative = unquote(url.path)
        if url.scheme or url.netloc or relative.startswith('/') or '..' in Path(relative).parts or relative not in entries:
            raise SystemExit(f'Unbundled or nonlocal application asset: {reference}')
LocalReferences().feed((ROOT / 'index.html').read_text())
manifest = {
    'format': 'pbgc-rag-development-bundle', 'schemaVersion': 1,
    'applicationVersion': json.loads((ROOT / 'package.json').read_text())['version'], 'status': 'INCOMPLETE-DEVELOPMENT',
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
