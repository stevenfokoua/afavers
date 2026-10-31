import json
import os
from pathlib import Path
import subprocess

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
base=['docker','exec','afavers-db-1','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c']
actual=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "local.agent.owner"}}','afavers-db-1'],text=True).strip()
if actual!=owner:raise SystemExit('Owner mismatch')
query="SELECT json_build_object('publicJobs',(SELECT count(*) FROM public.jobs WHERE source <> 'manual' AND is_active),'schedules',(SELECT json_agg(json_build_object('name',jobname,'schedule',schedule,'active',active)) FROM cron.job),'recentCronRuns',(SELECT json_agg(x) FROM (SELECT jobid,status,start_time,end_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 4)x));"
report=json.loads(subprocess.check_output(base+[query],text=True))
stats=subprocess.check_output(['docker','stats','--no-stream','--format','{{.Name}}: {{.MemUsage}}; CPU {{.CPUPerc}}','afavers-db-1','afavers-auth-1','afavers-rest-1','afavers-functions-1'],text=True)
report['containerSample']=stats.strip().splitlines()
report['backupTimerActive']=subprocess.run(['systemctl','is-active','--quiet','afavers-backup.timer']).returncode==0
(root/'operations-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
