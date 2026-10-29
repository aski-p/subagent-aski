"""Private transactional command inbox; no transport or native execution is installed."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
import base64
import json
import re
import secrets
import stat
import os
from pathlib import Path
import uuid

from ledger import Ledger, canonical, digest, key, protected_directory, public_id
from command_authority import require_command_capability

TERMINAL={"handled","failed","expired","closed"}
PURPOSES={"web-intake","bridge-claim","boss-redeem","boss-reply","boss-dispatch"}
SCHEMA="""
CREATE TABLE IF NOT EXISTS commands (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
 owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, boss_id TEXT NOT NULL,
 client_id TEXT NOT NULL, payload_hash TEXT NOT NULL, project_id TEXT,
 parent_id TEXT, raw_input TEXT,
 state TEXT NOT NULL, stage TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, received_at TEXT,
 terminal_at TEXT, last_handled_at TEXT, run_id TEXT REFERENCES runs(id),
 decision TEXT, decision_hash TEXT, reply_kind TEXT, reply_summary TEXT,
 reply_updated_at TEXT, reply_hash TEXT, safe_error TEXT,
 lease_hash TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 next_send_at TEXT, transport_hash TEXT, answered_by TEXT,
 UNIQUE(owner_id,client_id));
CREATE INDEX IF NOT EXISTS commands_partition ON commands(owner_id,binding_id,sequence);
CREATE INDEX IF NOT EXISTS commands_equivalence ON commands(owner_id,binding_id,payload_hash,state);
CREATE TABLE IF NOT EXISTS command_tombstones (
 owner_id TEXT NOT NULL, client_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 command_id TEXT NOT NULL, binding_id TEXT NOT NULL, boss_id TEXT NOT NULL, terminal_state TEXT NOT NULL, PRIMARY KEY(owner_id,client_id));
