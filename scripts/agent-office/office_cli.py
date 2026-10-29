"""Bounded stdin/protected-file CLI. Credential contents never enter argv or output."""
import argparse
import json
import sqlite3
import sys
from ledger import Ledger, MAX_BYTES, atomic_export, canonical, read_protected

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--db",required=True)
    parser.add_argument("--capability-file",required=True)
    parser.add_argument("--input-file")
    parser.add_argument("command",choices=["run-create","attempt-start","checkpoint-report",
                                          "checkpoint-verify","report-ack","run-approve","export"])
    args=parser.parse_args()
    try:
        raw=read_protected(args.input_file) if args.input_file else sys.stdin.read(MAX_BYTES+1)
        if len(raw.encode())>MAX_BYTES: raise ValueError("input_too_large")
        data=json.loads(raw)
        if not isinstance(data,dict): raise ValueError("invalid_input")
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
    except PermissionError: error="permission_denied"
    except (ValueError,KeyError,TypeError,OverflowError,AttributeError,IndexError): error="invalid_input"
    except (OSError,sqlite3.Error): error="storage_error"
    print(canonical({"error":error}))
    return 1

if __name__=="__main__":sys.exit(main())
