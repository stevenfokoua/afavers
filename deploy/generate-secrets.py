"""Run once on the VPS. Secrets never enter logs or the frontend package."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import time

target = Path('/opt/afavers/.env')
if target.exists():
    raise SystemExit('Existing secrets preserved; generation skipped')
owner = os.environ['AGENT_RESOURCE_OWNER']
key = secrets.token_hex(32)
def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=')
def jwt(role):
    head = b64(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
    body = b64(json.dumps({'iss':'supabase','role':role,'iat':int(time.time()),'exp':int(time.time())+10*365*86400},separators=(',',':')).encode())
    payload = head+b'.'+body
    return (payload+b'.'+b64(hmac.new(key.encode(),payload,hashlib.sha256).digest())).decode()
values = dict(AGENT_RESOURCE_OWNER=owner,POSTGRES_PASSWORD=secrets.token_hex(24),JWT_SECRET=key,ANON_KEY=jwt('anon'),SERVICE_ROLE_KEY=jwt('service_role'),CRON_SECRET=secrets.token_hex(32))
fd = os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
with os.fdopen(fd,'w') as handle:
    handle.write(''.join(f'{name}={value}\n' for name,value in values.items()))
print('Created root-readable afavers secrets; values omitted')
