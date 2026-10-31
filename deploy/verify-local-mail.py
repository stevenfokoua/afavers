"""Exercise real Auth emails through Postfix's exact local-only test alias.

Secret payload output is consumed only in memory by the private browser harness;
never save it in a public report or print it in a terminal transcript.
"""
import email.policy
import html
import json
import mailbox
import os
from pathlib import Path
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
state=root/'mail-test'
manifest=json.loads((state/'mailbox.json').read_text())
if manifest['owner']!=owner or (root/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Owner mismatch')
env=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if line)
account=state/'account.json'
receipt=root/'mail-verification.json'
base='https://afavers.saintcreators.com/backend'
checks=json.loads(receipt.read_text()) if receipt.exists() else {'mode':'Real Auth emails delivered through existing Postfix to an exact local-only mailbox; external inbox delivery not tested','checks':[]}
def save(name,ok):
    checks['checks'].append({'name':name,'passed':bool(ok)})
    receipt.write_text(json.dumps(checks,indent=2))
    if not ok:raise RuntimeError('Failed check: '+name)
def api(path,body=None,admin=False,method=None):
    headers={'apikey':env['ANON_KEY'],'Content-Type':'application/json','Authorization':'Bearer '+env['SERVICE_ROLE_KEY' if admin else 'ANON_KEY']}
    req=urllib.request.Request(base+path,headers=headers,method=method or ('POST' if body is not None else 'GET'),data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=35) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:
        try: data=json.loads(error.read())
        except ValueError:data={}
        return error.code,data
def current():return json.loads(account.read_text())
def owned(data,user):return user.get('email')==data['email'] and user.get('user_metadata',{}).get('afavers_resource_owner')==owner and user.get('user_metadata',{}).get('mail_test_nonce')==data['nonce']
action=sys.argv[1]
if action=='start':
    if account.exists():raise SystemExit('Existing mail-test account state must be retired first')
    data={'owner':owner,'email':manifest['email'],'password':secrets.token_urlsafe(24),'newPassword':secrets.token_urlsafe(24),'nonce':secrets.token_hex(16)}
    status,users=api('/auth/v1/admin/users?page=1&per_page=1000',admin=True)
    save('test address unused',status==200 and not any(u.get('email')==data['email'] for u in users.get('users',[])))
    account.write_text(json.dumps(data));os.chmod(account,0o600)
    status,user=api('/auth/v1/signup',{'email':data['email'],'password':data['password'],'data':{'afavers_resource_owner':owner,'mail_test_nonce':data['nonce']}})
    user=user.get('user',user)
    save('public signup accepted',status in (200,201) and owned(data,user))
    data['id']=user['id'];account.write_text(json.dumps(data))
    save('signup requires confirmation',not user.get('email_confirmed_at'))
    status,response=api('/auth/v1/token?grant_type=password',{'email':data['email'],'password':data['password']})
    save('unconfirmed login rejected',status==400 and response.get('error_code')=='email_not_confirmed')
    print('Public signup accepted; confirmation required; local delivery pending')
elif action=='inspect-links':
    messages=mailbox.mbox(manifest['folder']+'/inbox',create=False)
    for message in messages:
        for part in message.walk():
            if part.get_content_type() not in ('text/html','text/plain'):continue
            body=(part.get_payload(decode=True) or b'').decode('utf8',errors='replace')
            for candidate in re.findall(r'https?://[^\s<>\"]+',html.unescape(body)):
                url=urllib.parse.urlparse(candidate)
                print(json.dumps({'host':url.hostname,'path':url.path,'queryKeys':list(urllib.parse.parse_qs(url.query))}))
    messages.close()
