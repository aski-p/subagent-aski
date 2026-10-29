"""Synthetic-only tests for durable progress, authorization and admission."""
import concurrent.futures
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

try:
    from ledger import Ledger
except ImportError:
    Ledger = None

AT = "2026-10-29T10:00:00Z"

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(Ledger, "durable Ledger implementation is missing")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "runtime"
        self.db = str(self.root / "ledger.db")
        self.bossfile = str(self.root / "boss.cap")
        self.boss = Ledger.bootstrap(self.db, self.bossfile, "boss-1")
        self.create()
        self.worker = self.issue("worker", "worker", task_id="t1", attempt_id="a1")
        self.verifier = self.issue("verifier", "verifier", task_id="t1", attempt_id="a1")
        self.boss.start_attempt("t1", {"id":"a1", "observedProvider":"codex",
                                     "requestedModel":"requested-only"})

    def create(self, run_id="r1", task_id="t1", provider="codex"):
        return self.boss.create_run(
            {"id":run_id, "bossId":"boss-1", "projectId":"p1", "planVersion":1,
             "objectiveSummary":"CANARY /private/path secret native-thread raw prompt"},
            [{"id":task_id,"provider":provider,"role":"CANARY",
              "requestedModel":"CANARY"}],
            [{"id":run_id+"c"+str(i), "taskId":task_id, "weight":weight,
              "bossOnly":i==3,"label":"CANARY"} for i,weight in [(1,30),(2,50),(3,20)]])

    def issue(self, name, actor, **scope):
        path = str(self.root / (name+".cap"))
        self.boss.issue_capability(path, actor, run_id="r1", **scope)
        return Ledger(self.db, path)

    def event(self, cp=1, event_id=None, **kw):
        return dict({"eventId":event_id or "e"+str(cp),"runId":"r1","taskId":"t1",
                     "attemptId":"a1","planVersion":1,"checkpointId":"r1c"+str(cp),
                     "evidence":{"raw":"CANARY","safeUrl":"https://evil.test/?secret=CANARY"}}, **kw)

    def accept(self, cp=1):
        self.worker.report_checkpoint(self.event(cp))
        self.verifier.verify_checkpoint(self.event(cp, "v"+str(cp), decision="accepted"))

    def view(self):
        return self.boss.project_progress(AT)

    def test_01_weighted_progress_and_positive_boss_gate(self):
        self.worker.report_checkpoint(self.event())
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],0)
        self.verifier.verify_checkpoint(self.event(event_id="v1",decision="accepted"))
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],30)
        self.accept(2)
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],80)
        self.boss.approve_run("boss-1","r1",1)
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],100)

    def test_02_event_idempotency_and_conflict(self):
        event=self.event()
        self.assertEqual(self.worker.report_checkpoint(event),self.worker.report_checkpoint(event))
        with self.assertRaises(ValueError):
            self.worker.report_checkpoint(self.event(evidence={"changed":True}))

    def test_03_revocation_decreases_and_invalidates_approval(self):
        self.accept();self.accept(2)
        self.boss.approve_run("boss-1","r1",1)
        self.verifier.verify_checkpoint(self.event(event_id="revoke",decision="revoked"))
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],50)

    def test_04_old_attempt_and_plan_rejected(self):
        self.boss.start_attempt("t1",{"id":"a2","observedProvider":"codex"})
        with self.assertRaises(PermissionError):self.worker.report_checkpoint(self.event())
        fresh=self.issue("fresh","worker",task_id="t1",attempt_id="a2")
        with self.assertRaises(ValueError):
            fresh.report_checkpoint(self.event(attemptId="a2",planVersion=2))

    def test_05_role_forgery_wrong_scope_and_wrong_boss(self):
        for method,args in [
            (self.worker.verify_checkpoint,(self.event(actor="boss",decision="accepted"),)),
            (self.worker.approve_run,("boss-1","r1",1)),
            (self.worker.ack_report,("boss-1","missing",1)),
            (self.worker.create_run,({},[],[])),
            (self.worker.start_attempt,("t1",{"id":"x"})),
            (self.worker.issue_capability,(str(self.root/"forged.cap"),"boss"))]:
            with self.assertRaises(PermissionError):method(*args)
        for changed in [{"taskId":"other"},{"attemptId":"other"},{"runId":"other"}]:
            with self.assertRaises(PermissionError):self.worker.report_checkpoint(self.event(**changed))
        with self.assertRaises(PermissionError):self.boss.approve_run("boss-wrong","r1",1)
        forged=self.root/"forged.cap";forged.write_text("forged");forged.chmod(0o600)
        with self.assertRaises(PermissionError):Ledger(self.db,str(forged))

    def test_06_restart_ack_is_not_approval(self):
        self.accept();self.accept(2)
        self.boss.enqueue_report({"id":"report1","runId":"r1","revision":1,"status":"queued","raw":"CANARY"})
        self.boss.ack_report("boss-1","report1",1)
        reopened=Ledger(self.db,self.bossfile)
        view=reopened.project_progress(AT)
        self.assertEqual(view["reports"][0]["status"],"acknowledged")
        self.assertEqual(view["runs"][0]["verifiedPct"],80)
        with self.assertRaises(ValueError):self.boss.ack_report("boss-1","report1",2)

    def test_07_blocked_preserves_accepted_weight_and_restart_resets_attempt_evidence(self):
        self.accept()
        self.worker.report_checkpoint(self.event(2, state="blocked"))
        self.assertEqual(self.view()["tasks"][0]["state"],"blocked")
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],30)
        self.boss.start_attempt("t1",{"id":"a2","observedProvider":"codex"})
        self.assertEqual(self.view()["runs"][0]["verifiedPct"],0)

    def test_08_projection_redacts_canaries_and_observation_is_explicit(self):
        self.worker.report_checkpoint(self.event())
        view=self.view();raw=json.dumps(view)
        for secret in ["CANARY","/private/path","native-thread","requested-only","evil.test"]:
            self.assertNotIn(secret,raw)
        self.assertIsNone(view["tasks"][0]["observedModel"])
        self.assertIsNone(view["tasks"][0]["requestedModel"])
        self.assertEqual(view["projects"],[])
        self.assertEqual(view["catalogState"],"unavailable")

    def test_09_permissions_revocation_and_append_only_audit(self):
        for path in [self.db,self.bossfile,str(self.root/"worker.cap")]:
            self.assertEqual(os.stat(path).st_mode & 0o777,0o600)
        self.assertEqual(os.stat(self.root).st_mode & 0o777,0o700)
        self.boss.revoke_capability(str(self.root/"worker.cap"))
        with self.assertRaises(PermissionError):self.worker.report_checkpoint(self.event())
        with sqlite3.connect(self.db) as conn:
            self.assertGreater(conn.execute("select count(*) from audit").fetchone()[0],0)
            with self.assertRaises(sqlite3.DatabaseError):conn.execute("delete from audit")

    def test_10_invalid_weights_and_approval_before_evidence(self):
        with self.assertRaises(ValueError):self.boss.approve_run("boss-1","r1",1)
        for weight in [0,-1,float("nan"),float("inf")]:
            with self.assertRaises(ValueError):
                self.boss.create_run({"id":"bad","bossId":"boss-1","projectId":"p","planVersion":1},
                                     [{"id":"badtask","provider":"codex"}],
                                     [{"id":"badcp","taskId":"badtask","weight":weight,"bossOnly":True}])
        with self.assertRaises(ValueError):
            self.boss.create_run({"id":"bad","bossId":"boss-1","projectId":"p","planVersion":1},
                                 [{"id":"badtask","provider":"codex"}],
                                 [{"id":"badcp","taskId":"badtask","weight":1,"bossOnly":False}])

    def test_11_transactional_four_total_two_claude_admission(self):
        for n in range(2,8):self.create("r"+str(n),"t"+str(n),"claude" if n<5 else "codex")
        def start(n):
            try:
                Ledger(self.db,self.bossfile).start_attempt("t"+str(n),
                    {"id":"a"+str(n),"observedProvider":"claude" if n<5 else "codex"})
                return True
            except ValueError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(start,range(2,8)))
        self.assertEqual(sum(results),3)
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("select count(*) from attempts where ended_at is null").fetchone()[0],4)
            self.assertLessEqual(conn.execute("select count(*) from attempts where ended_at is null and provider='claude'").fetchone()[0],2)

    def test_12_cli_bounded_output_and_atomic_export(self):
        script=str(Path(__file__).with_name("office_cli.py"))
        base=[sys.executable,script,"--db",self.db,"--capability-file",str(self.root/"worker.cap")]
        result=subprocess.run(base+["checkpoint-verify"],input=json.dumps(self.event(decision="accepted")),text=True,capture_output=True)
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout),{"error":"permission_denied"})
        output=str(self.root/"progress.json")
        result=subprocess.run([sys.executable,script,"--db",self.db,"--capability-file",self.bossfile,"export"],
                              input=json.dumps({"now":AT,"output":output}),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn("CANARY",Path(output).read_text())
        self.assertEqual(os.stat(output).st_mode & 0o777,0o600)
        self.assertFalse(list(self.root.glob("*.tmp")))


    def test_13_tiny_final_weight_cannot_round_to_100_without_boss(self):
        self.boss.create_run({"id":"tiny","bossId":"boss-1","projectId":"p","planVersion":1},
            [{"id":"tt","provider":"codex"}],
            [{"id":"tc1","taskId":"tt","weight":1000000,"bossOnly":False},
             {"id":"tc2","taskId":"tt","weight":0.000000001,"bossOnly":True}])
        self.boss.start_attempt("tt",{"id":"ta","observedProvider":"codex"})
        worker_path=str(self.root/"tw.cap");verifier_path=str(self.root/"tv.cap")
        for path,actor in [(worker_path,"worker"),(verifier_path,"verifier")]:
            self.boss.issue_capability(path,actor,run_id="tiny",task_id="tt",attempt_id="ta")
        event={"eventId":"te","runId":"tiny","taskId":"tt","attemptId":"ta","planVersion":1,"checkpointId":"tc1"}
        Ledger(self.db,worker_path).report_checkpoint(event)
        Ledger(self.db,verifier_path).verify_checkpoint(dict(event,eventId="tv",decision="accepted"))
        run=next(r for r in self.view()["runs"] if r["verifiedPct"]>0)
        self.assertLess(run["verifiedPct"],100)

    def test_14_composable_transaction_rolls_back_caught_nested_failure(self):
        self.accept()
        # Force a duplicate checkpoint PK after the new run/tasks were inserted.
        with self.boss.transaction() as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                self.boss.create_run({"id":"rollback","bossId":"boss-1","projectId":"p","planVersion":1},
                    [{"id":"rollback-task","provider":"codex"}],
                    [{"id":"r1c1","taskId":"rollback-task","weight":1,"bossOnly":True}])
            self.assertIsNone(conn.execute("select id from runs where id='rollback'").fetchone())
        with self.assertRaises(RuntimeError):
            with self.boss.transaction():
                self.create("rollback2","rollback-task2")
                raise RuntimeError("synthetic W1 command binding failed")
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("select count(*) from runs where id='rollback2'").fetchone()[0],0)

    def test_15_repeated_attempt_id_with_changed_observation_conflicts(self):
        with self.assertRaises(ValueError):
            self.boss.start_attempt("t1",{"id":"a1","observedProvider":"codex","observedModel":"gpt-new"})

    def test_16_invalid_verification_and_no_report_are_rejected(self):
        for decision in ["pending","failed","canceled","accepted"]:
            with self.assertRaises(ValueError):
                self.verifier.verify_checkpoint(self.event(decision=decision))
        with self.assertRaises(PermissionError):
            self.verifier.verify_checkpoint(self.event(taskId="wrong",decision="accepted"))
        with self.assertRaises(PermissionError):
            self.verifier.verify_checkpoint(self.event(attemptId="wrong",decision="accepted"))
        with self.assertRaises(PermissionError):
            self.worker.report_checkpoint(self.event(3,role="boss"))


    def test_17_event_history_retains_scope_without_private_payload(self):
        self.accept()
        with sqlite3.connect(self.db) as conn:
            row=conn.execute("select run_id,task_id,attempt_id,plan_version,checkpoint_id,operation,evidence_hash from events where id='v1'").fetchone()
            self.assertEqual(row[:6],("r1","t1","a1",1,"r1c1","verify"))
            self.assertEqual(len(row[6]),64)
        with self.assertRaises(ValueError):
            self.worker.report_checkpoint(self.event(2,evidence={"kind":"transcript","label":"CANARY"}))

    def test_18_cli_invalid_types_and_size_stay_bounded(self):
        script=str(Path(__file__).with_name("office_cli.py"))
        for command,payload in [("run-create",{"run":[],"tasks":[],"checkpoints":[]}),
                                ("checkpoint-report",{"eventId":"x","evidence":"x"}),
                                ("checkpoint-report",{"raw":"x"*1048577})]:
            result=subprocess.run([sys.executable,script,"--db",self.db,"--capability-file",self.bossfile,command],
                                  input=json.dumps(payload),text=True,capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertLess(len(result.stdout),100)
            self.assertFalse(result.stderr)
            self.assertIn("error",json.loads(result.stdout))

    def test_19_failed_and_canceled_distinct_and_slots_released(self):
        for state in ["failed","canceled"]:
            with self.subTest(state=state):
                if state=="canceled":
                    self.boss.start_attempt("t1",{"id":"a2","observedProvider":"codex"})
                    worker=self.issue("end-worker","worker",task_id="t1",attempt_id="a2")
                else:worker=self.worker
                worker.report_checkpoint(self.event(event_id=state,attemptId="a2" if state=="canceled" else "a1",state=state))
                self.assertEqual(self.view()["tasks"][0]["state"],state)
                self.assertEqual(self.view()["runs"][0]["verifiedPct"],0)
                with sqlite3.connect(self.db) as conn:
                    self.assertEqual(conn.execute("select count(*) from attempts where ended_at is null").fetchone()[0],0)


    def test_20_multiple_tasks_share_one_final_boss_checkpoint(self):
        self.boss.create_run({"id":"multi","bossId":"boss-1","projectId":"p","planVersion":1},
            [{"id":"mt1","provider":"codex"},{"id":"mt2","provider":"codex"}],
            [{"id":"mc1","taskId":"mt1","weight":30,"bossOnly":False},
             {"id":"mc2","taskId":"mt2","weight":50,"bossOnly":False},
             {"id":"mc3","taskId":"mt2","weight":20,"bossOnly":True}])
        from ledger import public_id
        run=next(r for r in self.view()["runs"] if r["id"]==public_id("run","multi"))
        self.assertEqual(run["bossId"],public_id("boss","boss-1"))
        self.assertEqual(run["projectId"],"p")
        children=[t for t in self.view()["tasks"] if t["runId"]==run["id"]]
        self.assertEqual(len(children),2)


    def test_21_new_attempt_invalidates_run_final_approval_across_other_tasks(self):
        self.boss.create_run({"id":"cross","bossId":"boss-1","projectId":"p","planVersion":1},
            [{"id":"xt1","provider":"codex"},{"id":"xt2","provider":"codex"}],
            [{"id":"xc1","taskId":"xt1","weight":80,"bossOnly":False},
             {"id":"xc2","taskId":"xt2","weight":20,"bossOnly":True}])
        def accept_attempt(aid):
            self.boss.start_attempt("xt1",{"id":aid,"observedProvider":"codex"})
            event={"eventId":aid+"r","runId":"cross","taskId":"xt1","attemptId":aid,"planVersion":1,"checkpointId":"xc1"}
            for actor in ["worker","verifier"]:
                path=str(self.root/(aid+actor+".cap"))
                self.boss.issue_capability(path,actor,run_id="cross",task_id="xt1",attempt_id=aid)
                ledger=Ledger(self.db,path)
                if actor=="worker":ledger.report_checkpoint(event)
                else:ledger.verify_checkpoint(dict(event,eventId=aid+"v",decision="accepted"))
        accept_attempt("xa1")
        self.boss.approve_run("boss-1","cross",1)
        accept_attempt("xa2")
        from ledger import public_id
        run=next(r for r in self.view()["runs"] if r["id"]==public_id("run","cross"))
        self.assertEqual(run["verifiedPct"],80)


    def test_22_export_fails_closed_at_frozen_contract_collection_bounds(self):
        with self.boss.transaction() as conn:
            conn.executemany("insert into reports values(?,?,?,?,?)",
                [("bulk"+str(n),"r1",1,"queued",AT) for n in range(2001)])
        with self.assertRaises(ValueError):self.view()

if __name__ == "__main__": unittest.main()
