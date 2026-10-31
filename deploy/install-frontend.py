"""Verify and atomically install the built static release without deleting data."""
import hashlib
import json
from pathlib import Path
import re
import shutil

source=Path('/opt/afavers/frontend-release')
root=Path('/srv/www/afavers')
owner=Path('/opt/afavers/.resource-owner').read_text().strip()
marker=root/'.resource-owner'
if marker.exists() and marker.read_text().strip()!=owner:
    raise SystemExit('Afavers web directory belongs to another deployment')
version=json.loads((source/'version.json').read_text())['version']
if not re.fullmatch(r'[A-Za-z0-9-]{1,80}',version): raise ValueError('Invalid release version')
for name,expected in json.loads((source/'release-sha256.json').read_text()).items():
    path=(source/name).resolve()
    if not path.is_relative_to(source.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
        raise ValueError('Release file verification failed')
marker.write_text(owner+'\n')
release=root/'releases'/version
release.parent.mkdir(exist_ok=True)
if release.exists(): raise SystemExit('Existing release preserved; refusing overwrite')
shutil.copytree(source,release)
for path in release.rglob('*'): path.chmod(0o755 if path.is_dir() else 0o644)
release.chmod(0o755)
current=root/'current'
previous=None
if current.is_symlink():
    previous=current.resolve()
    if not previous.is_relative_to((root/'releases').resolve()): raise ValueError('Unmanaged current symlink')
elif current.exists(): raise ValueError('Unmanaged current directory')
pending=root/f'.current-{owner}'
if pending.exists() or pending.is_symlink(): raise ValueError('An unresolved switch already exists')
pending.symlink_to(release)
pending.replace(current)
Path('/opt/afavers/frontend-install-receipt.json').write_text(json.dumps({'version':version,'path':str(release),'previous':str(previous) if previous else None,'sha256Verified':True},indent=2))
print('Verified frontend installed at',release)
