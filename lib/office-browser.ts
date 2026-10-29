import type { SnapshotV1 } from "./status-contract";
export class OfficeFetchError extends Error { constructor(public status:number){super("office request failed")} }
export async function fetchOfficeSnapshot(signal?:AbortSignal):Promise<SnapshotV1>{const r=await fetch("/api/office/snapshot",{cache:"no-store",signal});if(!r.ok)throw new OfficeFetchError(r.status);return r.json() as Promise<SnapshotV1>}

import {parseProgress,type ProgressV1} from "./progress-contract";
export async function fetchOfficeProgress(signal?:AbortSignal):Promise<ProgressV1>{
 const r=await fetch("/api/office/progress",{cache:"no-store",signal});if(!r.ok)throw new OfficeFetchError(r.status);
 if(Number(r.headers.get("content-length"))>1048576||!r.body)throw Error("invalid_progress");
 const reader=r.body.getReader();let size=0;const parts:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error("invalid_progress");parts.push(value)}}finally{await reader.cancel()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 return parseProgress(JSON.parse(new TextDecoder().decode(bytes)));
}
