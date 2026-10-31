"""Tiny prebuilt fixtures: validate release contents without building the app."""
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest
import zipfile

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('package_production', Path(__file__).with_name('package-production.py'))
PRODUCTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRODUCTION)
COMMIT = '1234567890abcdef1234567890abcdef12345678'
KEY = 'eyJhbGciOiJIUzI1NiJ9.' + base64.urlsafe_b64encode(b'{"role":"anon"}').decode().rstrip('=') + '.fixture'


class ProductionPackageTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory(prefix='afavers-package-contract-')
        self.addCleanup(self.workspace.cleanup)
        self.repo = Path(self.workspace.name)
        self.dist, self.extension, self.out = self.repo / 'client/dist', self.repo / 'extension', self.repo / 'release'
        self.dist.mkdir(parents=True)
        (self.extension / 'icons').mkdir(parents=True)
        (self.repo / 'deploy').mkdir()
        shutil.copyfile(REPO / 'deploy/package-release.py', self.repo / 'deploy/package-release.py')
        (self.repo / 'package-lock.json').write_text('{}')
        (self.extension / 'package-lock.json').write_text('{}')
        (self.dist / 'index.html').write_text('<html>Fixture</html>')
        (self.dist / 'version.json').write_text(json.dumps({'version': COMMIT[:12], 'builtAt': '2026-10-31T00:00:00Z'}))
        self.manifest = json.loads((REPO / 'extension/manifest.json').read_text())
        for name in PRODUCTION.EXTENSION_FILES:
            (self.extension / name).write_text(json.dumps(self.manifest) if name == 'manifest.json' else '// prebuilt fixture')
        for image in (REPO / 'extension/icons').glob('*.png'):
            shutil.copyfile(image, self.extension / 'icons' / image.name)

    def package(self):
        PRODUCTION.package_production(self.repo, self.out, COMMIT, 'https://api.example.invalid/supabase/', KEY)

    def test_archive_contains_configured_extension_and_verifiable_source(self):
        self.package()
        archive = self.out / 'frontend.tar.gz'
        expected_hash = (self.out / 'frontend.tar.gz.sha256').read_text().split()[0]
        self.assertEqual(expected_hash, hashlib.sha256(archive.read_bytes()).hexdigest())
        with tarfile.open(archive) as release:
            source = json.loads(release.extractfile('source.json').read())
            self.assertEqual(source['commit'], COMMIT)
            self.assertEqual(release.extractfile('SOURCE_VERSION').read().decode().strip(), COMMIT)
            self.assertNotIn(KEY, json.dumps(source))
            self.assertEqual(json.loads((self.out / 'source.json').read_text()), source)
            hashes = json.loads(release.extractfile('release-sha256.json').read())
            for name, digest in hashes.items():
                self.assertEqual(hashlib.sha256(release.extractfile(name).read()).hexdigest(), digest)
            with zipfile.ZipFile(io.BytesIO(release.extractfile('afavers-chrome-extension.zip').read())) as extension:
                self.assertEqual(set(extension.namelist()), set(PRODUCTION.EXTENSION_FILES) | {'icons/' + path.name for path in (self.extension / 'icons').glob('*.png')})
                manifest = json.loads(extension.read('manifest.json'))
                original_permissions = {permission for permission in self.manifest['host_permissions'] if 'YOUR-PROJECT-REF' not in permission}
                self.assertEqual(set(manifest['host_permissions']), original_permissions | {PRODUCTION.APP_ORIGIN + '/*', 'https://api.example.invalid/*'})
                self.assertEqual(manifest['content_scripts'], self.manifest['content_scripts'])
                config = extension.read('config.js').decode()
                self.assertIn(KEY, config)
                self.assertIn('https://api.example.invalid/supabase', config)
                self.assertIn(PRODUCTION.APP_ORIGIN + '/jobs', config)
                self.assertNotIn('YOUR-PROJECT-REF', config)
        self.assertEqual((self.extension / 'config.js').read_text(), '// prebuilt fixture')
        self.assertEqual(json.loads((self.extension / 'manifest.json').read_text()), self.manifest)

    def test_service_key_and_non_https_configuration_are_rejected(self):
        service_key = 'header.' + base64.urlsafe_b64encode(b'{"role":"service_role"}').decode().rstrip('=') + '.fixture'
        for url, key in [('https://api.example.invalid', service_key), ('http://localhost', KEY), ('https://user:password@api.example.invalid', KEY), ('https://api.example.invalid', '')]:
            with self.assertRaises(ValueError):
                PRODUCTION.public_configuration(url, key)

    def test_wrong_version_and_existing_packages_are_preserved(self):
        (self.dist / 'version.json').write_text('{"version":"wrong"}')
        with self.assertRaisesRegex(ValueError, 'source commit'):
            self.package()
        self.assertFalse(self.out.exists())
        (self.dist / 'version.json').write_text(json.dumps({'version': COMMIT[:12]}))
        self.package()
        digest = hashlib.sha256((self.out / 'frontend.tar.gz').read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            self.package()
        self.assertEqual(hashlib.sha256((self.out / 'frontend.tar.gz').read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
