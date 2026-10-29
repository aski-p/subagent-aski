import {getAuthenticatedSession,requireOwner,PRIVATE_HEADERS} from "@/lib/owner-auth";
import {readAdapterProgress} from "@/lib/progress-client";
export const dynamic="force-dynamic";
export async function GET(request:Request){let status=401;try{status=requireOwner(getAuthenticatedSession(request))}catch{}if(status!==200)return Response.json({error:status===401?"unauthenticated":"forbidden"},{status,headers:PRIVATE_HEADERS});try{return Response.json(await readAdapterProgress(),{headers:PRIVATE_HEADERS})}catch{return Response.json({error:"source_unavailable",checkedAt:new Date().toISOString()},{status:503,headers:PRIVATE_HEADERS})}}
