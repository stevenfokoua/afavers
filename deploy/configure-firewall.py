"""Permit only the owned afavers bridge to its private host API listener."""
import ipaddress
import json
import os
from pathlib import Path
import subprocess

network=json.loads(subprocess.check_output(['docker','network','inspect','afavers_default'],text=True))[0]
if network.get('Labels',{}).get('local.agent.owner')!=os.environ['AGENT_RESOURCE_OWNER']:
    raise SystemExit('Network owner mismatch')
subnet=network['IPAM']['Config'][0]['Subnet']
if not ipaddress.ip_network(subnet).subnet_of(ipaddress.ip_network('172.16.0.0/12')):
    raise SystemExit('Unexpected private network range')
interface='br-'+network['Id'][:12]
rule=['allow','in','on',interface,'from',subnet,'to','172.17.0.1','port','18980','proto','tcp','comment','afavers private API']
subprocess.run(['ufw',*rule],check=True)
Path('/opt/afavers/firewall-receipt.json').write_text(json.dumps({'owner':os.environ['AGENT_RESOURCE_OWNER'],'interface':interface,'subnet':subnet,'rule':rule,'purpose':'Private afavers container-to-host API access; no public port opened'},indent=2))
