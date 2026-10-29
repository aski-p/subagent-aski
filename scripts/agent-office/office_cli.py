"""Bounded stdin/protected-file CLI. Credential contents never enter argv or output."""
import argparse
import json
import sqlite3
import sys
from ledger import Ledger, MAX_BYTES, atomic_export, canonical, read_protected, timestamp
from commands import CommandStore, CommandError, exact
from command_authority import require_command_capability

COMMANDS=["command-submit","command-list","command-claim","command-transport","command-redeem",
          "command-decision","command-reply","command-resume","command-purge","command-context",
          "command-native-prepare","command-native-confirm","command-native-reconcile","command-result","command-result-ack"]

def command_operation(args,data):
    store=CommandStore(args.db)
    capability={"capabilityFile":args.capability_file}
    op=args.command
    if op.startswith("command-native-") or op in {"command-result","command-result-ack"}:
        boss=Ledger(args.db,args.capability_file)
        if op=="command-native-prepare":
            exact(data,("commandId","taskId","attemptId"))
            return boss.reserve_command_attempt(data["commandId"],data["taskId"],data["attemptId"])
        if op=="command-native-confirm":
            exact(data,("commandId","attemptId","childId","observedProvider","observedModel"))
            return boss.confirm_command_attempt(data["commandId"],data["attemptId"],data["childId"],data["observedProvider"],data["observedModel"])
        if op=="command-native-reconcile":
            exact(data,("commandId","attemptId","proof"))
            return boss.reconcile_command_attempt(data["commandId"],data["attemptId"],data["proof"])
        if op=="command-result":
            exact(data,("commandId","report","planVersion","attemptIds"))
            return boss.enqueue_command_result(data["commandId"],data["report"],data["planVersion"],data["attemptIds"])
        exact(data,("commandId","reportId","revision"))
        with boss.transaction() as conn:
            boss._authorize(conn,{"boss"})
            row=conn.execute("SELECT b.* FROM command_result_bindings b JOIN commands c ON c.id=b.command_id AND c.result_sequence=b.sequence WHERE b.command_id=? AND b.report_id=? AND b.report_revision=?",(data["commandId"],data["reportId"],data["revision"])).fetchone()
            if row is None:raise ValueError("current_result_required")
            command=conn.execute("SELECT * FROM commands WHERE id=?",(data["commandId"],)).fetchone()
            boss._authorize(conn,{"boss"},boss_id=command["boss_id"])
            boss.ack_report(command["boss_id"],data["reportId"],data["revision"])
            return {"acknowledged":True}
    if op=="command-context":
        exact(data,("commandId","payloadHash"))
        with store._authorized(capability,"boss-redeem") as (_,conn,cap):
            from commands import command_row,scope_row
            row=command_row(conn,data["commandId"]);scope_row(row,cap)
            if row["received_at"] is None or row["payload_hash"]!=data["payloadHash"]:raise PermissionError("redeem_required")
            parent=None
            if row["parent_id"]:
                p=conn.execute("SELECT * FROM commands WHERE id=?",(row["parent_id"],)).fetchone()
                if p is not None:
                    scope_row(p,cap)
                    if p["answered_by"]!=row["id"]:raise PermissionError("wrong_parent")
                    parent={"commandId":p["id"],"payloadHash":p["payload_hash"]}
                elif row["continuation_context"]:
                    question=json.loads(row["continuation_context"])["question"]
                    parent={"commandId":question["commandId"],"payloadHash":question["payloadHash"]}
            revision=conn.execute("SELECT plan_version FROM command_revisions WHERE command_id=?",(row["id"],)).fetchone()
            plan=None
            if row["run_id"]:
                run=conn.execute("SELECT * FROM runs WHERE id=?",(row["run_id"],)).fetchone()
                plan={"run":{"id":run["id"],"bossId":run["boss_id"],"projectId":run["project_id"],"planVersion":run["plan_version"]},
                      "tasks":[{"id":t["id"],"provider":t["provider"]} for t in conn.execute("SELECT * FROM tasks WHERE run_id=? ORDER BY id",(run["id"],))],
                      "checkpoints":[{"id":c["id"],"taskId":c["task_id"],"weight":c["weight"],"bossOnly":bool(c["boss_only"])} for c in conn.execute("SELECT c.* FROM checkpoints c JOIN tasks t ON t.id=c.task_id WHERE t.run_id=? ORDER BY c.rowid",(run["id"],))]}
            return {"plan":plan,"decision":row["decision"],"runId":row["run_id"],"revision":revision[0] if revision else None,"parent":parent,
                    "nativeIntents":[dict(r) for r in conn.execute("SELECT attempt_id AS attemptId,task_id AS taskId,state,child_id AS childId FROM native_dispatches WHERE command_id=?",(row["id"],))]}
    if op=="command-submit":
        exact(data,("input",),("now",))
        cap=require_command_capability(capability,"web-intake",{"dbPath":args.db})
        return store.submit_result(capability,{"id":cap["binding_id"]},data["input"],data.get("now",timestamp()))
    if op=="command-list":
        exact(data,(),("cursor","limit"))
        with store._authorized(capability,"web-intake") as (_,_,cap):
            return store.receipts(cap["owner_id"],data.get("cursor"),data.get("limit",50))
    if op=="command-claim":
        exact(data,(),("now",))
        return store.claim(capability,data.get("now",timestamp()))
    if op=="command-transport":
        exact(data,("commandId","leaseToken","outcome"),("now",))
        return store.record_transport({**data,"now":data.get("now",timestamp()),"capability":capability})
    if op=="command-redeem":
        exact(data,("commandId","payloadHash"),("now",))
        return store.redeem(capability,data["commandId"],data["payloadHash"],data.get("now",timestamp()))
    if op=="command-decision":
        return store.record_decision(capability,{**data,"now":data.get("now",timestamp())})
    if op=="command-reply":
        return store.write_reply(capability,{**data,"now":data.get("now",timestamp())})
    if op=="command-resume":
        exact(data,())
        return store.resume(capability)
    exact(data,(),("now",))
    with store._authorized(capability,"boss-dispatch"):
        return store.purge(data.get("now",timestamp()))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--db",required=True)
    parser.add_argument("--capability-file",required=True)
    parser.add_argument("--input-file")
    parser.add_argument("command",choices=["run-create","attempt-start","checkpoint-report",
                                          "checkpoint-verify","report-ack","run-approve","export"]+COMMANDS)
    args=parser.parse_args()
    try:
        raw=read_protected(args.input_file) if args.input_file else sys.stdin.read(MAX_BYTES+1)
        if len(raw.encode())>MAX_BYTES: raise ValueError("input_too_large")
        data=json.loads(raw)
        if not isinstance(data,dict): raise ValueError("invalid_input")
        if args.command in COMMANDS:
            result=command_operation(args,data)
            print(canonical(result))
            return 0
        ledger=Ledger(args.db,args.capability_file)
        # Holding the outer transaction serializes the entire mutating dispatch.
        with ledger.transaction():
            if args.command=="run-create":
                ledger.create_run(data["run"],data["tasks"],data["checkpoints"])
            elif args.command=="attempt-start":
                ledger.start_attempt(data["taskId"],data["attempt"])
            elif args.command=="checkpoint-report": ledger.report_checkpoint(data)
            elif args.command=="checkpoint-verify": ledger.verify_checkpoint(data)
            elif args.command=="report-ack":
                ledger.ack_report(data["bossId"],data["reportId"],data["revision"])
            elif args.command=="run-approve":
                ledger.approve_run(data["bossId"],data["runId"],data["planVersion"])
            else:
                atomic_export(data["output"],ledger.project_progress(data["now"]))
        # Never echo internal IDs, paths, evidence, model requests or exception text.
        print(canonical({"ok":True}))
        return 0
    except CommandError as exc:
        result={"error":exc.code,"status":exc.status}
        if exc.receipt_id: result["existingReceiptId"]=exc.receipt_id
        if exc.retry_after: result["retryAfter"]=exc.retry_after
        print(canonical(result))
        return 1
    except PermissionError: error="permission_denied"
    except (ValueError,KeyError,TypeError,OverflowError,AttributeError,IndexError): error="invalid_input"
    except (OSError,sqlite3.Error): error="storage_error"
    print(canonical({"error":error}))
    return 1

if __name__=="__main__":sys.exit(main())
