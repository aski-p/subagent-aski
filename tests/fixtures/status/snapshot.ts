const now=Date.parse("2026-10-29T10:00:00Z");
const iso=(ms:number)=>new Date(ms).toISOString();
export const fixture=()=>({schemaVersion:1,snapshotId:"sample",observedAt:iso(now),coverage:[{source:"windows-codex",connection:"connected",coverage:"metadata-only",collectedAt:iso(now),lastActivityAt:iso(now-3600000),reasonCode:null}],agents:[],tasks:[],events:[],artifacts:[]});
