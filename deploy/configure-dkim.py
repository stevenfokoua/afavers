"""Install an owner-scoped DKIM signer and private Afavers-only SMTP listener.

Run through the VPS resource runner because the firewall range is verified from
the owned Docker network. Never export the private signing key.
"""
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import pwd
import re
import subprocess

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
if (root/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Deployment owner mismatch')
network=json.loads(subprocess.check_output(['docker','network','inspect','afavers_default'],text=True))[0]
if network.get('Labels',{}).get('local.agent.owner')!=owner:raise SystemExit('Network owner mismatch')
subnet=network['IPAM']['Config'][0]['Subnet']
if not ipaddress.ip_network(subnet).subnet_of(ipaddress.ip_network('172.16.0.0/12')):raise SystemExit('Unexpected subnet')
interface='br-'+network['Id'][:12]
account=pwd.getpwnam('opendkim')
folder=Path('/etc/afavers-dkim')
marker=f'# afavers resource owner: {owner}\n'
if folder.exists():
    if not (folder/'.resource-owner').is_file() or (folder/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Unowned signing directory')
else:
    folder.mkdir(mode=0o750)
    os.chown(folder,0,account.pw_gid)
    (folder/'.resource-owner').write_text(owner)
selector='afavers202610'
private=folder/(selector+'.private')
if not private.exists():
    subprocess.run(['opendkim-genkey','-b','2048','-r','-h','sha256','-s',selector,'-d','saintcreators.com','-D',str(folder)],check=True)
    os.chown(private,account.pw_uid,account.pw_gid)
    private.chmod(0o600)
elif private.stat().st_uid!=account.pw_uid or private.stat().st_mode & 0o077:
    raise SystemExit('Unsafe key ownership/permissions')
config='''Syslog yes
LogWhy yes
Mode s
Canonicalization relaxed/relaxed
SignatureAlgorithm rsa-sha256
Socket inet:18994@127.0.0.1
UMask 0077
KeyTable file:/etc/afavers-dkim/KeyTable
SigningTable refile:/etc/afavers-dkim/SigningTable
InternalHosts file:/etc/afavers-dkim/TrustedHosts
OversignHeaders From
RequireSafeKeys yes
'''
sources={
 'opendkim.conf':config,
 'KeyTable':f'{selector} saintcreators.com:{selector}:{private}\n',
 'SigningTable':f'afavers@saintcreators.com {selector}\n',
 'TrustedHosts':f'127.0.0.1\n172.17.0.1\n{subnet}\n',
}
for name,source in sources.items():
    path=folder/name
    if path.exists() and not path.read_text().startswith(marker):raise SystemExit('Unmanaged signer configuration: '+name)
    path.write_text(marker+source)
    os.chown(path,0,account.pw_gid)
    path.chmod(0o640)
unit=Path('/etc/systemd/system/afavers-dkim.service')
if unit.exists() and not unit.read_text().startswith(marker):raise SystemExit('Unmanaged signer unit')
unit.write_text(marker+'''[Unit]
Description=Afavers private DKIM signer
After=network.target
[Service]
Type=simple
User=opendkim
Group=opendkim
ExecStart=/usr/sbin/opendkim -f -x /etc/afavers-dkim/opendkim.conf
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
RestrictAddressFamilies=AF_INET AF_UNIX
MemoryMax=64M
MemorySwapMax=0
CPUQuota=15%
TasksMax=32
UMask=0077
[Install]
WantedBy=multi-user.target
''')
subprocess.run(['opendkim','-n','-x',str(folder/'opendkim.conf')],check=True,capture_output=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
# The generic instance was installed during this task and has never been attached
# to Postfix. Use only the explicitly owned, capped instance.
subprocess.run(['systemctl','disable','--now','opendkim.service'],check=True,capture_output=True)
subprocess.run(['systemctl','enable','--now','afavers-dkim.service'],check=True,capture_output=True)
subprocess.run(['systemctl','restart','afavers-dkim.service'],check=True,capture_output=True)
subprocess.run(['systemctl','is-active','--quiet','afavers-dkim.service'],check=True)
master=Path('/etc/postfix/master.cf')
begin=f'# BEGIN afavers DKIM SMTP owner {owner}\n'
end=f'# END afavers DKIM SMTP owner {owner}\n'
options=f'''  -o syslog_name=postfix/afavers
  -o mynetworks=127.0.0.0/8,172.17.0.1/32,{subnet}
  -o smtpd_client_restrictions=permit_mynetworks,reject
  -o smtpd_relay_restrictions=permit_mynetworks,reject
  -o smtpd_milters=inet:127.0.0.1:18994
  -o milter_default_action=tempfail
  -o milter_protocol=6
'''
block=begin+''.join(f'{address}:18995 inet n - n - 4 smtpd\n'+options for address in ('172.17.0.1','127.0.0.1'))+end
main_digest=hashlib.sha256(Path('/etc/postfix/main.cf').read_bytes()).hexdigest()
with master.open('r+') as stream:
    fcntl.flock(stream,fcntl.LOCK_EX)
    previous=stream.read()
    if begin in previous:
        old=previous[previous.index(begin):previous.index(end)+len(end)]
        candidate=previous.replace(old,block)
    elif '18995' in previous:raise SystemExit('SMTP listener port already configured')
    else:candidate=previous+('\n' if not previous.endswith('\n') else '')+block
    backup=root/'postfix-master-before-afavers-dkim.cf'
    if not backup.exists():backup.write_text(previous);backup.chmod(0o600)
    try:
        stream.seek(0);stream.write(candidate);stream.truncate();stream.flush()
        subprocess.run(['postfix','check'],check=True,capture_output=True)
        subprocess.run(['postfix','reload'],check=True,capture_output=True)
    except Exception:
        stream.seek(0);stream.write(previous);stream.truncate();stream.flush()
        subprocess.run(['postfix','reload'],check=True,capture_output=True)
        raise
rule=['allow','in','on',interface,'from',subnet,'to','172.17.0.1','port','18995','proto','tcp','comment','afavers private signed SMTP']
subprocess.run(['ufw',*rule],check=True,capture_output=True)
public=''.join(re.findall(r'"([^\"]*)"',(folder/(selector+'.txt')).read_text()))
records=[
 {'type':'TXT','name':'@','value':'v=spf1 ip4:194.164.207.240 ~all','ttl':3600},
 {'type':'TXT','name':selector+'._domainkey','value':public,'ttl':3600},
 {'type':'TXT','name':'_dmarc','value':'v=DMARC1; p=none; adkim=r; aspf=r','ttl':3600},
]
(root/'email-dns-records.json').write_text(json.dumps({'zone':'saintcreators.com','records':records},indent=2))
receipt={'owner':owner,'signingDomain':'saintcreators.com','signingAddress':'afavers@saintcreators.com','selector':selector,'privateKeyExported':False,'smtpListener':'172.17.0.1:18995','signerListener':'127.0.0.1:18994','firewallRule':rule,'postfixMainUnchanged':hashlib.sha256(Path('/etc/postfix/main.cf').read_bytes()).hexdigest()==main_digest,'globalSmtpMilters':subprocess.check_output(['postconf','-h','smtpd_milters'],text=True).strip(),'globalLocalMilters':subprocess.check_output(['postconf','-h','non_smtpd_milters'],text=True).strip()}
(root/'dkim-setup-receipt.json').write_text(json.dumps(receipt,indent=2))
print('Afavers-only DKIM signer and private SMTP listener configured; public DNS records exported')