CREATE TABLE IF NOT EXISTS command_continuation_provenance (
 command_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, root_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, boss_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL, parent_hash TEXT NOT NULL, root_hash TEXT NOT NULL,
 continuation_hash TEXT NOT NULL, project_id TEXT, redeemed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS command_project_confirmations (
 command_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, decision_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL, continuation_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS command_resume_cursors (
 owner_id TEXT NOT NULL, binding_id TEXT NOT NULL, boss_id TEXT NOT NULL,
 after_sequence INTEGER NOT NULL, PRIMARY KEY(owner_id,binding_id,boss_id));
CREATE TABLE IF NOT EXISTS command_result_bindings (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT NOT NULL, run_id TEXT NOT NULL,
 report_id TEXT NOT NULL, report_revision INTEGER NOT NULL, plan_version INTEGER NOT NULL,
 attempts_hash TEXT NOT NULL, decision_hash TEXT NOT NULL, execution_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL, UNIQUE(report_id,report_revision));
CREATE TABLE IF NOT EXISTS command_revisions (
 command_id TEXT PRIMARY KEY REFERENCES commands(id), run_id TEXT NOT NULL REFERENCES runs(id),
 plan_version INTEGER NOT NULL, payload_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS command_dispatch_intents (
 command_id TEXT PRIMARY KEY REFERENCES commands(id), run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
 payload_hash TEXT NOT NULL, state TEXT NOT NULL);
"""

class CommandError(ValueError):
    def __init__(self,code,receipt_id=None,retry_after=None):
        self.code=code
        self.status={"conflict":409,"equivalent_pending":409,"already_processed":410,
                     "rate_limited":429,"boss_unavailable":503}[code]
        self.receipt_id=receipt_id
        self.retry_after=retry_after
        super().__init__(code)

def exact(value,required,optional=()):
    if not isinstance(value,dict) or not set(required)<=set(value) or set(value)-set(required)-set(optional):
        raise ValueError("invalid_input")
    return value

def time_value(value):
    if not isinstance(value,str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z",value):
        raise ValueError("invalid_time")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    return parsed

def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",value):
        raise ValueError("invalid_command_id")
    return value

def bounded_text(value,limit):
    if not isinstance(value,str) or not 1<=len(value)<=limit or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]",value):
        raise ValueError("invalid_text")
    return value

def parse_input(value):
    exact(value,("schemaVersion","clientRequestId","projectId","text"),("replyToCommandId",))
    if len(json.dumps(value,ensure_ascii=False,separators=(",",":")).encode())>16384:
        raise ValueError("input_too_large")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"]!=1:
        raise ValueError("invalid_version")
    identifier(value["clientRequestId"])
    project=value["projectId"]
    if project is not None: key(project)
    if not isinstance(value["text"],str): raise ValueError("invalid_text")
    text=bounded_text(value["text"].strip("\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"),4000)
    result={"schemaVersion":1,"projectId":project,"text":text,
            "replyToCommandId":identifier(value["replyToCommandId"]) if "replyToCommandId" in value else None}
    return result,digest(canonical(result))

def command_row(conn,command_id):
    row=conn.execute("SELECT * FROM commands WHERE id=?",(identifier(command_id),)).fetchone()
    if row is None: raise ValueError("unknown_command")
    return row

def scope_row(row,cap):
    if any(row[field]!=cap[field] for field in ("owner_id","binding_id","boss_id")):
        raise PermissionError("wrong_scope")

def confirmed_command_project(conn,row,cap):
    """Independent persisted effective-project check, also used by direct Ledger calls."""
    scope_row(row,cap)
    if row["project_id"] is not None:
        if conn.execute("SELECT 1 FROM command_project_confirmations WHERE command_id=?",(row["id"],)).fetchone():
            raise PermissionError("project_override")
        project=row["project_id"]
    else:
        confirmation=conn.execute("SELECT * FROM command_project_confirmations WHERE command_id=?",(row["id"],)).fetchone()
        provenance=conn.execute("SELECT * FROM command_continuation_provenance WHERE command_id=?",(row["id"],)).fetchone()
        if confirmation is None or provenance is None:
            raise PermissionError("project_confirmation_required")
        scope_row(provenance,cap)
        if (row["received_at"] is None or row["parent_id"] is None or row["decision"]!="new_task"
            or provenance["parent_id"]!=row["parent_id"] or provenance["payload_hash"]!=row["payload_hash"]
            or provenance["project_id"] is not None or confirmation["payload_hash"]!=row["payload_hash"]
            or confirmation["decision_hash"]!=row["decision_hash"]
            or confirmation["continuation_hash"]!=provenance["continuation_hash"]):
            raise PermissionError("invalid_project_confirmation")
        project=confirmation["project_id"]
    if project not in cap["project_ids"]:
        raise PermissionError("unauthorized_project")
    return project


def receipt(row):
    return {"id":row["id"],"projectId":row["project_id"],"summary":"Owner command",
            "state":row["state"],"processingStage":row["stage"],"lastHandledAt":row["last_handled_at"],
            "createdAt":row["created_at"],"updatedAt":row["updated_at"],"expiresAt":row["expires_at"],
            "runId":public_id("run",row["run_id"]) if row["run_id"] else None,
            "replyKind":row["reply_kind"],"replySummary":row["reply_summary"],
            "replyToCommandId":row["parent_id"],"replyUpdatedAt":row["reply_updated_at"],
            "safeErrorCode":row["safe_error"]}

def expire(conn,now):
    conn.execute("""UPDATE commands SET state='expired',updated_at=?,terminal_at=?,safe_error='already_processed',
                 lease_hash=NULL,lease_until=NULL
                 WHERE received_at IS NULL AND state NOT IN ('handled','failed','expired','closed')
                 AND expires_at<=?""",(now,now,now))
    # A never-received answer can expire. Release only after its terminal expiry
    # is committed in this same lock; delayed old envelopes then fail redeem.
    conn.execute("""UPDATE commands SET answered_by=NULL WHERE state='awaiting_input'
        AND answered_by IN (SELECT id FROM commands WHERE state='expired' AND received_at IS NULL)""")

class CommandStore:
    def __init__(self,db_path:str):
        self.db_path=str(Path(db_path).absolute())
        self._active=ContextVar("command_transaction",default=None)
        protected_directory(Path(self.db_path).parent)
        info=Path(self.db_path).lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode & 0o077:
            raise PermissionError("unprotected_database")
        with self._private_transaction() as conn:
            # executescript commits implicitly; individual DDL retains our lock.
            for statement in SCHEMA.split(";"):
                if statement.strip(): conn.execute(statement)
            columns={r["name"] for r in conn.execute("PRAGMA table_info(commands)")}
            if "result_sequence" not in columns:
                conn.execute("ALTER TABLE commands ADD COLUMN result_sequence INTEGER")
            if "continuation_context" not in columns:
                conn.execute("ALTER TABLE commands ADD COLUMN continuation_context TEXT")

    @contextmanager
    def _private_transaction(self):
        active=self._active.get()
        if active is not None:
            yield active
            return
        conn=Ledger._connect(self.db_path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally: conn.close()

    @contextmanager
    def _authorized(self,capability,purpose,**resource):
        if not isinstance(capability,dict) or set(capability)!={"capabilityFile"}:
            raise PermissionError("invalid_capability")
        ledger=Ledger(self.db_path,capability["capabilityFile"])
        with ledger.transaction() as conn:
            cap=require_command_capability(capability,purpose,
                {"dbPath":self.db_path,"connection":conn,**resource})
            token=self._active.set(conn)
            try: yield ledger,conn,cap
            finally: self._active.reset(token)

    def submit(self,actor:dict,binding:dict,input:dict,now_iso:str)->dict:
        return self.submit_result(actor,binding,input,now_iso)["receipt"]

    def submit_result(self,actor:dict,binding:dict,input:dict,now_iso:str)->dict:
        """Same atomic intake with HTTP adapter replay metadata."""
        exact(binding,("id",))
        normalized,fingerprint=parse_input(input)
        now=iso(time_value(now_iso))
        with self._authorized(actor,"web-intake",bindingId=binding["id"]) as (_,conn,cap):
            expire(conn,now)
            owner=cap["owner_id"]
            # Idempotency and compact permanent tombstones precede all rate charging.
            old=conn.execute("SELECT * FROM commands WHERE owner_id=? AND client_id=?",
                             (owner,input["clientRequestId"])).fetchone()
            tomb=conn.execute("SELECT * FROM command_tombstones WHERE owner_id=? AND client_id=?",
                              (owner,input["clientRequestId"])).fetchone()
            if old:
                scope_row(old,cap)
                if old["payload_hash"]!=fingerprint: raise CommandError("conflict")
                return {"receipt":receipt(old),"replayed":True}
            if tomb:
                scope_row(tomb,cap)
                if tomb["payload_hash"]!=fingerprint: raise CommandError("conflict")
                raise CommandError("already_processed")
            equivalent=conn.execute("""SELECT id FROM commands WHERE owner_id=? AND binding_id=?
                 AND payload_hash=? AND state NOT IN ('handled','failed','expired','closed') LIMIT 1""",
                 (owner,cap["binding_id"],fingerprint)).fetchone()
            if equivalent: raise CommandError("equivalent_pending",equivalent["id"])
            project=normalized["projectId"]
            if project is not None and project not in cap["project_ids"]:
                raise ValueError("unknown_project")
            parent=normalized["replyToCommandId"]
            if parent:
                row=command_row(conn,parent);scope_row(row,cap)
                if row["state"]!="awaiting_input" or row["answered_by"] or row["project_id"]!=project:
                    raise ValueError("invalid_parent")
            parsed=time_value(now)
            for seconds,maximum in ((60,5),(3600,30)):
                cutoff=iso(parsed-timedelta(seconds=seconds))
                recent=conn.execute("SELECT created_at FROM commands WHERE owner_id=? AND created_at>? ORDER BY created_at",
                                    (owner,cutoff)).fetchall()
                if len(recent)>=maximum:
                    delay=max(1,int((time_value(recent[0][0])+timedelta(seconds=seconds)-parsed).total_seconds())+1)
                    raise CommandError("rate_limited",retry_after=delay)
            pending=conn.execute("""SELECT count(*) FROM commands WHERE owner_id=? AND received_at IS NULL
                                   AND state NOT IN ('handled','failed','expired','closed')""",(owner,)).fetchone()[0]
            if pending>=20: raise CommandError("rate_limited",retry_after=15)
            command_id=str(uuid.uuid4())
            conn.execute("""INSERT INTO commands(id,owner_id,binding_id,boss_id,client_id,payload_hash,project_id,
                parent_id,raw_input,state,stage,created_at,updated_at,expires_at,next_send_at)
                VALUES(?,?,?,?,?,?,?,?,?,'accepted','not_received',?,?,?,?)""",
                (command_id,owner,cap["binding_id"],cap["boss_id"],input["clientRequestId"],fingerprint,
                 project,parent,canonical(normalized),now,now,iso(parsed+timedelta(hours=24)),now))
            if parent:
                conn.execute("UPDATE commands SET answered_by=?,updated_at=? WHERE id=?",(command_id,now,parent))
            return {"receipt":receipt(command_row(conn,command_id)),"replayed":False}

    def receipts(self,owner_id:str,cursor:str|None,limit:int=50)->dict:
        """Trusted read adapter only; CLI derives owner from verified web credential."""
        key(owner_id)
        if type(limit) is not int or not 1<=limit<=50: raise ValueError("invalid_limit")
        before=9223372036854775807
        if cursor is not None:
            if not isinstance(cursor,str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}",cursor):
                raise ValueError("invalid_cursor")
            try:
                decoded=json.loads(base64.urlsafe_b64decode(cursor+"="*(-len(cursor)%4)))
                exact(decoded,("owner","before"))
                if decoded["owner"]!=digest(owner_id) or type(decoded["before"]) is not int or not 0<decoded["before"]<=9223372036854775807:
                    raise ValueError("invalid_cursor")
                before=decoded["before"]
            except Exception: raise ValueError("invalid_cursor") from None
        with self._private_transaction() as conn:
            rows=conn.execute("SELECT * FROM commands WHERE owner_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
                              (owner_id,before,limit+1)).fetchall()
            page=rows[:limit]
            next_cursor=None
            if len(rows)>limit:
                next_cursor=base64.urlsafe_b64encode(canonical({"owner":digest(owner_id),"before":page[-1]["sequence"]}).encode()).decode().rstrip("=")
            result={"receipts":[receipt(r) for r in page],"nextCursor":next_cursor}
            canonical(result)
            return result

    def claim(self,bridge:dict,now_iso:str)->dict|None:
        now=iso(time_value(now_iso))
        with self._authorized(bridge,"bridge-claim") as (_,conn,cap):
            expire(conn,now)
            # A lost lease may have sent. Never blindly resend a possible delivery.
            conn.execute("""UPDATE commands SET state='uncertain',updated_at=?,lease_hash=NULL,lease_until=NULL,
                 safe_error='boss_unavailable' WHERE owner_id=? AND binding_id=? AND state='claimed' AND lease_until<=?""",
                 (now,cap["owner_id"],cap["binding_id"],now))
            row=conn.execute("""SELECT * FROM commands WHERE owner_id=? AND binding_id=? AND boss_id=?
                 AND received_at IS NULL AND state IN ('accepted','retry_wait')
                 AND next_send_at<=? AND attempts<3 ORDER BY sequence LIMIT 1""",
                 (cap["owner_id"],cap["binding_id"],cap["boss_id"],now)).fetchone()
            if row is None: return None
            token=secrets.token_urlsafe(32)
            conn.execute("""UPDATE commands SET state='claimed',updated_at=?,lease_hash=?,lease_until=?,
                attempts=attempts+1,transport_hash=NULL WHERE id=?""",
                (now,digest(token),iso(time_value(now)+timedelta(seconds=60)),row["id"]))
            return {"commandId":row["id"],"payloadHash":row["payload_hash"],"leaseToken":token,"bindingRevision":1}

    def record_transport(self,event:dict)->dict:
        exact(event,("capability","commandId","leaseToken","outcome","now"))
        now=iso(time_value(event["now"]))
        outcome=event["outcome"]
        if outcome not in {"queued","retry_wait","uncertain","failed"}: raise ValueError("invalid_outcome")
        if not isinstance(event["leaseToken"],str): raise PermissionError("invalid_lease")
        with self._authorized(event["capability"],"bridge-claim") as (_,conn,cap):
            row=command_row(conn,event["commandId"]);scope_row(row,cap)
            token_hash=digest(event["leaseToken"])
            if not row["lease_hash"] or not secrets.compare_digest(row["lease_hash"],token_hash):
                raise PermissionError("stale_lease")
            fingerprint=digest(canonical({k:v for k,v in event.items() if k!="capability"}))
            if row["transport_hash"]:
                if row["transport_hash"]!=fingerprint: raise CommandError("conflict")
                return receipt(row)
            if row["received_at"]: return receipt(row)  # Receive always wins a delayed transport update.
            if row["state"]!="claimed" or row["lease_until"]<=now:
                raise PermissionError("stale_lease")
            if row["expires_at"]<=now: raise CommandError("already_processed")
            state="failed" if outcome=="retry_wait" and row["attempts"]>=3 else outcome
            delay=5 if row["attempts"]==1 else 30
            next_at=iso(time_value(now)+timedelta(seconds=delay)) if state=="retry_wait" else None
            conn.execute("""UPDATE commands SET state=?,updated_at=?,terminal_at=?,safe_error=?,
                  next_send_at=?,transport_hash=? WHERE id=?""",
                  (state,now,now if state=="failed" else None,
                   "boss_unavailable" if state in {"failed","uncertain"} else None,next_at,fingerprint,row["id"]))
            return receipt(command_row(conn,row["id"]))

    def redeem(self,boss_capability:dict,command_id:str,payload_hash:str,now_iso:str)->dict:
        now=iso(time_value(now_iso))
        rejected=False
        result=None
        with self._authorized(boss_capability,"boss-redeem") as (_,conn,cap):
            row=command_row(conn,command_id);scope_row(row,cap)
            if payload_hash!=row["payload_hash"]: raise PermissionError("wrong_payload")
            first_receive=row["received_at"] is None
            if first_receive:
                if row["expires_at"]<=now or row["state"] in TERMINAL:
                    expire(conn,now)
                    rejected=True
                else:
                    conn.execute("""UPDATE commands SET state='received',stage='received',received_at=?,updated_at=?,
                        lease_hash=NULL,lease_until=NULL,safe_error=NULL WHERE id=?""",(now,now,command_id))
                    row=command_row(conn,command_id)
            if row["raw_input"] is None: rejected=True
            if not rejected:
                # Redeeming the authorized answer closes only the answered question.
                # Its continued scope belongs to this child command, never a run on
                # the clarification parent. Return private context in the same lock.
                continuation=json.loads(row["continuation_context"]) if row["continuation_context"] else None
                if row["parent_id"] and continuation is None:
                    parent=command_row(conn,row["parent_id"]);scope_row(parent,cap)
                    if (parent["answered_by"]!=row["id"] or parent["project_id"]!=row["project_id"]
                        or parent["decision"]!="needs_clarification" or parent["raw_input"] is None):
                        raise PermissionError("wrong_parent")
                    previous=json.loads(parent["continuation_context"]) if parent["continuation_context"] else None
                    root=previous["root"] if previous else {"commandId":parent["id"],"payloadHash":parent["payload_hash"],"input":json.loads(parent["raw_input"])}
                    question={"commandId":parent["id"],"payloadHash":parent["payload_hash"],
                              "input":json.loads(parent["raw_input"]),"receipt":receipt(parent)}
                    # Capture only the root objective and latest question, never an
                    # accumulating transcript. It belongs to the ACTIVE child now.
                    continuation={"root":root,"question":question}
                    if parent["state"]=="awaiting_input":
                        conn.execute("""UPDATE commands SET state='handled',stage='handled',terminal_at=?,
                            last_handled_at=?,updated_at=? WHERE id=?""",(now,now,now,parent["id"]))
                        question["receipt"]=receipt(command_row(conn,parent["id"]))
                    encoded=json.dumps(continuation,ensure_ascii=False,separators=(",",":"))
                    if len(encoded.encode())>65536:raise ValueError("continuation_too_large")
                    conn.execute("UPDATE commands SET continuation_context=? WHERE id=?",(encoded,row["id"]))
                    conn.execute("""INSERT INTO command_continuation_provenance
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (row["id"],parent["id"],root["commandId"],row["owner_id"],row["binding_id"],
                         row["boss_id"],row["payload_hash"],parent["payload_hash"],root["payloadHash"],
                         digest(canonical(continuation)),row["project_id"],now))
                # Private response only, for the authenticated original Boss.
                result={"commandId":row["id"],"payloadHash":row["payload_hash"],
                        "input":json.loads(row["raw_input"]),"receipt":receipt(row)}
                if continuation is not None:
                    result["parent"]=continuation["question"]
                    result["continuation"]=continuation
        # Expiry must commit before returning the terminal error.
        if rejected: raise CommandError("already_processed")
        return result

    def record_decision(self,boss_capability:dict,decision:dict)->dict:
        exact(decision,("commandId","kind","now"),("run","tasks","checkpoints","runId","confirmedProjectId"))
        now=iso(time_value(decision["now"]))
        kind=decision["kind"]
        if kind not in {"query","new_task","revise_run","needs_clarification"}: raise ValueError("invalid_decision")
        fields=("run","tasks","checkpoints") if kind=="new_task" else ("runId",) if kind=="revise_run" else ()
        exact(decision,("commandId","kind","now",*fields),("confirmedProjectId",) if kind=="new_task" else ())
        with self._authorized(boss_capability,"boss-dispatch") as (ledger,conn,cap):
            row=command_row(conn,decision["commandId"]);scope_row(row,cap)
            fingerprint=digest(canonical({k:v for k,v in decision.items() if k!="now"}))
            if row["decision_hash"]:
                if row["decision_hash"]!=fingerprint: raise CommandError("conflict")
                return receipt(row)
            if row["received_at"] is None or row["state"] in TERMINAL:
                raise ValueError("receipt_required")
            conn.execute("UPDATE commands SET decision=?,decision_hash=?,stage='classified',updated_at=? WHERE id=?",
                         (kind,fingerprint,now,row["id"]))
            if kind=="new_task":
                if "confirmedProjectId" in decision:
                    if row["project_id"] is not None or row["parent_id"] is None or row["continuation_context"] is None:
                        raise PermissionError("clarification_confirmation_required")
                    project=key(decision["confirmedProjectId"])
                    provenance=conn.execute("SELECT * FROM command_continuation_provenance WHERE command_id=?",(row["id"],)).fetchone()
                    if provenance is None:
                        raise PermissionError("redeemed_continuation_required")
                    scope_row(provenance,cap)
                    continuation=json.loads(row["continuation_context"])
                    if (provenance["payload_hash"]!=row["payload_hash"] or provenance["parent_id"]!=row["parent_id"]
                        or provenance["project_id"] is not None
                        or provenance["continuation_hash"]!=digest(canonical(continuation))
                        or continuation["question"]["commandId"]!=row["parent_id"]
                        or continuation["root"]["input"]["projectId"] is not None):
                        raise PermissionError("invalid_confirmation_context")
                    if project not in cap["project_ids"] or decision["run"].get("projectId")!=project:
                        raise PermissionError("unauthorized_project")
                    conn.execute("INSERT INTO command_project_confirmations VALUES(?,?,?,?,?)",
                                 (row["id"],project,fingerprint,row["payload_hash"],provenance["continuation_hash"]))
                ledger.create_run_for_command(row["id"],decision["run"],decision["tasks"],decision["checkpoints"])
            elif kind=="revise_run":
                # Explicit existing scope, no plan overwrite or pretend child execution.
                run=conn.execute("SELECT * FROM runs WHERE id=?",(key(decision["runId"]),)).fetchone()
                if run is None or run["boss_id"]!=cap["boss_id"] or run["project_id"]!=row["project_id"]:
                    raise PermissionError("wrong_run_scope")
                linked=conn.execute("SELECT owner_id,binding_id FROM commands WHERE run_id=?",(run["id"],)).fetchall()
                if any(r["owner_id"]!=cap["owner_id"] or r["binding_id"]!=cap["binding_id"] for r in linked):
                    raise PermissionError("wrong_run_owner")
                conn.execute("UPDATE commands SET run_id=? WHERE id=?",(run["id"],row["id"]))
                conn.execute("INSERT INTO command_revisions VALUES(?,?,?,?)",
                             (row["id"],run["id"],run["plan_version"],fingerprint))
            return receipt(command_row(conn,row["id"]))

    def write_reply(self,boss_capability:dict,reply:dict)->dict:
        exact(reply,("commandId","kind","summary","now"))
        now=iso(time_value(reply["now"]))
        summary=bounded_text(reply["summary"],2000)
        if reply["kind"] not in {"query_answer","clarification","ack"}: raise ValueError("invalid_reply")
        with self._authorized(boss_capability,"boss-reply") as (_,conn,cap):
            row=command_row(conn,reply["commandId"]);scope_row(row,cap)
            fingerprint=digest(canonical({k:v for k,v in reply.items() if k!="now"}))
            if row["reply_hash"]==fingerprint: return receipt(row)
            if row["received_at"] is None or row["state"] in TERMINAL or row["decision"] is None:
                raise ValueError("classification_required")
            expected={"query":"query_answer","needs_clarification":"clarification",
                      "new_task":"ack","revise_run":"ack"}[row["decision"]]
            if reply["kind"]!=expected: raise ValueError("wrong_reply_kind")
            if row["reply_hash"]: raise CommandError("conflict")
            # Public replies are deliberately authored safe summaries. Reject known
            # runtime identifiers/paths, direct command echo and credential shapes.
            raw=json.loads(row["raw_input"]) if row["raw_input"] else None
            forbidden=[row["boss_id"],row["binding_id"],row["owner_id"],row["run_id"]]
            if any(value and len(value)>=8 and value in summary for value in forbidden):
                raise ValueError("unsafe_reply")
            # Owner-facing authored replies may contain short common words. Reject
            # an exact command echo or a long source substring, not ordinary chat.
            if raw and (raw["text"]==summary or (len(raw["text"])>=16 and raw["text"] in summary)):
                raise ValueError("unsafe_reply")
            if re.search(r"(?:[A-Za-z]:\\|/(?:home|Users|private|tmp|etc)/|(?:Bearer|TOKEN_SECRET)\b|[A-Za-z0-9_-]{48,})",summary):
                raise ValueError("unsafe_reply")
            state="handled" if expected=="query_answer" else "awaiting_input" if expected=="clarification" else row["state"]
            stage="handled" if state=="handled" else row["stage"]
            conn.execute("""UPDATE commands SET state=?,stage=?,reply_kind=?,reply_summary=?,reply_updated_at=?,
                reply_hash=?,updated_at=?,terminal_at=?,last_handled_at=? WHERE id=?""",
                (state,stage,reply["kind"],summary,now,fingerprint,now,now if state=="handled" else None,
                 now if state=="handled" else row["last_handled_at"],row["id"]))
            return receipt(command_row(conn,row["id"]))

    def resume(self,boss_capability:dict)->list:
        with self._authorized(boss_capability,"boss-redeem") as (_,conn,cap):
            partition=(cap["owner_id"],cap["binding_id"],cap["boss_id"])
            previous=conn.execute("""SELECT after_sequence FROM command_resume_cursors
                 WHERE owner_id=? AND binding_id=? AND boss_id=?""",partition).fetchone()
            after=previous["after_sequence"] if previous else 0
            # Persistent round-robin cursor: unfinished first-page work cannot
            # starve later commands, including after a controller/process restart.
            rows=conn.execute("""SELECT * FROM commands WHERE owner_id=? AND binding_id=? AND boss_id=?
                  AND received_at IS NOT NULL AND state NOT IN ('handled','failed','expired','closed')
                  ORDER BY CASE WHEN sequence>? THEN 0 ELSE 1 END,sequence LIMIT 50""",
                  (*partition,after)).fetchall()
            if rows:
                conn.execute("""INSERT INTO command_resume_cursors VALUES(?,?,?,?)
                    ON CONFLICT(owner_id,binding_id,boss_id) DO UPDATE SET after_sequence=excluded.after_sequence""",
                    (*partition,rows[-1]["sequence"]))
            # Raw payload still requires redeem by ID/hash. No secrets in recovery listing.
            return [{"commandId":r["id"],"payloadHash":r["payload_hash"],"receipt":receipt(r)} for r in rows]

    def purge(self,now_iso:str)->dict:
        """Trusted local scheduler operation; CLI requires scoped Boss-dispatch."""
        now=iso(time_value(now_iso));parsed=time_value(now)
        with self._private_transaction() as conn:
            expire(conn,now)
            conn.execute("""UPDATE commands SET state='closed',terminal_at=?,updated_at=?
              WHERE state='awaiting_input' AND reply_updated_at<=?""",
              (now,now,iso(parsed-timedelta(days=30))))
            cleared=conn.execute("""UPDATE commands SET raw_input=NULL,reply_summary=NULL,continuation_context=NULL
                WHERE state IN ('handled','failed','expired','closed') AND terminal_at<=?
                AND (raw_input IS NOT NULL OR reply_summary IS NOT NULL OR continuation_context IS NOT NULL)""",
                (iso(parsed-timedelta(days=7)),)).rowcount
            # Receipt retention starts on terminal transition. Clarifications closed
            # today retain a visible closed receipt for the next 30 days.
            rows=conn.execute("""SELECT * FROM commands WHERE state IN ('handled','failed','expired','closed')
                AND terminal_at<=?""",(iso(parsed-timedelta(days=30)),)).fetchall()
            removed=0
            for row in rows:
                conn.execute("INSERT OR IGNORE INTO command_tombstones VALUES(?,?,?,?,?,?,?)",
                    (row["owner_id"],row["client_id"],row["payload_hash"],row["id"],row["binding_id"],row["boss_id"],row["state"]))
                conn.execute("DELETE FROM command_dispatch_intents WHERE command_id=?",(row["id"],))
                conn.execute("DELETE FROM command_revisions WHERE command_id=?",(row["id"],))
                conn.execute("DELETE FROM command_project_confirmations WHERE command_id=?",(row["id"],))
                conn.execute("DELETE FROM command_continuation_provenance WHERE command_id=?",(row["id"],))
                conn.execute("DELETE FROM commands WHERE id=?",(row["id"],))
                removed+=1
            return {"purgedPayloads":cleared,"purgedReceipts":removed}
