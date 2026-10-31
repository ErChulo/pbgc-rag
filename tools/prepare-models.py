#!/usr/bin/env python3
"""Development-only preparation of the separately distributed offline GGUF pack."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PARTS = [
'6e6944f458d8d65c8e5dd262e251d45d5a53b84484f6788b829b4f0164180650',
'0bad8a019a41c35d4253dc934eee5f29691a7633d7c3654f0e20dd8e28ac948a',
'28fd3df59c9b92253471c39ed1b2d689bc919d9cc5c776b1d459e96d61e3a52a',
'dd0a66303e01cb761c8e7cec37f0df87a0225b1e07ae8dad84d5ed2c80315eb8',
'fda5d45bf20604af434f8e94878d87d027a2fc0df29089b69cacd75bdfc3f2ac',
'8534ad04d967c46f36aa3aaff164630bcbf67136375e30178cf601127756d2de']
BASE = 'https://github.com/rtynbirf/singulyar-llm/releases/download/weights-v1/'

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist' / 'models')
    parser.add_argument('--parts-dir', type=Path, help='Use already downloaded parts; no network.')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    manifest_path = ROOT / 'vendor/local-llm/qwen2.5-0.5b-instruct.manifest.json'
    manifest = json.loads(manifest_path.read_text())
    spec = manifest['files'][0]
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / spec['name']
    if not (output.is_file() and output.stat().st_size == spec['bytes'] and digest(output) == spec['sha256']):
        if args.verify_only:
            raise SystemExit('FAIL: prepared model missing or integrity check failed')
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
    shutil.copyfile(manifest_path, args.out / manifest_path.name)
    shutil.copyfile(ROOT / 'vendor/local-llm/LICENSE.Qwen2.5', args.out / 'LICENSE.Qwen2.5')
    print(json.dumps({'status':'PASS','path':str(output),'bytes':spec['bytes'],'sha256':spec['sha256']}))

if __name__ == '__main__':
    main()
