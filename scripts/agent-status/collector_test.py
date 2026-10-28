import datetime as dt, json, tempfile
from pathlib import Path
from collector import parse_records, read_records, collect
now=dt.datetime.now(dt.timezone.utc).isoformat();reg={'identitySalt':'s'*48,'sessions':{},'agentPaths':{'/root/forge_backend':{'name':'Forge','roleId':'forge','projectId':'office','taskId':'task1'}},'tasks':[]}
records=[{'type':'session_meta','timestamp':now,'payload':{'id':'raw-private-session','parent_thread_id':'raw-parent','agent_path':'/root/forge_backend','agent_nickname':'Unapproved','model_provider':'openai','base_instructions':'SENTINEL_SECRET'}},{'type':'response_item','payload':{'text':'SENTINEL_SECRET'}},{'type':'turn_context','payload':{'model':'gpt-real','effort':'medium','cwd':'SENTINEL_SECRET'}},{'type':'event_msg','timestamp':now,'payload':{'type':'task_started','message':'SENTINEL_SECRET'}}]
result,state=parse_records(records,'windows-codex',reg);a,e=result;text=json.dumps(result)
assert 'SENTINEL_SECRET' not in text and 'raw-private-session' not in text and '/root' not in text
assert a['name']=='Forge' and a['model']=='gpt-real' and a['parentId'] and a['status']=='working'
assert e[0]['publicSummary'] is None
result,_=parse_records([{'type':'assistant','sessionId':'c','timestamp':now,'parentUuid':'record-not-session','message':{'model':'claude-real','content':'SENTINEL_SECRET'}}],'pgx-claude',reg)
assert result[0]['model']=='claude-real' and result[0]['parentId'] is None and result[0]['status']=='unknown'
assert 'SENTINEL_SECRET' not in json.dumps(result)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'session.jsonl';p.write_text(json.dumps(records[0])+'\n'+json.dumps(records[3])[:20]);rs,c=read_records(p,{})
 assert len(rs)==1
 with p.open('a') as f:f.write(json.dumps(records[3])[20:]+'\n')
 rs,c=read_records(p,c);assert len(rs)==1 and rs[0]['type']=='event_msg'
 board=Path(d)/'board.json';board.write_text(json.dumps({'status':{'codex':{'text':'SENTINEL_SECRET','at':now}}}))
 reg.update(sources={'pgx-relay':{'boardFile':str(board)}},boardAgents={'codex':{'name':'Forge','roleId':'forge'}})
 assert 'SENTINEL_SECRET' not in json.dumps(collect('pgx-relay',reg,{}))
print('structural boundary: pass')

# Regression: oversized ignored appends must not pin the cursor/heartbeat forever.
from collector import LIMIT, run_once, source_files
from unittest.mock import patch
import io, contextlib, os
with tempfile.TemporaryDirectory() as d:
 root=Path(d); p=root/'session.jsonl';p.write_text(json.dumps(records[0])+'\n');_,cursor=read_records(p,{})
 with p.open('a') as f:f.write('{"type":"response_item","text":"'+'x'*(LIMIT*2)+'"}\n'+json.dumps({'type':'event_msg','timestamp':now,'payload':{'type':'task_complete'}})+'\n')
 found=[];offsets=[]
 for _ in range(4):
  rs,cursor=read_records(p,cursor);found.extend(rs);offsets.append(cursor['offset'])
 assert any(x.get('payload',{}).get('type')=='task_complete' for x in found),offsets
 assert all(b>a for a,b in zip(offsets[:2],offsets[1:3])),offsets
 assert not any(x.get('type')=='response_item' for x in found)
 # An initial large file still projects its bounded metadata head, even if tail
 # is wholly inside an unfinished oversized ignored record.
 initial=root/'initial.jsonl';initial.write_text(json.dumps(records[0])+'\n'+'x'*(LIMIT+100))
 rs,initial_cursor=read_records(initial,{})
 assert rs[0]['type']=='session_meta' and initial_cursor['discard'] is True
 print('oversized record: bounded progress and completion observed')
 # Malformed board must retain its spool and allow both subsequent sources to collect.
 board=root/'board.json';board.write_text(json.dumps({'status':{'codex':{'at':now}}}))
 codex=root/'codex.jsonl';codex.write_text(json.dumps(records[0])+'\n')
 claude=root/'claude.jsonl';claude.write_text(json.dumps({'type':'assistant','sessionId':'claude-real-session','timestamp':now,'message':{'model':'claude-real','content':'SENTINEL_SECRET'}})+'\n')
 registry=root/'registry.json';reg['sources']={'pgx-relay':{'boardFile':str(board)},'pgx-codex':{'files':[str(codex)]},'pgx-claude':{'files':[str(claude)]}};registry.write_text(json.dumps(reg))
 spool=root/'spool';cache=root/'cache.json';run_once(registry,spool,cache,('pgx-relay',));good=(spool/'pgx-relay.json').read_bytes()
 for malformed in ({'status':[]},[],{'status':{'codex':[]}}):
  board.write_text(json.dumps(malformed));out=io.StringIO()
  with contextlib.redirect_stdout(out):run_once(registry,spool,cache,('pgx-relay','pgx-codex','pgx-claude'))
  assert (spool/'pgx-relay.json').read_bytes()==good
  assert json.loads((spool/'pgx-codex.json').read_text())['agents']
  assert json.loads((spool/'pgx-claude.json').read_text())['agents']
  assert out.getvalue().strip()=='pgx-relay: source_unavailable'
 print('malformed board: last good retained and other sources continue')
 # Declare and count discovery I/O; explicit older session must always be selectable.
 sessions=root/'sessions';sessions.mkdir();old=sessions/'old-parent.jsonl';old.write_text('')
 for i in range(100):(sessions/f'{i:03d}.jsonl').write_text('')
 stats={};actual_visits=[0];original_scandir=os.scandir
 @contextlib.contextmanager
 def counted_scandir(directory):
  with original_scandir(directory) as entries:
   def counted_entries():
    for entry in entries:
     actual_visits[0]+=1;yield entry
   yield counted_entries()
 with patch('collector.os.scandir',counted_scandir):
  paths,limited=source_files({'roots':[str(sessions)],'files':[str(old)],'discoveryBudget':7,'maxFiles':2},stats)
 assert actual_visits[0]==stats['entriesVisited']==7,actual_visits
 assert stats['entriesVisited']<=7 and limited and old.resolve() in paths,stats
 reg['sources']['pgx-codex']={'roots':[str(sessions)],'files':[str(codex)],'discoveryBudget':7}
 snap=collect('pgx-codex',reg,{})
 assert snap['coverage'][0]['reasonCode']=='discovery_limited'
 print('discovery budget: <=7 entries; explicit older file retained; limited coverage reported')
