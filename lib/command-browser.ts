import {parseCommandContext,parseCommandReceipt,type CommandContext,type CommandInput,type CommandReceipt} from "./command-contract";
export class CommandFetchError extends Error {
 constructor(public status:number,public code:string,public outcomeUnknown=false,public existingReceiptId:string|null=null,public retryAfter:number|null=null){super(code)}
}
async function result(r:Response):Promise<unknown>{
 let data:Record<string,unknown>={};
 try { data=await r.json() as Record<string,unknown> } catch { if(r.ok) throw Error("invalid response") }
 if(!r.ok){
  const retry=r.headers.get("Retry-After");
  const delay=retry&&/^[0-9]+$/.test(retry)?Number(retry):0;
  throw new CommandFetchError(r.status,typeof data.error==="string"?data.error:"unavailable",data.outcomeUnknown===true,typeof data.existingReceiptId==="string"?data.existingReceiptId:null,delay>0&&delay<=3600?delay:null);
 }
 return data;
}
export async function fetchCommandContext(signal?:AbortSignal,cursor?:string):Promise<CommandContext>{
 const headers:Record<string,string>={};if(cursor)headers["X-Office-Cursor"]=cursor;
 return parseCommandContext(await result(await fetch("/api/office/commands",{cache:"no-store",headers,signal})));
}
export async function sendBossCommand(input:CommandInput,csrfToken:string,signal?:AbortSignal):Promise<CommandReceipt>{
 const data=await result(await fetch("/api/office/commands",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json","X-Office-CSRF":csrfToken},body:JSON.stringify(input),signal})) as Record<string,unknown>;
 return parseCommandReceipt(data.receipt);
}
