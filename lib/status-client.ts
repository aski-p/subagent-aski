import {parseSnapshot,type SnapshotV1} from "./status-contract";
export async function readAdapterSnapshot():Promise<SnapshotV1>{
 if(typeof window!=="undefined")throw new Error("server_only");
 const token=process.env.STATUS_ADAPTER_READ_TOKEN;const target=process.env.STATUS_ADAPTER_URL;if(!token||token.length<24||token===process.env.JWT_SECRET||!target)throw new Error("source_unavailable");
 const u=new URL(target);if(u.pathname!=="/agent-office-status"||u.search||u.hash||u.username||u.password||!(u.protocol==="https:"||(u.protocol==="http:"&&u.hostname==="127.0.0.1")))throw new Error("source_unavailable");
 const res=await fetch(u,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});if(!res.ok||Number(res.headers.get("content-length"))>1048576)throw new Error("source_unavailable");
 if(!res.body)throw new Error("source_unavailable");const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw new Error("source_unavailable");chunks.push(value);}}finally{await reader.cancel();}return parseSnapshot(JSON.parse(Buffer.concat(chunks).toString()),Date.now());
}
