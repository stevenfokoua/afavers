"""Configure and package already-built production assets; never deploy them."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit
import zipfile

APP_ORIGIN = 'https://afavers.saintcreators.com'
EXTENSION_FILES = ('manifest.json', 'popup.html', 'popup.css', 'popup.bundle.js', 'config.js', 'content.js')


def public_configuration(url, key):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('AFAVERS_SUPABASE_URL must be a public HTTPS URL without credentials, query or fragment')
    try:
        parts = key.split('.')
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4))) if len(parts) == 3 else {}
    except (ValueError, IndexError, TypeError):
        payload = {}
    if not isinstance(payload, dict) or payload.get('role') != 'anon':
        raise ValueError('AFAVERS_SUPABASE_ANON_KEY must be the public anon JWT, never a service-role key')
    return url.rstrip('/'), f'{parsed.scheme}://{parsed.netloc}'


def package_production(repo, out, commit, url, key):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('A full source commit SHA is required')
    url, api_origin = public_configuration(url, key)
    dist, extension = repo / 'client/dist', repo / 'extension'
    version = json.loads((dist / 'version.json').read_text())
    if version.get('version') != commit[:12]:
        raise ValueError('Built frontend version does not match the source commit')
    if not (dist / 'index.html').is_file():
        raise ValueError('A successful frontend build is required')
    for name in EXTENSION_FILES:
        if not (extension / name).is_file():
            raise ValueError(f'Extension runtime file missing: {name}')
    manifest = json.loads((extension / 'manifest.json').read_text())
    permissions = [value for value in manifest['host_permissions'] if 'YOUR-PROJECT-REF' not in value]
    manifest['host_permissions'] = list(dict.fromkeys(permissions + [APP_ORIGIN + '/*', api_origin + '/*']))
    icons = sorted((extension / 'icons').glob('*.png'))
    expected_icons = set(manifest.get('icons', {}).values()) | set(manifest.get('action', {}).get('default_icon', {}).values())
    if not icons or not expected_icons.issubset({'icons/' + icon.name for icon in icons}):
        raise ValueError('Extension manifest icons are missing')
    out.mkdir(parents=True, exist_ok=True)
    archive = out / 'frontend.tar.gz'
    generated = [archive, out / 'frontend.tar.gz.sha256', out / 'source.json', dist / 'SOURCE_VERSION', dist / 'source.json']
    if any(path.exists() for path in generated):
        raise ValueError('Refusing to overwrite an existing production package or source metadata')
    config = {'SUPABASE_URL': url, 'SUPABASE_ANON_KEY': key, 'DASHBOARD_URL': APP_ORIGIN + '/jobs'}
    # Vite copies an old public-assets ZIP into dist. Replace that build output
    # with the extension just rebuilt in this job; never change source config.
    with zipfile.ZipFile(dist / 'afavers-chrome-extension.zip', 'w', zipfile.ZIP_DEFLATED) as package:
        for name in EXTENSION_FILES:
            if name == 'manifest.json':
                package.writestr(name, json.dumps(manifest, indent=2) + '\n')
            elif name == 'config.js':
                package.writestr(name, 'self.__AFAVERS_CONFIG__ = ' + json.dumps(config) + ';\n')
            else:
                package.write(extension / name, name)
        for image in icons:
            package.write(image, 'icons/' + image.name)
    source = {
        'commit': commit, 'appVersion': commit[:12], 'builtAt': version.get('builtAt'),
        'repository': os.environ.get('GITHUB_REPOSITORY'), 'runId': os.environ.get('GITHUB_RUN_ID'),
        'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'), 'nodeVersion': '22.23.4',
        'appOrigin': APP_ORIGIN, 'supabaseUrl': url, 'extensionVersion': manifest.get('version'),
        'lockfileSha256': {str(path.relative_to(repo)): hashlib.sha256(path.read_bytes()).hexdigest() for path in (repo / 'package-lock.json', extension / 'package-lock.json')},
    }
    payload = json.dumps(source, indent=2) + '\n'
    (dist / 'SOURCE_VERSION').write_text(commit + '\n')
    (dist / 'source.json').write_text(payload)
    (out / 'source.json').write_text(payload)
    subprocess.run([sys.executable, str(repo / 'deploy/package-release.py'), '--dist', str(dist), '--out', str(archive)], check=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (out / 'frontend.tar.gz.sha256').write_text(f'{digest}  frontend.tar.gz\n')
    print('Production frontend and configured extension packaged; no deployment performed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    try:
        package_production(args.repo.resolve(), args.out.resolve(), os.environ.get('GITHUB_SHA', ''), os.environ.get('AFAVERS_SUPABASE_URL', ''), os.environ.get('AFAVERS_SUPABASE_ANON_KEY', ''))
    except (ValueError, KeyError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
