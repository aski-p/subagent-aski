"""Private SQLite checkpoint ledger. Capabilities authorize; caller role strings do not.

One trusted OS owner is assumed. No isolation against a malicious same-UID owner.
All writes use BEGIN IMMEDIATE, including issuance and slot admission. The public
transaction() context can wrap later command binding plus create_run atomically.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import tempfile

MAX_BYTES = 1048576
STATES = {"queued", "working", "qa", "done", "blocked", "failed", "canceled"}

def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def canonical(value):
    result = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    if len(result.encode()) > MAX_BYTES:
        raise ValueError("input_too_large")
    return result

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def public_id(kind, value):
    """Stable projection ID shared with command receipts and private catalog adapters."""
    return kind + "-" + digest(kind + ":" + value)[:32]

def key(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", value):
        raise ValueError("invalid_id")
    return value

def version(value):
    if type(value) is not int or not 1 <= value <= 1000000:
        raise ValueError("invalid_version")
    return value

def protected_directory(path):
    path = Path(path)
    if not path.exists():
        if not path.parent.exists():
            protected_directory(path.parent)
        path.mkdir(mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise PermissionError("unprotected_directory")
    return path

def read_protected(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "r") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise PermissionError("unprotected_file")
        value = stream.read(MAX_BYTES + 1)
        if len(value.encode()) > MAX_BYTES:
            raise ValueError("input_too_large")
        return value

def write_new_private(path, value):
    protected_directory(Path(path).parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())

def atomic_export(path, value):
    parent = protected_directory(Path(path).parent)
    encoded = canonical(value)
    fd, temporary = tempfile.mkstemp(prefix=".progress-", suffix=".tmp", dir=parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

SCHEMA = """
CREATE TABLE IF NOT EXISTS capabilities (
 credential_hash TEXT PRIMARY KEY, actor TEXT NOT NULL, boss_id TEXT NOT NULL,
 run_id TEXT, task_id TEXT, attempt_id TEXT, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, boss_id TEXT NOT NULL, project_id TEXT NOT NULL,
 plan_version INTEGER NOT NULL, create_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), provider TEXT NOT NULL,
 current_attempt TEXT, state TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), provider TEXT NOT NULL,
 observed_model TEXT, input_hash TEXT NOT NULL, state TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT);
CREATE TABLE IF NOT EXISTS checkpoints (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), weight REAL NOT NULL,
 boss_only INTEGER NOT NULL, state TEXT NOT NULL, attempt_id TEXT, evidence_id TEXT,
 verified_at TEXT);
