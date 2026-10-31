import json
import subprocess

base=['docker','compose','--env-file','/opt/afavers/.env','-f','/opt/afavers/compose.yml','exec','-T','db','psql','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1']
query="""SELECT json_build_object('function',p.oid::regprocedure::text,'owner',r.rolname) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid JOIN pg_roles r ON p.proowner=r.oid WHERE n.nspname='auth' AND p.proname IN ('uid','role','jwt');
SELECT json_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner)) FROM pg_namespace WHERE nspname='auth';
SELECT json_build_object('table',tablename,'owner',tableowner) FROM pg_tables WHERE schemaname='auth';"""
run=subprocess.run(base,input=query,text=True,capture_output=True)
if run.returncode:raise RuntimeError(run.stderr[-1000:])
print(run.stdout)
