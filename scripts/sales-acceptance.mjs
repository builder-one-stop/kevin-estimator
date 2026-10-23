// Host HTTP acceptance. Synthetic local identities only; no remote endpoints.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {SALES as S} from '../tests/ai/salesFixture.js'
const file=resolve('.local-review/sales/acceptance.json'),origin='http://127.0.0.1:8800'
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{conversationId:randomUUID(),messageId:randomUUID(),noteA:randomUUID(),noteB:randomUUID(),manualB:randomUUID(),stage:'new'}
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save()
async function request(identity,path,body,method=body?'POST':'GET',expected=200){
 const r=await fetch(origin+path,{method,headers:{Authorization:'Bearer sales-'+identity,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected,`Unexpected local status ${r.status} for ${path}: ${data.error||data.code||''}`);return data
}
const rpc=(who,action,data={},expected=200)=>request(who,'/test-supabase/rest/v1/rpc/sales_gateway',{p_action:action,p_data:data},'POST',expected)
assert.equal((await rpc('kevin','projects')).length,3);assert.equal((await rpc('other','projects')).length,1)
let row=await request('a','/api/ai/conversations',{id:report.conversationId,title:'QA SELLER A — local synthetic painting',language:'en'})
async function settle(){for(let n=0;n<150&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,30));row=await request('a','/api/ai/conversations/'+row.id)}assert.equal(row.state.run?.status,'ready')}
async function command(action,extra={},id=randomUUID()){row=await request('a',`/api/ai/conversations/${row.id}/commands`,{requestId:id,version:row.version,action,...extra});if(row.state.run?.status==='working')await settle()}
if(!row.state.receipts.includes(report.messageId))await command('message',{content:'Paint walls only in a 12 x 10 x 8 ft bedroom, two coats, minor nail-hole preparation and cleanup, no ceiling or trim. Synthetic local QA.'},report.messageId)
else if(row.state.run?.status==='working')await settle()
if(row.state.approvedRevision!==row.state.planRevision)await command('approve',{revision:row.state.planRevision})
if(!row.estimate_id)await command('generate')
report.estimateA=row.estimate_id;save()
await rpc('a','link-document',{projectId:S.leadA,id:report.estimateA})
await rpc('a','note',{projectId:S.leadA,id:report.noteA,body:'PRUEBA QA: llamamos para confirmar medidas; seguimiento pendiente. Datos sintéticos.'})
await rpc('b','note',{projectId:S.leadB,id:report.noteB,body:'PRUEBA QA: propuesta del vendedor B en preparación. Datos sintéticos.'})
await rpc('b','create-document',{projectId:S.leadB,id:report.manualB,title:'QA SELLER B — own preliminary proposal'})
await rpc('a','assign',{projectId:S.leadA,sellerId:S.b,version:1},403)
await rpc('a','notes',{projectId:S.leadB},403)
await rpc('kevin','notes',{projectId:S.otherLead},403)
await request('a','/api/ai/settings',{},'POST',403)
await request('worker','/api/ai/status',undefined,'GET',403)
await request('b','/api/ai/conversations/'+row.id,undefined,'GET',404)
const snapshot=(await rpc('a','document',{id:report.estimateA})).sales_snapshot
if(!report.reassignmentChecked){
 let lead=(await rpc('kevin','projects')).find(p=>p.id===S.leadA)
 if(lead.assigned_to!==S.b)await rpc('kevin','assign',{projectId:S.leadA,sellerId:S.b,version:lead.assignment_version})
 await rpc('a','notes',{projectId:S.leadA},403)
 await rpc('b','document',{id:report.estimateA},403)
 assert.deepEqual((await rpc('a','document',{id:report.estimateA})).sales_snapshot,snapshot)
 assert.equal((await rpc('b','documents',{projectId:S.leadA})).length,0)
 lead=(await rpc('kevin','projects')).find(p=>p.id===S.leadA)
 await rpc('kevin','assign',{projectId:S.leadA,sellerId:S.a,version:lead.assignment_version})
 report.reassignmentChecked=true;save()
}
assert.equal((await rpc('a','notes',{projectId:S.leadA})).filter(n=>n.id===report.noteA).length,1)
assert.equal((await rpc('b','documents',{projectId:S.leadB}))[0].id,report.manualB)
assert.equal((await rpc('kevin','document',{id:report.estimateA})).read_only,true)
const worker=await request('worker','/api/workers/');assert.equal(worker.role,'worker')
report.stage='http-verified';report.ownerIsolation=true;report.notesPersistent=true;report.provider='controlled-no-real-ai';report.reviewUrl='http://127.0.0.1:5190/__fixture/session?as=kevin';save()
console.info(JSON.stringify(report,null,2))
