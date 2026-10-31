"""Hermetic manifest/rollback checks. No Docker, SQL, HTTP or real services."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

try:
    import fcntl  # noqa: F401
except ImportError:
    sys.modules['fcntl'] = SimpleNamespace()
spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-readiness.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallReadinessTests(unittest.TestCase):
    def test_manifest_is_pinned_to_commit_and_actual_file_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); file = source / 'example.ts'; file.write_text('reviewed source')
            manifest = {'commit': 'a' * 40, 'files': {'example.ts': installer.sha(file)}}
            (source / 'source-manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(installer.verify_source(source, 'a' * 40), manifest)
            file.write_text('changed after review')
            with self.assertRaisesRegex(RuntimeError, 'source_file_hash_differs'):
                installer.verify_source(source, 'a' * 40)
            with self.assertRaisesRegex(RuntimeError, 'source_commit_manifest_invalid'):
                installer.verify_source(source, 'b' * 40)

    def test_copy_plan_maps_workers_and_router_without_live_configuration(self):
        names = ['supabase/functions/send-reminders/index.ts', 'deploy/functions-main/index.ts',
                 'deploy/apply-migrations.py', 'deploy/backup.py', 'deploy/compose.yml',
                 'deploy/bootstrap/roles.sql', 'client/dist/index.html', 'supabase/functions/_shared/smtp.test.ts']
        plan = installer.copy_plan({'files': dict.fromkeys(names, 'hash')})
        self.assertEqual(plan['supabase/functions/send-reminders/index.ts'], 'functions/send-reminders/index.ts')
        self.assertEqual(plan['deploy/functions-main/index.ts'], 'functions/main/index.ts')
        self.assertFalse(any(name in plan for name in names[4:]))

    def exercise_install(self, failure):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); stage = root / 'readiness-261031'; source = stage / 'source'; source.mkdir(parents=True)
            plan = {'supabase/functions/fetch-jobs/index.ts': 'functions/fetch-jobs/index.ts',
                    'supabase/functions/send-reminders/index.ts': 'functions/send-reminders/index.ts',
                    'deploy/apply-migrations.py': 'deploy/apply-migrations.py'}
            for name in plan:
                path = source / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('candidate source')
            old = root / 'functions/fetch-jobs/index.ts'; old.parent.mkdir(parents=True); old.write_text('known-good old worker')
            manifest = {'commit': 'a' * 40, 'files': {name: installer.sha(source / name) for name in plan}}
            schedules = [{'id': 1, 'name': installer.TASKS[0], 'active': True}, {'id': 2, 'name': installer.TASKS[1], 'active': False}]
            baseline = {name: {'id': name, 'service': name, 'state': 'running', 'health': 'healthy'} for name in ('db', 'auth', 'rest', 'functions')}
            events = []
            def schedule(identifier, active):
                events.append(('schedule', identifier, active))
                next(row for row in schedules if row['id'] == identifier)['active'] = active
            def command(args, **kwargs):
                if args[-1].endswith('backup.py'):
                    archive = root / 'backups/test.dump'; archive.parent.mkdir(); archive.write_bytes(b'local archive')
                    (root / 'backup-receipt.json').write_text(json.dumps({'path': str(archive), 'archiveInventoryVerified': True}))
                elif args[-1].endswith('apply-migrations.py'):
                    self.assertEqual(kwargs['env']['AFAVERS_PAUSE_REMINDER_SCHEDULE'], '1')
                    schedules.append({'id': 3, 'name': installer.TASKS[2], 'active': False})
                    if failure: raise RuntimeError('migration_application_failed')
                    (root / 'migration-receipt.json').write_text(json.dumps({'applied': ['additive.sql']}))
                return ''
            def restart(_owner):
                events.append(('restart',))
                return baseline
            with patch.object(installer, 'ROOT', root), patch.object(installer, 'STAGE', stage), \
                 patch.object(installer, 'services', return_value=baseline), \
                 patch.object(installer, 'protected_hashes', return_value={'private.env': 'unchanged-hash'}), \
                 patch.object(installer, 'verify_migrations', return_value=['additive.sql']), \
                 patch.object(installer, 'verify_source', return_value=manifest), \
                 patch.object(installer, 'schedule_rows', side_effect=lambda: [dict(row) for row in schedules]), \
                 patch.object(installer, 'set_schedule', side_effect=schedule), patch.object(installer, 'drain'), \
                 patch.object(installer, 'run', side_effect=command), patch.object(installer, 'restart_functions', side_effect=restart), \
                 patch.object(installer, 'reminder_unauthorized', return_value=True), patch.object(installer.signal, 'signal'), \
                 patch('builtins.print'):
                status = installer.install('owner', source, manifest, plan, 'a' * 40)
            receipt = json.loads(next(stage.glob('backend-install-*/receipt.json')).read_text())
            self.assertEqual(schedules[0]['active'], True)
            self.assertEqual(schedules[1]['active'], False)
            self.assertFalse(receipt['schemaRollbackAttempted'])
            self.assertTrue(receipt['schedulesRestored'])
            self.assertTrue(receipt['protectedUnchanged'])
            self.assertEqual(receipt.get('failure'), 'migration_application_failed' if failure else None, receipt)
            if failure:
                self.assertEqual(status, 1)
                self.assertEqual(old.read_text(), 'known-good old worker')
                self.assertFalse((root / 'functions/send-reminders/index.ts').exists())
                self.assertFalse(schedules[2]['active'])
                self.assertTrue(receipt['workerFilesRolledBack'])
            else:
                self.assertEqual(status, 0)
                self.assertTrue(schedules[2]['active'])
                self.assertLess(events.index(('restart',)), events.index(('schedule', 3, True)))

    def test_partial_migration_failure_restores_workers_and_original_cron_flags(self):
        self.exercise_install(failure=True)

    def test_success_enables_new_reminder_only_after_worker_health_and_probe(self):
        self.exercise_install(failure=False)


if __name__ == '__main__':
    unittest.main()
