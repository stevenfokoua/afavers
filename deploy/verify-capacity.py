"""Bounded real-HTTP Afavers capacity probe; invoke under the VPS Docker runner.

No email is sent. Only this run's metadata-tagged auth users and private fixtures
are written. Credentials/tokens stay in memory. Every exit attempts exact cleanup.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path('/opt/afavers')
PUBLIC = 'https://afavers.saintcreators.com'
INTERNAL = 'http://172.17.0.1:18980'
SENDER = 'afavers@saintcreators.com'
PURPOSE = 'disposable-capacity-verification'


def utc(value=None):
    return datetime.fromtimestamp(time.time() if value is None else value, timezone.utc).isoformat()


def timestamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (AttributeError, TypeError, ValueError):
        return None


def percentile(values, quantile):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * quantile) - 1)] if ordered else None


def summaries(events):
    result = {}
    for name in sorted({event['operation'] for event in events} | {'all'}):
        group = events if name == 'all' else [event for event in events if event['operation'] == name]
        values = [event['elapsedMs'] for event in group]
        result[name] = {'requests': len(group), 'failures': sum(not event['ok'] for event in group),
                        'p50Ms': percentile(values, .5), 'p95Ms': percentile(values, .95),
                        'maxMs': max(values, default=None), 'bytesRead': sum(event['bytes'] for event in group)}
    return result


def numeric_percent(value):
    try:
        return float(str(value).rstrip('%'))
    except (TypeError, ValueError):
        return None


def command(args, timeout=8):
    return subprocess.check_output(args, text=True, timeout=timeout, stderr=subprocess.DEVNULL)


def read_memory():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        parts = line.split()
        if parts[0] in ('MemAvailable:', 'SwapTotal:', 'SwapFree:'):
            values[parts[0][:-1]] = int(parts[1])
    swap = {}
    for line in Path('/proc/vmstat').read_text().splitlines():
        name, value = line.split()
        if name in ('pswpin', 'pswpout'):
            swap[name] = int(value) * os.sysconf('SC_PAGE_SIZE')
    cpu = [int(value) for value in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    return {'availableMemoryMiB': values.get('MemAvailable', 0) / 1024,
            'usedSwapMiB': (values.get('SwapTotal', 0) - values.get('SwapFree', 0)) / 1024,
            'swapInBytes': swap.get('pswpin', 0), 'swapOutBytes': swap.get('pswpout', 0),
            'cpuTotalTicks': sum(cpu), 'cpuIdleTicks': cpu[3] + cpu[4]}


def inspect_services(owner):
    output = command(['docker', 'compose', '-f', str(ROOT / 'compose.yml'), 'ps', '--format', 'json'])
    rows = [json.loads(line) for line in output.splitlines() if line.startswith('{')]
    if {row.get('Service') for row in rows} != {'db', 'auth', 'rest', 'functions'}:
        raise RuntimeError('expected_services_missing')
    services = []
    for row in rows:
        actual = command(['docker', 'inspect', '--format', '{{index .Config.Labels "local.agent.owner"}}', row['ID']]).strip()
        if actual != owner:
            raise RuntimeError('service_owner_differs')
        services.append({'service': row['Service'], 'id': row['ID'], 'health': row['Health'], 'state': row['State']})
    return sorted(services, key=lambda row: row['service'])


def sample(services, previous=None):
    result = {'at': time.time(), 'utc': utc(), **read_memory(), 'loadAverage': list(os.getloadavg())}
    if previous:
        total = result['cpuTotalTicks'] - previous['cpuTotalTicks']
        idle = result['cpuIdleTicks'] - previous['cpuIdleTicks']
        result['hostCpuPercent'] = round(100 * (total - idle) / total, 2) if total > 0 else None
    else:
        result['hostCpuPercent'] = None
    stats = command(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *[row['id'] for row in services]])
    result['containers'] = [{'id': row.get('ID'), 'cpuPercent': numeric_percent(row.get('CPUPerc')),
                             'memory': row.get('MemUsage'), 'memoryPercent': numeric_percent(row.get('MemPerc')),
                             'pids': row.get('PIDs')} for line in stats.splitlines() if line.strip() for row in [json.loads(line)]]
    if len(result['containers']) != 4:
        raise RuntimeError('container_stats_unavailable')
    queue = [json.loads(line) for line in command(['postqueue', '-j']).splitlines() if line.strip()]
    own = [row for row in queue if row.get('sender') == SENDER]
    result['mailQueue'] = {'count': len(own), 'oldestAgeSeconds': max((max(0, time.time() - row.get('arrival_time', time.time())) for row in own), default=0)}
    disk = shutil.disk_usage(ROOT)
    result['disk'] = {'free': disk.free, 'total': disk.total}
    return result


def pressure(snapshot, baseline, cpu_samples=()):
    issues = []
    if snapshot['availableMemoryMiB'] < 512:
        issues.append('available_memory_below_512MiB')
    if snapshot['disk']['free'] < max(1024 ** 3, snapshot['disk']['total'] * .05):
        issues.append('low_disk')
    if snapshot['swapOutBytes'] - baseline['swapOutBytes'] > 64 * 1024 ** 2:
        issues.append('swap_out_exceeded_64MiB')
    if snapshot['mailQueue']['count'] > 20 or snapshot['mailQueue']['oldestAgeSeconds'] > 1800:
        issues.append('afavers_mail_queue_pressure')
    if any(row.get('memoryPercent') is not None and row['memoryPercent'] >= 95 for row in snapshot['containers']):
        issues.append('afavers_container_memory_above_95_percent')
    recent = [row.get('hostCpuPercent') for row in cpu_samples[-3:]]
    if len(recent) == 3 and all(value is not None and value >= 95 for value in recent):
        issues.append('host_cpu_above_95_percent_for_three_samples')
    if snapshot['loadAverage'][0] > max(1, os.cpu_count() or 1) * 4:
        issues.append('host_load_pressure')
    return issues


def resource_summary(samples):
    if not samples:
        return {}
    containers = {}
    for snapshot in samples:
        for row in snapshot['containers']:
            entry = containers.setdefault(row['id'], {'maximumCpuPercent': None, 'maximumMemoryPercent': None})
            for source, target in [('cpuPercent', 'maximumCpuPercent'), ('memoryPercent', 'maximumMemoryPercent')]:
                if row.get(source) is not None:
                    entry[target] = max(entry[target] or 0, row[source])
    return {'minimumAvailableMemoryMiB': min(row['availableMemoryMiB'] for row in samples),
            'maximumHostCpuPercent': max((row['hostCpuPercent'] for row in samples if row['hostCpuPercent'] is not None), default=None),
            'swapOutIncreaseBytes': max(row['swapOutBytes'] for row in samples) - samples[0]['swapOutBytes'],
            'maximumLoad1': max(row['loadAverage'][0] for row in samples),
            'maximumAfaversQueuedMessages': max(row['mailQueue']['count'] for row in samples),
            'maximumAfaversMailAgeSeconds': max(row['mailQueue']['oldestAgeSeconds'] for row in samples),
            'containers': containers}


class Probe:
    def __init__(self, env, owner, folder, run_id):
        self.env, self.owner, self.folder, self.run_id = env, owner, folder, run_id
        self.manifest_path = folder / 'fixtures.private.json'
        self.manifest = {'owner': owner, 'runId': run_id, 'purpose': PURPOSE, 'users': [], 'cleanupComplete': False}
        self.events, self.failures = [], []
        self.stop = threading.Event()
        self.lock = threading.Lock()

    def persist(self):
        pending = self.manifest_path.with_suffix('.pending')
        pending.write_text(json.dumps(self.manifest, indent=2)); pending.chmod(0o600); pending.replace(self.manifest_path)

    def request(self, path, method='GET', body=None, token=None, public=False, timeout=6, prefer=None, cron=False):
        headers = {'apikey': self.env['ANON_KEY'], 'Authorization': 'Bearer ' + (token or self.env['ANON_KEY']), 'Content-Type': 'application/json'}
        if prefer:
            headers['Prefer'] = prefer
        if cron:
            headers.update({'x-cron-secret': self.env['CRON_SECRET'], 'x-afavers-verification': '1'})
        url = (PUBLIC + ('/backend' if path.startswith(('/auth/', '/rest/', '/functions/')) else '') if public else INTERNAL) + path
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, method=method, data=data, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    raise RuntimeError('response_size_limit')
                return response.status, json.loads(raw) if raw and 'json' in response.headers.get('Content-Type', '') else None, len(raw)
        except urllib.error.HTTPError as error:
            # Never return/log server bodies, URLs or credentials on failure.
            return error.code, None, 0

    def service(self, path, method='GET', body=None, prefer=None):
        return self.request(path, method, body, self.env['SERVICE_ROLE_KEY'], prefer=prefer)

    def monitored(self, index, name, path, token, method='GET', body=None, expected=(200,), validate=None):
        started = time.time(); status = 0; size = 0; ok = False
        try:
            status, result, size = self.request(path, method, body, token, public=True)
            ok = status in expected and (validate(result) if validate else True)
            return result
        except Exception:
            return None
        finally:
            elapsed = (time.time() - started) * 1000
            event = {'user': index, 'operation': name, 'startedAt': started, 'finishedAt': time.time(), 'elapsedMs': round(elapsed, 2), 'status': status, 'bytes': size, 'ok': bool(ok)}
            with self.lock:
                self.events.append(event)
                if not ok or elapsed > 5000:
                    self.failures.append(name + ('_failed' if not ok else '_over_5_seconds'))
                    self.stop.set()

    def provision(self, count):
        # Save all planned addresses before creating anything, so interruption
        # before an admin response can still be reconciled by owner+run metadata.
        self.manifest['users'] = [{'email': f'capacity-{self.run_id}-{index}@example.invalid', 'index': index} for index in range(count)]
        self.persist()
        identities = []
        for row in self.manifest['users']:
            password = secrets.token_urlsafe(24)
            status, user, _ = self.service('/auth/v1/admin/users', 'POST', {'email': row['email'], 'password': password, 'email_confirm': True, 'user_metadata': {'afavers_resource_owner': self.owner, 'capacity_run': self.run_id, 'purpose': PURPOSE}})
            if status not in (200, 201) or not user or not user.get('id'):
                raise RuntimeError('test_user_creation_failed')
            row['authId'] = user['id']; self.persist()
            status, session, _ = self.request('/auth/v1/token?grant_type=password', 'POST', {'email': row['email'], 'password': password}, public=True)
            if status != 200 or not session or not session.get('access_token'):
                raise RuntimeError('test_user_login_failed')
            token = session['access_token']
            status, profiles, _ = self.request('/rest/v1/users?select=id,email&auth_user_id=eq.' + user['id'], token=token)
            if status != 200 or not profiles or len(profiles) != 1 or profiles[0]['email'] != row['email']:
                raise RuntimeError('test_profile_unavailable')
            row['profileId'] = profiles[0]['id']; self.persist()
            # New-user defaults must not expand the shared import's preferences
            # or subscribe a synthetic inbox while the capacity test runs.
            for table in ('user_settings', 'job_alerts'):
                status, _, _ = self.service('/rest/v1/' + table + '?user_id=eq.' + str(row['profileId']), 'DELETE')
                if status not in (200, 204):
                    raise RuntimeError('test_defaults_removal_failed')
            status, jobs, _ = self.request('/rest/v1/jobs', 'POST', {'external_id': 'capacity_' + self.run_id + '_' + str(row['index']), 'title': 'Private capacity fixture ' + self.run_id, 'company': 'Afavers disposable capacity verification', 'location': 'Test fixture', 'description': 'Private verification data; never a real vacancy.', 'source': 'manual', 'is_manual': True, 'owner_user_id': row['profileId'], 'url': ''}, token, prefer='return=representation')
            if status not in (200, 201) or not jobs or len(jobs) != 1:
                raise RuntimeError('private_fixture_creation_failed')
            row['jobId'] = jobs[0]['id']; self.persist()
            status, _, _ = self.request('/rest/v1/user_jobs', 'POST', {'user_id': row['profileId'], 'job_id': row['jobId'], 'status': 'saved', 'notes': 'Capacity fixture'}, token)
            if status not in (200, 201, 204):
                raise RuntimeError('private_overlay_creation_failed')
            identities.append({**row, 'token': token})
        return identities

    def active_import(self, run_id=None):
        path = '/rest/v1/automation_runs?select=id,status,started_at,finished_at,lease_expires_at,trigger&task=eq.fetch-jobs&order=started_at.desc&limit=1'
        if run_id:
            path += '&id=eq.' + run_id
        status, rows, _ = self.service(path)
        if status != 200:
            raise RuntimeError('import_history_unavailable')
        return rows[0] if rows else None

    def worker(self, identity, end_at):
        index, token = identity['index'], identity['token']
        own = f'user_id=eq.{identity["profileId"]}&job_id=eq.{identity["jobId"]}'
        first = True; round_index = 0
        while time.monotonic() < end_at and not self.stop.is_set():
            if first:
                self.monitored(index, 'initial_job_snapshot', '/rest/v1/jobs?select=id,title,company,location,description,url,source,posted_date,deadline,salary,is_active,created_at,updated_at,owner_user_id,is_manual&owner_user_id=is.null&is_manual=eq.false&order=id.asc&limit=1000', token, validate=lambda rows: isinstance(rows, list))
                first = False
            if self.stop.is_set(): break
            self.monitored(index, 'frontend_version', '/version.json', token, validate=lambda value: isinstance(value, dict) and bool(value.get('version')))
            if self.stop.is_set(): break
            self.monitored(index, 'public_results', '/rest/v1/public_jobs?select=id,title,company,location,url,salary,source,posted_date&order=posted_date.desc.nullslast,id.desc&limit=50', token, validate=lambda rows: isinstance(rows, list))
            if self.stop.is_set(): break
            self.monitored(index, 'feed_health', '/rest/v1/rpc/get_feed_health', token, 'POST', {}, validate=lambda value: isinstance(value, dict) and 'latest' in value)
            if self.stop.is_set(): break
            note = f'Capacity fixture {self.run_id} round {round_index}'
            self.monitored(index, 'private_note_write', '/rest/v1/user_jobs?' + own, token, 'PATCH', {'status': 'preparing', 'notes': note}, expected=(200, 204))
            if self.stop.is_set(): break
            self.monitored(index, 'private_note_read', '/rest/v1/user_jobs?select=job_id,status,notes&' + own, token, validate=lambda rows: isinstance(rows, list) and len(rows) == 1 and rows[0].get('notes') == note and rows[0].get('status') == 'preparing')
            round_index += 1
            # Deliberate per-user pacing: this is a small shared-VPS pilot probe.
            self.stop.wait(1)

    def reconcile(self):
        missing = {row['email']: row for row in self.manifest['users'] if not row.get('authId')}
        if not missing:
            return
        # GoTrue admin paging is read-only and bounded. Match exact planned
        # address AND immutable run/owner metadata; never delete by name alone.
        for page in range(1, 21):
            status, payload, _ = self.service(f'/auth/v1/admin/users?page={page}&per_page=200')
            if status != 200 or not isinstance(payload, dict) or not isinstance(payload.get('users'), list):
                raise RuntimeError('test_user_reconciliation_unavailable')
            users = payload['users']
            for user in users:
                meta = user.get('user_metadata') or {}
                if user.get('email') in missing and meta.get('afavers_resource_owner') == self.owner and meta.get('capacity_run') == self.run_id and meta.get('purpose') == PURPOSE:
                    missing.pop(user['email'])['authId'] = user['id']
            if not missing or len(users) < 200:
                self.persist(); return
        if missing:
            raise RuntimeError('test_user_reconciliation_page_limit')

    def cleanup(self):
        remaining = []
        try:
            self.reconcile()
        except Exception:
            remaining.extend(row['index'] for row in self.manifest['users'] if not row.get('authId'))
        for row in self.manifest['users']:
            if not row.get('authId'):
                continue
            try:
                status, user, _ = self.service('/auth/v1/admin/users/' + row['authId'])
                if status != 404:
                    meta = (user or {}).get('user_metadata') or {}
                    if status != 200 or user.get('email') != row['email'] or meta.get('afavers_resource_owner') != self.owner or meta.get('capacity_run') != self.run_id or meta.get('purpose') != PURPOSE:
                        raise RuntimeError('test_user_metadata_differs')
                    # Capture the profile if creation succeeded but its response
                    # was lost before the original manifest update.
                    status, profiles, _ = self.service('/rest/v1/users?select=id&auth_user_id=eq.' + row['authId'])
                    if status != 200 or not isinstance(profiles, list) or len(profiles) > 1:
                        raise RuntimeError('test_profile_cleanup_lookup_failed')
                    if profiles:
                        row['profileId'] = profiles[0]['id']; self.persist()
                    status, _, _ = self.service('/auth/v1/admin/users/' + row['authId'], 'DELETE')
                    if status not in (200, 204):
                        raise RuntimeError('test_user_retirement_failed')
                    status, _, _ = self.service('/auth/v1/admin/users/' + row['authId'])
                    if status != 404:
                        raise RuntimeError('test_user_still_present')
                checks = [('users', 'auth_user_id=eq.' + row['authId'])]
                if row.get('profileId'):
                    checks += [('jobs', 'owner_user_id=eq.' + str(row['profileId'])), ('user_jobs', 'user_id=eq.' + str(row['profileId'])), ('user_settings', 'user_id=eq.' + str(row['profileId'])), ('job_alerts', 'user_id=eq.' + str(row['profileId']))]
                for table, predicate in checks:
                    status, rows, _ = self.service('/rest/v1/' + table + '?select=*&limit=1&' + predicate)
                    if status != 200 or rows != []:
                        raise RuntimeError('test_rows_still_present')
            except Exception:
                remaining.append(row['index'])
        self.manifest.update(cleanupComplete=not remaining, remainingUserIndexes=sorted(set(remaining)))
        self.persist()
        if not remaining:
            self.manifest_path.unlink()
            (self.folder / 'retention.json').unlink(missing_ok=True)
        else:
            (self.folder / 'retention.json').write_text(json.dumps({'owner': self.owner, 'lifecycle': 'temporary', 'reason': 'Retry exact metadata-checked capacity fixture cleanup after API recovery', 'keepUntil': int(time.time() + 24 * 3600)}, indent=2))
        return {'complete': not remaining, 'remainingUserCount': len(set(remaining)), 'credentialFilesCreated': False}


def load_environment(owner):
    if ROOT.resolve() != Path('/opt/afavers') or (ROOT / '.resource-owner').read_text().strip() != owner:
        raise RuntimeError('deployment_owner_differs')
    values = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if line and not line.startswith('#'))
    if not all(values.get(name) for name in ('ANON_KEY', 'SERVICE_ROLE_KEY', 'CRON_SECRET')):
        raise RuntimeError('required_configuration_missing')
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--users', type=int, choices=range(3, 6), default=3)
    parser.add_argument('--seconds', type=int, default=30)
    parser.add_argument('--import-mode', choices=('observe', 'trigger'), default='observe', help='Observe an existing run, or explicitly invoke one monitored import.')
    parser.add_argument('--p95-limit-ms', type=int, default=2000)
    parser.add_argument('--cleanup-only', type=Path, help='Retry cleanup from an existing owner-marked capacity verification folder.')
    args = parser.parse_args()
    if not 15 <= args.seconds <= 90 or not 250 <= args.p95_limit_ms <= 5000:
        parser.error('seconds must be 15..90 and p95-limit-ms 250..5000')
    owner = os.environ['AGENT_RESOURCE_OWNER']
    env = load_environment(owner)
    if args.cleanup_only:
        folder = args.cleanup_only.resolve()
        if not folder.is_relative_to(ROOT) or (folder / '.owner').read_text().strip() != owner:
            raise RuntimeError('cleanup_folder_owner_differs')
        manifest = json.loads((folder / 'fixtures.private.json').read_text())
        if manifest.get('owner') != owner or manifest.get('purpose') != PURPOSE:
            raise RuntimeError('cleanup_manifest_owner_differs')
        probe = Probe(env, owner, folder, manifest['runId']); probe.manifest = manifest
        result = probe.cleanup(); print(json.dumps({'cleanup': result})); return 0 if result['complete'] else 1
    run_id = uuid.uuid4().hex[:20]
    folder = ROOT / ('capacity-verification-' + run_id)
    folder.mkdir(mode=0o700); (folder / '.owner').write_text(owner)
    probe = Probe(env, owner, folder, run_id)
    report = {'owner': owner, 'runId': run_id, 'startedAt': utc(), 'users': args.users, 'requestedWorkloadSeconds': args.seconds, 'importMode': args.import_mode, 'scope': 'Bounded real HTTPS REST/static/owned-write pilot during one monitored import; not a browser-render or maximum-load benchmark.', 'failures': [], 'samples': []}
    services = []; import_future = None; executor = None; import_row = None
    def interrupted(_signum, _frame):
        probe.stop.set(); raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        services = inspect_services(owner)
        if any(row['state'] != 'running' or row['health'] != 'healthy' for row in services):
            raise RuntimeError('unhealthy_preflight')
        baseline = sample(services); report['samples'].append(baseline)
        issues = pressure(baseline, baseline)
        if issues:
            report['failures'].extend(issues); raise RuntimeError('preflight_pressure')
        if args.import_mode == 'observe':
            import_row = probe.active_import()
            if not import_row or import_row['status'] != 'running' or (timestamp(import_row['lease_expires_at']) or 0) <= time.time():
                raise RuntimeError('no_live_monitored_import')
        identities = probe.provision(args.users)
        executor = ThreadPoolExecutor(max_workers=args.users + 1, thread_name_prefix='afavers-capacity')
        if args.import_mode == 'trigger':
            import_future = executor.submit(probe.request, '/functions/v1/fetch-jobs', 'POST', {}, None, False, 145, None, True)
            ready_until = time.monotonic() + 10
            while time.monotonic() < ready_until:
                latest = probe.active_import()
                if latest and latest['status'] == 'running' and (timestamp(latest['lease_expires_at']) or 0) > time.time():
                    import_row = latest; break
                if import_future.done(): break
                probe.stop.wait(.25)
            if not import_row:
                raise RuntimeError('monitored_import_not_running')
        report['importRunId'] = import_row['id']
        report['importTrigger'] = import_row.get('trigger')
        end_at = time.monotonic() + args.seconds
        futures = [executor.submit(probe.worker, identity, end_at) for identity in identities]
        previous = baseline
        while not all(future.done() for future in futures):
            probe.stop.wait(2)
            current = sample(services, previous); report['samples'].append(current); previous = current
            issues = pressure(current, baseline, report['samples'])
            if issues:
                report['failures'].extend(issues); probe.stop.set()
            print(json.dumps({'phase': 'workload', 'requests': len(probe.events), 'failures': len(probe.failures), 'availableMemoryMiB': round(current['availableMemoryMiB']), 'pressure': issues}), flush=True)
        for future in futures:
            future.result()
        probe.stop.set()
        # An import remains an authorized real worker, not a disposable process
        # to kill. Continue bounded observation until it finishes or lease expiry.
        observe_until = time.monotonic() + 150
        while time.monotonic() < observe_until:
            latest = probe.active_import(import_row['id'])
            if not latest:
                raise RuntimeError('monitored_import_disappeared')
            import_row = latest
            if latest['status'] != 'running': break
            if (timestamp(latest['lease_expires_at']) or 0) <= time.time(): break
            if import_future and import_future.done(): break
            current = sample(services, previous); report['samples'].append(current); previous = current
            issues = pressure(current, baseline, report['samples'])
            if issues: report['failures'].extend(issues)
            print(json.dumps({'phase': 'observe-import', 'status': latest['status'], 'availableMemoryMiB': round(current['availableMemoryMiB'])}), flush=True)
            time.sleep(3)
        report['importOutcome'] = import_row['status']
        if import_future:
            status, result, _ = import_future.result(timeout=150)
            report['importHttpStatus'] = status
            if status == 409:
                report['importRequestReusedExistingRun'] = True
            elif status != 200 or not isinstance(result, dict) or not result.get('success'):
                report['failures'].append('import_request_failed')
        if import_row['status'] not in ('succeeded', 'partial'):
            report['failures'].append('import_not_completed')
        finish = timestamp(import_row.get('finished_at')) or time.time()
        start = timestamp(import_row.get('started_at')) or finish
        overlapping = [event for event in probe.events if event['startedAt'] <= finish and event['finishedAt'] >= start]
        report['overlappingRequests'] = len(overlapping)
        report['overlappingUsers'] = len({event['user'] for event in overlapping})
        if report['overlappingUsers'] != args.users:
            report['failures'].append('not_all_users_overlapped_monitored_import')
        after_services = inspect_services(owner)
        report['serviceIdentityAndHealthPreserved'] = services == after_services
        if services != after_services:
            report['failures'].append('service_identity_or_health_changed')
    except KeyboardInterrupt:
        report['failures'].append('interrupted')
    except Exception as error:
        code = str(error) if str(error).replace('_', '').isalnum() and len(str(error)) < 90 else 'capacity_probe_failed'
        report['failures'].append(code)
    finally:
        probe.stop.set()
        if executor:
            executor.shutdown(wait=True, cancel_futures=True)
        report['cleanup'] = probe.cleanup()
        report['requests'] = probe.events
        report['metrics'] = summaries(probe.events)
        report['resources'] = resource_summary(report['samples'])
        report['failures'].extend(probe.failures)
        if any(row['p95Ms'] is None or row['p95Ms'] > args.p95_limit_ms for row in report['metrics'].values()):
            report['failures'].append('latency_gate_not_met')
        if not report['cleanup']['complete']:
            report['failures'].append('cleanup_incomplete')
        report['failures'] = sorted(set(report['failures']))
        report['finishedAt'] = utc(); report['passed'] = not report['failures']
        path = folder / 'report.json'; path.write_text(json.dumps(report, indent=2)); path.chmod(0o600)
        print(json.dumps({'report': str(path), 'passed': report['passed'], 'failures': report['failures'], 'metrics': report['metrics'], 'cleanup': report['cleanup']}, indent=2), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
