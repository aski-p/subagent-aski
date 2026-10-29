import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseActivityProofs} from '../lib/lounge-contract';
import {parseProgress} from '../lib/progress-contract';
const proof={id:'proof',taskId:'task',runId:'run',attemptId:'attempt',planVersion:1,provider:'codex',source:'codex-native',state:'running',confirmedAt:'2026-01-01T00:00:00Z',leaseExpiresAt:'2026-01-01T00:01:00Z'};
const view={schemaVersion:1,observedAt:'2026-01-01T00:00:00Z',catalogState:'available',projects:[],runs:[],tasks:[],reports:[]};
test('old wire stays absent and extended wire is strict',()=>{
 assert.equal('activityProofs' in parseProgress(view),false);
 assert.deepEqual(parseProgress({...view,activityProofs:[proof]}).activityProofs,[proof]);
 for(const v of [null,undefined,{},[proof,proof],Array(2001).fill(proof)]) assert.throws(()=>parseProgress({...view,activityProofs:v}));
 assert.throws(()=>parseProgress({...view,activityProofs:[],extra:1}));
});
test('proofs require exact valid fields and canonical dates',()=>{
 for(const p of [{...proof,extra:1},{...proof,id:'bad/id'},{...proof,planVersion:0},{...proof,source:'claude-supervisor'},{...proof,confirmedAt:'2026-02-31T00:00:00Z'},{...proof,state:'bad'},Object.fromEntries(Object.entries(proof).filter(([k])=>k!=='runId'))]) assert.throws(()=>parseActivityProofs([p]));
 assert.throws(()=>parseProgress({...view,activityProofs:[],extra:'x'.repeat(1048576)}));
});