CREATE TABLE IF NOT EXISTS reports (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, credential_hash TEXT NOT NULL, payload_hash TEXT NOT NULL,
 result TEXT NOT NULL, run_id TEXT NOT NULL, task_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL, plan_version INTEGER NOT NULL, checkpoint_id TEXT NOT NULL,
 operation TEXT NOT NULL, evidence_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor_hash TEXT NOT NULL,
 action TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
 BEGIN SELECT RAISE(ABORT, 'append_only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
 BEGIN SELECT RAISE(ABORT, 'append_only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
 BEGIN SELECT RAISE(ABORT, 'append_only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
 BEGIN SELECT RAISE(ABORT, 'append_only'); END;
"""

class Ledger:
    def __init__(self, db_path: str, capability_file: str):
        self.db_path = str(Path(db_path).absolute())
        protected_directory(Path(self.db_path).parent)
        self.credential_hash = digest(read_protected(capability_file).strip())
        info = Path(self.db_path).lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise PermissionError("unprotected_database")
        self._active = ContextVar("ledger_transaction", default=None)
        with self.transaction() as conn:
            self._capability(conn)

    @staticmethod
    def _connect(path):
        conn = sqlite3.connect(path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    @classmethod
    def bootstrap(cls, db_path, capability_file, boss_id):
        """One-time owner provisioning. Returns bound Boss; never returns the secret."""
        key(boss_id)
        protected_directory(Path(db_path).parent)
        # O_EXCL means bootstrap can never install another Boss into an existing DB.
        fd = os.open(db_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        secret = secrets.token_urlsafe(48)
        conn = cls._connect(db_path)
        try:
            conn.executescript(SCHEMA)
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("INSERT INTO capabilities VALUES (?,?,?,?,?,?,0)",
                         (digest(secret), "boss", boss_id, None, None, None))
            write_new_private(capability_file, secret)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally: conn.close()
        return cls(db_path, capability_file)

    @contextmanager
    def transaction(self):
        """Reentrant per-context transaction; W1 may add rows using this same connection.

        Exceptions escaping the outer context roll back ALL writes. Never commit the
        yielded connection directly. Each entry rechecks the persisted capability.
        """
        active = self._active.get()
        if active is not None:
            self._capability(active)
            savepoint = "nested_" + secrets.token_hex(8)
            active.execute("SAVEPOINT " + savepoint)
            try:
                yield active
                active.execute("RELEASE " + savepoint)
            except Exception:
                active.execute("ROLLBACK TO " + savepoint)
                active.execute("RELEASE " + savepoint)
                raise
            return
        conn = self._connect(self.db_path)
        token = self._active.set(conn)
        try:
            conn.execute("BEGIN IMMEDIATE")
            self._capability(conn)
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._active.reset(token)
            conn.close()

    def _capability(self, conn):
        cap = conn.execute("SELECT * FROM capabilities WHERE credential_hash=? AND revoked=0",
                           (self.credential_hash,)).fetchone()
        if cap is None: raise PermissionError("invalid_capability")
        return cap

    def _authorize(self, conn, actors, **scope):
        cap = self._capability(conn)
        if cap["actor"] not in actors: raise PermissionError("wrong_actor")
        for field, value in scope.items():
            if cap[field] is not None and cap[field] != value:
                raise PermissionError("wrong_scope")
        return cap

    def _run(self, conn, run_id):
        run = conn.execute("SELECT * FROM runs WHERE id=?", (key(run_id),)).fetchone()
        if run is None: raise ValueError("unknown_run")
        self._authorize(conn, {"boss", "worker", "verifier"}, boss_id=run["boss_id"], run_id=run_id)
        return run

    def _audit(self, conn, action, value):
        conn.execute("INSERT INTO audit(actor_hash,action,payload_hash,created_at) VALUES(?,?,?,?)",
                     (self.credential_hash, action, digest(canonical(value)), timestamp()))

    def issue_capability(self, capability_file, actor, *, run_id=None, task_id=None, attempt_id=None):
        """Boss-only exact run/task/attempt assignment; verifier uses identical scope."""
        with self.transaction() as conn:
            cap = self._authorize(conn, {"boss"})
            if actor not in {"worker", "verifier"}: raise ValueError("invalid_actor")
            for value in (run_id, task_id, attempt_id): key(value)
            self._run(conn, run_id)
            task = conn.execute("SELECT * FROM tasks WHERE id=? AND run_id=?", (task_id,run_id)).fetchone()
            if task is None: raise ValueError("unknown_task")
            secret = secrets.token_urlsafe(48)
            conn.execute("INSERT INTO capabilities VALUES(?,?,?,?,?,?,0)",
                         (digest(secret), actor, cap["boss_id"], run_id, task_id, attempt_id))
            write_new_private(capability_file, secret)
            self._audit(conn, "issue", {"actor":actor,"run":run_id,"task":task_id,"attempt":attempt_id})
            return {"issued":True}

    def revoke_capability(self, capability_file):
        with self.transaction() as conn:
            cap = self._authorize(conn, {"boss"})
            target = digest(read_protected(capability_file).strip())
            changed = conn.execute("UPDATE capabilities SET revoked=1 WHERE credential_hash=? AND boss_id=?",
                                   (target,cap["boss_id"])).rowcount
            if not changed: raise ValueError("unknown_capability")
            self._audit(conn, "revoke_capability", {"hash":target})
            return {"revoked":True}

    def create_run(self, run:dict, tasks:list, checkpoints:list)->dict:
        with self.transaction() as conn:
            self._authorize(conn, {"boss"})
            if not isinstance(run,dict) or not isinstance(tasks,list) or not isinstance(checkpoints,list):
                raise ValueError("invalid_plan")
            self._authorize(conn, {"boss"}, boss_id=run.get("bossId"), run_id=run.get("id"))
            rid,bid,pid = key(run["id"]),key(run["bossId"]),key(run["projectId"])
            plan = version(run["planVersion"])
            payload_hash = digest(canonical([run,tasks,checkpoints]))
            previous = conn.execute("SELECT create_hash FROM runs WHERE id=?",(rid,)).fetchone()
            if previous:
                if previous[0] != payload_hash: raise ValueError("run_conflict")
                return {"id":rid}
            if not 1 <= len(tasks) <= 2000 or not 1 <= len(checkpoints) <= 10000:
                raise ValueError("invalid_plan")
            tids = [key(t["id"]) for t in tasks]
            if len(set(tids)) != len(tids): raise ValueError("duplicate_task")
            for t in tasks:
                if t["provider"] not in {"codex","claude"}: raise ValueError("invalid_provider")
            cids = [key(c["id"]) for c in checkpoints]
            if len(set(cids)) != len(cids): raise ValueError("duplicate_checkpoint")
            for c in checkpoints:
                w = c["weight"]
                if type(w) not in {float,int} or not math.isfinite(w) or not 0 < w <= 1000000:
                    raise ValueError("invalid_weight")
                if c["taskId"] not in tids or type(c["bossOnly"]) is not bool:
                    raise ValueError("invalid_checkpoint")
            if not math.isfinite(sum(c["weight"] for c in checkpoints)):
                raise ValueError("invalid_total")
            if not checkpoints[-1]["bossOnly"]:
                raise ValueError("positive_final_boss_checkpoint_required")
            for tid in tids:
                own = [c for c in checkpoints if c["taskId"]==tid]
                if not own or len(own)>100:
                    raise ValueError("positive_final_boss_checkpoint_required")
            at=timestamp()
            conn.execute("INSERT INTO runs VALUES(?,?,?,?,?,?)",(rid,bid,pid,plan,payload_hash,at))
            for t in tasks:
                conn.execute("INSERT INTO tasks VALUES(?,?,?,NULL,?,?)",(t["id"],rid,t["provider"],"queued",at))
            for c in checkpoints:
                conn.execute("INSERT INTO checkpoints VALUES(?,?,?,?,?,NULL,NULL,NULL)",
                             (c["id"],c["taskId"],c["weight"],int(c["bossOnly"]),"pending"))
            self._audit(conn,"create_run",[run,tasks,checkpoints])
            return {"id":rid}

    def start_attempt(self, task_id:str, attempt:dict)->dict:
        with self.transaction() as conn:
            self._authorize(conn, {"boss"})
            task=conn.execute("SELECT * FROM tasks WHERE id=?",(key(task_id),)).fetchone()
            if task is None: raise ValueError("unknown_task")
            self._run(conn,task["run_id"])
            aid=key(attempt["id"])
            provider=attempt.get("observedProvider")
            if provider != task["provider"]: raise ValueError("observed_provider_required")
            old=conn.execute("SELECT * FROM attempts WHERE id=?",(aid,)).fetchone()
            if old:
                if old["task_id"]!=task_id or task["current_attempt"]!=aid or old["input_hash"]!=digest(canonical(attempt)): raise ValueError("attempt_conflict")
                return {"id":aid}
            # Superseding this task releases only its current slot in this transaction.
            at=timestamp()
            conn.execute("UPDATE attempts SET ended_at=?,state='canceled' WHERE task_id=? AND ended_at IS NULL",(at,task_id))
            total=conn.execute("SELECT count(*) FROM attempts WHERE ended_at IS NULL").fetchone()[0]
            claude=conn.execute("SELECT count(*) FROM attempts WHERE ended_at IS NULL AND provider='claude'").fetchone()[0]
            if total>=4 or (provider=="claude" and claude>=2): raise ValueError("admission_limit")
            model=attempt.get("observedModel")
            if model is not None and (not isinstance(model,str) or not re.fullmatch(r"(?:gpt|claude)-[a-z0-9.-]{1,80}",model)):
                raise ValueError("invalid_observed_model")
            conn.execute("INSERT INTO attempts VALUES(?,?,?,?,?,?,?,NULL)",(aid,task_id,provider,model,digest(canonical(attempt)),"working",at))
            conn.execute("UPDATE tasks SET current_attempt=?,state='working',updated_at=? WHERE id=?",(aid,at,task_id))
            conn.execute("UPDATE checkpoints SET state='pending',attempt_id=NULL,evidence_id=NULL,verified_at=NULL WHERE task_id=?",(task_id,))
            conn.execute("UPDATE checkpoints SET state='pending',verified_at=NULL WHERE boss_only=1 AND task_id IN (SELECT id FROM tasks WHERE run_id=?)",(task["run_id"],))
            conn.execute("UPDATE runs SET updated_at=? WHERE id=?",(at,task["run_id"]))
            self._audit(conn,"start_attempt",{"taskId":task_id,"attempt":attempt})
            return {"id":aid}

    def _checkpoint_event(self, event, verify):
        with self.transaction() as conn:
            self._authorize(conn, {"verifier"} if verify else {"worker"},
                            run_id=event.get("runId"),task_id=event.get("taskId"),attempt_id=event.get("attemptId"))
            evidence=event.get("evidence",{})
            if not isinstance(evidence,dict) or evidence.get("kind","verification") not in {"commit","verification","link"}:
                raise ValueError("invalid_evidence")
            for name in ("label","safeUrl"):
                value=evidence.get(name)
                if value is not None and (not isinstance(value,str) or len(value)>300):
                    raise ValueError("invalid_evidence")
            run=self._run(conn,event["runId"])
            if version(event["planVersion"])!=run["plan_version"]: raise ValueError("old_plan")
            task=conn.execute("SELECT * FROM tasks WHERE id=? AND run_id=?",(event["taskId"],run["id"])).fetchone()
            if task is None: raise PermissionError("wrong_task")
            if task["current_attempt"]!=event["attemptId"]: raise PermissionError("old_attempt")
            eid=key(event["eventId"])
            fingerprint=digest(canonical({"operation":"verify" if verify else "report","event":event}))
            old=conn.execute("SELECT * FROM events WHERE id=?",(eid,)).fetchone()
            if old:
                if old["credential_hash"]!=self.credential_hash or old["payload_hash"]!=fingerprint:
                    raise ValueError("event_conflict")
                return json.loads(old["result"])
            cp=conn.execute("SELECT * FROM checkpoints WHERE id=? AND task_id=?",(event["checkpointId"],task["id"])).fetchone()
            if cp is None or cp["boss_only"]: raise PermissionError("boss_only_or_unknown_checkpoint")
            state=event.get("state","working")
            if state not in STATES: raise ValueError("invalid_state")
            at=timestamp()
            if verify:
                decision=event.get("decision")
                if decision not in {"accepted","revoked"}: raise ValueError("invalid_decision")
                if cp["attempt_id"]!=event["attemptId"] or cp["state"]=="pending":
                    raise ValueError("report_required")
                conn.execute("UPDATE checkpoints SET state=?,verified_at=? WHERE id=?",(decision,at,cp["id"]))
                if decision=="revoked":
                    conn.execute("UPDATE checkpoints SET state='pending',verified_at=NULL WHERE boss_only=1 AND task_id IN (SELECT id FROM tasks WHERE run_id=?)",(run["id"],))
            else:
                active=conn.execute("SELECT ended_at FROM attempts WHERE id=?",(event["attemptId"],)).fetchone()
                if active is None or active[0] is not None: raise ValueError("ended_attempt")
                if cp["state"] not in {"pending","reported"}: raise ValueError("checkpoint_already_verified")
                conn.execute("UPDATE checkpoints SET state='reported',attempt_id=?,evidence_id=?,verified_at=NULL WHERE id=?",
                             (event["attemptId"],eid,cp["id"]))
                conn.execute("UPDATE tasks SET state=? WHERE id=?",(state,task["id"]))
                conn.execute("UPDATE attempts SET state=?,ended_at=? WHERE id=?",
                             (state,at if state in {"done","failed","canceled"} else None,event["attemptId"]))
            conn.execute("UPDATE tasks SET updated_at=? WHERE id=?",(at,task["id"]))
            conn.execute("UPDATE runs SET updated_at=? WHERE id=?",(at,run["id"]))
            result={"eventId":eid,"state":event["decision"] if verify else "reported"}
            conn.execute("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                         (eid,self.credential_hash,fingerprint,canonical(result),run["id"],task["id"],
                          event["attemptId"],run["plan_version"],cp["id"],"verify" if verify else "report",digest(canonical(evidence))))
            self._audit(conn,"verify_checkpoint" if verify else "report_checkpoint",event)
            return result

    def report_checkpoint(self, event:dict)->dict:
        return self._checkpoint_event(event,False)

    def verify_checkpoint(self, event:dict)->dict:
        return self._checkpoint_event(event,True)

    def enqueue_report(self, report:dict)->dict:
        with self.transaction() as conn:
            self._authorize(conn,{"boss"})
            self._run(conn,report["runId"])
            rid=key(report["id"]);rev=version(report["revision"])
            status=report.get("status","pending")
            if status not in {"pending","sending","queued","retry_wait","failed","uncertain"}:
                raise ValueError("invalid_report_status")
            old=conn.execute("SELECT * FROM reports WHERE id=?",(rid,)).fetchone()
            if old and (old["run_id"]!=report["runId"] or rev<old["revision"]):
                raise ValueError("report_conflict")
            if old and rev==old["revision"]:
                if status!=old["status"]: raise ValueError("report_conflict")
                return {"id":rid,"revision":rev}
            conn.execute("INSERT INTO reports VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,status=excluded.status,updated_at=excluded.updated_at",
                         (rid,report["runId"],rev,status,timestamp()))
            self._audit(conn,"enqueue_report",report)
            return {"id":rid,"revision":rev}

    def ack_report(self,boss_id:str,report_id:str,revision:int)->dict:
        with self.transaction() as conn:
            self._authorize(conn,{"boss"},boss_id=boss_id)
            row=conn.execute("SELECT * FROM reports WHERE id=?",(key(report_id),)).fetchone()
            if row is None or row["revision"]!=version(revision): raise ValueError("report_revision_mismatch")
            self._run(conn,row["run_id"])
            conn.execute("UPDATE reports SET status='acknowledged',updated_at=? WHERE id=?",(timestamp(),report_id))
            self._audit(conn,"ack_report",{"id":report_id,"revision":revision})
            return {"id":report_id,"revision":revision,"status":"acknowledged"}

    def approve_run(self,boss_id:str,run_id:str,plan_version:int)->dict:
        with self.transaction() as conn:
            self._authorize(conn,{"boss"},boss_id=boss_id,run_id=run_id)
            run=self._run(conn,run_id)
            if run["plan_version"]!=version(plan_version): raise ValueError("old_plan")
            rows=conn.execute("SELECT c.* FROM checkpoints c JOIN tasks t ON t.id=c.task_id WHERE t.run_id=?",(run_id,)).fetchall()
            if any(c["state"]!="accepted" for c in rows if not c["boss_only"]):
                raise ValueError("unverified_checkpoints")
            at=timestamp()
            conn.execute("UPDATE checkpoints SET state='accepted',verified_at=? WHERE boss_only=1 AND task_id IN (SELECT id FROM tasks WHERE run_id=?)",(at,run_id))
            conn.execute("UPDATE tasks SET state='done',updated_at=? WHERE run_id=?",(at,run_id))
            conn.execute("UPDATE attempts SET state='done',ended_at=COALESCE(ended_at,?) WHERE task_id IN (SELECT id FROM tasks WHERE run_id=?)",(at,run_id))
            conn.execute("UPDATE runs SET updated_at=? WHERE id=?",(at,run_id))
            self._audit(conn,"approve_run",{"runId":run_id,"planVersion":plan_version})
            return {"id":run_id,"approved":True}

    def project_progress(self,now_iso:str)->dict:
        # Generated labels intentionally do not copy worker-controlled strings.
        parsed=datetime.fromisoformat(now_iso.replace("Z","+00:00"))
        if parsed.tzinfo is None or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z",now_iso):
            raise ValueError("invalid_time")
        opaque = public_id
        def pct(rows,worker=False):
            total=sum(c["weight"] for c in rows)
            eligible = {"reported","accepted"} if worker else {"accepted"}
            value = round(sum(c["weight"] for c in rows if c["state"] in eligible)/total*100,6)
            return value if all(c["state"] in eligible for c in rows) else min(value,99.999999)
        with self.transaction() as conn:
            cap=self._authorize(conn,{"boss"})
            runs=[];tasks=[];reports=[]
            for r in conn.execute("SELECT * FROM runs WHERE boss_id=? ORDER BY id",(cap["boss_id"],)):
                own=[]
                for t in conn.execute("SELECT * FROM tasks WHERE run_id=? ORDER BY id",(r["id"],)):
                    cps=list(conn.execute("SELECT * FROM checkpoints WHERE task_id=? ORDER BY rowid",(t["id"],)))
                    own.extend(cps)
                    attempts=list(conn.execute("SELECT * FROM attempts WHERE task_id=? ORDER BY started_at,id",(t["id"],)))
                    observed=next((a["observed_model"] for a in attempts if a["id"]==t["current_attempt"]),None)
                    complete=all(c["state"]=="accepted" for c in cps)
                    state="done" if complete else ("qa" if t["state"]=="done" else t["state"])
                    tasks.append({"id":opaque("task",t["id"]),"runId":opaque("run",r["id"]),"parentTaskId":None,
                        "role":"worker","provider":t["provider"],"requestedModel":None,"observedModel":observed,
                        "state":state,"planVersion":r["plan_version"],"verifiedPct":pct(cps),"workerPct":pct(cps,True),
                        "blockerSummary":"Work blocked" if state=="blocked" else None,"updatedAt":t["updated_at"],
                        "checkpoints":[{"id":opaque("checkpoint",c["id"]),"label":"Boss approval" if c["boss_only"] else "Work checkpoint",
                            "weight":c["weight"],"bossOnly":bool(c["boss_only"]),"state":c["state"],
                            "evidence":[] if c["evidence_id"] is None else [{"id":opaque("evidence",c["evidence_id"]),
                                "kind":"verification","label":"Checkpoint evidence","safeUrl":None,"verifiedAt":c["verified_at"]}]} for c in cps],
                        "attempts":[{"id":opaque("attempt",a["id"]),"state":a["state"],"observedModel":a["observed_model"],
                            "startedAt":a["started_at"],"endedAt":a["ended_at"]} for a in attempts]})
                run_tasks=[t for t in tasks if t["runId"]==opaque("run",r["id"])]
                state="done" if all(t["state"]=="done" for t in run_tasks) else next(
                    (s for s in ["blocked","failed","canceled","working","qa","queued"] if any(t["state"]==s for t in run_tasks)),"queued")
                runs.append({"id":opaque("run",r["id"]),"bossId":opaque("boss",r["boss_id"]),"bossLabel":None,
                    "projectId":r["project_id"],"objectiveSummary":"Work run","planVersion":r["plan_version"],
                    "state":state,"verifiedPct":pct(own),"workerPct":pct(own,True),"updatedAt":r["updated_at"]})
                for p in conn.execute("SELECT * FROM reports WHERE run_id=? ORDER BY id",(r["id"],)):
                    reports.append({"id":opaque("report",p["id"]),"runId":opaque("run",r["id"]),
                                    "revision":p["revision"],"status":p["status"],"updatedAt":p["updated_at"]})
            if len(runs)>500 or len(tasks)>2000 or len(reports)>2000 or any(len(t["attempts"])>100 for t in tasks):
                raise ValueError("projection_collection_limit")
            view={"schemaVersion":1,"observedAt":now_iso,"catalogState":"unavailable","projects":[],
                  "runs":runs,"tasks":tasks,"reports":reports}
            canonical(view)
            return view
