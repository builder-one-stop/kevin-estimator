import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { localDatabase, LocalRepository, A, B } from './localRepository.js'
import { createEstimatorHandler } from '../../server/http.js'
import { SupabaseRepository } from '../../server/repository.js'
import { emptyDocument } from '../../src/lib/estimateDocument.js'
import { fixturePlan } from './fixture.js'
import bcrypt from 'bcryptjs'

const C = '10000000-0000-4000-8000-000000000003'
let db, repo, handle, kevin, own, estimate
const passwordClaims = JSON.stringify({ amr: [{ method: 'password' }] })
async function user(id, claims = passwordClaims) {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, claims])
}
async function request(path, token = 'fixture-b', method = 'GET', body = {}) {
  const response = await handle(new Request(`https://onestop-beta.netlify.app/api/ai/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  }))
  return { status: response.status, data: await response.json() }
}
beforeAll(async () => {
  db = await localDatabase(); repo = new LocalRepository(db)
  await db.query('insert into auth.users(id) values($1)', [C])
  for (const owner of [A, B, C]) await db.query('insert into clients(owner_id,name) values($1,$2)', [owner, 'Synthetic client'])
  const state = { messages: [{ id: randomUUID(), role: 'user', content: 'Synthetic question', createdAt: new Date().toISOString() }, { id: randomUUID(), role: 'assistant', content: 'Synthetic answer', createdAt: new Date().toISOString() }], plan: fixturePlan, planRevision: 1, approvedRevision: 1, documentLanguage: 'en', receipts: [], runs: [] }
  ;[estimate] = await repo.query('insert into estimates(owner_id,title,document) values($1,$2,$3) returning *', [A, 'Synthetic estimate', JSON.stringify(emptyDocument())])
  ;[kevin] = await repo.query('insert into ai_conversations(id,owner_id,title,state,estimate_id) values($1,$2,$3,$4,$5) returning *', [randomUUID(), A, 'Synthetic Kevin', JSON.stringify(state), estimate.id])
  ;[own] = await repo.query('insert into ai_conversations(id,owner_id,title,state) values($1,$2,$3,$4) returning *', [randomUUID(), B, 'Synthetic development', JSON.stringify(state)])
  ;({ handle } = createEstimatorHandler({ repo, provider: {}, logger: () => {} }))
}, 30000)
afterAll(async () => { await db?.close() })

describe('beta identity and read-only review in migrated PostgreSQL', () => {
  it('rejects an unauthorized authenticated identity on every data table without deleting its data', async () => {
    await user(C, JSON.stringify({ amr: [{ method: 'password' }], role: 'admin', email: 'homecolor45@gmail.com' }))
    for (const table of ['clients', 'projects', 'estimates', 'estimate_messages', 'ai_conversations', 'ai_settings', 'ai_attachments', 'estimate_revisions']) {
      expect((await db.query(`select * from ${table}`)).rows).toEqual([])
    }
    await expect(db.query('insert into clients(name) values($1)', ['Forgery'])).rejects.toMatchObject({ code: '42501' })
    await expect(db.exec("update beta_accounts set role='admin'")).rejects.toMatchObject({ code: '42501' })
    expect((await db.query('select beta_session_access() as access')).rows[0].access.role).toBeNull()
    await db.exec('reset role')
    expect((await db.query('select count(*)::int as n from clients where owner_id=$1', [C])).rows[0].n).toBe(1)
  })
  it('requires password authentication and keeps both authorized identities owner-only', async () => {
    await user(A, JSON.stringify({ amr: [{ method: 'otp' }] }))
    expect((await db.query('select * from clients')).rows).toEqual([])
    expect((await db.query('select beta_session_access() as access')).rows[0].access.role).toBeNull()
    for (const [id, role] of [[A, 'operator'], [B, 'admin']]) {
      await user(id)
      expect((await db.query('select beta_session_access() as access')).rows[0].access).toEqual({ userId: id, role })
      expect((await db.query('select owner_id from clients')).rows).toEqual([{ owner_id: id }])
      expect((await db.query('select owner_id from ai_conversations')).rows).toEqual([{ owner_id: id }])
    }
    await db.exec('reset role')
  })
  it('allows admin review of only Kevin, returns history/plan/estimate/revisions, and never writes', async () => {
    const before = await repo.get(A, kevin.id)
    expect((await request('admin/conversations')).data.map(x => x.id)).toEqual([kevin.id])
    const detail = await request(`admin/conversations/${kevin.id}`)
    expect(detail.status).toBe(200)
    expect(detail.data.conversation.state.messages).toHaveLength(2)
    expect(detail.data.conversation.state.plan).toEqual(fixturePlan)
    expect(detail.data.estimate.id).toBe(estimate.id)
    expect(detail.data.revisions).toHaveLength(1)
    expect((await request(`admin/conversations/${own.id}`)).status).toBe(404)
    expect((await repo.get(A, kevin.id))).toEqual(before)
    expect((await request('conversations')).data.map(x => x.id)).toEqual([own.id])
    expect((await request(`conversations/${kevin.id}`)).status).toBe(404)
  })
  it('rejects Kevin reviewing development data and all review mutations or impersonation', async () => {
    expect((await request('admin/conversations', 'fixture-a')).status).toBe(403)
    for (const method of ['POST', 'PATCH', 'DELETE']) expect((await request(`admin/conversations/${kevin.id}`, 'fixture-b', method, { owner: A, action: 'message' })).status).toBe(405)
    expect((await request(`conversations/${kevin.id}/commands`, 'fixture-b', 'POST', { requestId: randomUUID(), version: kevin.version, action: 'message', content: 'Impersonation' })).status).toBe(404)
    await user(B)
    await expect(db.query('select beta_review($1,$2)', [B, kevin.id])).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('select beta_register_accounts()')).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
  })
  it('denies revoked or expired sessions in RLS and the server-only token check', async () => {
    await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1", [A])
    await user(A)
    expect((await db.query('select * from clients')).rows).toEqual([])
    expect((await db.query('select beta_session_access() as access')).rows[0].access.role).toBeNull()
    await db.exec('reset role; set role service_role')
    expect((await db.query('select beta_token_access($1,$2) as role', [A, A])).rows[0].role).toBeNull()
    await db.exec('reset role')
    await db.query('update auth.sessions set not_after=null where id=$1', [A])
    await db.query('delete from auth.sessions where id=$1', [A])
    await user(A)
    expect((await db.query('select * from clients')).rows).toEqual([])
    await expect(db.query('select beta_token_access($1,$2)', [A, A])).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role')
    await db.query('insert into auth.sessions(id,user_id) values($1,$1)', [A])
  })
  it('blocks direct password changes and allows only the service-only administrative hash setter', async () => {
    await db.exec('create role supabase_auth_admin; grant usage on schema auth to supabase_auth_admin; grant select,update on auth.users to supabase_auth_admin; set role supabase_auth_admin')
    await expect(db.query('update auth.users set encrypted_password=$1 where id=$2', ['forged', C])).rejects.toThrow('BETA_PASSWORD_ADMIN_ONLY')
    await db.exec('reset role')
    const hash = await bcrypt.hash('synthetic-test-password', 10)
    await user(B)
    await expect(db.query('select beta_admin_set_password($1,$2)', [A, hash])).rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role; set role service_role')
    await expect(db.query('select beta_admin_set_password($1,$2)', [C, hash])).rejects.toThrow('BETA_ACCOUNT_REQUIRED')
    await expect(db.query('select beta_admin_set_password($1,$2)', [A, null])).rejects.toThrow('BETA_INVALID_PASSWORD_HASH')
    await db.query('select beta_admin_set_password($1,$2)', [A, hash])
    await db.exec('reset role')
    const row = (await db.query('select encrypted_password from auth.users where id=$1', [A])).rows[0]
    expect(await bcrypt.compare('synthetic-test-password', row.encrypted_password)).toBe(true)
    await db.exec('set role supabase_auth_admin')
    await expect(db.query('update auth.users set encrypted_password=$1 where id=$2', ['forged-again', A])).rejects.toThrow('BETA_PASSWORD_ADMIN_ONLY')
    await db.exec('reset role')
  })
})

describe('server token verification', () => {
  it('checks membership and password AMR after Supabase validates the user', async () => {
    const repository = new SupabaseRepository('https://vtpciccluvpaclbeqxih.supabase.co', 'test-only-key')
    repository.db = { auth: { getUser: async () => ({ data: { user: { id: A } } }) } }
    repository.tokenAccess = async () => null
    const token = claims => `test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.verified-by-supabase`
    await expect(repository.authenticate(token({ sub: A, session_id: A, amr: [{ method: 'password' }], role: 'admin' }))).rejects.toMatchObject({ code: 'BETA_ACCESS_DENIED' })
    repository.tokenAccess = async () => 'operator'
    await expect(repository.authenticate(token({ sub: A, session_id: A, amr: [{ method: 'otp' }] }))).rejects.toMatchObject({ code: 'BETA_ACCESS_DENIED' })
    await expect(repository.authenticate(token({ sub: B, session_id: B, amr: [{ method: 'password' }] }))).rejects.toMatchObject({ code: 'BETA_ACCESS_DENIED' })
    expect(await repository.authenticate(token({ sub: A, session_id: A, amr: [{ method: 'password' }] }))).toBe(A)
  })
})
