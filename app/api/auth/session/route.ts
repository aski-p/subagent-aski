import {getAuthenticatedSession,OWNER_ID,PRIVATE_HEADERS} from "@/lib/owner-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{const identity=getAuthenticatedSession(request);return Response.json({authenticated:!!identity,owner:identity?.githubId===OWNER_ID},{headers:PRIVATE_HEADERS});}catch{return Response.json({authenticated:false,owner:false},{headers:PRIVATE_HEADERS});}}
