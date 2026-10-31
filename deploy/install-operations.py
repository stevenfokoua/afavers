"""Install a lightweight, owner-checked timer; no container or daemon added."""
from pathlib import Path
import os,subprocess

r=Path('/opt/afavers');owner=os.environ['AGENT_RESOURCE_OWNER']
assert (r/'.resource-owner').read_text().strip()==owner
assert (r/'operations.env').is_file()
marker=f'# afavers resource owner: {owner}\n'
units={
 'afavers-operations.service':'''[Unit]
Description=Afavers health and delivery checks
After=docker.service nginx.service postfix.service
[Service]
Type=oneshot
WorkingDirectory=/opt/afavers
Environment=AGENT_RESOURCE_OWNER=OWNER
ExecStart=/usr/bin/python3 /opt/afavers/resource-tools/runner.py run --docker --purpose "Afavers periodic health, under 80 MiB" -- /usr/bin/python3 /opt/afavers/deploy/operations.py --notify
UMask=0077
Nice=10
CPUQuota=10%
MemoryMax=128M
MemorySwapMax=0
TimeoutStartSec=150
'''.replace('OWNER',owner),
 'afavers-operations.timer':'''[Unit]
Description=Check Afavers health every five minutes
[Timer]
OnBootSec=4min
OnUnitActiveSec=5min
RandomizedDelaySec=20s
[Install]
WantedBy=timers.target
'''}
for name in units:
    p=Path('/etc/systemd/system')/name
    if p.exists() and not p.read_text().startswith(marker):raise SystemExit('Unmanaged unit: '+name)
for name,body in units.items():(Path('/etc/systemd/system')/name).write_text(marker+body)
os.chmod(r/'operations.env',0o600)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','afavers-operations.timer'],check=True)
print('Owned lightweight Afavers operations timer installed.')
