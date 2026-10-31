"""Hermetic capacity-probe safety/metric tests; no HTTP, Docker or real mail."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock


spec = importlib.util.spec_from_file_location('capacity', Path(__file__).with_name('verify-capacity.py'))
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


class CapacityTests(unittest.TestCase):
    def snapshot(self):
        return {'availableMemoryMiB': 1024, 'disk': {'free': 10 * 1024 ** 3, 'total': 100 * 1024 ** 3},
                'swapOutBytes': 100, 'mailQueue': {'count': 0, 'oldestAgeSeconds': 0},
                'containers': [{'id': 'owned', 'memoryPercent': 50, 'cpuPercent': 10}],
                'loadAverage': [0, 0, 0], 'hostCpuPercent': 10}

    def probe(self, folder):
        result = capacity.Probe({}, 'owner', Path(folder), 'nonce')
        result.manifest['users'] = [{'index': 0, 'email': 'capacity-nonce-0@example.invalid', 'authId': 'auth-id', 'profileId': 15}]
        return result

    def test_nearest_rank_percentile_and_failed_requests_stay_in_metrics(self):
        events = [{'operation': 'read', 'elapsedMs': value, 'ok': value < 200, 'bytes': 12} for value in [10, 20, 200]]
        summary = capacity.summaries(events)['all']
        self.assertEqual((summary['requests'], summary['failures'], summary['p50Ms'], summary['p95Ms'], summary['maxMs']), (3, 1, 20, 200, 200))

    def test_pressure_requires_real_growth_and_sustained_cpu(self):
        baseline = self.snapshot(); current = self.snapshot()
        self.assertFalse(capacity.pressure(current, baseline, [current]))
        current['swapOutBytes'] += 65 * 1024 ** 2
        current['containers'][0]['memoryPercent'] = 96
        current['hostCpuPercent'] = 96
        issues = capacity.pressure(current, baseline, [current] * 3)
        self.assertTrue({'swap_out_exceeded_64MiB', 'afavers_container_memory_above_95_percent', 'host_cpu_above_95_percent_for_three_samples'}.issubset(issues))

    def test_cleanup_refuses_mismatched_metadata_without_deletion(self):
        with tempfile.TemporaryDirectory() as folder:
            probe = self.probe(folder)
            probe.service = Mock(return_value=(200, {'email': probe.manifest['users'][0]['email'], 'user_metadata': {'afavers_resource_owner': 'someone-else'}}, 0))
            result = probe.cleanup()
            self.assertFalse(result['complete'])
            self.assertTrue(probe.manifest_path.exists())
            self.assertTrue((Path(folder) / 'retention.json').exists())
            self.assertTrue(all(len(call.args) == 1 for call in probe.service.call_args_list))

    def test_cleanup_checks_remaining_rows_even_if_auth_user_already_gone(self):
        with tempfile.TemporaryDirectory() as folder:
            probe = self.probe(folder)
            probe.service = Mock(side_effect=[(404, None, 0), (200, [], 0), (200, [{'id': 99}], 0)])
            self.assertFalse(probe.cleanup()['complete'])
            self.assertIn('jobs?', probe.service.call_args_list[-1].args[0])

    def test_successful_exact_cleanup_removes_private_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            probe = self.probe(folder)
            row = probe.manifest['users'][0]
            user = {'email': row['email'], 'user_metadata': {'afavers_resource_owner': 'owner', 'capacity_run': 'nonce', 'purpose': capacity.PURPOSE}}
            probe.service = Mock(side_effect=[(200, user, 0), (200, [{'id': 15}], 0), (200, {}, 0), (404, None, 0)] + [(200, [], 0)] * 5)
            self.assertTrue(probe.cleanup()['complete'])
            self.assertFalse(probe.manifest_path.exists())
            deletes = [call.args for call in probe.service.call_args_list if len(call.args) > 1 and call.args[1] == 'DELETE']
            self.assertEqual(deletes, [('/auth/v1/admin/users/auth-id', 'DELETE')])

    def test_resource_summary_retains_peak_and_swap_delta(self):
        first = self.snapshot(); last = self.snapshot()
        last.update(availableMemoryMiB=700, swapOutBytes=500, hostCpuPercent=80)
        last['containers'][0].update(cpuPercent=40, memoryPercent=75)
        summary = capacity.resource_summary([first, last])
        self.assertEqual(summary['minimumAvailableMemoryMiB'], 700)
        self.assertEqual(summary['swapOutIncreaseBytes'], 400)
        self.assertEqual(summary['containers']['owned']['maximumMemoryPercent'], 75)


if __name__ == '__main__':
    unittest.main()
