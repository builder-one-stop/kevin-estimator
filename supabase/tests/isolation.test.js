import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const migrations = readdirSync('supabase/migrations').sort().map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
const bootstrap = `create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb default '{}'::jsonb,
 updated_at timestamptz,confirmation_token text,confirmation_sent_at timestamptz,recovery_token text,recovery_sent_at timestamptz,
 email_change_token_current text,email_change_token_new text,email_change_sent_at timestamptz,
 phone_change_token text,phone_change_sent_at timestamptz,reauthentication_token text,reauthentication_sent_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(user_id text);create table auth.one_time_tokens(user_id uuid);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',auth.uid()) || coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;`
let db, clientA, clientB, projectA, projectB, estimateA, estimateB
const row = async (sql) => (await db.query(sql)).rows[0]
const asUser = async (id) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}'; set request.jwt.claims = '{"amr":[{"method":"password"}]}';`)
beforeAll(async () => {
  db = new PGlite()
  await db.exec(bootstrap)
  for (const migration of migrations) await db.exec(migration)
  await db.exec(`insert into auth.users(id) values ('${A}'), ('${B}'); insert into beta_accounts(user_id,role) values('${A}','operator'),('${B}','admin');insert into auth.sessions(id,user_id) values('${A}','${A}'),('${B}','${B}');`)
  for (const id of [A, B]) {
    await asUser(id)
    const client = await row("insert into clients(name) values ('Test client') returning *")
    const project = await row(`insert into projects(name, client_id) values ('Test project', '${client.id}') returning *`)
    const estimate = await row(`insert into estimates(client_id,project_id) values ('${client.id}','${project.id}') returning *`)
    if (id === A) { clientA = client; projectA = project; estimateA = estimate }
    else { clientB = client; projectB = project; estimateB = estimate }
  }
}, 30000)
afterAll(async () => { await db?.close() })

describe('actual SQL migrations and RLS (Postgres/PGlite)', () => {
  it('preserves legacy data and stops before assigning ownership', async () => {
    const legacy = new PGlite()
    try {
      await legacy.exec(bootstrap)
      for (const migration of migrations.slice(0, 4)) await legacy.exec(migration)
      await legacy.exec("insert into clients(name) values ('Unassigned'); insert into projects(name) values ('Unassigned')")
      await expect(legacy.exec(migrations[4])).rejects.toThrow('requires explicit reconciliation')
      await legacy.exec('rollback')
      expect((await legacy.query('select name from clients')).rows).toEqual([{ name: 'Unassigned' }])
      expect((await legacy.query('select name from projects')).rows).toEqual([{ name: 'Unassigned' }])
    } finally { await legacy.close() }
  })
  it('isolates reads, updates and deletes across two users', async () => {
    await asUser(A)
    for (const [table, own, other] of [['clients', clientA, clientB], ['projects', projectA, projectB], ['estimates', estimateA, estimateB]]) {
      expect((await db.query(`select id from ${table}`)).rows).toEqual([{ id: own.id }])
      expect((await db.query(`update ${table} set updated_at=now() where id='${other.id}' returning id`)).rows).toEqual([])
      expect((await db.query(`delete from ${table} where id='${other.id}' returning id`)).rows).toEqual([])
      await expect(db.exec(`update ${table} set owner_id='${B}' where id='${own.id}'`)).rejects.toThrow()
    }
  })
  it('denies anonymous reads and every write on all four tables', async () => {
    await db.exec("reset role; set role anon; set request.jwt.claim.sub = '';")
    for (const table of ['clients', 'projects', 'estimates', 'estimate_messages']) {
      for (const sql of [`select * from ${table}`, `delete from ${table}`, `update ${table} set id=id`, `insert into ${table} default values`]) {
        await expect(db.exec(sql)).rejects.toMatchObject({ code: '42501' })
      }
    }
  })
  it('rejects forged owners and foreign relationships on create and edit', async () => {
    await asUser(A)
    await expect(db.exec(`insert into clients(name,owner_id) values ('Forgery','${B}')`)).rejects.toThrow()
    await expect(db.exec(`insert into projects(name,client_id) values ('Foreign','${clientB.id}')`)).rejects.toThrow()
    await expect(db.exec(`update projects set client_id='${clientB.id}' where id='${projectA.id}'`)).rejects.toThrow()
    for (const fields of [`client_id='${clientB.id}'`, `project_id='${projectB.id}'`]) {
      await expect(db.exec(`update estimates set ${fields} where id='${estimateA.id}'`)).rejects.toThrow()
    }
    await expect(db.exec(`insert into estimates(project_id) values ('${projectB.id}')`)).rejects.toThrow()
    await expect(db.exec(`insert into estimates(client_id) values ('${clientB.id}')`)).rejects.toThrow()
    await expect(db.exec(`insert into estimates(owner_id) values ('${B}')`)).rejects.toThrow()
  })
  it('enforces project/client agreement in both directions', async () => {
    await asUser(A)
    const second = await row("insert into clients(name) values ('Second') returning *")
    await expect(db.exec(`update estimates set client_id='${second.id}' where id='${estimateA.id}'`)).rejects.toThrow('must match')
    await expect(db.exec(`update projects set client_id='${second.id}' where id='${projectA.id}'`)).rejects.toThrow('conflicts')
    await db.exec(`delete from clients where id='${second.id}'`)
  })
  it('allows authorized save, version conflict detection and reopening', async () => {
    await asUser(A)
    const saved = await row(`update estimates set title='Saved', markup_bps=2500 where id='${estimateA.id}' and version=1 returning *`)
    expect(saved).toMatchObject({ title: 'Saved', version: 2, markup_bps: 2500 })
    expect((await db.query(`update estimates set title='Stale' where id='${estimateA.id}' and version=1 returning *`)).rows).toEqual([])
    expect(await row(`select title, version from estimates where id='${estimateA.id}'`)).toEqual({ title: 'Saved', version: 2 })
  })
  it('isolates messages and rejects browser assistant impersonation', async () => {
    await asUser(A)
    await db.exec(`insert into estimate_messages(estimate_id,role,content) values ('${estimateA.id}','user','Test')`)
    await expect(db.exec(`insert into estimate_messages(estimate_id,role,content) values ('${estimateB.id}','user','Foreign')`)).rejects.toThrow()
    await expect(db.exec(`insert into estimate_messages(estimate_id,role,content) values ('${estimateA.id}','assistant','Fake')`)).rejects.toThrow()
    await asUser(B)
    expect((await db.query('select * from estimate_messages')).rows).toEqual([])
  })
  it('runs the rollback-only remote verification script', async () => {
    await db.exec('reset role')
    const result = await db.exec(readFileSync('supabase/tests/remote-isolation.sql', 'utf8'))
    expect(result.at(-1).rows[0].result).toContain('PASS:')
  })
  it('keeps estimates when authorized linked records are deleted', async () => {
    await asUser(B)
    await db.exec(`delete from clients where id='${clientB.id}'; delete from projects where id='${projectB.id}';`)
    expect(await row(`select client_id,project_id,owner_id from estimates where id='${estimateB.id}'`)).toEqual({ client_id: null, project_id: null, owner_id: B })
  })
})
