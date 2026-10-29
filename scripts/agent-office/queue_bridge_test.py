"""Bound Boss queue transport: UUID-only target, fixed argv, queued is never acknowledged."""
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent))
import queue_bridge

BOSS = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
EXE = '/opt/test/codex'

def report(**overrides):
    base = {'bossId': BOSS, 'runId': 'run-1', 'reportId': 'rep-1', 'revision': 2,
            'summary': 'Task finished.', 'table': [['Forge', '50%']]}
    base.update(overrides)
    return base

def ok_process(returncode=0):
    return Mock(return_value=subprocess.CompletedProcess([], returncode))

class UuidOnlyTargetTest(unittest.TestCase):
    def test_uuid_only_target(self):
        for bad in ['Boss', 'latest', 'boss chat', '', '00000000-0000-4000-8000-00000000000', '{%s}' % BOSS,
                    BOSS + ' ', BOSS + '\n', '--thread', 'urn:uuid:' + BOSS, None, 7]:
            run = ok_process()
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                queue_bridge.queue_report(EXE, bad, report(bossId=bad), run_process=run)
            run.assert_not_called()

    def test_report_must_bind_the_same_boss(self):
        run = ok_process()
        with self.assertRaises(ValueError):
            queue_bridge.queue_report(EXE, BOSS, report(bossId=OTHER), run_process=run)
        run.assert_not_called()

    def test_executable_must_be_absolute_not_path_lookup(self):
        for bad in ['codex', 'codex.exe', 'bin/codex', '', None]:
            run = ok_process()
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                queue_bridge.queue_report(bad, BOSS, report(), run_process=run)
            run.assert_not_called()
        queue_bridge.queue_report('C:/Program Files/Codex/bin/codex.exe', BOSS, report(), run_process=ok_process())

class QueueAcceptanceTest(unittest.TestCase):
    def test_queue_acceptance_not_ack(self):
        result = queue_bridge.queue_report(EXE, BOSS, report(), run_process=ok_process())
        self.assertEqual(result, {'status': 'queued', 'reportId': 'rep-1', 'revision': 2, 'errorCode': None})
        self.assertNotIn(result['status'], ('acknowledged', 'received', 'done'))

    def test_nonzero_exit_is_explicit_retry(self):
        result = queue_bridge.queue_report(EXE, BOSS, report(), run_process=ok_process(3))
        self.assertEqual(result, {'status': 'retry_wait', 'reportId': 'rep-1', 'revision': 2, 'errorCode': 'queue_rejected'})

    def test_missing_executable_is_explicit_retry(self):
        run = Mock(side_effect=FileNotFoundError(2, 'secret path detail'))
        result = queue_bridge.queue_report(EXE, BOSS, report(), run_process=run)
        self.assertEqual(result['status'], 'retry_wait')
        self.assertEqual(result['errorCode'], 'executable_unavailable')

class TimeoutTest(unittest.TestCase):
    def test_timeout_uncertain(self):
        run = Mock(side_effect=subprocess.TimeoutExpired([EXE], 30))
        result = queue_bridge.queue_report(EXE, BOSS, report(), run_process=run)
        self.assertEqual(result, {'status': 'uncertain', 'reportId': 'rep-1', 'revision': 2, 'errorCode': 'queue_timeout'})

    def test_interrupted_send_is_uncertain_with_generic_error(self):
        run = Mock(side_effect=subprocess.SubprocessError('raw tool output with private detail'))
        result = queue_bridge.queue_report(EXE, BOSS, report(), run_process=run)
        self.assertEqual(result['status'], 'uncertain')
        self.assertEqual(result['errorCode'], 'queue_interrupted')
        self.assertNotIn('private', json.dumps(result))

