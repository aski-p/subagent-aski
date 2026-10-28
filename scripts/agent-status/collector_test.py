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
