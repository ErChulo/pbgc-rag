#!/usr/bin/env python3
"""Development-only preparation of the separately distributed offline GGUF pack."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import re
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PARTS = [
'6e6944f458d8d65c8e5dd262e251d45d5a53b84484f6788b829b4f0164180650',
'0bad8a019a41c35d4253dc934eee5f29691a7633d7c3654f0e20dd8e28ac948a',
'28fd3df59c9b92253471c39ed1b2d689bc919d9cc5c776b1d459e96d61e3a52a',
'dd0a66303e01cb761c8e7cec37f0df87a0225b1e07ae8dad84d5ed2c80315eb8',
'fda5d45bf20604af434f8e94878d87d027a2fc0df29089b69cacd75bdfc3f2ac',
'8534ad04d967c46f36aa3aaff164630bcbf67136375e30178cf601127756d2de']
BASE = 'https://github.com/rtynbirf/singulyar-llm/releases/download/weights-v1/'
RECOVERY_URL = 'https://github.com/ErChulo/pbgc-rag/releases/download/office-v0.7.0/PBGC-RAG-0.7-office.zip'
RECOVERY_BYTES = 504833381
RECOVERY_SHA256 = '7b32a3646f481baf225a580325c9b42584aa5509a35184f0d90441288c2de440'

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()

def restore_office_model(archive_path, output_path, spec, archive_sha256):
    """Recover pinned weights from our previous release. Never execute ZIP scripts."""
    if digest(archive_path) != archive_sha256:
        raise ValueError('Recovery archive integrity check failed')
    temporary = output_path.with_suffix('.partial')
    def read_json(package, name, prefix, limit):
        info = package.getinfo(name)
        if info.file_size > limit:
            raise ValueError('Recovery model entry exceeds bounds')
        text = package.read(info).decode('ascii')
        if not text.startswith(prefix) or not text.endswith(';\n'):
            raise ValueError('Invalid recovery model script wrapper')
        return json.loads(text[len(prefix):-2])
    try:
        with zipfile.ZipFile(archive_path) as package:
            if len(package.namelist()) != len(set(package.namelist())):
                raise ValueError('Duplicate recovery archive entries')
            pack = read_json(package, 'models/qwen-pack.js', 'globalThis.PBGCQwenPack=', 128 * 1024)
            if (pack.get('schemaVersion') != 1 or pack.get('model', {}).get('files') != [spec]
                    or pack.get('totalBytes') != spec['bytes']):
                raise ValueError('Recovery pack does not identify the pinned model')
            chunks = pack.get('chunks')
            if not isinstance(chunks, list) or not 1 <= len(chunks) <= 128:
                raise ValueError('Invalid recovery chunk count')
            total = 0
            whole = hashlib.sha256()
            with temporary.open('wb') as target:
                for index, part in enumerate(chunks):
                    if (part.get('path') != f'models/qwen-part-{index:03d}.js'
                            or not re.fullmatch(r'[a-f0-9]{64}', part.get('sha256', ''))
                            or type(part.get('bytes')) is not int or not 1 <= part['bytes'] <= 8 * 1024 * 1024):
                        raise ValueError('Invalid recovery chunk metadata')
                    value = read_json(package, part['path'], 'globalThis.PBGCQwenPart=', 12 * 1024 * 1024)
                    if set(value) != {'index', 'data'} or type(value['index']) is not int or value['index'] != index:
                        raise ValueError('Invalid recovery chunk order')
                    chunk = base64.b64decode(value['data'], validate=True)
                    if len(chunk) != part['bytes'] or hashlib.sha256(chunk).hexdigest() != part['sha256']:
                        raise ValueError('Recovery chunk integrity check failed')
                    total += len(chunk)
                    if total > spec['bytes']:
                        raise ValueError('Recovery model exceeds pinned byte count')
                    whole.update(chunk)
                    target.write(chunk)
            if total != spec['bytes'] or whole.hexdigest() != spec['sha256']:
                raise ValueError('Recovered model integrity check failed')
        temporary.replace(output_path)
    finally:
        temporary.unlink(missing_ok=True)

def download_recovery(output, spec):
    archive = output.parent / '.office-v0.7.0.zip'
    temporary = archive.with_suffix('.download')
    try:
        if not (archive.is_file() and archive.stat().st_size == RECOVERY_BYTES and digest(archive) == RECOVERY_SHA256):
            with urllib.request.urlopen(RECOVERY_URL, timeout=120) as response, temporary.open('wb') as target:
                total = 0
                while block := response.read(1024 * 1024):
                    total += len(block)
                    if total > RECOVERY_BYTES:
                        raise ValueError('Recovery download exceeds pinned byte count')
                    target.write(block)
            if temporary.stat().st_size != RECOVERY_BYTES or digest(temporary) != RECOVERY_SHA256:
                raise ValueError('Recovery download integrity check failed')
            temporary.replace(archive)
        restore_office_model(archive, output, spec, RECOVERY_SHA256)
    finally:
        temporary.unlink(missing_ok=True)

def download_larger_model(output, spec):
    """Fetch the separate experimental pack during development, never at office runtime."""
    if (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*\.gguf', spec['name'])
            or not 491400032 < spec['bytes'] <= 768 * 1024 * 1024):
        raise ValueError('Experimental model must be larger than stable and within 768 MiB')
    url = 'https://github.com/ErChulo/pbgc-rag/releases/download/larger-model-weights-v1/' + spec['name']
    temporary = output.with_suffix('.download')
    try:
        total = 0
        actual = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as target:
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > spec['bytes']:
                    raise ValueError('Experimental download exceeds pinned model byte count')
                actual.update(block)
                target.write(block)
        if total != spec['bytes'] or actual.hexdigest() != spec['sha256']:
            raise ValueError('Experimental model integrity check failed')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist' / 'models')
    parser.add_argument('--parts-dir', type=Path, help='Use already downloaded parts; no network.')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    manifest_path = ROOT / 'vendor/local-llm/bundled.manifest.json'
    manifest = json.loads(manifest_path.read_text())
    spec = manifest['files'][0]
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / spec['name']
    if not (output.is_file() and output.stat().st_size == spec['bytes'] and digest(output) == spec['sha256']):
        if args.verify_only:
            raise SystemExit('FAIL: prepared model missing or integrity check failed')
        if manifest['id'] != 'qwen2.5-0.5b-instruct-q4-k-m':
            if args.parts_dir:
                raise SystemExit('The larger model uses a separate complete GGUF, not the stable six-part pack.')
            download_larger_model(output, spec)
            shutil.copyfile(manifest_path, args.out / manifest_path.name)
            shutil.copyfile(ROOT / 'vendor/local-llm/LICENSE.Qwen2.5', args.out / 'LICENSE.Qwen2.5')
            print(json.dumps({'status':'PASS','path':str(output),'bytes':spec['bytes'],'sha256':spec['sha256']}))
            return
        try:
            parts_dir = args.parts_dir or args.out / '.parts'
            parts_dir.mkdir(parents=True, exist_ok=True)
            paths = []
            for index, expected in enumerate(PARTS, 1):
                part = parts_dir / f'part-{index:02}.bin'
                size = 81900007 if index == 6 else 81900005
                if not part.is_file() or part.stat().st_size != size or digest(part) != expected:
                    if args.parts_dir:
                        raise SystemExit(f'FAIL: local part {index} integrity')
                    url = BASE + f'qwen2.5-0.5b-instruct-q4_k_m.part-{index:02}-of-06.bin'
                    temporary = part.with_suffix('.download')
                    try:
                        with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as target:
                            shutil.copyfileobj(response, target)
                        if temporary.stat().st_size != size or digest(temporary) != expected:
                            raise ValueError(f'Part {index} integrity check failed')
                        temporary.replace(part)
                    finally:
                        temporary.unlink(missing_ok=True)
                paths.append(part)
            temporary = output.with_suffix('.partial')
            try:
                with temporary.open('wb') as target:
                    for part in paths:
                        with part.open('rb') as source:
                            shutil.copyfileobj(source, target)
                if temporary.stat().st_size != spec['bytes'] or digest(temporary) != spec['sha256']:
                    raise ValueError('Combined model integrity check failed')
                temporary.replace(output)
            finally:
                temporary.unlink(missing_ok=True)
        except urllib.error.HTTPError as error:
            if args.parts_dir or error.code not in {404, 410}:
                raise
            print('Pinned external parts are unavailable; recovering identical weights from our verified office release.', flush=True)
            download_recovery(output, spec)
    shutil.copyfile(manifest_path, args.out / manifest_path.name)
    shutil.copyfile(ROOT / 'vendor/local-llm/LICENSE.Qwen2.5', args.out / 'LICENSE.Qwen2.5')
    print(json.dumps({'status':'PASS','path':str(output),'bytes':spec['bytes'],'sha256':spec['sha256']}))

if __name__ == '__main__':
    main()
