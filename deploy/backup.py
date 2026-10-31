"""Owner-checked daily local database backup. This does not replace an off-site backup."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path('/opt/afavers')
owner = os.environ['AGENT_RESOURCE_OWNER']
if (root / '.resource-owner').read_text().strip() != owner:
    raise SystemExit('Deployment owner mismatch')
actual = subprocess.check_output(['docker', 'inspect', '--format', '{{index .Config.Labels "local.agent.owner"}}', 'afavers-db-1'], text=True).strip()
if actual != owner:
    raise SystemExit('Database owner mismatch')
folder = root / 'backups'
folder.mkdir(mode=0o700, exist_ok=True)
marker = folder / '.resource-owner'
if marker.exists() and marker.read_text().strip() != owner:
    raise SystemExit('Backup owner mismatch')
if not marker.exists():
    if list(folder.iterdir()):
        raise SystemExit('Refusing an unmarked nonempty backup directory')
    marker.write_text(owner)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target = folder / f'afavers-{stamp}.dump'
partial = target.with_suffix('.partial')
try:
    with partial.open('xb') as stream:
        os.chmod(partial, 0o600)
        subprocess.run(['docker', 'exec', 'afavers-db-1', 'pg_dump', '-U', 'postgres', '-Fc', 'postgres'], stdout=stream, check=True, timeout=120)
    with partial.open('rb') as stream:
        listing = subprocess.check_output(['docker', 'exec', '-i', 'afavers-db-1', 'pg_restore', '--list'], stdin=stream, timeout=30)
    if b'TABLE DATA public jobs' not in listing:
        raise RuntimeError('Backup table inventory is incomplete')
    partial.replace(target)
    shutil.copyfile(root / '.env', folder / 'recovery.env')
    os.chmod(folder / 'recovery.env', 0o600)
    signing = Path('/etc/afavers-dkim')
    if signing.exists():
        if (signing / '.resource-owner').read_text().strip() != owner:
            raise RuntimeError('Signing-key backup owner mismatch')
        for key in signing.glob('*.private'):
            destination = folder / ('dkim-' + key.name)
            shutil.copyfile(key, destination)
            os.chmod(destination, 0o600)
    for old in sorted(folder.glob('afavers-????????T??????Z.dump'), reverse=True)[7:]:
        old.unlink()
    (root / 'backup-receipt.json').write_text(json.dumps({'utc': stamp, 'path': str(target), 'bytes': target.stat().st_size, 'archiveInventoryVerified': True, 'restoreTested': False, 'offsite': False}, indent=2))
    print('Afavers backup saved and archive inventory verified:', target.name)
finally:
    partial.unlink(missing_ok=True)
