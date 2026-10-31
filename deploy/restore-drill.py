"""Restore an existing local archive into a new, owned disposable database only.

Run through resource-tools/runner.py --docker. Never restore into postgres.
No ports, containers, volumes, off-site copies or production records are changed.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,subprocess,uuid


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--migrations',help='Optional owned directory of pending application-only migrations')
    parser.add_argument('--verify-sql',help='Optional contract checks; must explicitly guard the disposable database name')
    args=parser.parse_args()
    root=Path('/opt/afavers');owner=os.environ['AGENT_RESOURCE_OWNER']
    assert (root/'.resource-owner').read_text().strip()==owner
    container='afavers-db-1'
    actual=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "local.agent.owner"}}',container],text=True).strip();assert actual==owner
    folder=root/'backups';assert (folder/'.resource-owner').read_text().strip()==owner
    archive=sorted(folder.glob('afavers-????????T??????Z.dump'))[-1]
    database='afavers_restore_'+uuid.uuid4().hex[:12]
    assert re.fullmatch(r'afavers_restore_[a-f0-9]{12}',database) and database!='postgres'
    stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report={'owner':owner,'database':database,'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'started':stamp,'productionModified':False,'offsite':False,'restored':False,'targetRemoved':False,'migrations':[]}
    receipt=root/'restore-drill-receipt.json'
    def sql(query,db='postgres',check=True):
        result=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'],input=query,capture_output=True,text=True,timeout=40)
        if check and result.returncode:raise RuntimeError('Restore drill SQL failed: '+result.stderr[-1200:])
        return result
    assert sql("SELECT count(*) FROM pg_database WHERE datname='"+database+"';").stdout.strip()=='0'
    receipt.write_text(json.dumps(report,indent=2));created=False
    try:
        sql('CREATE DATABASE '+database+' TEMPLATE template0;');created=True
        sql('REVOKE ALL ON DATABASE '+database+' FROM PUBLIC; COMMENT ON DATABASE '+database+" IS 'afavers restore drill owner "+owner+"';")
        sql('CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS public; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;',database)
        with archive.open('rb') as stream:
            restore=subprocess.run(['docker','exec','-i',container,'pg_restore','-U','postgres','--dbname='+database,'--no-owner','--no-privileges','--clean','--if-exists','--schema=public','--schema=auth','--exit-on-error'],stdin=stream,capture_output=True,timeout=120)
        if restore.returncode:raise RuntimeError('Local archive restore failed: '+restore.stderr.decode(errors='replace')[-1800:])
        counts=sql("SELECT json_build_object('jobs',(SELECT count(*) FROM public.jobs),'profiles',(SELECT count(*) FROM public.users),'trackerRows',(SELECT count(*) FROM public.user_jobs),'orphanProfiles',(SELECT count(*) FROM public.users u LEFT JOIN auth.users a ON a.id=u.auth_user_id WHERE a.id IS NULL),'orphanTracker',(SELECT count(*) FROM public.user_jobs u LEFT JOIN public.jobs j ON j.id=u.job_id WHERE j.id IS NULL));",database)
        report['restoredCounts']=json.loads(counts.stdout);assert report['restoredCounts']['jobs']>0 and report['restoredCounts']['orphanProfiles']==0 and report['restoredCounts']['orphanTracker']==0
        report['restored']=True
        if args.migrations:
            directory=Path(args.migrations).resolve();assert directory.is_relative_to(root.resolve()) and (directory.parent/'.owner').read_text().strip()==owner
            for path in sorted(directory.glob('*.sql')):
                source=path.read_text()
                if 'cron.' in source or 'net.http_post' in source:
                    report['migrations'].append({'name':path.name,'skipped':'scheduling belongs only to the production database'})
                    continue
                sql('BEGIN;\n'+source+'\nCOMMIT;',database)
                report['migrations'].append({'name':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'applied':True})
        report['databaseChecks']='restored data and application referential relationships verified'
        if args.verify_sql:
            path=Path(args.verify_sql).resolve();assert path.is_relative_to(root.resolve())
            checks=path.read_text();assert 'afavers_restore_' in checks
            sql(checks,database)
            report['readinessContractsVerified']=True
    finally:
        if created:
            comment=sql("SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname='"+database+"';").stdout.strip()
            assert comment=='afavers restore drill owner '+owner,'Refusing to drop target with mismatched ownership'
            sql('DROP DATABASE '+database+' WITH (FORCE);')
            report['targetRemoved']=sql("SELECT count(*) FROM pg_database WHERE datname='"+database+"';").stdout.strip()=='0'
        report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        receipt.write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
