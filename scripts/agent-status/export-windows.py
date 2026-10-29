"""Outbound Tailscale SSH/scp only; scheduler starts this current-user 15s loop."""
import argparse, re, sqlite3, subprocess, sys, time
from pathlib import Path
from collector import run_once
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"agent-office"))
from queue_bridge import bridge_commands_once, protected_json
REMOTE_DIR='/home/aski/agent-office-status/spool'

def transport(local,host,key):
 # Deliberately fixed remote operation; no remote command or path CLI parameters.
 if not re.fullmatch(r'aski@[a-zA-Z0-9-]+\.tail[a-zA-Z0-9]+\.ts\.net',host):raise ValueError('invalid_tailnet_host')
 remote=REMOTE_DIR+'/windows-codex.json'
 # pythonw hides only this parent; OpenSSH children must suppress their own console.
 child_options={'creationflags':subprocess.CREATE_NO_WINDOW} if sys.platform=='win32' else {}
 flags=['-i',str(Path(key).resolve()),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10']
 subprocess.run(['scp',*flags,str(local),host+':'+remote+'.tmp'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30,**child_options)
 subprocess.run(['ssh',*flags,host,'chmod 600 '+remote+'.tmp && mv -f '+remote+'.tmp '+remote],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,**child_options)

def main():
 p=argparse.ArgumentParser();p.add_argument('--registry',required=True);p.add_argument('--cache',required=True);p.add_argument('--host',required=True);p.add_argument('--key',required=True);p.add_argument('--once',action='store_true');p.add_argument('--command-config');a=p.parse_args()
 # Local staging stays on the user's profile volume. Never transfer source/session/cache files.
 stage=Path(a.cache).resolve().parent/'spool';stage.mkdir(parents=True,exist_ok=True)
 while True:
  tick=time.monotonic()
  try:
   run_once(a.registry,stage,a.cache,('windows-codex',))
   candidate=stage/'windows-codex.json'
   if candidate.is_file() and candidate.stat().st_size<=1048576:transport(candidate,a.host,a.key)
  except (OSError,ValueError,subprocess.SubprocessError):print('windows-codex: transport_unavailable')
  if a.command_config:
   try:bridge_commands_once(protected_json(a.command_config))
   except (OSError,ValueError,KeyError,TypeError,AttributeError,sqlite3.Error,subprocess.SubprocessError):print('office-command: transport_unavailable')
  if a.once:break
  time.sleep(max(0,15-(time.monotonic()-tick)))
if __name__=='__main__':main()