class ArgumentArrayTest(unittest.TestCase):
    def test_argument_array_and_hidden_windows_child(self):
        run = ok_process()
        with patch.object(sys, 'platform', 'win32'), patch.object(subprocess, 'CREATE_NO_WINDOW', 0x08000000, create=True):
            queue_bridge.queue_report(EXE, BOSS, report(summary='x; rm -rf / && "quoted" $(id)'), run_process=run)
        run.assert_called_once()
        argv = run.call_args.args[0]
        kwargs = run.call_args.kwargs
        self.assertIsInstance(argv, list)
        self.assertEqual(argv[:5], [EXE, 'queue', '--thread', BOSS, '--message'])
        self.assertEqual(len(argv), 6)
        self.assertIn('rep-1', argv[5])
        self.assertIn('x; rm -rf / && "quoted" $(id)', argv[5], 'payload is one argv element, never shell-joined')
        self.assertIs(kwargs.get('shell', False), False)
        self.assertEqual(kwargs.get('creationflags'), 0x08000000, 'pythonw child must not open a console window')
        self.assertIs(kwargs['stdin'], subprocess.DEVNULL)
        self.assertIs(kwargs['stdout'], subprocess.DEVNULL)
        self.assertIs(kwargs['stderr'], subprocess.DEVNULL)
        self.assertGreater(kwargs['timeout'], 0)

    def test_posix_does_not_receive_windows_creation_flags(self):
        run = ok_process()
        with patch.object(sys, 'platform', 'linux'):
            queue_bridge.queue_report(EXE, BOSS, report(), run_process=run)
        self.assertEqual(run.call_args.kwargs.get('creationflags', 0), 0)
        self.assertIs(run.call_args.kwargs.get('shell', False), False)

class EnvelopeTest(unittest.TestCase):
    def test_envelope_keys_and_result_marker(self):
        text = queue_bridge.render_report_envelope(report())
        for needle in ['bossId: ' + BOSS, 'runId: run-1', 'reportId: rep-1', 'revision: 2', 'Task finished.', 'Forge']:
            self.assertIn(needle, text)
        self.assertIn(queue_bridge.RESULT_MARKER, text)

    def test_envelope_requires_report_key(self):
        for missing in ['bossId', 'runId', 'reportId', 'revision']:
            bad = report()
            del bad[missing]
            with self.subTest(missing=missing), self.assertRaises(ValueError):
                queue_bridge.render_report_envelope(bad)
        for field, value in [('revision', -1), ('revision', True), ('revision', '2'), ('reportId', 'a b'), ('runId', 'x' * 200)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                queue_bridge.render_report_envelope(report(**{field: value}))

    def test_malformed_report_shapes_are_rejected(self):
        for bad in [None, 'text', ['list']]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                queue_bridge.queue_report(EXE, BOSS, bad, run_process=ok_process())
        for table in ['abc', [{'k': 'v'}], ['row-as-string'], {'a': 1}]:
            with self.subTest(table=table), self.assertRaises(ValueError):
                queue_bridge.render_report_envelope(report(table=table))

    def test_envelope_is_bounded_and_single_line_cells(self):
        text = queue_bridge.render_report_envelope(report(summary='s' * 10000 + '\x1b[31m',
                                                          table=[['row\nsplit', 'c' * 500]] * 100))
        self.assertLessEqual(len(text), queue_bridge.MAX_MESSAGE_CHARS)
        self.assertNotIn('\x1b', text)
        self.assertNotIn('row\nsplit', text)
        self.assertLessEqual(sum(1 for line in text.splitlines() if line.startswith('| ')), queue_bridge.MAX_TABLE_ROWS)

class ProbeCliTest(unittest.TestCase):
    def test_probe_sends_only_designated_probe(self):
        run = ok_process()
        out = io.StringIO()
        with patch.object(queue_bridge, 'DEFAULT_RUN_PROCESS', run), patch('sys.stdout', out):
            code = queue_bridge.main(['probe', '--boss-id', BOSS, '--report-id', 'probe-1', '--codex-exe', EXE])
        self.assertEqual(code, 0)
        run.assert_called_once()
        argv = run.call_args.args[0]
        self.assertEqual(argv[:4], [EXE, 'queue', '--thread', BOSS])
        self.assertIn('reportId: probe-1', argv[5])
        self.assertIn(queue_bridge.RESULT_MARKER, argv[5])
        printed = json.loads(out.getvalue())
        self.assertEqual(printed, {'status': 'queued', 'reportId': 'probe-1', 'revision': 1, 'errorCode': None})
        self.assertNotIn(BOSS, out.getvalue())

    def test_probe_rejects_name_target_without_spawning(self):
        run = ok_process()
        with patch.object(queue_bridge, 'DEFAULT_RUN_PROCESS', run), patch('sys.stdout', io.StringIO()), patch('sys.stderr', io.StringIO()):
            code = queue_bridge.main(['probe', '--boss-id', 'Boss', '--report-id', 'probe-1', '--codex-exe', EXE])
        self.assertNotEqual(code, 0)
        run.assert_not_called()

    def test_cli_has_no_free_text_message_option(self):
        with patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit):
            queue_bridge.main(['probe', '--boss-id', BOSS, '--report-id', 'p', '--codex-exe', EXE, '--message', 'do X'])

if __name__ == '__main__': unittest.main()
