"""Private local-only mailbox; no change to any other recipient or SMTP transport."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
if (root/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Owner mismatch')
name='afavers-test-01a17ca0'
folder=Path('/var/mail/afavers-01a17ca0')
inbox=folder/'inbox'
line=f'{name}: {inbox}\n'
aliases=Path('/etc/aliases')
state=root/'mail-test'
action=sys.argv[1]
if action=='setup':
    state.mkdir(mode=0o700,exist_ok=True)
    marker=state/'.resource-owner'
    if marker.exists() and marker.read_text().strip()!=owner:raise SystemExit('Mail test owner mismatch')
    if not marker.exists():
        if list(state.iterdir()):raise SystemExit('Unowned test state')
        marker.write_text(owner)
    if folder.exists():raise SystemExit('Mailbox path exists; inspect before reuse')
    account=pwd.getpwnam(subprocess.check_output(['postconf','-h','default_privs'],text=True).strip())
    folder.mkdir(mode=0o700)
    os.chown(folder,account.pw_uid,account.pw_gid)
    inbox.touch(mode=0o600)
    os.chown(inbox,account.pw_uid,account.pw_gid)
    (state/'mailbox.json').write_text(json.dumps({'owner':owner,'folder':str(folder),'uid':account.pw_uid,'aliasLine':line,'email':name+'@localhost.localdomain'}))
    with aliases.open('r+') as file:
        fcntl.flock(file,fcntl.LOCK_EX)
        content=file.read()
        if any(row.split(':',1)[0].strip()==name for row in content.splitlines()):raise SystemExit('Alias already exists')
        file.seek(0,2)
        file.write(('' if content.endswith('\n') else '\n')+line)
        file.flush()
        subprocess.run(['newaliases'],check=True)
    print('Private local-only mailbox prepared; no external message routing changed')
elif action=='cleanup':
    manifest=json.loads((state/'mailbox.json').read_text())
    if manifest['owner']!=owner or manifest['folder']!=str(folder):raise SystemExit('Mailbox ownership mismatch')
    with aliases.open('r+') as file:
        fcntl.flock(file,fcntl.LOCK_EX)
        content=file.read()
        if content.count(line)!=1:raise SystemExit('Alias changed; manual review required')
        file.seek(0)
        file.write(content.replace(line,''))
        file.truncate()
        file.flush()
        subprocess.run(['newaliases'],check=True)
    if folder.stat().st_uid!=manifest['uid'] or {p.name for p in folder.iterdir()}!={'inbox'}:raise SystemExit('Mailbox changed; preserve for review')
    inbox.unlink()
    folder.rmdir()
    (state/'mailbox-retired').write_text('Local test alias and raw messages removed')
    print('Owned test alias and mailbox retired')
elif action=='retire-state':
    if (state/'.resource-owner').read_text().strip()!=owner:raise SystemExit('State owner mismatch')
    if folder.exists() or line in aliases.read_text() or (state/'account.json').exists():raise SystemExit('Mail test still active')
    if {p.name for p in state.iterdir()}-{'mailbox.json','.resource-owner','mailbox-retired'}:raise SystemExit('Unexpected state files; preserve')
    for path in state.iterdir():path.unlink()
    state.rmdir()
    print('Owned temporary mail-test directory retired')
else:raise SystemExit('Unknown action')
