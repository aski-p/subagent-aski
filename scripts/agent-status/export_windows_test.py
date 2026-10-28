"""Prevent console flashes when the pythonw scheduler launches OpenSSH."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('office_export', Path(__file__).with_name('export-windows.py'))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

class QuietTransportTest(unittest.TestCase):
    def test_windows_both_children_have_no_console(self):
        with patch.object(sys, 'platform', 'win32'), patch.object(subprocess, 'CREATE_NO_WINDOW', 0x08000000, create=True), patch.object(subprocess, 'run') as run:
            exporter.transport('sanitized.json', 'aski@pgx.tailtest.ts.net', 'test-key')
        self.assertEqual([c.args[0][0] for c in run.call_args_list], ['scp', 'ssh'])
        for call in run.call_args_list:
            self.assertEqual(call.kwargs.get('creationflags'), 0x08000000, 'OpenSSH would allocate a visible console from pythonw')
            self.assertIs(call.kwargs['stdout'], subprocess.DEVNULL)
            self.assertIs(call.kwargs['stderr'], subprocess.DEVNULL)
            self.assertTrue(call.kwargs['check'])
    def test_posix_does_not_receive_windows_creation_flags(self):
        with patch.object(sys, 'platform', 'linux'), patch.object(subprocess, 'run') as run:
            exporter.transport('sanitized.json', 'aski@pgx.tailtest.ts.net', 'test-key')
        for call in run.call_args_list:
            self.assertEqual(call.kwargs.get('creationflags', 0), 0)
    def test_transport_failure_is_still_propagated(self):
        with patch.object(subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'scp')):
            with self.assertRaises(subprocess.CalledProcessError):
                exporter.transport('sanitized.json', 'aski@pgx.tailtest.ts.net', 'test-key')

if __name__ == '__main__': unittest.main()
