import {readFileSync} from 'node:fs'
import {localDatabase,A,B,LocalRepository} from './localRepository.js'
import {fail} from '../../shared/aiDomain.js'
export const SALES={kevin:B,otherManager:A,a:'10000000-0000-4000-8000-000000000003',b:'10000000-0000-4000-8000-000000000004',other:'10000000-0000-4000-8000-000000000005',worker:'10000000-0000-4000-8000-000000000006',org:'20000000-0000-4000-8000-000000000001',otherOrg:'20000000-0000-4000-8000-000000000002',leadA:'30000000-0000-4000-8000-000000000001',leadB:'30000000-0000-4000-8000-000000000002',unassigned:'30000000-0000-4000-8000-000000000003',otherLead:'30000000-0000-4000-8000-000000000004'}
export async function salesDatabase(dataDir){
 const db=await localDatabase(dataDir)
 if((await db.query("select to_regclass('public.sales_memberships') as t")).rows[0].t){
  // Isolated QA database only: preserve existing review data while allowing the
  // normal owner-authorized estimate deletion to remove its private link.
  const key=(await db.query("select confdeltype from pg_constraint where conname='sales_document_links_estimate_id_fkey'")).rows[0]
  if(key?.confdeltype!=='c')await db.exec('alter table public.sales_document_links drop constraint sales_document_links_estimate_id_fkey;alter table public.sales_document_links add constraint sales_document_links_estimate_id_fkey foreign key(estimate_id) references public.estimates(id) on delete cascade')
  const draft=readFileSync('docs/local-sales-schema.sql','utf8'),start=draft.indexOf('create function sales_private.gateway('),end=draft.indexOf('revoke all on all functions in schema sales_private',start)
  if(start<0||end<start)throw Error('LOCAL_SALES_GATEWAY_DRAFT_INVALID')
  await db.exec(draft.slice(start,end).replace('create function sales_private.gateway','create or replace function sales_private.gateway'))
  return withCommercial(db)
 }
 await db.exec(readFileSync('docs/local-sales-schema.sql','utf8'))
 // Only isolated synthetic users. No Supabase Auth API or remote connection.
 for(const user of [SALES.a,SALES.b,SALES.other,SALES.worker]){
  await db.query('insert into auth.users(id) values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[user])
 }
 for(const user of [SALES.a,SALES.b,SALES.other])await db.query("insert into beta_accounts(user_id,role) values($1,'seller')",[user])
 await db.query('insert into sales_organizations(id,name) values($1,$2),($3,$4)',[SALES.org,'One Stop QA',SALES.otherOrg,'Separate QA organization'])
 for(const [user,org,name,role] of [[B,SALES.org,'Kevin QA','manager'],[A,SALES.otherOrg,'Other manager QA','manager'],[SALES.a,SALES.org,'Seller A QA','seller'],[SALES.b,SALES.org,'Seller B QA','seller'],[SALES.other,SALES.otherOrg,'Other seller QA','seller']])await db.query('insert into sales_memberships(user_id,organization_id,name,role) values($1,$2,$3,$4)',[user,org,name,role])
 for(const [id,owner,org,seller,name] of [[SALES.leadA,B,SALES.org,SALES.a,'QA lead A'],[SALES.leadB,B,SALES.org,SALES.b,'QA lead B'],[SALES.unassigned,B,SALES.org,null,'QA unassigned'],[SALES.otherLead,A,SALES.otherOrg,SALES.other,'QA other organization']]){
  await db.query("insert into projects(id,owner_id,name,stage) values($1,$2,$3,'Lead')",[id,owner,name]);await db.query('insert into sales_project_access(project_id,organization_id,assigned_to) values($1,$2,$3)',[id,org,seller])
 }
 await db.query("insert into workers(id,user_id,manager_id,email,name) values($1,$1,$2,'worker-qa@example.invalid','Worker QA')",[SALES.worker,B])
 return withCommercial(db)
}
export async function asSalesUser(db,user,fn){return db.transaction(async tx=>{
 await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({amr:[{method:'password'}]})]);await tx.exec('set local role authenticated');return fn(tx)
})}
export async function salesRpc(db,user,action,data={}){return asSalesUser(db,user,async tx=>(await tx.query('select public.sales_gateway($1,$2) as value',[action,JSON.stringify(data)])).rows[0].value)}
export class SalesRepository extends LocalRepository{
 async owned(owner,table,id){if(['projects','clients'].includes(table)&&await this.access(owner)==='seller')throw fail('SALES_USE_SNAPSHOT_LINK',403);return super.owned(owner,table,id)}
 async review(){throw fail('ORGANIZATION_REVIEW_ONLY',403)}
 async access(user){if(user===SALES.worker)return 'worker';const role=await super.access(user);if(role==='seller'&&!(await this.query('select 1 from sales_memberships where user_id=$1 and active',[user])).length)return null;return role}
 async authenticate(token){const user=SALES[token?.replace('sales-','')];if(!user||!['kevin','otherManager','a','b','other','worker'].some(key=>token===`sales-${key}`))throw fail('UNAUTHORIZED',401);if(!await this.access(user))throw fail('UNAUTHORIZED',401);return user}
}

async function withCommercial(db){await db.exec(readFileSync('docs/local-commercial-schema.sql','utf8'));return db}
