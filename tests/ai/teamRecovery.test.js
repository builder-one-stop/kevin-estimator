import {beforeAll,afterAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {salesDatabase,SALES as S,salesRpc} from './salesFixture.js'
import {localTeamClient} from '../../scripts/team-local-adapter.mjs'
import {createTeamHandler} from '../../server/team.js'
let db,base
beforeAll(async()=>{db=await salesDatabase();base=localTeamClient(db)},60000)
afterAll(async()=>{await db?.close()})
const token=user=>'local.'+Buffer.from(JSON.stringify({sub:user,session_id:user,amr:[{method:'password'}]})).toString('base64url')+'.synthetic'
const createInput=()=>({id:randomUUID(),name:'Synthetic Recovery Seller',email:'recovery-'+randomUUID()+'@example.invalid',password:'Synthetic-only-password-12'})
async function call(client,action,body,actor=S.kevin){
 const response=await createTeamHandler({db:client})(new Request('http://localhost/api/workers/team/'+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(actor),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}))
 return {status:response.status,body:await response.json()}
}
function injected(mode){
 let fail=true,authCalls=0
 return {get authCalls(){return authCalls},auth:{getUser:base.auth.getUser,admin:{createUser:async data=>{authCalls++;return base.auth.admin.createUser(data)}}},rpc:async(name,args)=>{
  if(args.p_action!=='activate'||!fail)return base.rpc(name,args)
  fail=false
  if(mode==='rollback'){
   try{await db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query('select public.team_command($1,$2,$3,$4)',[args.p_actor,args.p_session,args.p_action,JSON.stringify(args.p_input)]);await tx.exec("do $$begin raise exception 'SYNTHETIC_COMMIT_FAILURE';end$$")})}catch{/* Deliberate post-write transaction rollback, not a fake success. */}
   return {error:{code:'XX000',message:'synthetic commit failure'}}
  }
  if(mode==='lost-response'){await base.rpc(name,args);return {error:{code:'NETWORK',message:'synthetic response loss'}}}
  throw Error('Unknown fault')
 }}
}
it('recovers Auth-created/SQL-commit-failed with the same request, without adopting an orphan or changing role',async()=>{
 const body=createInput(),client=injected('rollback'),failed=await call(client,'create',body)
 expect(failed.status).toBe(503)
 const users=(await db.query('select id,raw_app_meta_data from auth.users where email=$1',[body.email])).rows
 expect(users).toHaveLength(1);expect(users[0].raw_app_meta_data.one_stop_team_seat).toBe(body.id)
 const uid=users[0].id
 expect((await db.query('select user_id from team_seats where id=$1',[body.id])).rows[0].user_id).toBeNull()
 expect((await db.query('select * from beta_accounts where user_id=$1',[uid])).rows).toHaveLength(0)
 expect((await db.query('select * from sales_memberships where user_id=$1',[uid])).rows).toHaveLength(0)
 expect((await db.query('select * from team_audit where target=$1',[uid])).rows).toHaveLength(0)
 await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid])
 await expect(salesRpc(db,uid,'context')).rejects.toThrow(/SALES_ACCESS_DENIED/)
 expect((await call(base,'create',{...body,id:randomUUID()})).body.error).toBe('TEAM_EMAIL_UNAVAILABLE')
 expect((await call(base,'create',body,S.otherManager)).status).toBe(403)
 const recovered=await call(client,'create',body);expect(recovered.status).toBe(200);expect(recovered.body.userId).toBe(uid);expect(client.authCalls).toBe(1)
 expect((await db.query('select role from beta_accounts where user_id=$1',[uid])).rows).toEqual([{role:'seller'}])
 expect((await db.query('select role,organization_id from sales_memberships where user_id=$1',[uid])).rows).toEqual([{role:'seller',organization_id:S.org}])
 expect((await db.query("select * from team_audit where target=$1 and action='created'",[uid])).rows).toHaveLength(1)
})
it('a lost committed response retries once without a second identity, role grant or creation audit',async()=>{
 const body=createInput(),client=injected('lost-response');expect((await call(client,'create',body)).status).toBe(503)
 const uid=(await db.query('select user_id from team_seats where id=$1',[body.id])).rows[0].user_id
 expect(uid).toBeTruthy();expect((await call(client,'create',body)).body.userId).toBe(uid);expect(client.authCalls).toBe(1)
 expect((await db.query('select id from auth.users where email=$1',[body.email])).rows).toHaveLength(1)
 expect((await db.query("select id from team_audit where target=$1 and action='created'",[uid])).rows).toHaveLength(1)
})
it('an old create retry never reactivates an account deactivated after its uncertain success',async()=>{
 const body=createInput(),client=injected('lost-response');await call(client,'create',body)
 const uid=(await db.query('select user_id from team_seats where id=$1',[body.id])).rows[0].user_id
 expect((await call(base,'update',{userId:uid,name:body.name,active:false,version:1})).status).toBe(200)
 expect((await call(client,'create',body)).status).toBe(200)
 expect((await db.query('select active from sales_memberships where user_id=$1',[uid])).rows[0].active).toBe(false)
})
it('simultaneous retries of one request create one Auth identity, one seller membership and one audit',async()=>{
 const body=createInput(),responses=await Promise.all([call(base,'create',body),call(base,'create',body)])
 expect(responses.map(x=>x.status)).toEqual([200,200]);expect(responses[0].body).toEqual(responses[1].body)
 const uid=responses[0].body.userId
 expect((await db.query('select id from auth.users where email=$1',[body.email])).rows).toHaveLength(1)
 expect((await db.query('select * from sales_memberships where user_id=$1',[uid])).rows).toHaveLength(1)
 expect((await db.query("select * from team_audit where target=$1 and action='created'",[uid])).rows).toHaveLength(1)
})
it('two different concurrent requests for one email have one winner and do not adopt the winning identity',async()=>{
 const body=createInput(),other={...body,id:randomUUID()},responses=await Promise.all([call(base,'create',body),call(base,'create',other)])
 expect(responses.map(x=>x.status).sort()).toEqual([200,409]);expect(responses.find(x=>x.status===409).body.error).toBe('TEAM_EMAIL_UNAVAILABLE')
 expect((await db.query('select * from auth.users where email=$1',[body.email])).rows).toHaveLength(1)
 expect((await db.query('select * from team_seats where email=$1',[body.email])).rows).toHaveLength(1)
})
it('concurrent deactivation/edit has one winner, no silent reactivation, and resolves stale intent after reload',async()=>{
 const body=createInput(),created=await call(base,'create',body),uid=created.body.userId
 await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid]);await db.query('insert into auth.refresh_tokens(user_id) values($1)',[uid])
 const deactivate={userId:uid,name:body.name,active:false,version:1},edit={...deactivate,name:'Edited Synthetic Seller',active:true}
 const responses=await Promise.all([call(base,'update',deactivate),call(base,'update',edit)])
 expect(responses.map(x=>x.status).sort()).toEqual([200,409])
 const member=(await call(base,'')).body.members.find(x=>x.userId===uid)
 expect(member.version).toBe(2)
 if(member.active)expect(member.name).toBe(edit.name);else expect(member.name).toBe(deactivate.name)
 const intent={userId:uid,name:member.name,active:false,version:member.version}
 const confirmed=await call(base,'update',intent);expect(confirmed.status).toBe(200)
 expect((await call(base,'update',intent)).body).toEqual(confirmed.body)
 expect((await db.query('select * from auth.sessions where user_id=$1',[uid])).rows).toHaveLength(0)
 expect((await db.query('select * from auth.refresh_tokens where user_id=$1',[uid])).rows).toHaveLength(0)
 expect((await db.query("select * from team_audit where target=$1 and action='deactivated'",[uid])).rows).toHaveLength(1)
})
