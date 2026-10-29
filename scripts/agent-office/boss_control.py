"""Fixed outbound private command RPC. No payload-selected executable or shell."""
import argparse
import base64
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import stat
import subprocess
import sys

MAX_BYTES=1048576
SCOPES={'command-redeem':'redeem','command-resume':'redeem','command-context':'redeem',
        'command-decision':'dispatch','command-reply':'reply',
        'command-native-prepare':'boss','command-native-confirm':'boss','command-native-reconcile':'boss',
        'command-result':'boss','command-result-ack':'boss',
        'command-claim':'bridge','command-transport':'bridge'}

def protected_path(path):
    path=Path(path)
    if not path.is_absolute() or path.is_symlink() or path.parent.is_symlink():raise PermissionError('unprotected_config')
    if sys.platform=='win32':
        # Installer applies a current-user-only inherited ACL. Recheck on every read.
        ps=str(Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe')
        script="$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:AGENT_OFFICE_ACL_PATH; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $u){exit 1}; foreach($r in $a.Access){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($u,'S-1-5-18')){exit 1}}"
        encoded=base64.b64encode(script.encode('utf-16le')).decode()
        # pwsh7 module paths cannot be reused by the fixed Windows PowerShell5 ACL child.
        acl_env={name:value for name,value in os.environ.items() if name.casefold()!='psmodulepath'}
        acl_env['AGENT_OFFICE_ACL_PATH']=str(path)
        subprocess.run([ps,'-NoProfile','-NonInteractive','-EncodedCommand',encoded],env=acl_env,check=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10,creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        for item in (path,path.parent):
            info=item.lstat()
            if info.st_uid!=os.getuid() or info.st_mode & 0o077:raise PermissionError('unprotected_config')
    return path

def protected_json(path):
    path=protected_path(path)
    if not stat.S_ISREG(path.lstat().st_mode):raise PermissionError('unprotected_config')
    with path.open('rb') as stream:raw=stream.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise ValueError('input_too_large')
    value=json.loads(raw)
    if not isinstance(value,dict):raise ValueError('invalid_config')
    return value

class HelperRejected(ValueError):
    """A bounded error returned by the fixed helper, without private error text."""

def command_remote(config, operation, data, run_process=None):
    if operation not in SCOPES:raise ValueError('invalid_operation')
    host=config['host']
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*@[a-zA-Z0-9-]+\.tail[a-zA-Z0-9]+\.ts\.net',host):raise ValueError('invalid_host')
    for name in ('sshExe','identityFile'):
        if not Path(config[name]).is_absolute():raise ValueError('invalid_fixed_path')
    paths=[config['pythonPath'],config['cliPath'],config['dbPath'],config['capabilityFiles'][SCOPES[operation]]]
    if any(not isinstance(p,str) or not PurePosixPath(p).is_absolute() or not re.fullmatch(r'/[A-Za-z0-9_./-]+',p) for p in paths):raise ValueError('invalid_remote_path')
    remote=shlex.join([paths[0],paths[1],'--db',paths[2],'--capability-file',paths[3],operation])
    flags={'creationflags':subprocess.CREATE_NO_WINDOW} if sys.platform=='win32' else {}
    result=(run_process or subprocess.run)([config['sshExe'],'-T','-i',config['identityFile'],'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',host,remote],input=json.dumps(data,separators=(',',':')),encoding='utf-8',stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,shell=False,check=False,timeout=20,**flags)
    if len(result.stdout.encode())>MAX_BYTES:raise ValueError('invalid_helper_response')
    value=json.loads(result.stdout)
    if result.returncode or isinstance(value,dict) and 'error' in value:raise HelperRejected('command_helper_unavailable')
    return value

def boss_operation(config, operation, data):
    if operation not in SCOPES or SCOPES[operation]=='bridge':raise ValueError('invalid_operation')
    if not os.environ.get('CODEX_THREAD_ID') or os.environ['CODEX_THREAD_ID']!=config['bossId']:
        raise PermissionError('wrong_original_boss')
    if type(config.get('bindingRevision')) is not int or config['bindingRevision']!=1:raise PermissionError('wrong_binding_revision')
    if operation=='command-redeem':
        if set(data)!={'commandId','payloadHash','bindingRevision'} or data['bindingRevision']!=config['bindingRevision']:raise PermissionError('wrong_binding_revision')
        data={k:v for k,v in data.items() if k!='bindingRevision'}
    return command_remote(config,operation,data)

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=[op for op in SCOPES if SCOPES[op]!='bridge']);a=p.parse_args()
    try:
        config=protected_json(os.environ['AGENT_OFFICE_BOSS_CONFIG'])
        raw=sys.stdin.buffer.read(MAX_BYTES+1).decode('utf-8')
        if len(raw.encode())>MAX_BYTES:raise ValueError('input_too_large')
        data=json.loads(raw)
        if not isinstance(data,dict):raise ValueError('invalid_input')
        print(json.dumps(boss_operation(config,a.operation,data),separators=(',',':')))
        return 0
    except (OSError,ValueError,KeyError,TypeError,AttributeError,PermissionError,subprocess.SubprocessError):
        print('{"error":"command_controller_unavailable"}')
        return 1
if __name__=='__main__':sys.exit(main())
