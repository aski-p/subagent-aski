"""Read-only structural metadata projection. No source text is logged or exported."""
import argparse, datetime as dt, hashlib, hmac, json, os, re, time
from pathlib import Path
SOURCES=('pgx-relay','pgx-codex','pgx-claude','windows-codex')
EVENTS={'task_started','task_complete','thread_settings_applied','item_completed'}
LIMIT=4*1024*1024

def iso(): return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
def stamp(v):
 try:
  if not isinstance(v,str): return None
  d=dt.datetime.fromisoformat(v.replace('Z','+00:00'))
  if d.tzinfo is None: return None
  return d.astimezone(dt.timezone.utc).isoformat().replace('+00:00','Z')
 except (ValueError,TypeError): return None

def identity(salt,source,raw):
 return hmac.new(salt.encode(),(source+':'+str(raw)).encode(),hashlib.sha256).hexdigest()[:32] if raw else None

def model(v): return v if isinstance(v,str) and re.fullmatch(r'[a-zA-Z0-9_.:/-]{1,100}',v) and not v.startswith(('/', 'C:')) else None

def approved(reg,raw,path=None):
 # Only operator-reviewed registry supplies labels, roles, project and task details.
 return reg.get('sessions',{}).get(str(raw),reg.get('agentPaths',{}).get(path,{}))

def parse_records(records,source,reg,previous=None):
 salt=reg['identitySalt']; state=dict(previous or {}); events=list(state.pop('events',[]))
 for d in records:
  if not isinstance(d,dict):continue
  typ=d.get('type'); p=d.get('payload'); at=stamp(d.get('timestamp'))
  if source in ('pgx-codex','windows-codex'):
   if not isinstance(p,dict): continue
   if typ=='session_meta':
    raw=p.get('id') or p.get('session_id')
    if not isinstance(raw,str):continue
    state.update(raw=raw,parent=p.get('parent_thread_id') if isinstance(p.get('parent_thread_id'),str) else None,agentPath=p.get('agent_path') if isinstance(p.get('agent_path'),str) else None,provider=model(p.get('model_provider')))
   elif typ=='turn_context':
    state['model']=model(p.get('model'))
   elif typ=='event_msg' and p.get('type') in EVENTS and at:
    state['lastActivityAt']=at
    if p['type']=='task_started':state['status']='working'
    elif p['type']=='task_complete':state['status']='completed'
    events.append({'type':p['type'],'occurredAt':at})
  elif source=='pgx-claude' and typ in ('user','assistant','system') and isinstance(d.get('sessionId'),str):
   state['raw']=d['sessionId'];state['provider']='anthropic'
   # parentUuid is a record link, not a parent session ID: never misrepresent it.
   if typ=='assistant' and isinstance(d.get('message'),dict):state['model']=model(d['message'].get('model'))
   if at:state['lastActivityAt']=at
   # An assistant/user record proves activity only, never completion or running state.
 raw=state.get('raw')
 if not raw:return None,state
 mapping=approved(reg,raw,state.get('agentPath'));aid=identity(salt,source,raw);now=iso()
 parent=state.get('parent') or mapping.get('parentSessionId')
 agent={'id':aid,'name':mapping.get('name'),'roleId':mapping.get('roleId'),'parentId':identity(salt,source,parent),'provider':state.get('provider'),'model':state.get('model'),'projectId':mapping.get('projectId'),'currentTaskId':mapping.get('taskId'),'status':state.get('status','unknown'),'lastActivityAt':state.get('lastActivityAt'),'lastSeenAt':now,'source':source}
 cutoff=dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=24)
 events=[e for e in events if dt.datetime.fromisoformat(e['occurredAt'].replace('Z','+00:00'))>=cutoff][-200:]
 state['events']=events
 public_events=[{'id':identity(salt,source,raw+e['type']+e['occurredAt']),'agentId':aid,'taskId':mapping.get('taskId'),'type':e['type'],'publicSummary':mapping.get('eventSummaries',{}).get(e['type']),'occurredAt':e['occurredAt']} for e in events]
 return (agent,public_events),state

def atomic(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700);temp=path.with_name(path.name+'.tmp')
 with open(temp,'w',encoding='utf8') as f:json.dump(value,f,separators=(',',':'))
 os.chmod(temp,0o600);os.replace(temp,path)

def read_records(path,cursor):
 stat=path.stat();offset=cursor.get('offset',0)
 if cursor.get('inode')!=stat.st_ino or stat.st_size<offset:offset=0
 with path.open('rb') as f:
  if offset==0 and stat.st_size>LIMIT:
   head=f.read(256*1024);f.seek(max(len(head),stat.st_size-LIMIT+len(head)));f.readline();raw=head+b'\n'+f.read(LIMIT-len(head));end=f.tell()
  else:
   f.seek(offset);raw=f.read(LIMIT);end=f.tell()
 # Retain incomplete final line for next poll; malformed complete records are ignored.
 if raw and not raw.endswith(b'\n'):
  complete=raw.rfind(b'\n');end-=len(raw)-complete-1;raw=raw[:complete+1] if complete>=0 else b''
 records=[]
 for line in raw.splitlines():
  if len(line)>256*1024:continue
  try:records.append(json.loads(line))
  except (ValueError,UnicodeError):pass
 return records,{'inode':stat.st_ino,'offset':end}

