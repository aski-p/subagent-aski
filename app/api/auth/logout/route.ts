import {callbackOrigin,logoutCookie,PRIVATE_HEADERS} from "@/lib/owner-auth";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{const origin=callbackOrigin(request);if(request.headers.get("origin")!==origin)return Response.json({error:"invalid_origin"},{status:403,headers:PRIVATE_HEADERS});return Response.json({authenticated:false,owner:false},{headers:{...PRIVATE_HEADERS,"Set-Cookie":logoutCookie()}});}catch{return Response.json({error:"invalid_origin"},{status:403,headers:PRIVATE_HEADERS});}}
