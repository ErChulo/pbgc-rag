#!/usr/bin/env python3
"""Build the separately released experimental weights from pinned public sources.

Development tooling only. The delivered office application never runs this file,
downloads a model, compiles code or contacts a registry.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'vendor/local-llm/bundled.manifest.json'
PROVENANCE = ROOT / 'vendor/local-llm/larger-model.provenance.json'
MAX_MODEL_BYTES = 768 * 1024 * 1024
MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_SOURCE_BYTES = 512 * 1024 * 1024
CURRENT_STAGE = 'metadata'

def stage(value):
    global CURRENT_STAGE
    CURRENT_STAGE = value
    if __import__('os').environ.get('GITHUB_ACTIONS'):
        print('::notice title=Experimental model preparation::' + value, flush=True)


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def model_spec(manifest):
    files = manifest.get('files')
    if manifest.get('schemaVersion') != 1 or not isinstance(files, list) or len(files) != 1:
        raise ValueError('Bundled manifest must identify one supported model')
    spec = files[0]
    if (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.gguf', spec.get('name', ''))
            or type(spec.get('bytes')) is not int or not 24 <= spec['bytes'] <= MAX_MODEL_BYTES
            or not re.fullmatch(r'[a-f0-9]{64}', spec.get('sha256', ''))):
        raise ValueError('Bundled model metadata is invalid or exceeds 768 MiB')
    return spec


def verify_model(path, spec):
    actual_bytes = path.stat().st_size if path.is_file() else 0
    actual_sha = sha256(path) if path.is_file() else 'absent'
    if actual_bytes != spec['bytes'] or actual_sha != spec['sha256']:
        if __import__('os').environ.get('GITHUB_ACTIONS'):
            print('::error title=Experimental model integrity::' + json.dumps({'bytes':actual_bytes,'sha256':actual_sha,'expectedBytes':spec['bytes'],'expectedSha256':spec['sha256']}), flush=True)
        raise ValueError('Experimental model differs from its pinned size/SHA-256')
    with path.open('rb') as source:
        if source.read(8) not in {b'GGUF\x02\x00\x00\x00', b'GGUF\x03\x00\x00\x00'}:
            raise ValueError('Experimental model is not supported GGUF v2/v3')


def download_source_archive(path, provenance):
    expected = provenance.get('sourceArchiveSha256', '')
    commit = provenance.get('llamaCommit', '')
    url = provenance.get('sourceArchiveUrl', '')
    parsed = urllib.parse.urlsplit(url)
    if (not re.fullmatch(r'[a-f0-9]{64}', expected)
            or not re.fullmatch(r'[a-f0-9]{40}', commit)
            or parsed.scheme != 'https' or parsed.hostname not in {'github.com', 'codeload.github.com'}
            or commit not in parsed.path or parsed.username or parsed.password):
        raise ValueError('Quantizer source must have a fixed GitHub commit and archive SHA-256')
    if path.is_file() and path.stat().st_size <= MAX_ARCHIVE_BYTES and sha256(path) == expected:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.download')
    try:
        total = 0
        digest = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as target:
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > MAX_ARCHIVE_BYTES:
                    raise ValueError('Quantizer source archive exceeds its preparation bound')
                target.write(block)
                digest.update(block)
        if digest.hexdigest() != expected:
            raise ValueError('Quantizer source archive SHA-256 failed')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def extract_source_archive(archive, destination, commit):
    """Extract only bounded regular source files. Never follow archive links."""
    expected_root = 'llama.cpp-' + commit
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > 20000:
            raise ValueError('Quantizer source has too many entries')
        total = 0
        seen = set()
        for member in members:
            name = PurePosixPath(member.name)
            if (name.is_absolute() or '..' in name.parts or not name.parts
                    or name.parts[0] != expected_root or '\\' in member.name or ':' in member.name
                    or len(member.name) > 1024 or not (member.isfile() or member.isdir())
                    or member.name in seen or member.size < 0):
                raise ValueError('Unsafe quantizer source archive entry')
            seen.add(member.name)
            total += member.size
            if total > MAX_SOURCE_BYTES:
                raise ValueError('Quantizer source exceeds its expanded byte bound')
        for member in members:
            target = destination.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as content, target.open('xb') as output:
                    shutil.copyfileobj(content, output)
    return destination / expected_root


def prepare_model(spec, provenance, output):
    if output.is_file():
        try:
            verify_model(output, spec)
            return
        except ValueError:
            pass
    quantization = provenance.get('quantization')
    if quantization not in {'Q2_K', 'Q3_K_S', 'Q3_K_M', 'Q3_K_L', 'Q4_0', 'Q4_K_S', 'Q4_K_M'}:
        raise ValueError('Unsupported experimental quantization')
    cache = ROOT / 'dist/larger-model-bootstrap'
    cache.mkdir(parents=True, exist_ok=True)
    source_model = cache / 'qwen2.5-1.5b-instruct-f16.gguf'
    stage('source-model')
    subprocess.run([sys.executable, str(ROOT / 'tools/prepare-larger-model-source.py'),
                    '--out', str(source_model)], check=True, cwd=ROOT)
    archive = cache / ('llama.cpp-' + provenance['llamaCommit'] + '.tar.gz')
    stage('source-archive')
    download_source_archive(archive, provenance)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.partial')
    try:
        with tempfile.TemporaryDirectory(prefix='quantizer-', dir=cache) as directory:
            work = Path(directory)
            source = extract_source_archive(archive, work, provenance['llamaCommit'])
            build = work / 'build'
            flags = ['-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DLLAMA_CURL=OFF',
                     '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_SERVER=OFF',
                     '-DLLAMA_BUILD_TOOLS=ON', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF',
                     '-DGGML_AVX=OFF', '-DGGML_AVX2=OFF', '-DGGML_AVX512=OFF',
                     '-DGGML_FMA=OFF', '-DGGML_F16C=OFF']
            stage('quantizer-configure')
            subprocess.run(['cmake', '-S', str(source), '-B', str(build), *flags], check=True)
            stage('quantizer-build')
            subprocess.run(['cmake', '--build', str(build), '--config', 'Release',
                            '--target', 'llama-quantize', '-j4'], check=True)
            quantizer = build / 'bin/llama-quantize'
            if not quantizer.is_file():
                raise ValueError('Pinned quantizer did not produce its expected executable')
            stage('quantize')
            subprocess.run([str(quantizer), str(source_model), str(temporary), quantization, '4'], check=True)
            stage('model-verify')
            verify_model(temporary, spec)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, help='Directory for the verified experimental GGUF')
    parser.add_argument('--verify-existing', type=Path, help='Verify a previously published GGUF; no build/download')
    parser.add_argument('--existing-manifest', type=Path, help='Also require the downloaded manifest to match this branch')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    spec = model_spec(manifest)
    if args.existing_manifest:
        if not args.verify_existing:
            parser.error('--existing-manifest requires --verify-existing')
        if json.loads(args.existing_manifest.read_text()) != manifest:
            raise ValueError('Existing release manifest differs; do not overwrite its assets')
    if args.verify_existing:
        output = args.verify_existing
        verify_model(output, spec)
    else:
        output = (args.out or ROOT / 'dist/models') / spec['name']
        prepare_model(spec, json.loads(PROVENANCE.read_text()), output)
    print(json.dumps({'status': 'PASS', 'path': str(output), 'bytes': spec['bytes'], 'sha256': spec['sha256']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if __import__('os').environ.get('GITHUB_ACTIONS'):
            detail = str(error) if isinstance(error, ValueError) else type(error).__name__
            print('::error title=Experimental preparation failed::' + CURRENT_STAGE + ': ' + detail.replace('\n', ' ')[:200], flush=True)
        raise
