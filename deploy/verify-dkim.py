"""Local-only delivery drill: prove signatures and preserve the shared SMTP path."""
import email.policy
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
import json
import mailbox
import os
from pathlib import Path
import smtplib
import subprocess
import time
import dkim

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
if (root/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Owner mismatch')
manifest=json.loads((root/'mail-test/mailbox.json').read_text())
if manifest['owner']!=owner:raise SystemExit('Test mailbox owner mismatch')
records=json.loads((root/'email-dns-records.json').read_text())
public=next(r['value'] for r in records['records'] if r['name'].endswith('._domainkey')).encode()
results=[]
def check(name,ok):
    results.append({'name':name,'passed':bool(ok)})
    (root/'dkim-verification.json').write_text(json.dumps({'mode':'Real Postfix delivery to owned local-only mailbox; DKIM checked against generated public key; DNS publication and external inbox not yet tested','checks':results},indent=2))
    if not ok:raise RuntimeError('DKIM check failed: '+name)
def message(sender,port,label):
    msg=EmailMessage()
    msg['From']=sender
    msg['To']=manifest['email']
    msg['Subject']='Afavers owned DKIM test '+label
    msg['Message-ID']=make_msgid(domain='saintcreators.com')
    msg['Date']=formatdate(localtime=False)
    msg.set_content('Original DKIM verification content '+label)
    with smtplib.SMTP('127.0.0.1',port,timeout=15) as smtp:
        smtp.send_message(msg)
    for _ in range(30):
        box=mailbox.mbox(manifest['folder']+'/inbox',create=False)
        try:
            found=next((m for m in box if m['Message-ID']==msg['Message-ID']),None)
        finally:box.close()
        if found:
            # Preserve wire CRLF canonicalization and folded header lines.
            return found.as_bytes(policy=email.policy.SMTP)
        time.sleep(.2)
    raise RuntimeError('Local delivery timeout')
signed=message('afavers@saintcreators.com',18995,'signed')
check('dedicated SMTP adds expected DKIM domain and selector',b'DKIM-Signature:' in signed and b'd=saintcreators.com' in signed and b's=afavers202610' in signed)
check('RSA SHA256 signature verifies with generated public key',dkim.verify(signed,dnsfunc=lambda name,timeout=5:public))
check('tampered body fails verification',not dkim.verify(signed.replace(b'Original DKIM',b'Modified DKIM'),dnsfunc=lambda name,timeout=5:public))
other=message('other-app@example.invalid',18995,'other-sender')
check('unrelated sender is not signed with Afavers key',b'DKIM-Signature:' not in other)
shared=message('afavers@saintcreators.com',25,'shared-route')
check('existing shared SMTP port remains unchanged',b'DKIM-Signature:' not in shared)
check('global SMTP milters remain unchanged',subprocess.check_output(['postconf','-h','smtpd_milters'],text=True).strip()=='' and subprocess.check_output(['postconf','-h','non_smtpd_milters'],text=True).strip()=='')
print('All',len(results),'local DKIM checks passed; no external emails sent')
