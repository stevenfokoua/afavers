from pathlib import Path
import subprocess

root=Path('/opt/afavers')
owner=(root/'.resource-owner').read_text().strip()
marker=f'# afavers resource owner: {owner}\n'
units={
 'afavers-backup.service':f'''[Unit]
Description=Afavers local database backup
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
WorkingDirectory=/opt/afavers
Environment=AGENT_RESOURCE_OWNER={owner}
ExecStart=/usr/bin/python3 /opt/afavers/resource-tools/runner.py run --docker --purpose "Scheduled Afavers backup" -- /usr/bin/python3 /opt/afavers/deploy/backup.py
UMask=0077
Nice=10
CPUQuota=25%
MemoryMax=128M
TimeoutStartSec=180
''',
 'afavers-backup.timer':'''[Unit]
Description=Daily Afavers local backup
[Timer]
OnCalendar=*-*-* 03:40:00
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
'''}
for name in units:
    path=Path('/etc/systemd/system')/name
    if path.exists() and not path.read_text().startswith(marker):raise SystemExit('Unmanaged unit: '+name)
for name,source in units.items():(Path('/etc/systemd/system')/name).write_text(marker+source)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','afavers-backup.timer'],check=True)
print('Afavers backup timer installed; seven local dumps retained; no off-site copy configured')
