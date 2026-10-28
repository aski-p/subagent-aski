"""Outbound Tailscale SSH/scp only; scheduler starts this current-user 15s loop."""
import argparse, re, subprocess, time
from pathlib import Path
from collector import run_once
REMOTE_DIR='/home/aski/agent-office-status/spool'

def transport(local,host,key):
 # Deliberately fixed remote operation; no remote command or path CLI parameters.
 if not re.fullmatch(r'aski@[a-zA-Z0-9-]+\.tail[a-zA-Z0-9]+\.ts\.net',host):raise ValueError('invalid_tailnet_host')
 remote=REMOTE_DIR+'/windows-codex.json'
 flags=['-i',str(Path(key).resolve()),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10']
 subprocess.run(['scp',*flags,str(local),host+':'+remote+'.tmp'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
 subprocess.run(['ssh',*flags,host,'chmod 600 '+remote+'.tmp && mv -f '+remote+'.tmp '+remote],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)

def main():
 p=argparse.ArgumentParser();p.add_argument('--registry',required=True);p.add_argument('--cache',required=True);p.add_argument('--host',required=True);p.add_argument('--key',required=True);p.add_argument('--once',action='store_true');a=p.parse_args()
 # Local staging stays on the user's profile volume. Never transfer source/session/cache files.
 stage=Path(a.cache).resolve().parent/'spool';stage.mkdir(parents=True,exist_ok=True)
 while True:
  try:
   run_once(a.registry,stage,a.cache,('windows-codex',))
   candidate=stage/'windows-codex.json'
   if candidate.is_file() and candidate.stat().st_size<=1048576:transport(candidate,a.host,a.key)
  except (OSError,ValueError,subprocess.SubprocessError):print('windows-codex: transport_unavailable')
  if a.once:break
  time.sleep(15)
if __name__=='__main__':main()
