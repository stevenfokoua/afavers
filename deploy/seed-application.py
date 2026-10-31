"""Fetch initial public jobs and provision only the explicit public demo account."""
import json
from pathlib import Path
import urllib.error
import urllib.request

root=Path('/opt/afavers')
env=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if line)
base='http://172.17.0.1:18980'
def api(path,method='GET',body=None,cron=False):
    headers={'apikey':env['ANON_KEY'],'Authorization':'Bearer '+env['SERVICE_ROLE_KEY'],'Content-Type':'application/json'}
    if cron:headers['x-cron-secret']=env['CRON_SECRET']
    req=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=160) as response:return response.status,json.loads(response.read() or b'null')
    except urllib.error.HTTPError as error:return error.code,json.loads(error.read() or b'null')
status,fetch=api('/functions/v1/fetch-jobs','POST',{},True)
if status!=200 or not fetch.get('success'):
    error=str(fetch.get('error') or fetch.get('message') or fetch.get('code') or 'unknown error')
    for value in env.values():
        if len(value)>15:error=error.replace(value,'[redacted]')
    raise RuntimeError('Initial job fetch failed; status '+str(status)+'; '+error[:800])
print('Initial job fetch:',json.dumps({key:fetch.get(key) for key in ('success','total','inserted','updated','complete','sources')}),flush=True)
email='demo@afavers.saintcreators.com'
status,profiles=api('/rest/v1/users?select=id,email&email=eq.'+email)
if status!=200:raise RuntimeError('Demo profile preflight failed')
if not profiles:
    status,user=api('/auth/v1/admin/users','POST',{'email':email,'password':'demo1234','email_confirm':True,'user_metadata':{'purpose':'Public demo account; never use for personal data'}})
    if status not in (200,201):raise RuntimeError('Demo account provisioning failed; status '+str(status))
print('Public demo account ready; no admin rights granted')
(root/'initial-seed.json').write_text(json.dumps({'jobs':{key:fetch.get(key) for key in ('success','total','inserted','updated','complete','sources')},'demoEmail':email,'demoIsPublic':True},indent=2))
