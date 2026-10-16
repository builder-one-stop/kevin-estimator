import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, afterAll, it, expect } from 'vitest'
import { bootstrap } from './workers-bootstrap.js'
const A = '10000000-0000-4000-8000-000000000001',
  B = '10000000-0000-4000-8000-000000000002',
  U = '10000000-0000-4000-8000-000000000003',
  V = '10000000-0000-4000-8000-000000000004'
let db, w, v, p, q, s
const id = () => crypto.randomUUID()
const sql = (x) => `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`
async function command(actor, action, input = {}) {
  if(action==='clock'&&input.kind==='in')input={...input,location:{latitude:34.05,longitude:-118.25,accuracy:25,capturedAt:new Date().toISOString()}}
  await db.exec('reset role')
  return (await db.query(`select workers_command('${actor}','${actor}','${action}',${sql(input)}) x`)).rows[0]
    .x
}
async function asUser(u) {
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${u}';set request.jwt.claims='{"amr":[{"method":"password"}]}';`,
  )
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(bootstrap)
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
  await db.exec(
    `insert into auth.users(id,email) values('${A}','manager@test.invalid'),('${B}','other@test.invalid'),('${U}','worker@test.invalid'),('${V}','other-worker@test.invalid');insert into beta_accounts(user_id,role) values('${A}','operator'),('${B}','admin');insert into auth.sessions(id,user_id) values('${A}','${A}'),('${B}','${B}'),('${U}','${U}'),('${V}','${V}');`,
  )
  p = id()
  q = id()
  w = id()
  v = id()
  await db.exec(
    `insert into projects(id,name,owner_id) values('${p}','Worksite','${A}'),('${q}','Other','${B}');insert into workers(id,user_id,manager_id,email,name) values('${w}','${U}','${A}','worker@test.invalid','Worker A'),('${v}','${V}','${B}','other-worker@test.invalid','Worker B');`,
  )
  await command(A, 'update_worker', { workerId: w, name: 'Worker A', active: true, projects: [p] })
}, 30000)
afterAll(async () => {
  await db?.close()
})
it('isolates manager ownership, safe project fields and worker accounts from every CRM table', async () => {
  await expect(
    command(B, 'update_worker', { workerId: w, name: 'No', active: true, projects: [] }),
  ).rejects.toThrow('ACCESS_DENIED')
  await expect(
    command(A, 'update_worker', { workerId: w, name: 'No', active: true, projects: [q] }),
  ).rejects.toThrow('ACCESS_DENIED')
  const d = await command(U, 'dashboard')
  expect(d.projects).toEqual([{ id: p, name: 'Worksite', address: null }])
  expect(d.workers).toHaveLength(1)
  await asUser(U)
  expect((await db.query('select beta_session_access() x')).rows[0].x.role).toBe('worker')
  for (const table of [
    'clients',
    'projects',
    'estimates',
    'estimate_messages',
    'ai_conversations',
    'ai_settings',
    'ai_attachments',
    'estimate_revisions',
  ])
    expect((await db.query(`select * from ${table}`)).rows).toEqual([])
  await expect(db.exec(`insert into clients(name)values('forged')`)).rejects.toThrow()
  await expect(db.exec(`update workers set manager_id='${U}'`)).rejects.toThrow()
  await expect(db.exec(`select workers_command('${A}','${A}','dashboard')`)).rejects.toThrow(
    'permission denied',
  )
  await db.exec('reset role;set role anon')
  await expect(db.exec('select * from workers')).rejects.toThrow()
})
it('uses server time, deduplicates requests, and permits only valid sequential transitions', async () => {
  const req = { id: id(), projectId: p, kind: 'in' }
  s = await command(U, 'clock', req)
  expect((await command(U, 'clock', req)).id).toBe(s.id)
  await expect(command(U, 'clock', { ...req, id: id() })).rejects.toThrow('SHIFT_ALREADY_OPEN')
  await expect(command(U, 'clock', { id: id(), projectId: p, kind: 'break_end' })).rejects.toThrow(
    'INVALID_SEQUENCE',
  )
  await command(U, 'clock', { id: id(), projectId: p, kind: 'break_start' })
  await expect(command(U, 'clock', { id: id(), projectId: p, kind: 'out' })).rejects.toThrow(
    'CONFIRM_BREAK_CLOSE',
  )
  await expect(
    command(A, 'update_worker', { workerId: w, name: 'A', active: false, projects: [] }),
  ).rejects.toThrow('OPEN_SHIFT_RESOLUTION_REQUIRED')
  s = await command(U, 'clock', { id: id(), projectId: p, kind: 'out', closeBreak: true })
  expect(s.events.map((e) => e.kind)).toEqual(['in', 'break_start', 'break_end', 'out'])
  expect(s.ended_at).toBeTruthy()
})
it('audits correction approval and rejects invalid chronology and overlap', async () => {
  const old = s.events[0]
  const earlier = new Date(Date.parse(old.at) - 3600000).toISOString()
  const c = await command(U, 'request_correction', {
    shiftId: s.id,
    eventId: old.id,
    kind: null,
    at: earlier,
    reason: 'Forgot first entry',
  })
  await expect(
    command(V, 'review_correction', { correctionId: c.id, decision: 'approve', reason: 'Verified' }),
  ).rejects.toThrow('ACCESS_DENIED')
  const approved = await command(A, 'review_correction', {
    correctionId: c.id,
    decision: 'approve',
    reason: 'Verified record',
  })
  expect(approved.before_events[0].at).toBe(old.at)
  expect(Date.parse(approved.after_events[0].at)).toBe(Date.parse(earlier))
  await expect(
    command(A, 'admin_correction', {
      shiftId: s.id,
      eventId: old.id,
      kind: null,
      at: new Date(Date.now() + 3600000).toISOString(),
      reason: 'Invalid future',
    }),
  ).rejects.toThrow('INVALID_CHRONOLOGY')
  const next = await command(U, 'clock', { id: id(), projectId: p, kind: 'in' })
  await expect(
    command(A, 'admin_correction', {
      shiftId: next.id,
      eventId: next.events[0].id,
      kind: null,
      at: earlier,
      reason: 'Overlaps previous',
    }),
  ).rejects.toThrow('SHIFT_OVERLAP')
  await command(U, 'clock', { id: id(), projectId: p, kind: 'out' })
  await db.exec('reset role')
  expect(
    (await db.query(`select original_events from worker_shifts where id='${s.id}'`)).rows[0]
      .original_events[0].at,
  ).toBe(old.at)
})
it('reserves idempotent evidence and immediately revokes assignment and disabled session access', async () => {
  const req = { id: id(), projectId: p, mime: 'image/jpeg', bytes: 100 }
  const e = await command(U, 'reserve_evidence', req)
  expect((await command(U, 'reserve_evidence', req)).path).toBe(e.path)
  await expect(command(V, 'get_evidence', { evidenceId: e.id })).rejects.toThrow('ACCESS_DENIED')
  await command(A, 'update_worker', { workerId: w, name: 'Worker A', active: true, projects: [] })
  expect((await command(U, 'dashboard')).projects).toEqual([])
  await expect(command(U, 'get_evidence', { evidenceId: e.id })).rejects.toThrow('ACCESS_DENIED')
  await expect(command(U, 'reserve_evidence', { ...req, id: id() })).rejects.toThrow('ACCESS_DENIED')
  expect((await command(A, 'dashboard')).evidence).toHaveLength(1)
  await command(A, 'update_worker', { workerId: w, name: 'Worker A', active: false, projects: [] })
  await expect(command(U, 'dashboard')).rejects.toThrow('ACCESS_DENIED')
  await asUser(U)
  expect((await db.query('select beta_session_access() x')).rows[0].x.role).toBe(null)
})
it('lets administration record a missing historical block and insert an omitted break atomically', async () => {
  const start = { id: id(), kind: 'in', at: '2026-07-01T15:00:00Z' },
    end = { id: id(), kind: 'out', at: '2026-07-01T23:00:00Z' }
  const shift = await command(A, 'admin_shift', {
    id: id(),
    workerId: w,
    projectId: p,
    events: [start, end],
    reason: 'Verified omitted day',
  })
  expect(shift.original_events).toEqual([])
  const input = {
    shiftId: shift.id,
    version: shift.version,
    reason: 'Verified omitted lunch',
    events: [
      start,
      { id: id(), kind: 'break_start', at: '2026-07-01T19:00:00Z' },
      { id: id(), kind: 'break_end', at: '2026-07-01T19:30:00Z' },
      end,
    ],
  }
  const corrected = await command(A, 'admin_batch', input)
  expect(corrected.events).toHaveLength(4)
  expect(corrected.original_events).toEqual([])
  await expect(command(A, 'admin_batch', input)).rejects.toThrow('CONFLICT')
  await expect(
    command(A, 'admin_batch', { ...input, version: corrected.version, events: [start, end] }),
  ).rejects.toThrow('INVALID_EVENT')
})
it('storage policies allow only reserved uploads, never direct downloads or overwrite', async () => {
  await command(A, 'update_worker', { workerId: w, name: 'Worker A', active: true, projects: [p] })
  await db.exec(
    `reset role;insert into auth.sessions(id,user_id)values('${U}','${U}') on conflict do nothing`,
  )
  const e = await command(U, 'reserve_evidence', { id: id(), projectId: p, mime: 'image/jpeg', bytes: 100 })
  await asUser(U)
  await db.exec(`insert into storage.objects(bucket_id,name)values('worker-progress','${e.path}')`)
  expect((await db.query(`select * from storage.objects where name='${e.path}'`)).rows).toEqual([])
  await expect(
    db.exec(`insert into storage.objects(bucket_id,name)values('worker-progress','forged/path')`),
  ).rejects.toThrow()
  await asUser(V)
  await expect(
    db.exec(`insert into storage.objects(bucket_id,name)values('worker-progress','${e.path}')`),
  ).rejects.toThrow()
})
it('reconciles only marked provision accounts and never adopts a preexisting identity', async () => {
  const rid = id(),
    uid = id(),
    input = { id: rid, email: 'new-provision@test.invalid', name: 'New worker' }
  const first = await command(A, 'reserve_worker', input)
  expect(first.user_id).toBe(null)
  expect((await command(A, 'reserve_worker', input)).id).toBe(rid)
  await expect(command(B, 'reserve_worker', input)).rejects.toThrow('CONFLICT')
  await expect(
    command(A, 'reserve_worker', { ...input, id: id(), email: 'manager@test.invalid' }),
  ).rejects.toThrow('ACCOUNT_EXISTS')
  await db.exec(
    `reset role;insert into auth.users(id,email,raw_app_meta_data)values('${uid}','new-provision@test.invalid','{"workers_provision_id":"${rid}"}')`,
  )
  expect((await command(A, 'provision_lookup', { workerId: rid })).userId).toBe(uid)
  expect((await command(A, 'activate_account', { workerId: rid })).user_id).toBe(uid)
})
it('manager password reset is scoped to owned workers and revokes old sessions', async () => {
  const { hash } = await import('bcryptjs')
  const hashed = await hash('Synthetic-Password-Only', 10)
  await expect(command(A, 'reset_password', { workerId: v, hash: hashed })).rejects.toThrow('ACCESS_DENIED')
  expect((await command(B, 'reset_password', { workerId: v, hash: hashed })).reset).toBe(true)
  await expect(command(V, 'dashboard')).rejects.toThrow('ACCESS_DENIED')
  await db.exec('reset role')
  expect(
    (await db.query(`select encrypted_password from auth.users where id='${V}'`)).rows[0].encrypted_password,
  ).toBe(hashed)
})
