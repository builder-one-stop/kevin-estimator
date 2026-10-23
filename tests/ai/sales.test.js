import {describe,it,expect,beforeAll,afterAll} from 'vitest'
import {randomUUID} from 'node:crypto'
import {salesDatabase,salesRpc,asSalesUser,SALES as S} from './salesFixture.js'
let db
beforeAll(async()=>{db=await salesDatabase()},60000)
afterAll(async()=>{await db?.close()})
describe('Local sales organization and existing project security',()=>{
 it('Kevin sees three organization leads; sellers only their assignment',async()=>{
  expect((await salesRpc(db,S.kevin,'projects')).map(p=>p.id)).toHaveLength(3)
  expect((await salesRpc(db,S.a,'projects')).map(p=>p.id)).toEqual([S.leadA])
  expect((await salesRpc(db,S.b,'projects')).map(p=>p.id)).toEqual([S.leadB])
  expect((await salesRpc(db,S.other,'projects')).map(p=>p.id)).toEqual([S.otherLead])
 })
 it('denies self-assignment, foreign organization and forged actions',async()=>{
  await expect(salesRpc(db,S.a,'assign',{projectId:S.leadA,sellerId:S.b,version:1})).rejects.toThrow('SALES_MANAGER_REQUIRED')
  await expect(salesRpc(db,S.a,'notes',{projectId:S.leadB})).rejects.toThrow('SALES_LEAD_DENIED')
  await expect(salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.other,version:1})).rejects.toThrow('SALES_SELLER_DENIED')
  await expect(salesRpc(db,S.kevin,'notes',{projectId:S.otherLead})).rejects.toThrow('SALES_LEAD_DENIED')
  await expect(salesRpc(db,S.worker,'projects')).rejects.toThrow('SALES_ACCESS_DENIED')
 })
 it('notes are append-only, attributed, dated and retry idempotent',async()=>{
  const payload={projectId:S.leadA,id:randomUUID(),body:'QA follow-up: confirm measurements.'}
  const first=await salesRpc(db,S.a,'note',payload),again=await salesRpc(db,S.a,'note',payload)
  expect(again.id).toBe(first.id);expect(first.author_name).toBe('Seller A QA');expect(first.created_at).toBeTruthy()
  expect((await salesRpc(db,S.kevin,'notes',{projectId:S.leadA})).length).toBe(1)
  await expect(salesRpc(db,S.a,'note',{...payload,body:'changed'})).rejects.toThrow('NOTE_RETRY_CONFLICT')
  await expect(asSalesUser(db,S.a,tx=>tx.query('delete from sales_lead_notes'))).rejects.toThrow(/permission denied/)
 })
 it('direct table access cannot bypass assignments or promote a seller',async()=>{
  expect((await asSalesUser(db,S.a,tx=>tx.query('select * from projects'))).rows).toEqual([])
  await expect(asSalesUser(db,S.a,tx=>tx.query("insert into projects(owner_id,name) values($1,'unauthorized')",[S.a]))).rejects.toThrow(/row-level security/)
  await expect(asSalesUser(db,S.a,tx=>tx.query("update beta_accounts set role='admin' where user_id=$1",[S.a]))).rejects.toThrow(/permission denied/)
  await expect(asSalesUser(db,S.a,tx=>tx.query('select * from sales_memberships'))).rejects.toThrow(/permission denied/)
 })
 it('reassignment transfers lead/notes but not original seller documents',async()=>{
  const id=randomUUID(),data={projectId:S.leadA,id,title:'QA proposal A'}
  const doc=await salesRpc(db,S.a,'create-document',data)
  expect((await salesRpc(db,S.a,'create-document',data)).id).toBe(id)
  expect(doc.owner_id).toBe(S.a);expect(doc.project_id).toBeNull()
  await expect(salesRpc(db,S.b,'link-document',{projectId:S.leadB,id})).rejects.toThrow('SALES_DOCUMENT_DENIED')
  await salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.b,version:1})
  await expect(salesRpc(db,S.a,'notes',{projectId:S.leadA})).rejects.toThrow('SALES_LEAD_DENIED')
  expect((await salesRpc(db,S.b,'notes',{projectId:S.leadA})).length).toBe(2)
  expect(await salesRpc(db,S.b,'documents',{projectId:S.leadA})).toEqual([])
  expect((await salesRpc(db,S.kevin,'documents',{projectId:S.leadA}))[0].id).toBe(id)
  expect((await asSalesUser(db,S.a,tx=>tx.query('select id from estimates where id=$1',[id]))).rows).toHaveLength(1)
  expect((await asSalesUser(db,S.b,tx=>tx.query('select id from estimates where id=$1',[id]))).rows).toHaveLength(0)
  await expect(salesRpc(db,S.kevin,'assign',{projectId:S.leadA,sellerId:S.a,version:1})).rejects.toThrow('ASSIGNMENT_CONFLICT')
 })
 it('worker and administrator session roles remain intact',async()=>{
  expect((await asSalesUser(db,S.worker,tx=>tx.query('select public.beta_session_access() as value'))).rows[0].value.role).toBe('worker')
  expect((await asSalesUser(db,S.kevin,tx=>tx.query('select public.beta_session_access() as value'))).rows[0].value.role).toBe('admin')
 })
 it('owner deletion removes only the document link, never the lead or its notes',async()=>{
  const id=randomUUID();await salesRpc(db,S.b,'create-document',{id,projectId:S.leadB,title:'QA delete own draft'})
  await asSalesUser(db,S.b,tx=>tx.query('delete from estimates where id=$1',[id]))
  expect((await db.query('select * from sales_document_links where estimate_id=$1',[id])).rows).toHaveLength(0)
  expect((await salesRpc(db,S.b,'projects')).some(p=>p.id===S.leadB)).toBe(true)
 })
 it('anonymous calls and revoked sessions cannot use the privileged gateway',async()=>{
  await expect(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query("select sales_gateway('projects','{}')")})).rejects.toThrow(/permission denied/)
  await db.query('delete from auth.sessions where user_id=$1',[S.a])
  await expect(salesRpc(db,S.a,'projects')).rejects.toThrow('SALES_ACCESS_DENIED')
  await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[S.a])
 })
 it('does not attach a legacy document with a dynamic client/project relation to a reassigned lead',async()=>{
  const project=randomUUID(),estimate=randomUUID()
  await db.query("insert into projects(id,owner_id,name) values($1,$2,'Legacy own project')",[project,S.b])
  await db.query("insert into estimates(id,owner_id,title,project_id) values($1,$2,'Legacy document',$3)",[estimate,S.b,project])
  await expect(salesRpc(db,S.b,'link-document',{projectId:S.leadB,id:estimate})).rejects.toThrow('SALES_STANDALONE_DOCUMENT_REQUIRED')
  expect((await db.query('select project_id from estimates where id=$1',[estimate])).rows[0].project_id).toBe(project)
 })
})
