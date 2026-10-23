import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {salesDatabase,SalesRepository,SALES as S,salesRpc,asSalesUser} from './salesFixture.js'
import {createEstimatorHandler} from '../../server/http.js'
import {LocalReviewProvider} from '../../scripts/local-review-provider.mjs'
let db,repo,handler,estimateId,conversationId,provider
beforeAll(async()=>{db=await salesDatabase();repo=new SalesRepository(db);provider=new LocalReviewProvider();handler=createEstimatorHandler({repo,provider,testMode:true,logger:()=>{},requestsPerMinute:1000})},60000)
afterAll(async()=>{await db?.close()})
async function request(path,body,identity='a',method=body?'POST':'GET'){
 const res=await handler.handle(new Request('http://localhost/api/ai/'+path,{method,headers:{Authorization:'Bearer sales-'+identity,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:res.status,data:await res.json()}
}
async function command(row,action,extra={}){const r=await request(`conversations/${row.id}/commands`,{requestId:randomUUID(),version:row.version,action,...extra});expect(r.status).toBe(200);for(let n=0;n<150;n++){const next=await repo.get(S.a,row.id);if(next.state.run?.status!=='working')return next;await new Promise(r=>setTimeout(r,10))}throw Error('Controlled run timeout')}
describe('Seller API authorization and quote ownership',()=>{
 it('denies settings writes, admin review, foreign relations and worker AI access',async()=>{
  expect((await request('settings',{})).status).toBe(403)
  expect((await request('admin/conversations')).status).toBe(403)
  expect((await request('admin/conversations',undefined,'kevin')).status).toBe(403)
  expect((await request('status',undefined,'worker')).status).toBe(403)
  expect((await request('status',undefined,'forged')).status).toBe(401)
  expect((await request('settings')).status).toBe(200)
 })
 it('seller can interpret, approve, calculate, own and link a quote without cross-owner project foreign keys',async()=>{
  let r=await request('conversations',{id:randomUUID(),title:'QA Seller A synthetic painting',language:'en'});expect(r.status).toBe(200)
  let row=r.data;conversationId=row.id
  expect((await request(`conversations/${row.id}/commands`,{requestId:randomUUID(),version:row.version,action:'links',projectId:S.leadB})).status).toBe(403)
  row=await command(row,'message',{content:'Paint walls only of a 12 x 10 x 8 ft bedroom, two coats, minor preparation. No ceiling or trim.'})
  expect(row.state.run.status).toBe('ready');expect(row.state.plan.tasks.length).toBeGreaterThan(0)
  row=await command(row,'approve',{revision:row.state.planRevision});row=await command(row,'generate')
  estimateId=row.estimate_id;expect(estimateId).toBeTruthy()
  const estimate=await repo.estimate(S.a,estimateId);expect(estimate.owner_id).toBe(S.a)
  await salesRpc(db,S.a,'link-document',{projectId:S.leadA,id:estimateId})
  expect((await salesRpc(db,S.kevin,'documents',{projectId:S.leadA}))[0].id).toBe(estimateId)
  expect((await request('conversations/'+conversationId,undefined,'b')).status).toBe(404)
  expect((await request('estimates/'+estimateId,undefined,'b')).status).toBeGreaterThanOrEqual(400)
 })
 it('reassigned seller retains only static own document and no route back to current lead',async()=>{
  const before=await salesRpc(db,S.a,'document',{id:estimateId});expect(before.sales_snapshot.name).toBe('QA lead A')
  await salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.b,version:1})
  await db.query("update projects set name='PRIVATE NEW FOLLOW-UP' where id=$1",[S.leadA])
  const after=await salesRpc(db,S.a,'document',{id:estimateId});expect(after.sales_snapshot).toEqual(before.sales_snapshot)
  expect(after.project_id).toBeNull();expect(after.client_id).toBeNull()
  await expect(salesRpc(db,S.a,'notes',{projectId:S.leadA})).rejects.toThrow('SALES_LEAD_DENIED')
  expect((await salesRpc(db,S.a,'projects')).length).toBe(0)
  await expect(salesRpc(db,S.b,'document',{id:estimateId})).rejects.toThrow('SALES_DOCUMENT_DENIED')
  await expect(salesRpc(db,S.otherManager,'document',{id:estimateId})).rejects.toThrow('SALES_DOCUMENT_DENIED')
  expect((await salesRpc(db,S.kevin,'document',{id:estimateId})).read_only).toBe(true)
  expect((await request('conversations/'+conversationId)).data.project_id).toBeNull()
 })
 it('seller edits and finalizes own proposal through authenticated RLS; inactive membership is rejected',async()=>{
  const record=await repo.estimate(S.a,estimateId),doc=structuredClone(record.document);doc.proposal.notes='QA note on my own proposal'
  await asSalesUser(db,S.a,tx=>tx.query('update estimates set document=$1 where id=$2',[JSON.stringify(doc),estimateId]))
  const updated=await repo.estimate(S.a,estimateId)
  const finalized=await asSalesUser(db,S.a,async tx=>(await tx.query('select to_jsonb(finalize_estimate($1,$2,$3)) as v',[estimateId,updated.version,randomUUID()])).rows[0].v)
  expect(finalized.finalized_version).toBe(finalized.version)
  await db.query('update sales_memberships set active=false where user_id=$1',[S.a])
  expect((await request('conversations/'+conversationId)).status).toBe(401)
  expect((await asSalesUser(db,S.a,tx=>tx.query('select * from estimates'))).rows).toHaveLength(0)
 })
})
