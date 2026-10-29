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



class ExportLoopHookTest(unittest.TestCase):
    def test_metadata_failure_does_not_skip_command_and_once(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder,patch.object(sys,'argv',['export-windows.py','--registry','synthetic','--cache',folder+'/cache','--host','aski@node.tailtest.ts.net','--key','synthetic','--command-config','private.json','--once']),patch.object(exporter,'run_once',side_effect=OSError),patch.object(exporter,'protected_json',return_value={'synthetic':True}),patch.object(exporter,'bridge_commands_once') as command,patch.object(exporter.time,'sleep') as sleep:
            exporter.main();command.assert_called_once_with({'synthetic':True});sleep.assert_not_called()
    def test_command_failure_does_not_change_metadata_or_once(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder,patch.object(sys,'argv',['export-windows.py','--registry','synthetic','--cache',folder+'/cache','--host','aski@node.tailtest.ts.net','--key','synthetic','--command-config','private.json','--once']),patch.object(exporter,'run_once') as metadata,patch.object(exporter,'protected_json',side_effect=PermissionError),patch.object(exporter.time,'sleep') as sleep:
            exporter.main();metadata.assert_called_once();sleep.assert_not_called()
    def test_absent_config_preserves_metadata_only(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder,patch.object(sys,'argv',['export-windows.py','--registry','synthetic','--cache',folder+'/cache','--host','aski@node.tailtest.ts.net','--key','synthetic','--once']),patch.object(exporter,'run_once'),patch.object(exporter,'bridge_commands_once') as command:
            exporter.main();command.assert_not_called()



class MetadataConfigurationBoundaryTest(unittest.TestCase):
    def test_actual_invalid_registry_shapes_still_process_commands_once(self):
        import json
        import tempfile
        for registry in ([],{'identitySalt':None}):
            with self.subTest(registry=registry),tempfile.TemporaryDirectory() as folder:
                registry_path=Path(folder)/'registry.json'
                registry_path.write_text(json.dumps(registry),encoding='utf-8')
                argv=['export-windows.py','--registry',str(registry_path),'--cache',folder+'/cache','--host','aski@node.tailtest.ts.net','--key','synthetic','--command-config','private.json','--once']
                with patch.object(sys,'argv',argv),patch.object(exporter,'protected_json',return_value={'synthetic':True}),patch.object(exporter,'bridge_commands_once') as command,patch.object(exporter.time,'sleep') as sleep:
                    exporter.main()
                    command.assert_called_once_with({'synthetic':True})
                    sleep.assert_not_called()
    def test_expected_metadata_key_error_does_not_skip_commands(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder,patch.object(sys,'argv',['export-windows.py','--registry','synthetic','--cache',folder+'/cache','--host','aski@node.tailtest.ts.net','--key','synthetic','--command-config','private.json','--once']),patch.object(exporter,'run_once',side_effect=KeyError),patch.object(exporter,'protected_json',return_value={}),patch.object(exporter,'bridge_commands_once') as command:
            exporter.main();command.assert_called_once_with({})

if __name__=='__main__':unittest.main()
