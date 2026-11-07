#!/usr/bin/env python3
"""Development only: retrieve the exact public Docker GGUF before quantization."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

SOURCE_BYTES = 3093669376
SOURCE_SHA = 'b6eaec3509f1d0373d1f4802654c4a7bfcde0768645d2d45e8885f6922b428ee'
TOKEN_URL = 'https://auth.docker.io/token?service=registry.docker.io&scope=repository:ai/qwen2.5:pull'
BLOB_URL = 'https://registry-1.docker.io/v2/ai/qwen2.5/blobs/sha256:' + SOURCE_SHA

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def prepare(output):
    if output.is_file() and output.stat().st_size == SOURCE_BYTES and sha(output) == SOURCE_SHA:
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.download')
    with urllib.request.urlopen(TOKEN_URL, timeout=60) as response:
        token = json.loads(response.read(1024 * 1024))['token']
    request = urllib.request.Request(BLOB_URL, headers={'Authorization': 'Bearer ' + token})
    opener = urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(request, timeout=120)
    except urllib.error.HTTPError as error:
        if error.code not in {301, 302, 303, 307, 308}:
            raise
        location = error.headers['Location']
        target = urllib.parse.urlsplit(location)
        if target.scheme != 'https' or target.hostname != 'production.cloudfront.docker.com':
            raise ValueError('Unexpected public Docker model redirect')
        # A new request keeps the registry token away from the signed asset host.
        response = urllib.request.urlopen(location, timeout=120)
    try:
        total = 0
        digest = hashlib.sha256()
        with response, temporary.open('wb') as target:
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > SOURCE_BYTES:
                    raise ValueError('Source model exceeds its pinned byte count')
                digest.update(block)
                target.write(block)
        if total != SOURCE_BYTES or digest.hexdigest() != SOURCE_SHA:
            raise ValueError('Source model failed its pinned integrity check')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'dist/models/source/qwen2.5-1.5b-instruct-f16.gguf')
    args = parser.parse_args()
    prepare(args.out)
    print(json.dumps({'status': 'PASS', 'bytes': SOURCE_BYTES, 'sha256': SOURCE_SHA}))