def source_files(config):
 # Explicit operator-owned roots only, bounded most recently modified candidates across dates.
 paths=[Path(p).resolve() for p in config.get('files',[])]
 for root in config.get('roots',[]):
  root=Path(root).resolve()
  if root.name not in ('sessions','projects'):raise ValueError('invalid_source_root')
  paths.extend(root.rglob('*.jsonl'))
 paths=[p for p in paths if p.is_file() and p.suffix=='.jsonl' and not p.is_symlink()]
 return sorted(set(paths),key=lambda p:p.stat().st_mtime,reverse=True)[:min(config.get('maxFiles',32),64)]

def collect(source,reg,cache):
 cfg=reg.get('sources',{}).get(source,{});now=iso();agents=[];events=[];reason=None
 if source=='pgx-relay':
  path=Path(cfg.get('boardFile','/home/aski/agent-shared/board.json'))
  if path.stat().st_size>LIMIT:raise ValueError('source_unavailable')
  board=json.loads(path.read_text());last=[]
  # Source-owned board contains arbitrary prose: use only reviewed IDs + timestamps/status enums.
  for who,mapping in reg.get('boardAgents',{}).items():
   value=board.get('status',{}).get(who,{})
   if not isinstance(value,dict):continue
   at=stamp(value.get('at') or value.get('updatedAt'));last.append(at) if at else None
   aid=identity(reg['identitySalt'],source,who)
   agents.append({'id':aid,'name':mapping.get('name'),'roleId':mapping.get('roleId'),'parentId':None,'provider':None,'model':None,'projectId':mapping.get('projectId'),'currentTaskId':mapping.get('taskId'),'status':'unknown','lastActivityAt':at,'lastSeenAt':now,'source':source})
  activity=max(last,default=None)
 else:
  paths=source_files(cfg)
  if not paths:reason='no_selected_sessions'
  keep={}
  for path in paths:
   key=str(path);old=cache.get(key,{})
   try:
    records,cursor=read_records(path,old.get('cursor',{}));result,state=parse_records(records,source,reg,old.get('state'))
    keep[key]={'cursor':cursor,'state':state}
    if result:a,e=result;agents.append(a);events.extend(e)
   except (OSError,ValueError,TypeError):reason='partial_source'
  cache.clear();cache.update(keep);activity=max((a['lastActivityAt'] for a in agents if a['lastActivityAt']),default=None)
 tasks=[]
 for task in reg.get('tasks',[]):
  assignees=[a for a in agents if a['currentTaskId']==task['id']]
  if assignees:
   times=[a['lastActivityAt'] for a in assignees if a['lastActivityAt']]
   tasks.append({'id':task['id'],'projectId':task.get('projectId'),'title':task.get('title'),'status':'qa' if all(a['status']=='completed' for a in assignees) else 'working' if any(a['status']=='working' for a in assignees) else 'unknown','assigneeIds':[a['id'] for a in assignees],'source':source,'sourceUrl':task.get('sourceUrl'),'updatedAt':max(times,default=None)})
 events=sorted({e['id']:e for e in events}.values(),key=lambda e:e['occurredAt'],reverse=True)[:200]
 return {'schemaVersion':1,'snapshotId':identity(reg['identitySalt'],source,now),'observedAt':now,'coverage':[{'source':source,'connection':'connected' if agents else 'unknown','coverage':'registered' if source=='pgx-relay' and agents else 'metadata-only' if agents else 'unsupported','collectedAt':now,'lastActivityAt':activity,'reasonCode':reason}],'agents':agents,'tasks':tasks,'events':events,'artifacts':[]}

def run_once(registry,spool,cache_path,sources):
 reg=json.loads(Path(registry).read_text(encoding='utf-8-sig'))
 if len(reg.get('identitySalt',''))<32:raise ValueError('identity_salt_required')
 try:cache=json.loads(Path(cache_path).read_text())
 except (OSError,ValueError):cache={}
 for source in sources:
  try:
   value=collect(source,reg,cache.setdefault(source,{}));atomic(Path(spool)/(source+'.json'),value)
  except (OSError,ValueError,TypeError,KeyError):
   # Preserve last good spool; heartbeat ages naturally, never log source exception data.
   print(source+': source_unavailable')
 atomic(cache_path,cache)

def main():
 p=argparse.ArgumentParser();p.add_argument('--registry',required=True);p.add_argument('--spool',required=True);p.add_argument('--cache',required=True);p.add_argument('--loop',action='store_true');a=p.parse_args()
 while True:
  run_once(a.registry,a.spool,a.cache,('pgx-relay','pgx-codex','pgx-claude'))
  if not a.loop:break
  time.sleep(15)
if __name__=='__main__':main()
