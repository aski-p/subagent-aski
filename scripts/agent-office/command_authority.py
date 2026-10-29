"""Scoped command credentials reuse the core Ledger issuer and capabilities table."""
import json
from ledger import Ledger

PURPOSES = {"web-intake","bridge-claim","boss-redeem","boss-reply","boss-dispatch"}

def require_command_capability(capability:dict,purpose:str,resource:dict)->dict:
    """Verify a protected credential and persisted scope, never caller role claims.

    dbPath and optional connection are trusted runtime context. Owner/binding are
    compared when present; omitted scope is obtained from the persisted credential.
    """
    if not isinstance(capability,dict) or set(capability)!={"capabilityFile"} or purpose not in PURPOSES:
        raise PermissionError("invalid_capability")
    if "connection" in resource:
        cap=Ledger.capability_for_file(resource["connection"],capability["capabilityFile"])
    else:
        ledger=Ledger(resource["dbPath"],capability["capabilityFile"])
        with ledger.transaction() as conn:
            cap=ledger._capability(conn)
    if cap["actor"]!="command" or cap["purpose"]!=purpose:
        raise PermissionError("wrong_purpose")
    if not cap["owner_id"] or not cap["binding_id"]:
        raise PermissionError("missing_scope")
    for field,column in (("ownerId","owner_id"),("bindingId","binding_id")):
        if field in resource and resource[field]!=cap[column]:
            raise PermissionError("wrong_scope")
    return {**dict(cap),"project_ids":json.loads(cap["project_ids"])}
