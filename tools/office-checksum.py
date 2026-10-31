#!/usr/bin/env python3
"""Development-only integrity record for the exact tested office release ZIP."""
import argparse
import hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--verify', action='store_true')
args = p.parse_args()
archive = root / 'dist/PBGC-RAG-0.4-office.zip'
checksum = root / 'dist/SHA256SUMS.txt'
h = hashlib.sha256()
with archive.open('rb') as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(chunk)
expected = h.hexdigest() + '  ' + archive.name + '\n'
if args.verify:
    if checksum.read_text(encoding='utf-8') != expected:
        raise SystemExit('FAIL: release ZIP differs from the tested artifact')
else:
    checksum.write_text(expected, encoding='utf-8')
print('PASS: complete office ZIP checksum')
