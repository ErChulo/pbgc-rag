#!/usr/bin/env python3
"""Offline synthetic acceptance for recovering pinned model bytes from a release."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

MODULE_PATH = Path(__file__).resolve().parents[1] / 'tools' / 'prepare-models.py'
MODULE_SPEC = importlib.util.spec_from_file_location('prepare_models', MODULE_PATH)
PREPARE = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(PREPARE)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def script(name, value):
    return 'globalThis.' + name + '=' + json.dumps(value, separators=(',', ':')) + ';\n'


class RecoverOfficeModel(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='pbgc model recovery ')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.archive = self.root / 'office.zip'
        self.output = self.root / 'model.gguf'
        self.parts = [b'GGUF\x00synthetic-first\xff', b'synthetic-second\x00\xfe']
        self.model = b''.join(self.parts)
        self.spec = {'name': 'model.gguf', 'bytes': len(self.model), 'sha256': sha(self.model)}
        self.pack = {
            'schemaVersion': 1, 'model': {'files': [self.spec]},
            'totalBytes': len(self.model),
            'chunks': [{'path': f'models/qwen-part-{index:03d}.js',
                        'bytes': len(part), 'sha256': sha(part)}
                       for index, part in enumerate(self.parts)]}
        self.values = [{'index': index, 'data': base64.b64encode(part).decode('ascii')}
                       for index, part in enumerate(self.parts)]

    def build(self, pack=None, values=None, raw_part=None):
        pack = self.pack if pack is None else pack
        values = self.values if values is None else values
        with zipfile.ZipFile(self.archive, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('models/qwen-pack.js', script('PBGCQwenPack', pack))
            for index, value in enumerate(values):
                text = raw_part if index == 0 and raw_part is not None else script('PBGCQwenPart', value)
                archive.writestr(f'models/qwen-part-{index:03d}.js', text)
        return sha(self.archive.read_bytes())

    def restore(self, expected_archive_sha=None):
        PREPARE.restore_office_model(self.archive, self.output, self.spec,
                                    expected_archive_sha or sha(self.archive.read_bytes()))

    def assert_rejected(self, expected_archive_sha=None):
        self.output.write_bytes(b'previous verified bytes')
        with self.assertRaises((ValueError, KeyError, zipfile.BadZipFile)):
            self.restore(expected_archive_sha)
        self.assertEqual(self.output.read_bytes(), b'previous verified bytes')
        self.assertFalse(self.output.with_suffix('.partial').exists())

    def test_recovers_exact_binary_model_from_multiple_json_chunks(self):
        self.restore(self.build())
        self.assertEqual(self.output.read_bytes(), self.model)
        self.assertFalse(self.output.with_suffix('.partial').exists())

    def test_rejects_archive_changed_since_pinning(self):
        self.build()
        self.assert_rejected('0' * 64)

    def test_rejects_active_javascript_instead_of_json(self):
        marker = self.root / 'must-not-execute'
        self.build(raw_part="globalThis.PBGCQwenPart=(()=>{throw Error('must not execute')})();\n")
        self.assert_rejected()
        self.assertFalse(marker.exists())

    def test_rejects_wrong_chunk_index_without_overwriting_output(self):
        values = copy.deepcopy(self.values)
        values[1]['index'] = 0
        self.build(values=values)
        self.assert_rejected()

    def test_rejects_bad_chunk_digest(self):
        pack = copy.deepcopy(self.pack)
        pack['chunks'][0]['sha256'] = '0' * 64
        self.build(pack=pack)
        self.assert_rejected()

    def test_rejects_traversal_chunk_path(self):
        pack = copy.deepcopy(self.pack)
        pack['chunks'][0]['path'] = '../outside.js'
        self.build(pack=pack)
        self.assert_rejected()
        self.assertFalse((self.root.parent / 'outside.js').exists())

    def test_rejects_whole_model_digest_even_when_chunks_match(self):
        self.spec['sha256'] = '0' * 64
        self.build()
        self.assert_rejected()

    def test_rejects_invalid_base64(self):
        values = copy.deepcopy(self.values)
        values[0]['data'] = '!not-base64!'
        self.build(values=values)
        self.assert_rejected()

    def test_rejects_wrong_declared_chunk_length(self):
        pack = copy.deepcopy(self.pack)
        pack['chunks'][0]['bytes'] += 1
        self.build(pack=pack)
        self.assert_rejected()


if __name__ == '__main__':
    unittest.main(verbosity=2)
