"""Finish the authorized HTTPS deployment once public DNS points at this VPS."""
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

root=Path('/opt/afavers')
domain='afavers.saintcreators.com'
if not (root/'.resource-owner').is_file():raise SystemExit('Deployment ownership marker missing')
with urllib.request.urlopen(f'https://dns.google/resolve?name={domain}&type=A',timeout=15) as response:
    dns=json.load(response)
addresses={answer['data'] for answer in dns.get('Answer',[]) if answer['type']==1}
if addresses!={'194.164.207.240'}:
    raise SystemExit('DNS is not ready: add A afavers -> 194.164.207.240 and retry after propagation')
certificate=Path(f'/etc/letsencrypt/live/{domain}/fullchain.pem')
if not certificate.is_file():
    subprocess.run(['certbot','certonly','--webroot','-w','/srv/www/afavers/acme','-d',domain,'--non-interactive','--agree-tos'],check=True)
subprocess.run(['python3',str(root/'deploy/configure-nginx.py'),'--tls'],check=True)
checks=[]
for path in ('/','/login','/hotpicks','/version.json','/backend/auth/v1/health'):
    # A graceful Nginx reload returns before its new workers accept TLS.
    for attempt in range(4):
        try:
            with urllib.request.urlopen('https://'+domain+path,timeout=20) as response:
                if response.status!=200:raise RuntimeError('Public check failed: '+path)
                checks.append({'path':path,'status':response.status,'cache':response.headers.get('Cache-Control')})
            break
        except urllib.error.URLError:
            if attempt==3:raise
            time.sleep(1)
(root/'public-verification.json').write_text(json.dumps({'domain':domain,'checks':checks},indent=2))
print('Public HTTPS checks passed:',domain)
