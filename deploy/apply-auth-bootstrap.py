"""Apply a reviewed platform bootstrap file only to the new afavers DB."""
from pathlib import Path
import subprocess
import sys

name=sys.argv[1]
if name not in ('auth-ownership.sql','auth-claims.sql'):raise SystemExit('Unknown bootstrap step')
root=Path('/opt/afavers')
cmd=['docker','compose','--env-file',str(root/'.env'),'-f',str(root/'compose.yml'),'exec','-T','db','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1']
subprocess.run(cmd,input=(root/'deploy/bootstrap'/name).read_text(),text=True,check=True)
