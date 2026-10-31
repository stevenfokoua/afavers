"""Install a checked CI artifact atomically; preserve the previous static release."""
from pathlib import Path
import argparse, datetime, hashlib, json, os, re, shutil, tarfile, urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', type=Path, required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--expected-previous', required=True)
    args = parser.parse_args()
    root, web = Path('/opt/afavers'), Path('/srv/www/afavers')
    owner = os.environ['AGENT_RESOURCE_OWNER']
    stage = args.stage.resolve()
    assert stage.is_relative_to(root) and (stage/'.owner').read_text().strip() == owner
    assert (root/'.resource-owner').read_text().strip() == owner == (web/'.resource-owner').read_text().strip()
    assert re.fullmatch('[0-9a-f]{40}', args.commit)
    version = args.commit[:12]
    previous = (web/'current').resolve()
    assert previous.is_relative_to(web/'releases') and previous.name == args.expected_previous
    assert json.loads((root/'frontend-release/version.json').read_text())['version'] == args.expected_previous
    archive = stage/'frontend.tar.gz'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == (stage/'frontend.tar.gz.sha256').read_text().split()[0]
    source = json.loads((stage/'source.json').read_text())
    assert source['commit'] == args.commit and source['appVersion'] == version
    assert source['supabaseUrl'] == 'https://afavers.saintcreators.com/backend'
    candidate, release = stage/'candidate', web/'releases'/version
    assert not candidate.exists() and not release.exists()
    candidate.mkdir()
    with tarfile.open(archive) as tar:
        for member in tar:
            target = (candidate/member.name).resolve()
            assert target.is_relative_to(candidate) and member.isfile() and not member.issym() and not member.islnk()
        tar.extractall(candidate, filter='data')
    hashes = json.loads((candidate/'release-sha256.json').read_text())
    for name, expected in hashes.items():
        path = (candidate/name).resolve()
        assert path.is_relative_to(candidate) and hashlib.sha256(path.read_bytes()).hexdigest() == expected, name
    assert json.loads((candidate/'source.json').read_text()) == source
    assert (candidate/'SOURCE_VERSION').read_text().strip() == args.commit
    assert json.loads((candidate/'version.json').read_text())['version'] == version
    assert 'afavers-chrome-extension.zip' in hashes
    protected = [root/'.env', root/'compose.yml', Path('/etc/postfix/main.cf')]
    protected_hashes = {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    receipt = {'owner':owner,'commit':args.commit,'version':version,'previous':str(previous),
               'installed':False,'rolledBack':False,'started':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    export = root/'frontend-release'
    old_export = stage/'previous-export'
    pending = web/('.current-'+version)
    assert not old_export.exists() and not pending.exists() and not pending.is_symlink()
    switched = False
    try:
        shutil.copytree(candidate, release)
        for path in release.rglob('*'): path.chmod(0o755 if path.is_dir() else 0o644)
        release.chmod(0o755)
        export.rename(old_export)
        candidate.rename(export)
        pending.symlink_to(release); pending.replace(web/'current'); switched = True
        receipt['installed'] = True
        def fetch(path):
            with urllib.request.urlopen('https://afavers.saintcreators.com/'+path,timeout=25) as response:
                assert response.status == 200
                return response.read()
        assert json.loads(fetch('version.json'))['version'] == version
        for name, expected in hashes.items():
            assert hashlib.sha256(fetch(name)).hexdigest() == expected, name
        for route in ['', 'login','register','reset-password','demo','jobs','dashboard','kanban','hotpicks','reminders','settings']:
            assert fetch(route) == (release/'index.html').read_bytes(), route
        assert protected_hashes == {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
        receipt.update(allPublicHashesVerified=True,publicFiles=len(hashes),protectedConfigUnchanged=True)
    except Exception:
        if switched:
            rollback = web/('.rollback-'+version)
            assert not rollback.exists() and (web/'current').resolve() == release
            rollback.symlink_to(previous); rollback.replace(web/'current')
            export.rename(stage/'failed-export'); old_export.rename(export)
            receipt['rolledBack'] = True
        elif old_export.exists() and not export.exists():
            old_export.rename(export)
        raise
    finally:
        receipt['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (stage/'frontend-deployment.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps(receipt,indent=2))


if __name__ == '__main__': main()
