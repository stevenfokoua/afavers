from pathlib import Path
import subprocess

owner=Path('/opt/afavers/.resource-owner').read_text().strip()
marker=f'# afavers resource owner: {owner}\n'
path=Path('/etc/letsencrypt/renewal-hooks/deploy/afavers-reload-nginx.sh')
if path.exists() and marker not in path.read_text():raise SystemExit('Unmanaged renewal hook')
path.write_text('#!/bin/sh\n'+marker+'''set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/afavers.saintcreators.com ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi
''')
path.chmod(0o755)
subprocess.run(['sh','-n',str(path)],check=True)
subprocess.run(['systemctl','is-active','--quiet','certbot.timer'],check=True)
print('Scoped Afavers renewal hook installed; existing Certbot timer active')
