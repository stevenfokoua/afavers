"""Real two-user checks against the private API, retiring only owned test users."""
import json
import os
from pathlib import Path
import secrets
import time
import urllib.error
import urllib.request
import uuid

root=Path('/opt/afavers')
env=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if line)
owner=os.environ['AGENT_RESOURCE_OWNER']
base='http://172.17.0.1:18980'
created=[]
results=[]
receipt=root/'backend-verification.json'

def request(path,method='GET',body=None,token=None,prefer=None):
    headers={'apikey':env['ANON_KEY'],'Authorization':'Bearer '+(token or env['ANON_KEY']),'Content-Type':'application/json'}
    if prefer:headers['Prefer']=prefer
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=160) as response:
            text=response.read().decode();return response.status,json.loads(text) if text else None
    except urllib.error.HTTPError as error:
        text=error.read().decode()
        try:return error.code,json.loads(text)
        except json.JSONDecodeError:return error.code,{'message':text[:200]}

def check(name,condition):
    results.append({'check':name,'passed':bool(condition)})
    if not condition:raise RuntimeError(name+' failed')
    print('Passed:',name,flush=True)

try:
    identities=[]
    for index in range(2):
        email=f'afavers-verify-{owner[:8]}-{uuid.uuid4().hex[:8]}@example.invalid'
        password=secrets.token_urlsafe(24)
        status,user=request('/auth/v1/admin/users','POST',{'email':email,'password':password,'email_confirm':True,'user_metadata':{'afavers_resource_owner':owner,'purpose':'disposable verification'}},env['SERVICE_ROLE_KEY'])
        check('confirmed synthetic user creation '+str(index),status in (200,201) and bool(user.get('id')))
        created.append({'id':user['id'],'email':email})
        receipt.write_text(json.dumps({'owner':owner,'tests':results,'ownedTestUsers':created,'cleanupComplete':False},indent=2))
        status,session=request('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password})
        check('password login '+str(index),status==200 and bool(session.get('access_token')))
        token=session['access_token']
        status,profiles=request('/rest/v1/users?select=id,email,is_admin&auth_user_id=eq.'+user['id'],token=token)
        check('own profile and auth identity '+str(index),status==200 and len(profiles)==1 and profiles[0]['email']==email)
        identities.append((token,profiles[0]['id']))
    tokenA,idA=identities[0];tokenB,idB=identities[1]
    status,row=request('/rest/v1/jobs','POST',{'external_id':'verification_'+uuid.uuid4().hex,'title':'Disposable private verification job','company':'afavers verification','source':'manual','is_manual':True,'owner_user_id':idA,'url':'https://example.invalid/private'},tokenA,'return=representation')
    check('manual job creation',status==201 and len(row)==1)
    jobId=row[0]['id']
    status,_=request('/rest/v1/user_jobs','POST',{'user_id':idA,'job_id':jobId,'status':'applied','notes':'Private verification note','interview_date':'2026-11-05'},tokenA)
    check('own tracker write',status in (200,201,204))
    status,rows=request('/rest/v1/jobs?id=eq.'+str(jobId),token=tokenB)
    check('private listing hidden from second user',status==200 and rows==[])
    status,rows=request('/rest/v1/user_jobs?job_id=eq.'+str(jobId),token=tokenB)
    check('private tracker notes hidden from second user',status==200 and rows==[])
    status,_=request('/rest/v1/user_jobs','POST',{'user_id':idB,'job_id':jobId,'status':'saved'},tokenB)
    check('cross-user private job attachment rejected',status in (400,401,403))
    status,_=request('/rest/v1/users?id=eq.'+str(idA),'PATCH',{'is_admin':True},tokenA)
    check('self-admin promotion rejected',status in (401,403))
    status,_=request('/rest/v1/user_jobs?user_id=eq.'+str(idA)+'&job_id=eq.'+str(jobId),'PATCH',{'interview_date':None},tokenA)
    check('clear nullable interview date write',status in (200,204))
    status,rows=request('/rest/v1/user_jobs?select=interview_date&job_id=eq.'+str(jobId),token=tokenA)
    check('cleared interview date persisted',status==200 and rows[0]['interview_date'] is None)
    status,rows=request('/rest/v1/public_jobs?id=eq.'+str(jobId))
    check('anonymous listing excludes private jobs',status==200 and rows==[])
    status,_=request('/functions/v1/werkstudent-search','POST',{})
    check('anonymous personalized search rejected',status==401)
    status,_=request('/functions/v1/job-alerts','POST',{})
    check('anonymous email-alert execution rejected',status==401)
    status,search=request('/functions/v1/werkstudent-search','POST',{'keyword':'software','location':'Berlin'},tokenA)
    check('authenticated personalized search',status==200 and isinstance(search.get('jobs'),list) and 'software' in search.get('searchTerm',''))
    status,_=request('/functions/v1/fetch-jobs','POST',{},tokenA)
    check('non-admin global job fetch rejected',status in (401,403))
    status,news=request('/functions/v1/news','POST',{'ressort':'wirtschaft'})
    check('public news proxy',status==200 and isinstance(news.get('news'),list))
finally:
    remaining=[]
    for item in created:
        status,current=request('/auth/v1/admin/users/'+item['id'],token=env['SERVICE_ROLE_KEY'])
        if status==200 and current.get('email')==item['email'] and current.get('user_metadata',{}).get('afavers_resource_owner')==owner:
            status,_=request('/auth/v1/admin/users/'+item['id'],'DELETE',token=env['SERVICE_ROLE_KEY'])
            if status not in (200,204):remaining.append(item['id'])
        elif status!=404:remaining.append(item['id'])
    receipt.write_text(json.dumps({'owner':owner,'tests':results,'ownedTestUsersRemaining':remaining,'cleanupComplete':not remaining},indent=2))
    print('Owned test-user cleanup complete:',not remaining,flush=True)
