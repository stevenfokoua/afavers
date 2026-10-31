"""Owner/hash checked backend installation. Invoke inside the existing VPS Docker runner.

Only functions are restarted. No frontend, auth, Compose, SMTP or schema rollback.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path('/opt/afavers')
STAGE = ROOT / 'readiness-261031'
TASKS = ('fetch-jobs-every-2-hours', 'job-alerts-every-2-hours', 'send-reminders-every-minute')
DEPLOY_SCRIPTS = {'apply-migrations.py', 'backup.py', 'operations.py', 'install-operations.py',
                  'verify-capacity.py', 'restore-drill.py', 'install-readiness.py'}
PROTECTED = (ROOT / '.env', ROOT / 'compose.yml', ROOT / 'smtp/ca-bundle.crt',
             Path('/etc/postfix/main.cf'), Path('/etc/postfix/master.cf'),
             Path('/etc/opendkim.conf'), Path('/etc/opendkim/key.table'), Path('/etc/opendkim/signing.table'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args, *, text=None, timeout=20, env=None):
    result = subprocess.run(args, input=text, text=True, capture_output=True, timeout=timeout, env=env)
    if result.returncode:
        # Child SQL/HTTP errors can contain private headers; never emit them.
        raise RuntimeError('command_failed_' + str(result.returncode))
    return result.stdout


def sql(source):
    return run(['docker', 'exec', '-i', 'afavers-db-1', 'psql', '-U', 'postgres', '-d', 'postgres',
                '-XAtq', '-v', 'ON_ERROR_STOP=1'], text="SET statement_timeout='10s';\n" + source, timeout=15).strip()


def query(source):
    return json.loads(sql(source))


def verify_source(source, commit):
    manifest = json.loads((source / 'source-manifest.json').read_text())
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or manifest.get('commit') != commit or not isinstance(manifest.get('files'), dict):
        raise RuntimeError('source_commit_manifest_invalid')
    for name, digest in manifest['files'].items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts or '\\' in name or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise RuntimeError('source_manifest_path_invalid')
        path = source.joinpath(*relative.parts)
        if not path.resolve().is_relative_to(source.resolve()) or path.is_symlink() or not path.is_file() or sha(path) != digest:
            raise RuntimeError('source_file_hash_differs')
    return manifest


def copy_plan(manifest):
    plan = {}
    for name in manifest['files']:
        path = PurePosixPath(name)
        target = None
        if name.startswith('supabase/functions/') and not name.endswith('.test.ts') and path.suffix in ('.ts', '.json', '.jsonc'):
            if path.parts[2] not in ('_shared', 'fetch-jobs', 'job-alerts', 'send-reminders', 'news', 'werkstudent-search'):
                raise RuntimeError('unrecognized_function_source')
            target = PurePosixPath('functions', *path.parts[2:])
        elif name.startswith('deploy/functions-main/') and path.name in ('index.ts', 'deno.jsonc', 'LICENSE', 'UPSTREAM.md'):
            target = PurePosixPath('functions/main', path.name)
        elif name.startswith('supabase/migrations/') and len(path.parts) == 3 and path.suffix == '.sql':
            target = path
        elif len(path.parts) == 2 and path.parts[0] == 'deploy' and path.name in DEPLOY_SCRIPTS:
            target = path
        if target:
            if str(target) in plan.values():
                raise RuntimeError('duplicate_install_target')
            plan[name] = str(target)
    required = {'supabase/functions/send-reminders/index.ts', 'deploy/functions-main/index.ts',
                'deploy/apply-migrations.py', 'deploy/backup.py'}
    if not required.issubset(plan):
        raise RuntimeError('required_runtime_source_missing')
    return plan


def protected_hashes():
    result = {str(path): sha(path) if path.is_file() else None for path in PROTECTED}
    current = Path('/srv/www/afavers/current')
    result['frontendCurrent'] = str(current.resolve()) if current.exists() else None
    result['frontendVersion'] = sha(current / 'version.json') if (current / 'version.json').is_file() else None
    return result


def services(owner):
    ids = run(['docker', 'compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'compose.yml'), 'ps', '-aq']).split()
    if len(ids) != 4:
        raise RuntimeError('expected_four_services')
    template = '{"id":"{{.Id}}","service":"{{index .Config.Labels "com.docker.compose.service"}}","owner":"{{index .Config.Labels "local.agent.owner"}}","startedAt":"{{.State.StartedAt}}","state":"{{.State.Status}}","health":"{{if .State.Health}}{{.State.Health.Status}}{{end}}"}'
    rows = [json.loads(run(['docker', 'inspect', '--format', template, identifier])) for identifier in ids]
    if {row['service'] for row in rows} != {'db', 'auth', 'rest', 'functions'} or any(row['owner'] != owner for row in rows):
        raise RuntimeError('service_owner_or_identity_differs')
    return {row['service']: row for row in rows}


def healthy(rows):
    return all(row['state'] == 'running' and row['health'] == 'healthy' for row in rows.values())


def verify_migrations(source, manifest):
    if sql("SELECT to_regclass('afavers_internal.migrations') IS NOT NULL;") != 't':
        raise RuntimeError('existing_migration_ledger_missing')
    ledger = query("SELECT coalesce(json_object_agg(name,sha256),'{}'::json) FROM afavers_internal.migrations;")
    staged = {PurePosixPath(name).name: digest for name, digest in manifest['files'].items() if name.startswith('supabase/migrations/') and name.endswith('.sql')}
    for name, digest in ledger.items():
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.sql', name) or staged.get(name) != digest:
            raise RuntimeError('applied_migration_source_changed')
        installed = ROOT / 'supabase/migrations' / name
        if not installed.is_file() or installed.is_symlink() or sha(installed) != digest:
            raise RuntimeError('applied_migration_install_changed')
    for path in (ROOT / 'supabase/migrations').glob('*.sql'):
        if path.name not in staged or sha(path) != staged[path.name]:
            raise RuntimeError('unreviewed_installed_migration')
    pending = sorted(set(staged) - set(ledger))
    if any(not name.startswith('20261031_') for name in pending):
        raise RuntimeError('unexpected_pending_migration')
    return pending


def schedule_rows():
    rows = query("SELECT coalesce(json_agg(json_build_object('id',jobid,'name',jobname,'active',active)),'[]'::json) FROM cron.job WHERE jobname IN ('" + "','".join(TASKS) + "');")
    if len({row['name'] for row in rows}) != len(rows) or not set(TASKS[:2]).issubset({row['name'] for row in rows}):
        raise RuntimeError('managed_schedule_missing_or_duplicate')
    return rows


def set_schedule(identifier, active):
    sql(f'SELECT cron.alter_job({int(identifier)}, active := {str(bool(active)).lower()});')


def queue_ids():
    if sql("SELECT to_regclass('net.http_request_queue') IS NOT NULL;") != 't':
        raise RuntimeError('pg_net_queue_unavailable')
    return query("SELECT coalesce(json_agg(id),'[]'::json) FROM net.http_request_queue WHERE url ~ '/functions/v1/(fetch-jobs|job-alerts|send-reminders)([?]|$)';")


def drain(receipt):
    ledger = sql("SELECT to_regclass('public.automation_runs') IS NOT NULL;") == 't'
    tables = {name: sql("SELECT to_regclass('public." + name + "') IS NOT NULL;") == 't' for name in ('job_alert_batches', 'reminder_deliveries')}
    began = time.monotonic(); captured = set(queue_ids()); stable = 0
    # Old workers have no outcome ledger, and pg_net removes a request from its
    # queue before the HTTP response exists. That already-dispatched subset is
    # not directly enumerable. A 155s quiet grace covers the old 150s request
    # budget instead of falsely calling an empty queue proof of a drained worker.
    grace = 0 if ledger else 155
    while time.monotonic() - began < 180:
        queued = queue_ids(); captured.update(queued)
        awaiting = 0
        if captured:
            identifiers = ','.join(str(int(value)) for value in captured)
            awaiting = int(sql(f'SELECT count(*) FROM unnest(ARRAY[{identifiers}]::bigint[]) AS expected(id) WHERE NOT EXISTS(SELECT 1 FROM net._http_response response WHERE response.id=expected.id);'))
        running = int(sql("SELECT count(*) FROM public.automation_runs WHERE status='running' AND lease_expires_at>now();")) if ledger else 0
        in_flight = 0
        if tables['job_alert_batches']:
            in_flight += int(sql("SELECT count(*) FROM public.job_alert_batches WHERE status='sending';"))
        if tables['reminder_deliveries']:
            in_flight += int(sql("SELECT count(*) FROM public.reminder_deliveries WHERE state='claimed';"))
        stable = stable + 1 if not (queued or awaiting or running or in_flight) else 0
        receipt['drain'] = {'automationLedgerPresent': ledger, 'legacyQuietGraceSeconds': grace,
                            'knownNetRequests': len(captured), 'pendingNetResponses': awaiting,
                            'queuedRequests': len(queued), 'runningLeases': running, 'inFlightDeliveries': in_flight,
                            'elapsedSeconds': round(time.monotonic() - began)}
        if stable >= 2 and time.monotonic() - began >= grace:
            return
        print(json.dumps({'phase': 'drain', **receipt['drain']}), flush=True)
        time.sleep(3)
    raise RuntimeError('worker_drain_timeout_no_process_killed')


def safe_target(relative):
    target = ROOT / relative
    if not target.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('install_target_escapes_deployment')
    candidate = target
    while candidate != ROOT:
        if candidate.is_symlink():
            raise RuntimeError('install_target_symlink')
        candidate = candidate.parent
    return target


def replace_file(source, target, nonce):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.' + nonce + '.pending')
    try:
        with temporary.open('xb') as stream:
            stream.write(source.read_bytes())
        temporary.chmod(0o644); temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def restart_functions(owner):
    before = services(owner)
    run(['docker', 'compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'compose.yml'),
         'restart', '--timeout', '20', 'functions'], timeout=40)
    until = time.monotonic() + 75
    while time.monotonic() < until:
        rows = services(owner)
        if healthy(rows):
            if rows['functions']['id'] != before['functions']['id']:
                raise RuntimeError('functions_container_recreated')
            for name in ('db', 'auth', 'rest'):
                if rows[name] != before[name]:
                    raise RuntimeError('untargeted_service_changed')
            return rows
        time.sleep(3)
    raise RuntimeError('functions_health_timeout')


def reminder_unauthorized():
    request = urllib.request.Request('http://172.17.0.1:18980/functions/v1/send-reminders', data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status == 401
    except urllib.error.HTTPError as error:
        return error.code == 401


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True, help='Exact reviewed 40-character source commit')
    args = parser.parse_args()
    owner = os.environ['AGENT_RESOURCE_OWNER']
    if (ROOT / '.resource-owner').read_text().strip() != owner or (STAGE / '.owner').read_text().strip() != owner:
        raise RuntimeError('deployment_or_stage_owner_differs')
    source = STAGE / 'source'
    if STAGE.is_symlink() or source.is_symlink() or not source.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('stage_source_symlink_or_escape')
    manifest = verify_source(source, args.commit); plan = copy_plan(manifest)
    lock_path = ROOT / '.readiness-install.lock'
    with lock_path.open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock.seek(0); prior = lock.read().strip()
        if prior and prior != owner:
            raise RuntimeError('install_lock_owner_differs')
        lock.seek(0); lock.truncate(); lock.write(owner); lock.flush(); lock_path.chmod(0o600)
        return install(owner, source, manifest, plan, args.commit)


def install(owner, source, manifest, plan, commit):
    nonce = uuid.uuid4().hex[:12]
    folder = STAGE / ('backend-install-' + nonce); folder.mkdir(mode=0o700); (folder / '.owner').write_text(owner)
    receipt_path = folder / 'receipt.json'
    receipt = {'owner': owner, 'commit': commit, 'startedAt': time.time(), 'success': False, 'sourceHashes': manifest['files'],
               'installed': [], 'rollbackFiles': [], 'schedulesRestored': False, 'schemaRollbackAttempted': False}
    receipt['recovery'] = ['Read this receipt and verify owner/protected hashes before further action.',
        'Additive schema and migration ledger are retained; do not run destructive schema rollback.',
        'Previous worker files are under previous/functions; restore only their verified paths if rollback is incomplete.',
        'Keep a newly created reminder schedule paused until the new worker returns unauthenticated 401 and health is verified.',
        'Use previousSchedules to restore exact original flags if needed; never enable a missing old-worker route.',
        'Retire this owner-marked rollback directory only after the release coordinator completes acceptance.']
    def persist():
        receipt_path.write_text(json.dumps(receipt, indent=2)); receipt_path.chmod(0o600)
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGINT, interrupted); signal.signal(signal.SIGTERM, interrupted)
    previous = []; paused = False; copied = False; restarted = False; ready = False
    baseline = {}; protected = {}
    try:
        baseline = services(owner)
        if not healthy(baseline):
            raise RuntimeError('unhealthy_backend_preflight')
        protected = protected_hashes(); receipt.update(beforeServices=baseline, protectedBefore=protected)
        receipt['pendingMigrations'] = verify_migrations(source, manifest)
        previous = schedule_rows(); receipt['previousSchedules'] = previous; persist()
        # Persist intent before mutation so a killed coordinator has a recovery map.
        paused = True
        for row in previous: set_schedule(row['id'], False)
        receipt['schedulesPaused'] = True; persist()
        drain(receipt); persist()
        # Save exact overwritten files before touching code. Keep all rollback
        # files until the coordinator's remaining live acceptance gates pass.
        for name, relative in plan.items():
            target = safe_target(relative)
            row = {'target': relative, 'existed': target.exists()}
            if target.exists():
                if not target.is_file(): raise RuntimeError('install_target_not_file')
                backup = folder / 'previous' / relative; backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup); row['sha256'] = sha(backup)
            receipt['rollbackFiles'].append(row)
        persist()
        print(json.dumps({'phase': 'fresh-local-backup'}), flush=True)
        backup_started = time.time()
        run(['python3', str(source / 'deploy/backup.py')], timeout=160)
        backup = json.loads((ROOT / 'backup-receipt.json').read_text()); archive = Path(backup['path']).resolve()
        if not archive.is_relative_to((ROOT / 'backups').resolve()) or not archive.is_file() or archive.stat().st_mtime < backup_started - 2 or not backup.get('archiveInventoryVerified'):
            raise RuntimeError('fresh_backup_not_verified')
        receipt['localBackup'] = {'path': str(archive), 'bytes': archive.stat().st_size, 'sha256': sha(archive), 'offsite': False}
        persist()
        # Reverify source immediately before installation and refuse drift.
        verify_source(source, commit)
        copied = True
        for name, relative in plan.items():
            target = safe_target(relative); replace_file(source / name, target, nonce)
            if sha(target) != manifest['files'][name]: raise RuntimeError('installed_source_hash_differs')
            receipt['installed'].append({'path': relative, 'sha256': manifest['files'][name]}); persist()
        print(json.dumps({'phase': 'additive-migrations', 'count': len(receipt['pendingMigrations'])}), flush=True)
        run(['python3', str(ROOT / 'deploy/apply-migrations.py')], timeout=180,
            env={**os.environ, 'AFAVERS_PAUSE_REMINDER_SCHEDULE': '1'})
        receipt['migrationReceipt'] = json.loads((ROOT / 'migration-receipt.json').read_text())
        rows = schedule_rows()
        if any(row['active'] for row in rows): raise RuntimeError('managed_schedule_resumed_before_worker_ready')
        persist(); restarted = True
        receipt['afterServices'] = restart_functions(owner)
        if not reminder_unauthorized(): raise RuntimeError('new_reminder_unauthorized_probe_failed')
        if protected_hashes() != protected: raise RuntimeError('protected_configuration_changed')
        if any(receipt['afterServices'][name] != baseline[name] for name in ('db', 'auth', 'rest')):
            raise RuntimeError('untargeted_service_identity_changed')
        ready = True; receipt['success'] = True
    except (Exception, KeyboardInterrupt) as error:
        code = str(error) if re.fullmatch(r'[a-z0-9_]{1,100}', str(error)) else 'backend_install_failed_or_interrupted'
        receipt['failure'] = code
        # Additive SQL stays in place. Restore only the exact known worker files,
        # including removal of newly installed worker paths, never live data.
        if copied:
            try:
                for row in receipt['rollbackFiles']:
                    if not row['target'].startswith('functions/'):
                        continue
                    target = safe_target(row['target'])
                    if row['existed']:
                        backup = folder / 'previous' / row['target']
                        if sha(backup) != row['sha256']: raise RuntimeError('rollback_file_hash_differs')
                        replace_file(backup, target, nonce)
                    else: target.unlink(missing_ok=True)
                receipt['workerFilesRolledBack'] = True
                if restarted: receipt['rollbackServices'] = restart_functions(owner)
            except (Exception, KeyboardInterrupt):
                receipt['workerRollbackIncomplete'] = True
    finally:
        # Once recovery starts, another signal must not interrupt schedule repair.
        signal.signal(signal.SIGINT, signal.SIG_IGN); signal.signal(signal.SIGTERM, signal.SIG_IGN)
        if paused:
            try:
                current = schedule_rows(); by_name = {row['name']: row for row in current}
                if not receipt.get('workerRollbackIncomplete'):
                    for row in previous:
                        actual = by_name.get(row['name'])
                        if not actual or actual['id'] != row['id']: raise RuntimeError('managed_schedule_identity_changed')
                        set_schedule(actual['id'], row['active'])
                    if TASKS[2] not in {row['name'] for row in previous} and TASKS[2] in by_name:
                        set_schedule(by_name[TASKS[2]]['id'], ready)
                    receipt['schedulesRestored'] = True
                receipt['finalSchedules'] = schedule_rows()
            except Exception:
                receipt['scheduleRestoreFailed'] = True
                receipt.setdefault('failure', 'managed_schedule_restore_failed')
        try:
            receipt['protectedAfter'] = protected_hashes()
            receipt['protectedUnchanged'] = not protected or protected == receipt['protectedAfter']
        except Exception: receipt['protectedUnchanged'] = False
        receipt['finishedAt'] = time.time()
        if not receipt['protectedUnchanged']:
            receipt.setdefault('failure', 'protected_configuration_changed')
        receipt['success'] = bool(receipt['success'] and receipt.get('schedulesRestored') and receipt['protectedUnchanged'])
        persist()
        (folder / 'retention.json').write_text(json.dumps({'owner': owner, 'lifecycle': 'temporary',
            'reason': 'Known-good exact worker rollback and release acceptance evidence; retire after coordinator acceptance',
            'keepUntil': int(time.time() + 24 * 3600)}, indent=2))
        print(json.dumps({'receipt': str(receipt_path), 'success': receipt['success'], 'failure': receipt.get('failure'),
                          'schedulesRestored': receipt['schedulesRestored'], 'schemaRollbackAttempted': False}), flush=True)
    return 0 if receipt['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
