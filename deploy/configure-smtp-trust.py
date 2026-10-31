"""Trust the existing Postfix public certificate only inside Afavers Auth."""
import json
import os
from pathlib import Path
import subprocess

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
actual=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "local.agent.owner"}}','afavers-auth-1'],text=True).strip()
if actual!=owner or (root/'.resource-owner').read_text().strip()!=owner:raise SystemExit('Owner mismatch')
certificate=Path(subprocess.check_output(['postconf','-h','smtpd_tls_cert_file'],text=True).strip())
subprocess.run(['openssl','x509','-in',str(certificate),'-noout','-checkhost','ubuntu','-checkend','2592000'],check=True,capture_output=True)
folder=root/'smtp'
folder.mkdir(mode=0o755,exist_ok=True)
base=folder/'system-ca.crt'
subprocess.run(['docker','cp','afavers-auth-1:/etc/ssl/certs/ca-certificates.crt',str(base)],check=True,capture_output=True)
(folder/'ca-bundle.crt').write_bytes(base.read_bytes()+b'\n'+certificate.read_bytes())
(folder/'ca-bundle.crt').chmod(0o644)
base.unlink()
(root/'smtp-trust-receipt.json').write_text(json.dumps({'publicCertificate':str(certificate),'smtpHostname':'ubuntu','scope':'Afavers Auth container only','tlsVerificationEnabled':True},indent=2))
print('Afavers Auth CA bundle includes system roots and the existing Postfix certificate; TLS verification retained')
