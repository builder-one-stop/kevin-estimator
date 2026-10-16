// Independent real worker-session checks. Administrative UI/API checks use the separate password-gated script.
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const url = 'https://vtpciccluvpaclbeqxih.supabase.co',
  origin = process.env.WORKERS_TEST_ORIGIN || 'http://localhost:5173'
if (
  process.env.SUPABASE_URL !== url ||
  !['http://localhost:5173', 'https://onestop-beta.netlify.app'].includes(origin)
)
  throw new Error('Unexpected target')
const evidencePrefix = origin.startsWith('https:') ? 'beta-fixture' : 'fixture'
const key = loadEnv('development', process.cwd()).VITE_SUPABASE_ANON_KEY
const create = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const report = {
    scope: 'Real remote worker sessions; administrative account/creation flow not exercised',
    origin,
    checks: [],
    errors: [],
  },
  users = [],
  records = []
let project, browser
const check = (ok, code) => {
  if (!ok) throw new Error(code)
  report.checks.push(code)
}
const api = async (t, action = '', body) => {
  const r = await fetch(`${origin}/api/workers/${action}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: r.status, data: await r.json() }
}
try {
  const owner = await db.from('beta_accounts').select('user_id').eq('role', 'admin').single()
  check(!owner.error, 'existing manager identity found without changing credentials')
  const made = await db
    .from('projects')
    .insert({
      owner_id: owner.data.user_id,
      name: `QA WORKERS FIXTURE ${Date.now()}`,
      address: 'Synthetic site',
    })
    .select('id')
    .single()
  check(!made.error, 'isolated project fixture')
  project = made.data.id
  for (let i = 0; i < 2; i++) {
    const email = `qa-worker-fixture-${randomUUID()}@example.invalid`,
      password = `QA-${randomUUID()}!`,
      id = randomUUID()
    const u = await db.auth.admin.createUser({ email, password, email_confirm: true })
    check(!u.error, 'create temporary normal Auth user')
    users.push(u.data.user.id)
    const w = await db
      .from('workers')
      .insert({
        id,
        user_id: u.data.user.id,
        manager_id: owner.data.user_id,
        name: `QA Worker ${i + 1}`,
        email,
      })
      .select()
      .single()
    check(!w.error, 'separate worker role fixture')
    records.push({ id, userId: u.data.user.id, email, password, name: w.data.name })
    const auth = create(),
      session = await auth.auth.signInWithPassword({ email, password })
    check(!session.error, 'real password session')
    Object.assign(records[i], { auth, token: session.data.session.access_token })
  }
  const [a, b] = records
  check((await api(b.token)).data.projects.length === 0, 'unassigned worker dashboard empty')
  check(
    !(await db.from('worker_assignments').insert({ worker_id: a.id, project_id: project })).error,
    'fixture assignment',
  )
  const d = await api(a.token)
  check(
    d.status === 200 &&
      d.data.projects.length === 1 &&
      Object.keys(d.data.projects[0]).sort().join(',') === 'address,id,name',
    'safe project projection',
  )
  for (const table of [
    'clients',
    'projects',
    'estimates',
    'estimate_messages',
    'ai_conversations',
    'ai_settings',
    'ai_attachments',
    'estimate_revisions',
  ]) {
    const r = await a.auth.from(table).select('*').limit(1)
    check(!r.error && !r.data.length, `CRM read denied: ${table}`)
  }
  check(
    (
      await api(a.token, 'create', {
        id: randomUUID(),
        email: `qa-invalid-${randomUUID()}@example.invalid`,
        name: 'No',
        password: randomUUID(),
      })
    ).status === 403,
    'worker denied account creation API',
  )
  check(
    (await a.auth.from('workers').update({ manager_id: a.userId }).eq('id', a.id)).error,
    'worker cannot modify profile ownership',
  )
  check((await a.auth.auth.updateUser({ password: randomUUID() })).error, 'direct password change rejected')
  await a.auth.auth.updateUser({ data: { role: 'admin' } })
  check(
    (await api(a.token, 'update', { workerId: a.id, name: 'No', active: true, projects: [project] }))
      .status === 403,
    'metadata cannot escalate permissions',
  )
  const ai = await fetch(origin + '/api/ai/status', { headers: { Authorization: `Bearer ${a.token}` } })
  check(ai.status === 403, 'AI API denied for worker')
  const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f07a22' } })
    .jpeg()
    .toBuffer()
  async function evidence(bytes, mime, valid = true) {
    const id = randomUUID(),
      r = await api(a.token, 'reserve', { id, projectId: project, mime, bytes: bytes.length })
    check(r.status === 200, 'reserve media')
    const u = await a.auth.storage.from('worker-progress').upload(r.data.path, bytes, { contentType: mime })
    check(!u.error, 'private reserved upload')
    const f = await api(a.token, 'finish', { evidenceId: id })
    check(
      valid ? f.status === 200 : f.status !== 200,
      valid ? 'server confirms media' : 'server rejects malformed media',
    )
    return r.data
  }
  const photo = await evidence(jpeg, 'image/jpeg')
  await evidence(Buffer.from('invalid jpeg bytes'), 'image/jpeg', false)
  const missing = await api(a.token, 'reserve', {
    id: randomUUID(),
    projectId: project,
    mime: 'image/jpeg',
    bytes: 100,
  })
  check(
    (await api(a.token, 'finish', { evidenceId: missing.data.id })).data.error === 'FILE_MISSING',
    'interrupted file cannot appear successful',
  )
  check(
    (await api(b.token, 'view', { evidenceId: photo.id })).status === 403,
    'worker B denied A file by UUID',
  )
  // Give B the same project: their data and uploads must still remain isolated.
  await db.from('worker_assignments').insert({ worker_id: b.id, project_id: project })
  check(
    (await api(b.token)).data.evidence.length === 0,
    'same-project workers cannot see one another uploads',
  )
  check(
    (await api(b.token, 'view', { evidenceId: photo.id })).status === 403,
    'same-project worker denied foreign evidence',
  )
  const anon = create()
  check((await anon.from('workers').select('*')).error, 'anonymous rows denied')
  check((await anon.storage.from('worker-progress').download(photo.path)).error, 'anonymous file denied')
  check(
    (await b.auth.storage.from('worker-progress').download(photo.path)).error,
    'foreign direct storage denied',
  )
  const starts = await Promise.all([
    api(a.token, 'clock', { id: randomUUID(), projectId: project, kind: 'in' }),
    api(a.token, 'clock', { id: randomUUID(), projectId: project, kind: 'in' }),
  ])
  check(starts.filter((r) => r.status === 200).length === 1, 'concurrent devices open only one shift')
  const shift = starts.find((r) => r.status === 200).data
  check(
    (await api(a.token, 'clock', { id: randomUUID(), projectId: project, kind: 'break_end' })).data.error ===
      'INVALID_SEQUENCE',
    'invalid clock sequence rejected',
  )
  for (let i = 0; i < 2; i++) {
    const id = randomUUID()
    check(
      (await api(a.token, 'clock', { id, projectId: project, kind: 'break_start' })).status === 200,
      'break starts',
    )
    check(
      (await api(a.token, 'clock', { id, projectId: project, kind: 'break_start' })).status === 200,
      'duplicate request idempotent',
    )
    check(
      (await api(a.token, 'clock', { id: randomUUID(), projectId: project, kind: 'break_end' })).status ===
        200,
      'break ends',
    )
  }
  check(
    (await api(a.token, 'clock', { id: randomUUID(), projectId: project, kind: 'out' })).status === 200,
    'shift closes',
  )
  const corrected = await api(a.token, 'correction', {
    shiftId: shift.id,
    eventId: shift.events[0].id,
    kind: null,
    at: new Date(Date.parse(shift.started_at) - 60000).toISOString(),
    reason: 'QA correction request',
  })
  check(corrected.status === 200 && corrected.data.status === 'pending', 'worker requests audited correction')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const videoPage = await browser.newPage()
  await videoPage.goto(origin)
  const webm = await videoPage.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(10)
    const chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        const buffer = await new Blob(chunks).arrayBuffer()
        resolve(Array.from(new Uint8Array(buffer)))
      }
    })
    recorder.start()
    ctx.fillStyle = '#ee7020'
    ctx.fillRect(0, 0, 64, 64)
    await new Promise((r) => setTimeout(r, 400))
    ctx.fillStyle = '#80bc40'
    ctx.fillRect(0, 0, 32, 32)
    await new Promise((r) => setTimeout(r, 400))
    recorder.stop()
    stream.getTracks().forEach((t) => t.stop())
    return done
  })
  await videoPage.close()
  await evidence(Buffer.from(webm), 'video/webm')
  await db.from('worker_assignments').update({ active: false }).eq('worker_id', b.id)
  for (const [i, w] of records.entries()) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(origin + '/contacts')
    await page.getByLabel('Email', { exact: true }).fill(w.email)
    await page.getByLabel('Password', { exact: true }).fill(w.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My work', exact: true })).toBeVisible()
    await expect(page.locator('.sidebar')).toHaveCount(0)
    if (i === 0) {
      await page.getByRole('button', { name: 'View', exact: true }).first().click()
      await expect(page.locator('video')).toBeVisible()
      await expect.poll(() => page.locator('video').evaluate((v) => v.readyState)).toBeGreaterThan(1)
      check(true, 'real WebM playback')
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'View', exact: true }).last().click()
      await expect
        .poll(() => page.locator('.worker-media img').evaluate((i) => i.naturalWidth))
        .toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      check(true, 'real JPEG render')
    } else await expect(page.getByRole('heading', { name: 'No assigned projects' })).toBeVisible()
    await page.getByRole('button', { name: 'Español', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mi trabajo', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Mi trabajo', exact: true })).toBeVisible()
    await expect(page.getByText('Cargando…', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await mkdir('evidence/workers', { recursive: true })
    await page.screenshot({ path: `evidence/workers/${evidencePrefix}-worker-${i + 1}.png`, fullPage: true })
    await page.close()
    check(true, `worker ${i + 1} real mobile route guard EN/ES and persistence`)
  }
  await db.from('worker_assignments').update({ active: false }).eq('worker_id', a.id)
  check(
    (await api(a.token, 'view', { evidenceId: photo.id })).status === 403,
    'assignment removal blocks new file access',
  )
  check(
    (
      await a.auth.storage
        .from('worker-progress')
        .upload(missing.data.path, jpeg, { contentType: 'image/jpeg' })
    ).error,
    'assignment removal blocks direct upload with old session',
  )
  await db.from('workers').update({ active: false }).eq('id', a.id)
  check(
    (await api(a.token)).status === 403,
    'deactivation blocks already-issued token without waiting for expiry',
  )
} catch (e) {
  report.errors.push(e.message)
  process.exitCode = 1
} finally {
  await browser?.close()
  const failures = []
  for (const w of records) {
    const objs = await db.from('worker_evidence').select('path').eq('worker_id', w.id)
    if (
      objs.data?.length &&
      (await db.storage.from('worker-progress').remove(objs.data.map((o) => o.path))).error
    )
      failures.push('storage')
    const shifts = await db.from('worker_shifts').select('id').eq('worker_id', w.id)
    if (
      shifts.data?.length &&
      (
        await db
          .from('worker_corrections')
          .delete()
          .in(
            'shift_id',
            shifts.data.map((s) => s.id),
          )
      ).error
    )
      failures.push('corrections')
    for (const t of ['worker_commands', 'worker_evidence', 'worker_shifts', 'worker_assignments'])
      if ((await db.from(t).delete().eq('worker_id', w.id)).error) failures.push(t)
    if ((await db.from('workers').delete().eq('id', w.id)).error) failures.push('workers')
  }
  for (const userId of users) if ((await db.auth.admin.deleteUser(userId)).error) failures.push('auth')
  if (project && (await db.from('projects').delete().eq('id', project)).error) failures.push('project')
  report.cleanup = { failures }
  if (failures.length) process.exitCode = 1
  await mkdir('evidence/workers', { recursive: true })
  await writeFile(`evidence/workers/${evidencePrefix}-remote.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