elif action=='verify-dkim-mail':
    import dkim
    data=current()
    records=json.loads((root/'email-dns-records.json').read_text())
    public=next(row['value'] for row in records['records'] if row['name'].endswith('._domainkey')).encode()
    found=None
    for _ in range(30):
        messages=mailbox.mbox(manifest['folder']+'/inbox',create=False)
        try:
            for message in messages:
                for part in message.walk():
                    if part.get_content_type() not in ('text/html','text/plain'):continue
                    body=(part.get_payload(decode=True) or b'').decode('utf8',errors='replace')
                    if 'https://afavers.saintcreators.com/backend/auth/v1/verify?' in html.unescape(body):found=message
        finally:messages.close()
        if found:break
        time.sleep(.3)
    valid=bool(found and found['DKIM-Signature'] and dkim.verify(found.as_bytes(policy=email.policy.SMTP),dnsfunc=lambda name,timeout=5:public))
    (root/'auth-dkim-verification.json').write_text(json.dumps({'realSignupAccepted':True,'localAuthEmailReceived':bool(found),'signatureVerifiedWithGeneratedPublicKey':valid,'privateBridge':'Afavers container to dedicated Postfix SMTP listener','dnsPublished':False,'externalInboxTested':False},indent=2))
    if not valid:raise RuntimeError('Real Auth email did not verify with the configured DKIM key')
    print('Real signup email crossed the private container route and its DKIM signature verifies')
elif action=='mail':
    data=current()
    wanted=sys.argv[2]
    link=None
    for _ in range(30):
        messages=mailbox.mbox(manifest['folder']+'/inbox',create=False)
        try:
            for message in messages:
                for part in message.walk():
                    if part.get_content_type() not in ('text/html','text/plain'):continue
                    body=(part.get_payload(decode=True) or b'').decode(part.get_content_charset() or 'utf8',errors='replace')
                    for candidate in re.findall(r'https://afavers\.saintcreators\.com/[^\s<>\"]+',html.unescape(body)):
                        if urllib.parse.parse_qs(urllib.parse.urlparse(candidate).query).get('type')==[wanted]:link=candidate
        finally:messages.close()
        if link:break
        time.sleep(.5)
    save(wanted+' email arrived in local mailbox',bool(link))
    print('AFAVERS_PRIVATE_DATA='+json.dumps({'url':link,'email':data['email'],'password':data['password'],'newPassword':data['newPassword']}))
elif action=='request-reset':
    data=current()
    status,user=api('/auth/v1/admin/users/'+data['id'],admin=True)
    save('confirmation link confirmed owned account',status==200 and owned(data,user) and user.get('email_confirmed_at'))
    status,session=api('/auth/v1/token?grant_type=password',{'email':data['email'],'password':data['password']})
    save('confirmed password login works',status==200 and bool(session.get('access_token')))
    redirect=urllib.parse.quote('https://afavers.saintcreators.com/reset-password',safe='')
    status,_=api('/auth/v1/recover?redirect_to='+redirect,{'email':data['email']})
    save('public recovery request accepted',status==200)
    print('Confirmed account verified; recovery email requested')
elif action=='verify-reset':
    data=current()
    status,_=api('/auth/v1/token?grant_type=password',{'email':data['email'],'password':data['password']})
    save('old password rejected after reset',status==400)
    status,response=api('/auth/v1/token?grant_type=password',{'email':data['email'],'password':data['newPassword']})
    save('new password login accepted',status==200 and bool(response.get('access_token')))
    print('Password reset verified; old password rejected and new password accepted')
elif action=='cleanup':
    if account.exists():
        data=current()
        if 'id' not in data:
            status,users=api('/auth/v1/admin/users?page=1&per_page=1000',admin=True)
            matches=[u for u in users.get('users',[]) if owned(data,u)]
            if len(matches)>1:raise SystemExit('Ambiguous ownership; preserve for review')
            if matches:data['id']=matches[0]['id']
        if 'id' in data:
            status,user=api('/auth/v1/admin/users/'+data['id'],admin=True)
            if status!=404:
                if status!=200 or not owned(data,user):raise SystemExit('Refusing to delete an unowned account')
                status,_=api('/auth/v1/admin/users/'+data['id'],admin=True,method='DELETE')
                save('owned test account deleted',status in (200,204))
        account.unlink()
    checks['privateAccountStateRetired']=True
    receipt.write_text(json.dumps(checks,indent=2))
    print('Owned local-mail test account and credentials retired')
else:raise SystemExit('Unknown action')
