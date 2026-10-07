import { PGlite } from '@electric-sql/pglite'
import { readFileSync,readdirSync } from 'node:fs'
import { fail } from '../../shared/aiDomain.js'
export const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002'
export async function localDatabase(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;
 create policy preexisting_global_policy on storage.objects for all to anon,authenticated using(true) with check(true);`)
 for(const file of readdirSync('supabase/migrations').sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
 await db.exec(`insert into auth.users values('${A}'),('${B}');grant all on all tables in schema public to service_role;`)
 return db
}
export class LocalRepository{
 constructor(db){this.db=db;this.files=new Map()}
 async query(sql,args=[]){try{return (await this.db.query(sql,args)).rows}catch(e){if(/CONFLICT|23505|ai_one_run/.test(`${e.message} ${e.code}`))throw fail('CONFLICT',409);throw e}}
 async authenticate(token){if(token==='fixture-a')return A;if(token==='fixture-b')return B;throw fail('UNAUTHORIZED',401)}
 async get(owner,id){const [row]=await this.query('select * from ai_conversations where owner_id=$1 and id=$2',[owner,id]);if(!row)throw fail('NOT_FOUND',404);return row}
 async list(owner){return this.query('select * from ai_conversations where owner_id=$1 order by updated_at desc',[owner])}
 async commit(owner,row,expected,estimate=null,estimateVersion=null,origin='ai'){const [x]=await this.query('select ai_commit($1,$2,$3,$4,$5,$6,$7) as value',[owner,row.id,expected,JSON.stringify(row),estimate?JSON.stringify(estimate):null,estimateVersion,origin]);return x.value}
 async expire(owner){for(const row of await this.list(owner))if(row.state.run?.status==='working'&&Date.now()-Date.parse(row.state.run.startedAt)>150000){row.state.run={...row.state.run,status:'error',error:'RUN_EXPIRED'};await this.commit(owner,row,row.version)}}
 async owned(owner,table,id){if(!['estimates','clients','projects'].includes(table))throw fail('UNAUTHORIZED_TOOL',403);const [row]=await this.query(`select * from ${table} where owner_id=$1 and id=$2`,[owner,id]);if(!row)throw fail('FORBIDDEN_RELATION',403);return row}
 async estimate(owner,id){return this.owned(owner,'estimates',id)}
 async settings(owner){return (await this.query('select * from ai_settings where owner_id=$1',[owner]))[0]||null}
 async saveSettings(owner,data,version){const [row]=version===0?await this.query('insert into ai_settings(owner_id,data) values($1,$2) returning *',[owner,JSON.stringify(data)]):await this.query('update ai_settings set data=$1,version=version+1 where owner_id=$2 and version=$3 returning *',[JSON.stringify(data),owner,version]);if(!row)throw fail('CONFLICT',409);return row}
 async revisions(owner,id){await this.estimate(owner,id);return this.query('select * from estimate_revisions where owner_id=$1 and estimate_id=$2 order by version desc',[owner,id])}
 async assets(owner,id){await this.get(owner,id);return this.query('select * from ai_attachments where owner_id=$1 and conversation_id=$2 order by created_at',[owner,id])}
 async asset(owner,id){const [row]=await this.query('select * from ai_attachments where owner_id=$1 and id=$2',[owner,id]);if(!row)throw fail('NOT_FOUND',404);return row}
 async upload(owner,conversation,id,bytes,mime){const [row]=await this.query('insert into ai_attachments(id,owner_id,conversation_id,path,mime,size) values($1,$2,$3,$4,$5,$6) returning *',[id,owner,conversation,`${owner}/${conversation}/${id}`,mime,bytes.length]);this.files.set(id,{bytes,mime});return row}
 async image(owner,id){await this.asset(owner,id);return this.files.get(id)}
 async deleteAsset(owner,id){await this.asset(owner,id);this.files.delete(id);await this.query('delete from ai_attachments where owner_id=$1 and id=$2',[owner,id])}
}
