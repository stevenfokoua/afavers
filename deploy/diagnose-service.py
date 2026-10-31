"""Bounded, credential-redacted diagnostics for an exact owned app service."""
import json
import os
from pathlib import Path
import subprocess
import sys

name=sys.argv[1]
if name not in ('auth','db','rest','functions'):raise SystemExit('Unknown service')
root=Path('/opt/afavers')
values=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if line)
container=f'afavers-{name}-1'
owner=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "local.agent.owner"}}',container],text=True).strip()
if owner!=os.environ['AGENT_RESOURCE_OWNER']:raise SystemExit('Owner mismatch')
state=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .State}}',container],text=True))
print(json.dumps({key:state.get(key) for key in ('Status','ExitCode','OOMKilled')}))
run=subprocess.run(['docker','logs','--tail','50',container],capture_output=True,text=True)
logs=run.stdout+run.stderr
for value in values.values():
    if len(value)>15:logs=logs.replace(value,'[redacted]')
for line in logs.splitlines()[-12:]:
    try:
        item=json.loads(line)
        message=str(item.get('msg',''))
        if 'ERROR:' in message:message='ERROR:'+message.rsplit('ERROR:',1)[1]
        diagnostic = {key:item[key] for key in ('error','error_code','status') if key in item}
        print(item.get('level',''),message[:1200],json.dumps(diagnostic)[:1600])
    except json.JSONDecodeError:
        print(line[:500])
