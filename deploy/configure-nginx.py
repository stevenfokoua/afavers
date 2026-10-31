"""Install only afavers vhosts, validate, and gracefully reload with rollback."""
import argparse
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--tls',action='store_true')
args=parser.parse_args()
root=Path('/opt/afavers')
owner=(root/'.resource-owner').read_text().strip()
marker=f'# afavers resource owner: {owner}\n'
domain='afavers.saintcreators.com'
gateway='172.17.0.1'
backend='''server {
 listen 172.17.0.1:18980;
 server_name afavers-internal;
 access_log off;
 error_log /var/log/nginx/afavers-error.log warn;
 client_max_body_size 1m;
 location /auth/v1/ { proxy_pass http://127.0.0.1:18991/; proxy_set_header Host afavers.saintcreators.com; proxy_set_header X-Forwarded-Proto https; }
 location /rest/v1/ { proxy_pass http://127.0.0.1:18992/; }
 location /functions/v1/ { proxy_pass http://127.0.0.1:18993/; proxy_read_timeout 155s; }
 location / { return 404; }
}
'''
if args.tls:
    if not Path(f'/etc/letsencrypt/live/{domain}/fullchain.pem').is_file():
        raise SystemExit('TLS certificate is required before public API publication')
    if not Path('/srv/www/afavers/current/index.html').is_file():
        raise SystemExit('A verified frontend release is required before publication')
    public=(root/'deploy/nginx.conf.template').read_text().replace('DOMAIN',domain)
    public=public.replace('    location ~ /\\. { deny all; }', '    include /opt/afavers/deploy/nginx-backend.locations;\n    location ~ /\\. { deny all; }')
else:
    public=f'''server {{
 listen 80;
 listen [::]:80;
 server_name {domain};
 access_log off;
 location ^~ /.well-known/acme-challenge/ {{ root /srv/www/afavers/acme; }}
 location / {{ return 503; }}
}}
'''

changes={'afavers-internal.conf':marker+backend,'afavers.conf':marker+public}
backups={}
new_links=[]
for name in changes:
    path=Path('/etc/nginx/sites-available')/name
    if path.exists() and not path.read_text().startswith(marker):
        raise SystemExit(f'Refusing to overwrite an unmanaged vhost: {name}')
    link=Path('/etc/nginx/sites-enabled')/name
    if link.exists() and (not link.is_symlink() or link.resolve()!=path):
        raise SystemExit(f'Refusing an unrelated enabled vhost: {name}')
    backups[path]=path.read_bytes() if path.exists() else None
subprocess.run(['nginx','-t'],check=True,capture_output=True)
try:
    for name,content in changes.items():
        path=Path('/etc/nginx/sites-available')/name
        path.write_text(content)
        link=Path('/etc/nginx/sites-enabled')/name
        if not link.exists():
            link.symlink_to(path)
            new_links.append(link)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    for link in new_links: link.unlink()
    for path,content in backups.items():
        if content is None: path.unlink(missing_ok=True)
        else: path.write_bytes(content)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    raise
print('Afavers vhosts validated and gracefully reloaded; other vhosts preserved')
