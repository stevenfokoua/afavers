"""Small Afavers-only health checks. Run Docker reads through the resource runner."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from email.message import EmailMessage
import json
import os
from pathlib import Path
import shutil
import smtplib
import socket
import ssl
import subprocess
import time
import urllib.request

DOMAIN = 'afavers.saintcreators.com'
SENDER = 'afavers@saintcreators.com'


def age_seconds(value, now):
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return max(0, now - stamp.timestamp())
    except (ValueError, TypeError):
        return None


def evaluate(snapshot, now):
    """Stable issue codes; never expose credentials, account IDs or mail bodies."""
    issues = {}
    if not snapshot.get('authHealthy'):
        issues['auth_unavailable'] = 'The public authentication health check failed.'
    if not snapshot.get('frontendHealthy'):
        issues['frontend_unavailable'] = 'The public frontend/version check failed.'
    services = snapshot.get('services', [])
    if len(services) != 4 or any(s.get('state') != 'running' or s.get('health') != 'healthy' for s in services):
        issues['backend_unhealthy'] = 'One or more Afavers backend services are unhealthy.'
    if snapshot.get('collectionErrors'):
        issues['health_collection_incomplete'] = 'Some local health checks could not be completed.'
    disk = snapshot.get('disk', {})
    if disk.get('free', 0) < max(1024**3, disk.get('total', 0) * .05):
        issues['disk_low'] = 'Less than 1 GiB or 5 percent disk space is available.'
    if snapshot.get('availableMemoryMiB', 0) < 256:
        issues['memory_low'] = 'Available host memory is below 256 MiB.'
    expiry = snapshot.get('tlsExpiresAt')
    if expiry is None or expiry - now < 14 * 86400:
        issues['tls_renewal'] = 'The TLS certificate is unavailable or expires within 14 days.'
    feed = snapshot.get('feed')
    if not isinstance(feed, dict):
        issues['feed_status_unavailable'] = 'Import outcome history could not be read.'
    else:
        usable_age = age_seconds(feed.get('last_usable_at'), now)
        latest = feed.get('latest') or {}
        if usable_age is None or usable_age > 6 * 3600:
            issues['feed_stale'] = 'No usable job refresh has completed within six hours.'
        if latest.get('status') in ('failed', 'timed_out'):
            issues['import_failed'] = 'The latest import failed or timed out.'
        sources = latest.get('sources') or []
        if any(s.get('status') in ('failed', 'error') for s in sources):
            issues['source_failed'] = 'A configured job source failed during the latest run.'
        alerts = feed.get('alerts') or {}
        if alerts.get('status') in ('failed', 'timed_out', 'partial'):
            issues['job_alert_failure'] = 'Job-alert processing needs attention.'
    automation = snapshot.get('automation', {})
    if automation.get('ledgerReadUnavailable'):
        issues['delivery_status_unavailable'] = 'Delivery outcome ledgers could not be read.'
    if automation.get('uncertainDeliveries', 0):
        issues['mail_delivery_uncertain'] = 'A delivery has an uncertain SMTP outcome and needs review.'
    if automation.get('failedDeliveries', 0):
        issues['mail_delivery_failed'] = 'A recent reminder or job-alert delivery failed permanently.'
    if automation.get('oldInFlight', 0) or automation.get('acceptedBacklog', 0):
        issues['mail_delivery_stalled'] = 'A delivery lease or accepted-mail receipt has not been finalized.'
    tasks = automation.get('tasks', {})
    for task, maximum_age in [('job-alerts', 6 * 3600), ('send-reminders', 5 * 60)]:
        latest = tasks.get(task, {})
        age = age_seconds(latest.get('started_at'), now)
        if age is None or age > maximum_age:
            issues[task + '_stale'] = task + ' has no recent observed worker run.'
        elif latest.get('status') in ('failed', 'timed_out'):
            issues[task + '_failed'] = task + ' failed or exceeded its lease.'
    for task in automation.get('disabledSchedules', []):
        issues['schedule_disabled_' + task] = 'The managed schedule is disabled: ' + task
    for task in automation.get('missingSchedules', []):
        issues['schedule_missing_' + task] = 'The managed schedule is missing: ' + task
    queue = snapshot.get('afaversMailQueue', {})
    if queue.get('unavailable'):
        issues['mail_queue_status_unavailable'] = 'The local outgoing mail queue could not be inspected.'
    if queue.get('oldestAgeSeconds', 0) > 1800 or queue.get('count', 0) > 20:
        issues['mail_queue_stuck'] = 'Afavers outgoing mail has waited over 30 minutes or exceeds 20 queued messages.'
    backup_age = age_seconds(snapshot.get('lastLocalBackupAt'), now)
    if backup_age is None or backup_age > 48 * 3600:
        issues['local_backup_stale'] = 'The existing local database dump is over 48 hours old or unavailable.'
    return issues


def advance(previous, issues, now):
    """Two observations to open/close; unchanged incidents stay quiet."""
    state = dict(previous or {})
    events = []
    for code in sorted(set(state) | set(issues)):
        row = dict(state.get(code, {}))
        failing = code in issues
        row['failures'] = row.get('failures', 0) + 1 if failing else 0
        row['healthy'] = 0 if failing else row.get('healthy', 0) + 1
        active = row.get('active', False)
        if failing:
            row['message'] = issues[code]
            if row['failures'] >= 2 and (not active or (not row.get('deliveryUnknown') and now - row.get('lastNotification', 0) >= 6 * 3600)):
                events.append({'code': code, 'state': 'alert', 'message': issues[code]})
                row.update(active=True, lastNotification=now)
        elif active and row['healthy'] >= 2:
            events.append({'code': code, 'state': 'recovered', 'message': row.get('message', code)})
            row.update(active=False, lastNotification=now)
        if failing or row.get('active'):
            state[code] = row
        else:
            state.pop(code, None)
    return state, events


def command(args, timeout=15):
    return subprocess.check_output(args, text=True, timeout=timeout)


def collect_backend(root, owner):
    try:
        actual = command(['docker', 'inspect', '--format', '{{index .Config.Labels "local.agent.owner"}}', 'afavers-db-1']).strip()
        if actual != owner:
            return [], ['docker_owner_mismatch']
        output = command(['docker', 'compose', '-f', str(root / 'compose.yml'), 'ps', '--format', 'json'])
        return [{'name': s['Service'], 'state': s['State'], 'health': s['Health']} for line in output.splitlines() if line.startswith('{') for s in [json.loads(line)]], []
    except Exception:
        return [], ['docker_unavailable']


def collect(root, owner):
    env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines() if line and not line.startswith('#'))
    now = time.time()
    services, collection_errors = collect_backend(root, owner)
    snapshot = {'checkedAt': datetime.fromtimestamp(now, timezone.utc).isoformat(), 'services': services, 'collectionErrors': collection_errors}
    for label, path in [('authHealthy', '/backend/auth/v1/health'), ('frontendHealthy', '/version.json')]:
        try:
            with urllib.request.urlopen('https://' + DOMAIN + path, timeout=10) as response:
                snapshot[label] = response.status == 200 and isinstance(json.load(response), dict)
        except Exception:
            snapshot[label] = False
    usage = shutil.disk_usage(root)
    snapshot['disk'] = {'total': usage.total, 'free': usage.free}
    try:
        memory = {parts[0].rstrip(':'): int(parts[1]) for line in Path('/proc/meminfo').read_text().splitlines() if (parts := line.split()) and parts[0] in ('MemAvailable:', 'SwapTotal:', 'SwapFree:')}
    except Exception:
        memory = {}; snapshot['collectionErrors'].append('memory_unavailable')
    snapshot['availableMemoryMiB'] = memory.get('MemAvailable', 0) // 1024
    snapshot['usedSwapMiB'] = (memory.get('SwapTotal', 0) - memory.get('SwapFree', 0)) // 1024
    try:
        with socket.create_connection((DOMAIN, 443), timeout=10) as sock:
            with ssl.create_default_context().wrap_socket(sock, server_hostname=DOMAIN) as connection:
                snapshot['tlsExpiresAt'] = ssl.cert_time_to_seconds(connection.getpeercert()['notAfter'])
    except Exception:
        snapshot['tlsExpiresAt'] = None
    try:
        req = urllib.request.Request('http://172.17.0.1:18980/rest/v1/rpc/get_feed_health', data=b'{}', headers={'apikey': env['ANON_KEY'], 'Authorization': 'Bearer ' + env['SERVICE_ROLE_KEY'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as response:
            snapshot['feed'] = json.load(response)
    except Exception:
        snapshot['feed'] = None
    try:
        queue = [json.loads(line) for line in command(['postqueue', '-j']).splitlines() if line.strip()]
        own = [row for row in queue if row.get('sender') == SENDER]
        snapshot['afaversMailQueue'] = {'count': len(own), 'oldestAgeSeconds': max((max(0, now - row.get('arrival_time', now)) for row in own), default=0)}
    except Exception:
        snapshot['afaversMailQueue'] = {'unavailable': True}
    receipt = root / 'backup-receipt.json'
    try:
        backup = json.loads(receipt.read_text())
        snapshot['lastLocalBackupAt'] = datetime.strptime(backup['utc'], '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        snapshot['lastLocalBackupAt'] = None
    # Ledger uncertainty is operator-visible; no recipient or application text is read.
    query = """SELECT json_build_object(
      'tasks',(SELECT coalesce(json_object_agg(task,json_build_object('status',CASE WHEN status='running' AND lease_expires_at<now() THEN 'timed_out' ELSE status END,'started_at',started_at)),'{}'::json) FROM (SELECT DISTINCT ON(task) task,status,started_at,lease_expires_at FROM public.automation_runs ORDER BY task,started_at DESC)x),
      'uncertainDeliveries',(SELECT count(*) FROM public.reminder_deliveries WHERE state='uncertain')+(SELECT count(*) FROM public.job_alert_batches WHERE status='uncertain'),
      'failedDeliveries',(SELECT count(*) FROM public.reminder_deliveries WHERE state='failed' AND claimed_at>now()-interval '24 hours')+(SELECT count(*) FROM public.job_alert_batches WHERE status='failed' AND updated_at>now()-interval '24 hours'),
      'oldInFlight',(SELECT count(*) FROM public.reminder_deliveries WHERE state='claimed' AND claimed_at<now()-interval '3 minutes')+(SELECT count(*) FROM public.job_alert_batches WHERE status='sending' AND updated_at<now()-interval '3 minutes'),
      'acceptedBacklog',(SELECT count(*) FROM public.job_alert_batches WHERE status='accepted' AND updated_at<now()-interval '5 minutes'),
      'disabledSchedules',(SELECT coalesce(json_agg(jobname),'[]'::json) FROM cron.job WHERE jobname IN('fetch-jobs-every-2-hours','job-alerts-every-2-hours','send-reminders-every-minute') AND NOT active),
      'missingSchedules',(SELECT coalesce(json_agg(expected.name),'[]'::json) FROM unnest(ARRAY['fetch-jobs-every-2-hours','job-alerts-every-2-hours','send-reminders-every-minute']) AS expected(name) WHERE NOT EXISTS(SELECT 1 FROM cron.job actual WHERE actual.jobname=expected.name)));"""
    try:
        if collection_errors: raise RuntimeError('Docker ownership or availability is unverified')
        snapshot['automation'] = json.loads(command(['docker', 'exec', 'afavers-db-1', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', query]))
    except Exception:
        snapshot['automation'] = {'ledgerReadUnavailable': True}
    return snapshot


class NotificationError(RuntimeError):
    def __init__(self, uncertain):
        super().__init__('Operator SMTP outcome is uncertain' if uncertain else 'Operator SMTP rejected or unavailable')
        self.uncertain = uncertain


def notify(recipient, events):
    if not recipient or any(c in recipient for c in '\r\n') or '@' not in recipient:
        raise ValueError('A valid operations recipient is required')
    message = EmailMessage()
    message['From'] = SENDER
    message['To'] = recipient
    message['Subject'] = 'Afavers: ' + ', '.join(event['state'] + ' ' + event['code'] for event in events)
    message.set_content('\n'.join(event['state'].upper() + ': ' + event['message'] for event in events) + '\n\nHost: ' + DOMAIN + '\nInspect: /opt/afavers/health/status.json and journalctl -u afavers-operations.service\n')
    accepted = False
    smtp = None
    submitted = False
    try:
        smtp = smtplib.SMTP('127.0.0.1', 18995, timeout=15)
        submitted = True
        smtp.send_message(message)
        accepted = True
    except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError, smtplib.SMTPConnectError):
        raise NotificationError(False)
    except (OSError, smtplib.SMTPException):
        raise NotificationError(submitted)
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except (OSError, smtplib.SMTPException):
                smtp.close()
                if not accepted and not submitted:
                    raise NotificationError(False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--notify', action='store_true')
    parser.add_argument('--snapshot', action='store_true', help='Read-only diagnostic; no state or email writes')
    args = parser.parse_args()
    root = Path('/opt/afavers')
    owner = os.environ['AGENT_RESOURCE_OWNER']
    if (root / '.resource-owner').read_text().strip() != owner:
        raise SystemExit('Deployment owner differs')
    snapshot = collect(root, owner)
    now = time.time()
    issues = evaluate(snapshot, now)
    if args.snapshot:
        print(json.dumps({'snapshot': snapshot, 'issues': issues}, indent=2))
        return
    folder = root / 'health'
    folder.mkdir(mode=0o700, exist_ok=True)
    marker = folder / '.owner'
    if marker.exists() and marker.read_text().strip() != owner:
        raise SystemExit('Health folder ownership differs')
    if not marker.exists() and list(folder.iterdir()):
        raise SystemExit('Unowned health folder is not empty')
    marker.write_text(owner)
    state_path = folder / 'incidents.json'
    previous = json.loads(state_path.read_text()) if state_path.exists() else {}
    state, events = advance(previous, issues, now)
    # Persist the notification attempt before SMTP: a process failure must not spam.
    pending = folder / 'incidents.pending'
    pending.write_text(json.dumps(state, indent=2)); pending.replace(state_path)
    result = {'snapshot': snapshot, 'issues': issues, 'events': events, 'notification': 'not requested'}
    if args.notify and events:
        config = dict(line.split('=', 1) for line in (root / 'operations.env').read_text().splitlines() if line and not line.startswith('#'))
        try:
            notify(config.get('OPERATIONS_EMAIL', ''), events)
            result['notification'] = 'accepted by local SMTP'
        except NotificationError as error:
            result['notification'] = 'failed or uncertain; inspect local mail queue and journal'
            for event in events:
                row = state.get(event['code'])
                if row:
                    if error.uncertain: row['deliveryUnknown'] = True
                    else: row['lastNotification'] = now - 6 * 3600 + 5 * 60
            pending.write_text(json.dumps(state, indent=2)); pending.replace(state_path)
    (folder / 'status.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'checkedAt': snapshot['checkedAt'], 'issues': sorted(issues), 'events': events, 'notification': result['notification']}))


if __name__ == '__main__':
    main()
