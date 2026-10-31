import unittest
from unittest.mock import patch
from pathlib import Path
from operations import advance, evaluate, collect_backend


class OperationsTests(unittest.TestCase):
    def healthy(self):
        return {'authHealthy': True, 'frontendHealthy': True, 'services': [{'state':'running','health':'healthy'}] * 4, 'disk': {'total':100*1024**3,'free':30*1024**3}, 'availableMemoryMiB':1000, 'tlsExpiresAt':4_000_000, 'feed': {'last_usable_at':'1970-01-12T13:45:00+00:00', 'latest':{'status':'succeeded','sources':[]}}, 'lastLocalBackupAt':'1970-01-12T13:45:00+00:00','automation':{'tasks':{'job-alerts':{'started_at':'1970-01-12T13:45:00+00:00','status':'succeeded'},'send-reminders':{'started_at':'1970-01-12T13:45:00+00:00','status':'succeeded'}}}}

    def test_healthy_system_is_quiet(self):
        self.assertEqual(evaluate(self.healthy(), 1_000_000), {})

    def test_short_failures_do_not_notify(self):
        state, events = advance({}, {'feed_stale':'Stale'}, 100)
        self.assertFalse(events)
        state, events = advance(state, {}, 200)
        self.assertFalse(events)
        self.assertFalse(state)

    def test_persistent_incident_notifies_once_then_recovery(self):
        state, _ = advance({}, {'feed_stale':'Stale'}, 100)
        state, events = advance(state, {'feed_stale':'Stale'}, 200)
        self.assertEqual(events[0]['state'], 'alert')
        state, events = advance(state, {'feed_stale':'Stale'}, 300)
        self.assertFalse(events)
        state, events = advance(state, {}, 400)
        self.assertFalse(events)
        state, events = advance(state, {}, 500)
        self.assertEqual(events[0]['state'], 'recovered')
        self.assertFalse(state)

    def test_feed_partial_is_not_an_outage_but_failed_is(self):
        s = self.healthy(); s['feed']['latest']['status'] = 'partial'
        self.assertNotIn('import_failed', evaluate(s, 1_000_000))
        s['feed']['latest']['status'] = 'failed'
        self.assertIn('import_failed', evaluate(s, 1_000_000))

    def test_age_queue_and_disk_limits(self):
        s = self.healthy(); s['feed']['last_usable_at'] = None; s['disk']['free'] = 0; s['afaversMailQueue'] = {'count':1,'oldestAgeSeconds':1900}
        issues = evaluate(s, 1_000_000)
        self.assertTrue({'feed_stale','disk_low','mail_queue_stuck'}.issubset(issues))

    def test_docker_outage_becomes_an_observable_issue(self):
        with patch('operations.command',side_effect=OSError('Docker unavailable')):
            services, errors = collect_backend(Path('/opt/afavers'),'owner')
        s=self.healthy();s.update(services=services,collectionErrors=errors)
        self.assertIn('backend_unhealthy',evaluate(s,1_000_000))
        self.assertIn('health_collection_incomplete',evaluate(s,1_000_000))

    def test_wrong_engine_owner_stops_docker_reads(self):
        with patch('operations.command',return_value='other-owner') as call:
            services,errors=collect_backend(Path('/opt/afavers'),'owner')
            self.assertEqual(call.call_count,1)
        self.assertEqual(errors,['docker_owner_mismatch']);self.assertFalse(services)

    def test_worker_schedule_and_ledger_failures_are_visible(self):
        s=self.healthy();s['automation']={'tasks':{},'acceptedBacklog':1,'failedDeliveries':1}
        issues=evaluate(s,1_000_000)
        self.assertTrue({'job-alerts_stale','send-reminders_stale','mail_delivery_stalled','mail_delivery_failed'}.issubset(issues))

    def test_uncertain_operator_delivery_is_not_blindly_resent(self):
        state={'feed_stale':{'active':True,'failures':2,'lastNotification':100,'deliveryUnknown':True}}
        _,events=advance(state,{'feed_stale':'Stale'},100_000)
        self.assertFalse(events)

    def test_deleted_schedule_is_visible_before_last_worker_becomes_stale(self):
        s = self.healthy()
        s['automation']['missingSchedules'] = ['job-alerts-every-2-hours']
        issues = evaluate(s, 1_000_000)
        self.assertIn('schedule_missing_job-alerts-every-2-hours', issues)
        self.assertNotIn('job-alerts_stale', issues)


if __name__ == '__main__': unittest.main()
