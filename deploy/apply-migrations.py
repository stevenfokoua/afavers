"""Run under the VPS Docker resource runner. Never print backend credentials."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path('/opt/afavers')
env = dict(line.split('=', 1) for line in (root/'.env').read_text().splitlines() if line and not line.startswith('#'))
base = ['docker', 'compose', '--env-file', str(root/'.env'), '-f', str(root/'compose.yml'), 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
def sql(text):
    run = subprocess.run(base, input=text, text=True, capture_output=True)
    if run.returncode:
        error = run.stderr
        for value in env.values():
            if len(value) > 15: error = error.replace(value, '[redacted]')
        raise RuntimeError(error[-3000:])
    return run.stdout

sql('CREATE SCHEMA IF NOT EXISTS afavers_internal; CREATE TABLE IF NOT EXISTS afavers_internal.migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());')
applied = []
for path in sorted((root/'supabase/migrations').glob('*.sql')):
    name = path.name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    exists = sql(f"SELECT sha256 FROM afavers_internal.migrations WHERE name = '{name}';")
    if digest in exists:
        continue
    if sql(f"SELECT count(*) FROM afavers_internal.migrations WHERE name = '{name}';").splitlines()[2].strip() != '0':
        raise RuntimeError(f'Applied migration changed: {name}')
    source = path.read_text().replace('https://YOUR-PROJECT-REF.supabase.co', 'http://host.docker.internal:18980').replace('YOUR_CRON_SECRET', env['CRON_SECRET'])
    sql('BEGIN;\n'+source+f"\nINSERT INTO afavers_internal.migrations(name,sha256) VALUES ('{name}','{digest}');\nCOMMIT;")
    applied.append(name)
    print('Applied', name, flush=True)
sql("NOTIFY pgrst, 'reload schema';")
(root/'migration-receipt.json').write_text(json.dumps({'applied':applied,'tracked':True},indent=2))
