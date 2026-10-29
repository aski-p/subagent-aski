import {parseProgress,type ProgressV1} from "./progress-contract";
export async function readAdapterProgress():Promise<ProgressV1>{
 if(typeof window!=="undefined")throw Error("server_only");
 const token=process.env.STATUS_ADAPTER_READ_TOKEN,target=process.env.STATUS_ADAPTER_URL;
 if(!token||token.length<24||token===process.env.JWT_SECRET||!target)throw Error("source_unavailable");
 const u=new URL(target);if(target.includes("?")||target.includes("#")||u.pathname!=="/agent-office-status"||u.search||u.hash||u.username||u.password||!(u.protocol==="https:"||(u.protocol==="http:"&&u.hostname==="127.0.0.1")))throw Error("source_unavailable");
 u.search="?view=progress";
 const response=await fetch(u,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!response.ok||Number(response.headers.get("content-length"))>1048576||!response.body)throw Error("source_unavailable");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error("source_unavailable");chunks.push(value)}}finally{await reader.cancel()}
 return parseProgress(JSON.parse(Buffer.concat(chunks).toString()));
}
