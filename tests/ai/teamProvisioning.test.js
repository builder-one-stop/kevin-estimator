import {beforeAll,afterAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {salesDatabase,SALES as S,asSalesUser,salesRpc} from './salesFixture.js'
import {localTeamClient} from '../../scripts/team-local-adapter.mjs'
import {createTeamHandler} from '../../server/team.js'
import {localDatabase,B} from './localRepository.js'
let db,client,handler,seat,user
beforeAll(async()=>{db=await salesDatabase();client=localTeamClient(db);handler=createTeamHandler({db:client,env:{}})},60000)
afterAll(async()=>{await db?.close()})
const token=who=>'synthetic.'+Buffer.from(JSON.stringify({sub:who,session_id:who,amr:[{method:'password'}]})).toString('base64url')+'.signature'
async function api(who,action='',body,extra={}){const r=await handler(new Request('http://localhost/api/workers/team/'+action,{method:body?'POST':'GET',headers:{...(who?{Authorization:'Bearer '+token(who)}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()}}
it('admin lists organization sellers; seller, worker, operator and anonymous cannot manage identities',async()=>{
 const list=await api(S.kevin);expect(list.status).toBe(200);expect(list.body.members).toHaveLength(2)
 expect(list.body.members.map(m=>m.userId).sort()).toEqual([S.a,S.b].sort())
 for(const who of [S.a,S.b,S.worker,S.otherManager])expect((await api(who)).status).toBe(403)
 expect((await api(null)).status).toBe(401)
 expect((await api(S.kevin,'',undefined,{Origin:'https://foreign.invalid'})).status).toBe(403)
})
it('rejects invalid inputs and never grants a role supplied by a caller',async()=>{
 for(const body of [{id:randomUUID(),name:'QA',email:'qa@example.invalid',password:'short'},{id:randomUUID(),name:'QA',email:'not-email',password:'Synthetic-only-12'},{id:randomUUID(),name:'QA',email:'qa@example.invalid',password:'Synthetic-only-12',role:'admin'}])expect((await api(S.kevin,'create',body)).status).toBe(400)
 expect((await db.query('select * from team_seats')).rows).toHaveLength(0)
})
it('creates a distinct seller idempotently and never stores a plaintext password',async()=>{
 seat=randomUUID();const body={id:seat,name:'Synthetic Team QA',email:'new-team@example.invalid',password:'Synthetic-only-password-12'}
 const first=await api(S.kevin,'create',body),second=await api(S.kevin,'create',body);expect(first.status).toBe(200);expect(second.body).toEqual(first.body);user=first.body.userId
 await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[user])
 expect((await db.query('select role from beta_accounts where user_id=$1',[user])).rows[0].role).toBe('seller')
 expect((await db.query('select role,organization_id from sales_memberships where user_id=$1',[user])).rows[0]).toEqual({role:'seller',organization_id:S.org})
 expect((await db.query('select * from team_seats where id=$1',[seat])).rows).toHaveLength(1)
 expect(JSON.stringify((await db.query('select row_to_json(x) value from team_seats x')).rows)).not.toContain(body.password)
 expect((await db.query('select * from workers where user_id=$1',[user])).rows).toHaveLength(0)
 expect((await api(S.kevin,'create',{...body,id:randomUUID()})).body.error).toBe('TEAM_EMAIL_UNAVAILABLE')
 expect((await api(S.kevin,'create',{...body,id:randomUUID(),email:'worker-qa@example.invalid'})).body.error).toBe('TEAM_EMAIL_UNAVAILABLE')
})
it('SQL denies direct RPC/table access and IDOR; no one can adopt a worker or another organization seller',async()=>{
 await expect(asSalesUser(db,S.kevin,tx=>tx.query('select public.team_command($1,$1,$2,$3)',[S.kevin,'list','{}']))).rejects.toThrow(/permission denied/)
 for(const table of ['team_seats','team_member_versions','team_audit'])await expect(asSalesUser(db,S.kevin,tx=>tx.query('select * from '+table))).rejects.toThrow(/permission denied/)
 for(const target of [S.other,S.worker,S.kevin])expect((await api(S.kevin,'update',{userId:target,name:'Attempt',active:false,version:1})).status).toBe(403)
 await expect(salesRpc(db,user,'notes',{projectId:S.leadA})).rejects.toThrow(/SALES_LEAD_DENIED/)
})
it('deactivation revokes sessions and RLS access; retries are idempotent and stale edits conflict',async()=>{
 await db.query('insert into auth.refresh_tokens(user_id) values($1)',[user])
 const before=(await api(S.kevin)).body.members.find(m=>m.userId===user)
 const input={userId:user,name:before.name,active:false,version:before.version}
 const first=await api(S.kevin,'update',input),retry=await api(S.kevin,'update',input);expect(first.status).toBe(200);expect(retry.body).toEqual(first.body)
 expect((await db.query('select * from auth.sessions where user_id=$1',[user])).rows).toHaveLength(0)
 expect((await db.query('select * from auth.refresh_tokens where user_id=$1',[user])).rows).toHaveLength(0)
 await expect(salesRpc(db,user,'context')).rejects.toThrow(/SALES_ACCESS_DENIED/)
 expect((await api(S.kevin,'update',{...input,name:'Stale mutation'})).body.error).toBe('TEAM_CONFLICT')
 const current=(await api(S.kevin)).body.members.find(m=>m.userId===user)
 expect((await api(S.kevin,'update',{...input,active:true,version:current.version})).status).toBe(200)
 expect((await db.query('select * from auth.sessions where user_id=$1',[user])).rows).toHaveLength(0)
})
it('server fails closed before Auth provisioning when schema is not installed',async()=>{
 let created=0;const closed=createTeamHandler({db:{auth:{getUser:client.auth.getUser,admin:{createUser:()=>{created++}}},rpc:async()=>({error:{code:'PGRST202',message:'missing function'}})}})
 const r=await closed(new Request('http://localhost/api/workers/team/create',{method:'POST',headers:{Authorization:'Bearer '+token(S.kevin),'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),name:'QA',email:'pending@example.invalid',password:'Synthetic-only-12'})}))
 expect(r.status).toBe(503);expect((await r.json()).error).toBe('TEAM_SETUP_REQUIRED');expect(created).toBe(0)
})
it('draft is transactional, service-only and does not alter workers or existing owner policies',()=>{
 const sql=readFileSync('docs/team-provisioning-draft.sql','utf8');expect(sql).not.toMatch(/alter table public\.workers|drop policy|disable row level/i);expect(sql).toContain('revoke all on function public.team_command');expect(sql.trim()).toMatch(/commit;$/)
})
it('installs against the production schema in isolation, and deactivation removes direct document RLS visibility',async()=>{
 const isolated=await localDatabase()
 try{
  await isolated.exec(readFileSync('supabase/migrations/20261023180600_one_stop_sales_commercial_hybrid_costs.sql','utf8'))
  await isolated.exec(readFileSync('docs/team-provisioning-draft.sql','utf8'))
  const org=randomUUID();await isolated.query("insert into sales_organizations(id,name) values($1,'Synthetic production-schema QA')",[org]);await isolated.query("insert into sales_memberships(user_id,organization_id,name,role) values($1,$2,'Synthetic Admin','manager')",[B,org])
  const transport=localTeamClient(isolated),run=(action,p_input)=>transport.rpc('team_command',{p_actor:B,p_session:B,p_action:action,p_input})
  const reservation={id:randomUUID(),name:'New Synthetic Seller',email:'canonical-team@example.invalid'};expect((await run('reserve',reservation)).error).toBeNull()
  const created=await transport.auth.admin.createUser({email:reservation.email,app_metadata:{one_stop_team_seat:reservation.id}});const subject=created.data.user.id
  expect((await run('activate',{id:reservation.id})).error).toBeNull();await isolated.query('insert into auth.sessions(id,user_id) values($1,$1)',[subject])
  const estimate=randomUUID();await isolated.query("insert into estimates(id,owner_id,title) values($1,$2,'Synthetic own document')",[estimate,subject])
  expect((await asSalesUser(isolated,subject,tx=>tx.query('select id from estimates where id=$1',[estimate]))).rows).toHaveLength(1)
  expect((await run('update',{userId:subject,name:reservation.name,active:false,version:1})).error).toBeNull()
  expect((await asSalesUser(isolated,subject,tx=>tx.query('select id from estimates where id=$1',[estimate]))).rows).toHaveLength(0)
 }finally{await isolated.close()}
},60000)
