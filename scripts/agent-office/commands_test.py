"""Synthetic W1 integration tests: credentials and separate SQLite connections."""
import concurrent.futures
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid
from ledger import Ledger, public_id

try:
    from commands import CommandStore, CommandError
except ImportError:
    CommandStore = None

T = datetime(2026, 1, 1, tzinfo=timezone.utc)
def at(seconds=0):
    return (T + timedelta(seconds=seconds)).isoformat(timespec="milliseconds").replace("+00:00", "Z")

class CommandsTest(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(CommandStore, "durable command inbox implementation is missing")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        os.chmod(self.tmp.name, 0o700)
        self.db = str(Path(self.tmp.name) / "db")
        self.boss = Ledger.bootstrap(self.db, str(Path(self.tmp.name) / "boss"), "synthetic-boss")
        self.caps = {}
        for purpose in ("web-intake","bridge-claim","boss-redeem","boss-reply","boss-dispatch"):
            path = str(Path(self.tmp.name) / purpose)
            self.boss.issue_command_capability(path, purpose, owner_id="owner", binding_id="binding",
                                               project_ids=["catalog-project"])
            self.caps[purpose] = {"capabilityFile":path}
        self.store = CommandStore(self.db)

    def data(self, text="synthetic question", parent=None, project=None, request=None):
        d = {"schemaVersion":1,"clientRequestId":request or str(uuid.uuid4()),"projectId":project,"text":text}
        if parent: d["replyToCommandId"] = parent
        return d

    def submit(self, data=None, sec=0):
        return self.store.submit(self.caps["web-intake"], {"id":"binding"}, data or self.data(), at(sec))

    def receive(self, receipt, sec=0):
        claim = self.store.claim(self.caps["bridge-claim"], at(sec))
        self.assertEqual(claim["commandId"], receipt["id"])
        payload = self.store.redeem(self.caps["boss-redeem"], receipt["id"], claim["payloadHash"], at(sec+1))
        return claim, payload

    def decision(self, receipt, kind, sec=2, **kw):
        return self.store.record_decision(self.caps["boss-dispatch"],
                                         {"commandId":receipt["id"],"kind":kind,"now":at(sec),**kw})

    def reply(self, receipt, kind="query_answer", sec=3, **kw):
        return self.store.write_reply(self.caps["boss-reply"],
            {"commandId":receipt["id"],"kind":kind,"summary":"Safe answer","now":at(sec),**kw})

    def error(self, code, fn):
        with self.assertRaises(CommandError) as ctx: fn()
        self.assertEqual(ctx.exception.code, code)
        return ctx.exception

    def test_idempotency_and_equivalent_pending(self):
        d=self.data()
        r=self.submit(d)
        self.assertEqual(self.submit(d), r)
        self.error("conflict", lambda:self.submit({**d,"text":"changed"}))
        err=self.error("equivalent_pending", lambda:self.submit(self.data()))
        self.assertEqual(err.receipt_id,r["id"])
        self.receive(r); self.decision(r,"query"); self.reply(r)
        self.assertNotEqual(self.submit(self.data(),4)["id"],r["id"])

    def test_strict_input_and_catalog(self):
        for d in ({**self.data(),"actor":"boss"}, {**self.data(),"schemaVersion":True},
                  self.data("\x00"),self.data("x"*4001),self.data(" "),
                  self.data(project="unknown"),self.data(request="native-session")):
            with self.assertRaises((ValueError,PermissionError)): self.submit(d)
        self.assertIsNone(self.submit()["projectId"])

    def test_credential_scope_and_revocation(self):
        r=self.submit()
        for purpose in ("web-intake","bridge-claim","boss-reply"):
            with self.assertRaises(PermissionError):
                self.store.redeem(self.caps[purpose],r["id"],"0"*64,at())
        with self.assertRaises(PermissionError):
            self.store.submit({"actor":"boss","purpose":"web-intake"},{"id":"binding"},self.data(),at())
        with self.assertRaises(PermissionError):
            self.store.submit(self.caps["web-intake"],{"id":"other"},self.data(),at())
        foreign=str(Path(self.tmp.name)/"foreign")
        self.boss.issue_command_capability(foreign,"boss-redeem",owner_id="foreign",binding_id="binding",project_ids=[])
        with self.assertRaises(PermissionError): self.store.redeem({"capabilityFile":foreign},r["id"],"0"*64,at())
        self.boss.revoke_capability(self.caps["web-intake"]["capabilityFile"])
        with self.assertRaises(PermissionError): self.submit()
        # The scoped command credential cannot gain core Boss authority.
        with self.assertRaises(PermissionError):
            Ledger(self.db,self.caps["boss-dispatch"]["capabilityFile"]).create_run({},[],[])

    def test_parent_authorization_and_single_answer(self):
        parent=self.submit()
        with self.assertRaises(ValueError): self.submit(self.data(parent=parent["id"]))
        self.receive(parent); self.decision(parent,"needs_clarification"); self.reply(parent,"clarification")
        child=self.submit(self.data("answer",parent=parent["id"]),4)
        self.assertEqual(child["replyToCommandId"],parent["id"])
        with self.assertRaises(ValueError): self.submit(self.data("different",parent=parent["id"]),5)
        with self.assertRaises(ValueError): self.submit(self.data("answer",parent=parent["id"],project="catalog-project"),5)

    def test_rate_minute_and_retries(self):
        d=self.data("0"); self.submit(d)
        for _ in range(10): self.submit(d)
        for i in range(1,5): self.submit(self.data(str(i)))
        e=self.error("rate_limited", lambda:self.submit(self.data("six")))
        self.assertEqual(e.status,429)
        self.assertGreater(e.retry_after,0)
        self.submit(self.data("after"),61)

    def test_hour_and_pending_limits(self):
        # Complete queries so only the hourly budget is reached.
        for i in range(30):
            sec=i*65
            r=self.submit(self.data(str(i)),sec); self.receive(r,sec); self.decision(r,"query",sec+2); self.reply(r,sec=sec+3)
        self.error("rate_limited",lambda:self.submit(self.data("31"),1950))
        self.submit(self.data("after hour"),3601)
        other=str(Path(self.tmp.name)/"other")
        self.boss.issue_command_capability(other,"web-intake",owner_id="other",binding_id="binding",project_ids=[])
        for i in range(20):
            self.store.submit({"capabilityFile":other},{"id":"binding"},self.data(str(i)),at(i*65))
        self.error("rate_limited",lambda:self.store.submit({"capabilityFile":other},{"id":"binding"},self.data("21"),at(1400)))

    def test_lease_fencing_retry_budget_and_uncertainty(self):
        r=self.submit(); c=self.store.claim(self.caps["bridge-claim"],at())
        self.assertIsNone(self.store.claim(self.caps["bridge-claim"],at(1)))
        event={"capability":self.caps["bridge-claim"],"commandId":r["id"],"leaseToken":c["leaseToken"],
               "outcome":"retry_wait","now":at(1)}
        self.store.record_transport(event)
        self.assertIsNone(self.store.claim(self.caps["bridge-claim"],at(4)))
        c2=self.store.claim(self.caps["bridge-claim"],at(6))
        with self.assertRaises(PermissionError): self.store.record_transport({**event,"now":at(7)})
        self.store.record_transport({**event,"leaseToken":c2["leaseToken"],"now":at(7)})
        c3=self.store.claim(self.caps["bridge-claim"],at(37))
        self.store.record_transport({**event,"leaseToken":c3["leaseToken"],"now":at(38)})
        self.assertIsNone(self.store.claim(self.caps["bridge-claim"],at(200)))
        self.assertEqual(self.store.receipts("owner",None)["receipts"][0]["state"],"failed")
        r2=self.submit(self.data("possible send"),250)
        self.store.claim(self.caps["bridge-claim"],at(250))
        self.assertIsNone(self.store.claim(self.caps["bridge-claim"],at(400)))
        self.assertEqual(self.store.receipts("owner",None)["receipts"][-1]["state"],"uncertain")

    def test_ttl_received_and_expired_redeem(self):
        r=self.submit(); c=self.store.claim(self.caps["bridge-claim"],at())
        self.error("already_processed",lambda:self.store.redeem(self.caps["boss-redeem"],r["id"],c["payloadHash"],at(86400)))
        r2=self.submit(self.data("received"),86401); self.receive(r2,86401)
        self.store.purge(at(200000))
        self.assertEqual(self.store.receipts("owner",None)["receipts"][-1]["state"],"received")

    def test_new_run_atomic_and_retry_query_has_no_run(self):
        r=self.submit(self.data(project="catalog-project")); self.receive(r)
        run={"id":"synthetic-run","bossId":"synthetic-boss","projectId":"catalog-project","planVersion":1}
        tasks=[{"id":"synthetic-task","provider":"codex"}]
        cps=[{"id":"synthetic-final","taskId":"synthetic-task","weight":1,"bossOnly":True}]
        for _ in range(3): self.decision(r,"new_task",run=run,tasks=tasks,checkpoints=cps)
        conn=Ledger._connect(self.db); self.addCleanup(conn.close)
        self.assertEqual(conn.execute("select count(*) from runs").fetchone()[0],1)
        self.assertEqual(conn.execute("select count(*) from command_dispatch_intents").fetchone()[0],1)
        receipt=self.store.receipts("owner",None)["receipts"][0]
        self.assertEqual(receipt["runId"],public_id("run",run["id"]))
        self.assertEqual(receipt["processingStage"],"dispatch_intent")
        q=self.submit(self.data("question"),4); self.receive(q,4); self.decision(q,"query",6); self.reply(q,sec=7)
        self.assertEqual(conn.execute("select count(*) from runs").fetchone()[0],1)
        self.assertIsNone(self.store.receipts("owner",None)["receipts"][-1]["runId"])
        bad=self.submit(self.data("bad task",project="catalog-project"),8);self.receive(bad,8)
        with self.assertRaises(ValueError): self.decision(bad,"new_task",10,run={**run,"id":"bad-run"},tasks=tasks,checkpoints=[])
        self.assertEqual(conn.execute("select count(*) from runs").fetchone()[0],1)

    def test_raw_redaction_resume_and_retention(self):
        secret="SENTINEL transcript /private/synthetic TOKEN_SECRET"
        d=self.data(secret);r=self.submit(d);claim,payload=self.receive(r)
        self.assertEqual(payload["input"]["text"],secret)
        self.assertNotIn(secret,json.dumps(self.store.resume(self.caps["boss-redeem"])))
        self.decision(r,"query"); self.reply(r)
        public=json.dumps(self.store.receipts("owner",None))
        self.assertNotIn("SENTINEL",public);self.assertNotIn("TOKEN_SECRET",public)
        self.assertNotIn("capabilityFile",public)
        self.store.purge(at(7*86400+4))
        conn=Ledger._connect(self.db);self.addCleanup(conn.close)
        row=conn.execute("select raw_input,reply_summary from commands where id=?",(r["id"],)).fetchone()
        self.assertIsNone(row["raw_input"]);self.assertIsNone(row["reply_summary"])
        self.store.purge(at(30*86400+4))
        self.assertEqual(self.store.receipts("owner",None)["receipts"],[])
        self.error("already_processed",lambda:self.submit(d,31*86400))
        self.error("conflict",lambda:self.submit({**d,"text":"different"},31*86400))
        self.assertEqual(conn.execute("select count(*) from command_tombstones").fetchone()[0],1)

    def test_clarification_closes_after_thirty_days(self):
        r=self.submit(); self.receive(r);self.decision(r,"needs_clarification");self.reply(r,"clarification")
        self.store.purge(at(30*86400+4))
        conn=Ledger._connect(self.db);self.addCleanup(conn.close)
        self.assertEqual(conn.execute("select state from commands where id=?",(r["id"],)).fetchone()[0],"closed")

    def test_concurrent_connections_dedup_and_gc(self):
        d=self.data()
        def call(i):
            s=CommandStore(self.db)
            s.purge(at())
            return s.submit(self.caps["web-intake"],{"id":"binding"},d,at())["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            ids=list(pool.map(call,range(16)))
        self.assertEqual(len(set(ids)),1)
        def equivalent(i):
            try: return CommandStore(self.db).submit(self.caps["web-intake"],{"id":"binding"},self.data(),at())
            except CommandError as e: return e.code
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(list(pool.map(equivalent,range(8))),["equivalent_pending"]*8)

    def test_pagination_owner_partition_and_cli_safe_payload(self):
        for i in range(5): self.submit(self.data(str(i)))
        page=self.store.receipts("owner",None,2)
        self.assertEqual(len(page["receipts"]),2)
        self.assertEqual(len(self.store.receipts("owner",page["nextCursor"],2)["receipts"]),2)
        self.assertEqual(self.store.receipts("foreign",None)["receipts"],[])
        result=subprocess.run(["python3","scripts/agent-office/office_cli.py","--db",self.db,
                               "--capability-file",self.caps["web-intake"]["capabilityFile"],"command-list"],
                              input='{}',capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(len(json.loads(result.stdout)["receipts"]),5)
        self.assertNotIn("capabilityFile",result.stdout)
        self.assertEqual(result.stderr,"")

    def test_cli_submit_redeem_and_scoped_error_payloads(self):
        def cli(purpose,op,payload):
            return subprocess.run(["python3","scripts/agent-office/office_cli.py","--db",self.db,
                "--capability-file",self.caps[purpose]["capabilityFile"],op],input=json.dumps(payload),
                capture_output=True,text=True,timeout=3)
        data=self.data()
        result=cli("web-intake","command-submit",{"input":data,"now":at()})
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        submitted=json.loads(result.stdout)
        self.assertFalse(submitted["replayed"])
        r=submitted["receipt"]
        same=cli("web-intake","command-submit",{"input":data,"now":at()})
        self.assertTrue(json.loads(same.stdout)["replayed"])
        self.assertEqual(json.loads(same.stdout)["receipt"]["id"],r["id"])
        replay=cli("web-intake","command-submit",{"input":self.data(request="123e4567-e89b-42d3-a456-426614174001"),"now":at()})
        self.assertEqual(json.loads(replay.stdout)["error"],"equivalent_pending")
        claimed=cli("bridge-claim","command-claim",{"now":at()})
        c=json.loads(claimed.stdout)
        redeemed=cli("boss-redeem","command-redeem",{"commandId":r["id"],"payloadHash":c["payloadHash"],"now":at(1)})
        self.assertEqual(json.loads(redeemed.stdout)["input"]["text"],"synthetic question")
        rejected=cli("web-intake","command-redeem",{"commandId":r["id"],"payloadHash":c["payloadHash"]})
        self.assertEqual(json.loads(rejected.stdout),{"error":"permission_denied"})
        self.assertEqual(rejected.stderr,"")

    def test_worker_and_foreign_binding_cannot_redeem_or_reply(self):
        self.boss.create_run({"id":"worker-run","bossId":"synthetic-boss","projectId":"catalog-project","planVersion":1},
                            [{"id":"worker-task","provider":"codex"}],
                            [{"id":"worker-final","taskId":"worker-task","bossOnly":True,"weight":1}])
        path=str(Path(self.tmp.name)/"worker")
        self.boss.issue_capability(path,"worker",run_id="worker-run",task_id="worker-task",attempt_id="attempt")
        r=self.submit();c,_=self.receive(r);self.decision(r,"query")
        with self.assertRaises(PermissionError): self.store.redeem({"capabilityFile":path},r["id"],c["payloadHash"],at(2))
        with self.assertRaises(PermissionError): self.store.write_reply({"capabilityFile":path},
            {"commandId":r["id"],"kind":"query_answer","summary":"Safe answer","now":at(3)})
        path2=str(Path(self.tmp.name)/"other-binding")
        self.boss.issue_command_capability(path2,"boss-reply",owner_id="owner",binding_id="other-binding",project_ids=[])
        with self.assertRaises(PermissionError): self.store.write_reply({"capabilityFile":path2},
            {"commandId":r["id"],"kind":"query_answer","summary":"Safe answer","now":at(3)})

    def test_tombstone_preserves_binding_authority(self):
        d=self.data();r=self.submit(d);self.receive(r);self.decision(r,"query");self.reply(r)
        self.store.purge(at(31*86400))
        path=str(Path(self.tmp.name)/"rebound")
        self.boss.issue_command_capability(path,"web-intake",owner_id="owner",binding_id="new-binding",project_ids=[])
        with self.assertRaises(PermissionError):
            self.store.submit({"capabilityFile":path},{"id":"new-binding"},d,at(31*86400))

    def test_concurrent_expiry_redeem_and_equivalence(self):
        r=self.submit();c=self.store.claim(self.caps["bridge-claim"],at())
        def gc():
            return CommandStore(self.db).purge(at(86400))
        def redeem():
            try:
                return CommandStore(self.db).redeem(self.caps["boss-redeem"],r["id"],c["payloadHash"],at(86400))
            except CommandError as e: return e.code
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(gc),pool.submit(redeem)]
            self.assertEqual(futures[1].result(),"already_processed")
            futures[0].result()
        self.assertEqual(self.store.receipts("owner",None)["receipts"][0]["state"],"expired")
        # Different IDs for the same intent racing in independent connections.
        def submit(i):
            try: return CommandStore(self.db).submit(self.caps["web-intake"],{"id":"binding"},self.data("race"),at(86401))
            except CommandError as e: return e.code
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            values=list(pool.map(submit,range(8)))
        self.assertEqual(sum(isinstance(v,dict) for v in values),1)
        self.assertEqual(values.count("equivalent_pending"),7)

    def test_native_result_ack_does_not_fake_command_completion(self):
        r=self.submit(self.data("new task",project="catalog-project"));self.receive(r)
        run={"id":"ack-run","bossId":"synthetic-boss","projectId":"catalog-project","planVersion":1}
        tasks=[{"id":"ack-task","provider":"codex"}]
        cps=[{"id":"ack-final","taskId":"ack-task","weight":1,"bossOnly":True}]
        self.decision(r,"new_task",run=run,tasks=tasks,checkpoints=cps);self.reply(r,"ack")
        self.boss.enqueue_report({"id":"ack-report","runId":"ack-run","revision":1})
        self.boss.ack_report("synthetic-boss","ack-report",1)
        self.store.resume(self.caps["boss-redeem"])
        self.assertNotEqual(self.store.receipts("owner",None)["receipts"][0]["state"],"handled")
        # W1 never fabricates native started/dispatched state from an ack reply.
        self.assertEqual(self.store.receipts("owner",None)["receipts"][0]["processingStage"],"dispatch_intent")
        progress=json.dumps(self.boss.project_progress(at(5)))
        self.assertNotIn("new task",progress)
        self.assertNotIn("synthetic-boss",progress)

    def test_unsafe_reply_and_claim_payload_are_bounded(self):
        r=self.submit(self.data("SECRET_RAW_COMMAND"));c,p=self.receive(r);self.decision(r,"query")
        self.assertNotIn("SECRET_RAW_COMMAND",json.dumps(c))
        for summary in ("SECRET_RAW_COMMAND","/home/synthetic/private","Bearer synthetic","TOKEN_SECRET","x"*2001):
            with self.assertRaises(ValueError): self.reply(r,summary=summary)

    def test_revision_records_plan_and_rejects_foreign_command_run(self):
        self.boss.create_run({"id":"rev-run","bossId":"synthetic-boss","projectId":"catalog-project","planVersion":3},
                            [{"id":"rev-task","provider":"codex"}],
                            [{"id":"rev-final","taskId":"rev-task","bossOnly":True,"weight":1}])
        r=self.submit(self.data("revise",project="catalog-project"));self.receive(r)
        self.decision(r,"revise_run",runId="rev-run")
        conn=Ledger._connect(self.db);self.addCleanup(conn.close)
        saved=conn.execute("SELECT * FROM command_revisions WHERE command_id=?",(r["id"],)).fetchone()
        self.assertEqual(saved["plan_version"],3)
        self.assertEqual(conn.execute("SELECT plan_version FROM runs WHERE id='rev-run'").fetchone()[0],3)

    def test_expired_redeem_persists_terminal_state(self):
        r=self.submit();c=self.store.claim(self.caps["bridge-claim"],at())
        self.error("already_processed",lambda:self.store.redeem(self.caps["boss-redeem"],r["id"],c["payloadHash"],at(86400)))
        self.assertEqual(self.store.receipts("owner",None)["receipts"][0]["state"],"expired")

    def test_direct_command_run_retries_and_composition_rollback(self):
        r=self.submit(self.data(project="catalog-project"));self.receive(r)
        run={"id":"direct-run","bossId":"synthetic-boss","projectId":"catalog-project","planVersion":1}
        tasks=[{"id":"direct-task","provider":"codex"}]
        cps=[{"id":"direct-final","taskId":"direct-task","weight":1,"bossOnly":True}]
        self.decision(r,"new_task",run=run,tasks=tasks,checkpoints=cps)
        scoped=Ledger(self.db,self.caps["boss-dispatch"]["capabilityFile"])
        for _ in range(3): self.assertEqual(scoped.create_run_for_command(r["id"],run,tasks,cps),{"id":"direct-run"})
        with self.assertRaises(ValueError): scoped.create_run_for_command(r["id"],{**run,"id":"changed"},tasks,cps)
        second=self.submit(self.data("rollback",project="catalog-project"),4);self.receive(second,4)
        with self.assertRaises(RuntimeError):
            with scoped.transaction() as conn:
                conn.execute("UPDATE commands SET decision='new_task' WHERE id=?",(second["id"],))
                scoped.create_run_for_command(second["id"],{**run,"id":"rollback-run"},
                    [{"id":"rollback-task","provider":"codex"}],
                    [{"id":"rollback-final","taskId":"rollback-task","weight":1,"bossOnly":True}])
                raise RuntimeError("synthetic outer failure")
        with scoped.transaction() as conn:
            self.assertIsNone(conn.execute("SELECT 1 FROM runs WHERE id='rollback-run'").fetchone())
            self.assertIsNone(conn.execute("SELECT decision FROM commands WHERE id=?",(second["id"],)).fetchone()[0])

    def test_started_only_completes_after_approved_run_and_result_ack(self):
        for order in ("ack-first","approve-first"):
            with self.subTest(order=order):
                r=self.submit(self.data(order,project="catalog-project"))
                self.receive(r)
                rid="complete-"+order;tid="task-"+order
                self.decision(r,"new_task",run={"id":rid,"bossId":"synthetic-boss","projectId":"catalog-project","planVersion":1},
                    tasks=[{"id":tid,"provider":"codex"}],
                    checkpoints=[{"id":"final-"+order,"taskId":tid,"weight":1,"bossOnly":True}])
                # Fixture representing W3's future authenticated native-start proof.
                # W1 itself has no API that fabricates a started native worker.
                with self.store._private_transaction() as conn:
                    conn.execute("UPDATE commands SET state='started',stage='dispatched' WHERE id=?",(r["id"],))
                report="report-"+order
                self.boss.enqueue_report({"id":report,"runId":rid,"revision":1})
                if order=="ack-first":
                    self.boss.ack_report("synthetic-boss",report,1)
                else:
                    self.boss.approve_run("synthetic-boss",rid,1)
                state=lambda:next(x["state"] for x in self.store.receipts("owner",None)["receipts"] if x["id"]==r["id"])
                self.assertEqual(state(),"started")
                if order=="ack-first":
                    self.boss.approve_run("synthetic-boss",rid,1)
                    self.assertEqual(state(),"started")
                    # A fresh result ACK after completion is required.
                self.boss.ack_report("synthetic-boss",report,1)
                self.assertEqual(state(),"handled")

if __name__=="__main__": unittest.main()
