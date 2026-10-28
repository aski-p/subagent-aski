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

MAX_LINE=256*1024
DEFAULT_DISCOVERY_BUDGET=2048
MAX_DISCOVERY_BUDGET=8192

def read_records(path,cursor):
 stat=path.stat();offset=cursor.get('offset',0);discard=bool(cursor.get('discard',False))
 if cursor.get('inode')!=stat.st_ino or stat.st_size<offset:offset=0;discard=False
 prefix=b''
 with path.open('rb') as f:
  if offset==0 and stat.st_size>LIMIT:
   # Initial history is bounded head/tail, including the skip to a tail line boundary.
   # Never call unbounded readline() on an ignored image/tool record.
   head=f.read(MAX_LINE);boundary=head.rfind(b'\n');prefix=head[:boundary+1] if boundary>=0 else b''
   f.seek(max(len(head),stat.st_size-(LIMIT-len(head))));raw=f.read(LIMIT-len(head));discard=True
  else:
   f.seek(offset);raw=f.read(LIMIT)
  end=f.tell()
 if discard:
  boundary=raw.find(b'\n')
  if boundary<0:raw=b''
  else:raw=raw[boundary+1:];discard=False
 # Allowed-size incomplete lines retry; oversized incomplete records are discarded
 # in bounded chunks until newline, always advancing without storing their bytes.
 boundary=raw.rfind(b'\n');tail=raw[boundary+1:]
 if len(tail)>MAX_LINE:discard=True
 else:end-=len(tail)
 complete=prefix+(raw[:boundary+1] if boundary>=0 else b'')
 records=[]
 for line in complete.splitlines():
  if len(line)>MAX_LINE:continue
  try:records.append(json.loads(line))
  except (ValueError,UnicodeError):pass
 return records,{'inode':stat.st_ino,'offset':end,'discard':discard}

def source_files(config,stats=None):
 # Discovery work has its own entry budget, independent of selected-file/read caps.
 # Explicit known sessions take precedence, including parents under older date dirs.
 budget=config.get('discoveryBudget',DEFAULT_DISCOVERY_BUDGET)
 max_files=config.get('maxFiles',32)
 if not isinstance(budget,int) or not 1<=budget<=MAX_DISCOVERY_BUDGET:raise ValueError('invalid_discovery_budget')
 if not isinstance(max_files,int) or not 1<=max_files<=64:raise ValueError('invalid_max_files')
 declared=config.get('files',[]);roots=config.get('roots',[])
 if not isinstance(declared,list) or not isinstance(roots,list) or len(roots)>8:raise ValueError('invalid_sources')
 limited=len(declared)>64;explicit=[];candidates=[];visited=0
 for name in declared[:64]:
  path=Path(name)
  if path.is_symlink() or path.suffix!='.jsonl':continue
  path=path.resolve()
  if path.is_file() and path not in explicit:explicit.append(path)
 stack=[]
 for name in roots:
  root=Path(name)
  if root.is_symlink():raise ValueError('invalid_source_root')
  root=root.resolve()
  if root.name not in ('sessions','projects'):raise ValueError('invalid_source_root')
  stack.append(root)
 while stack and visited<budget:
  directory=stack.pop()
  try:
   with os.scandir(directory) as entries:
    while visited<budget:
     try:entry=next(entries)
     except StopIteration:break
     visited+=1
     if entry.is_symlink():continue
     if entry.is_dir(follow_symlinks=False):stack.append(Path(entry.path))
     elif entry.name.endswith('.jsonl') and entry.is_file(follow_symlinks=False):
      candidates.append((entry.stat(follow_symlinks=False).st_mtime,Path(entry.path)))
    if visited>=budget:limited=True
  except OSError:limited=True
 if stack:limited=True
 candidates.sort(key=lambda item:item[0],reverse=True)
 paths=list(dict.fromkeys(explicit+[p for _,p in candidates]))
 if len(paths)>max_files:limited=True
 if stats is not None:stats.update(entriesVisited=visited,discoveryBudget=budget)
 return paths[:max_files],limited

def collect(source,reg,cache):
 cfg=reg.get('sources',{}).get(source,{});now=iso();agents=[];events=[];reason=None
 if source=='pgx-relay':
  path=Path(cfg.get('boardFile','/home/aski/agent-shared/board.json'))
  if path.stat().st_size>LIMIT:raise ValueError('source_unavailable')
  board=json.loads(path.read_text());last=[]
  if not isinstance(board,dict) or not isinstance(board.get('status'),dict):raise ValueError('invalid_board')
  statuses=board['status']
  # Source-owned board contains arbitrary prose: use only reviewed IDs + timestamps/status enums.
  for who,mapping in reg.get('boardAgents',{}).items():
   value=statuses.get(who)
   if value is None:continue
   if not isinstance(value,dict):raise ValueError('invalid_board')
   at=stamp(value.get('at') or value.get('updatedAt'));last.append(at) if at else None
   aid=identity(reg['identitySalt'],source,who)
   agents.append({'id':aid,'name':mapping.get('name'),'roleId':mapping.get('roleId'),'parentId':None,'provider':None,'model':None,'projectId':mapping.get('projectId'),'currentTaskId':mapping.get('taskId'),'status':'unknown','lastActivityAt':at,'lastSeenAt':now,'source':source})
  activity=max(last,default=None)
 else:
  paths,limited=source_files(cfg)
  if limited:reason='discovery_limited'
  elif not paths:reason='no_selected_sessions'
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
