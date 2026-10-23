import {it,expect,beforeAll,afterAll} from 'vitest'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {localDatabase,A,B} from './localRepository.js'
import {SupabaseRepository} from '../../server/repository.js'
import {SupabaseActualCosts} from '../../server/supabaseActualCosts.js'
let db,repo,originalProject,originalEstimate
const org=randomUUID(),seller=randomUUID(),other=randomUUID(),otherOrg=randomUUID()
// Test-only PostgREST transport over real PGlite permissions; production repository is unchanged.
function transport(db){
 const run=async(sql,args)=>{try{return await db.transaction(async tx=>{await tx.exec('set local role service_role');return {data:(await tx.query(sql,args)).rows,error:null}})}catch(e){return {data:null,error:{code:e.code,message:e.message}}}}
 return {from(table){let columns='*',conditions=[],args=[],single=false
  const builder={select(x){columns=x;return builder},eq(k,v){args.push(v);conditions.push(k+'=$'+args.length);return builder},maybeSingle(){single=true;return builder},then(resolve,reject){return run(`select ${columns} from public.${table}${conditions.length?' where '+conditions.join(' and '):''}`,args).then(r=>resolve({...r,data:r.error?null:single?r.data[0]||null:r.data}),reject)}}
  return builder
 },rpc(name,input){const values=Object.values(input),params=Object.keys(input).map((k,i)=>k+'=> $'+(i+1)).join(',');return run('select public.'+name+'('+params+') as value',values).then(r=>({...r,data:r.error?null:r.data[0].value}))}}
}
beforeAll(async()=>{
 db=await localDatabase();originalProject=randomUUID();originalEstimate=randomUUID()
 await db.query("insert into projects(id,owner_id,name,stage) values($1,$2,'Existing retained lead','Lead')",[originalProject,A])
 await db.query("insert into estimates(id,owner_id,title,document) values($1,$2,'Retained estimate',$3)",[originalEstimate,B,JSON.stringify({sections:[{id:'s',items:[{id:'i',description:'Synthetic material',quantity:2,unitCost:50,costType:'material'}]}]})])
 await db.exec(readFileSync('supabase/migrations/20261023180600_one_stop_sales_commercial_hybrid_costs.sql','utf8'))
 await db.query("insert into auth.users(id) values($1),($2)",[seller,other]);await db.query("insert into auth.sessions(id,user_id) values($1,$1),($2,$2)",[seller,other]);await db.query("insert into beta_accounts(user_id,role) values($1,'seller'),($2,'seller')",[seller,other])
 await db.query("insert into sales_organizations(id,name) values($1,'Local One Stop'),($2,'Separate local organization')",[org,otherOrg])
 for(const [id,organization,role]of [[A,org,'manager'],[B,org,'manager'],[seller,org,'seller'],[other,otherOrg,'seller']])await db.query('insert into sales_memberships(user_id,organization_id,name,role) values($1,$2,$3,$4)',[id,organization,'SYNTHETIC '+role,role])
 repo=Object.create(SupabaseRepository.prototype);repo.salesEnabled=true;repo.db=transport(db)
},60000)
afterAll(async()=>{await db?.close()})
const asUser=(user,fn)=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await tx.exec('set local role authenticated');return fn(tx)})
it('applies the complete draft atomically without changing existing data or assigning historical leads',async()=>{
 expect((await db.query('select owner_id,name from projects where id=$1',[originalProject])).rows[0]).toEqual({owner_id:A,name:'Existing retained lead'})
 expect((await db.query('select * from sales_project_access where project_id=$1',[originalProject])).rows).toHaveLength(0)
 expect((await repo.estimate(B,originalEstimate)).title).toBe('Retained estimate')
 const project=randomUUID();await db.query("insert into projects(id,owner_id,name) values($1,$2,'New isolated lead')",[project,A])
 expect((await db.query('select organization_id,assigned_to from sales_project_access where project_id=$1',[project])).rows[0]).toEqual({organization_id:org,assigned_to:null})
})
it('uses production membership checks and forbids dynamic lead/client links for sellers',async()=>{
 repo.db.auth={getUser:async()=>({data:{user:{id:seller}},error:null})};repo.tokenAccess=async()=>true
 const token=['e30',Buffer.from(JSON.stringify({sub:seller,session_id:randomUUID(),amr:[{method:'password'}]})).toString('base64url'),'synthetic'].join('.')
 expect(await repo.authenticate(token)).toBe(seller)
 expect(await repo.access(seller)).toBe('seller')
 await expect(repo.owned(seller,'projects',originalProject)).rejects.toMatchObject({code:'SALES_USE_SNAPSHOT_LINK'})
 await db.query('update sales_memberships set active=false where user_id=$1',[seller]);expect(await repo.access(seller)).toBeNull()
 await expect(repo.authenticate(token)).rejects.toMatchObject({code:'BETA_ACCESS_DENIED'})
 await expect(db.query("insert into estimates(owner_id,title) values($1,'Denied revoked member')",[seller])).rejects.toThrow('ACCESS_DENIED')
 await db.query('update sales_memberships set active=true where user_id=$1',[seller])
 const fake=randomUUID();await expect(db.query("insert into estimates(owner_id,title,project_id) values($1,'Forbidden dynamic link',$2)",[seller,originalProject])).rejects.toThrow('SALES_USE_SNAPSHOT_LINK')
 await expect(repo.estimate(seller,fake)).rejects.toMatchObject({status:403})
})
it('rolls back the entire schema expansion if any pre-commit step fails',async()=>{
 const isolated=await localDatabase(),id=randomUUID()
 try{
 await isolated.query("insert into projects(id,owner_id,name) values($1,$2,'SYNTHETIC rollback preserved')",[id,A])
 const sql=readFileSync('supabase/migrations/20261023180600_one_stop_sales_commercial_hybrid_costs.sql','utf8').replace(/commit;\s*$/,()=>"do $$begin raise exception 'SIMULATED_PRECOMMIT_FAILURE';end $$;\ncommit;")
 await expect(isolated.exec(sql)).rejects.toThrow('SIMULATED_PRECOMMIT_FAILURE')
 await isolated.exec('rollback')
 expect((await isolated.query("select to_regclass('public.sales_memberships') as t")).rows[0].t).toBeNull()
 expect((await isolated.query('select owner_id from projects where id=$1',[id])).rows[0].owner_id).toBe(A)
 expect((await isolated.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conname='beta_accounts_role_check'")).rows[0].definition).not.toContain('seller')
 }finally{await isolated.close()}
},30000)
it('persists actual costs across repository instances and deduplicates retries across DB requests',async()=>{
 const estimate=await repo.estimate(B,originalEstimate),store=new SupabaseActualCosts(repo)
 const input={requestId:randomUUID(),category:'material',amountUsd:120,date:'2026-10-23',note:'SYNTHETIC isolated receipt',currency:'USD'}
 await store.add(B,estimate,input);await new SupabaseActualCosts(repo).add(B,estimate,input)
 const records=await store.list(B,estimate.id);expect(records).toHaveLength(1);expect(records[0]).toMatchObject({amountCents:12000,priceVerification:false,automaticLearning:false,budgetSnapshot:{knownCostCents:10000}})
 await expect(store.add(B,estimate,{...input,amountUsd:121})).rejects.toMatchObject({status:409})
 await expect(store.list(A,estimate.id)).rejects.toMatchObject({status:403})
 await expect(store.add(B,{...estimate,version:estimate.version+1},{...input,requestId:randomUUID()})).rejects.toMatchObject({status:409})
 await expect(db.transaction(async tx=>{await tx.exec('set local role authenticated');return tx.query('select public.actual_cost_gateway($1,$2)',[B,estimate.id])})).rejects.toThrow(/permission denied/)
})
it('supervises only active same-organization conversations and closes the legacy global review shortcut',async()=>{
 const own=randomUUID(),foreign=randomUUID()
 for(const [id,owner]of [[own,seller],[foreign,other]])await db.query("insert into ai_conversations(id,owner_id,title,state) values($1,$2,'SYNTHETIC review','{}')",[id,owner])
 expect((await repo.review(B)).map(x=>x.id)).toContain(own)
 expect((await repo.review(B)).map(x=>x.id)).not.toContain(foreign)
 await expect(repo.review(B,foreign)).rejects.toMatchObject({status:404})
 expect((await repo.review(B,own)).conversation.owner_id).toBe(seller)
 await expect(repo.review(A)).rejects.toMatchObject({status:403})
 const legacy=await repo.result(repo.db.rpc('beta_review',{p_actor:B,p_id:foreign}));expect(legacy).toBeNull()
})
it('revokes lead access after reassignment while keeping only the seller own static document',async()=>{
 const project=randomUUID(),document=randomUUID()
 await db.query("insert into projects(id,owner_id,name) values($1,$2,'SYNTHETIC reassignment lead')",[project,A])
 const rpc=(user,action,data)=>asUser(user,async tx=>(await tx.query('select public.sales_gateway($1,$2) as value',[action,JSON.stringify(data)])).rows[0].value)
 await rpc(B,'assign',{projectId:project,sellerId:seller,version:1})
 await rpc(seller,'create-document',{projectId:project,id:document,title:'SYNTHETIC seller snapshot'})
 await rpc(B,'assign',{projectId:project,sellerId:null,version:2})
 await expect(rpc(seller,'notes',{projectId:project})).rejects.toThrow('SALES_LEAD_DENIED')
 const retained=await repo.estimate(seller,document);expect(retained.project_id).toBeNull();expect(retained.client_id).toBeNull()
 const view=await rpc(seller,'document',{id:document});expect(view.sales_snapshot.name).toBe('SYNTHETIC reassignment lead')
 await expect(repo.owned(seller,'projects',project)).rejects.toMatchObject({status:403})
})
it('revokes inactive manager access in both API role checks and direct authenticated RLS',async()=>{
 await db.query('update sales_memberships set active=false where user_id=$1',[B])
 try{
 expect(await repo.access(B)).toBeNull()
 expect((await asUser(B,tx=>tx.query('select id from estimates where id=$1',[originalEstimate]))).rows).toHaveLength(0)
 }finally{await db.query('update sales_memberships set active=true where user_id=$1',[B])}
})
