import type { SnapshotV1 } from "./status-contract";
export class OfficeFetchError extends Error { constructor(public status:number){super("office request failed")} }
export async function fetchOfficeSnapshot(signal?:AbortSignal):Promise<SnapshotV1>{const r=await fetch("/api/office/snapshot",{cache:"no-store",signal});if(!r.ok)throw new OfficeFetchError(r.status);return r.json() as Promise<SnapshotV1>}
