import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { hiddenInput } from './hidden-beta-input.mjs'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
const url = 'https://vtpciccluvpaclbeqxih.supabase.co',
  origin = process.env.WORKERS_TEST_ORIGIN || 'http://localhost:5173'
if (
  process.env.SUPABASE_URL !== url ||
  !['http://localhost:5173', 'https://onestop-beta.netlify.app'].includes(origin)
)
  throw new Error('Unexpected target')
const key = loadEnv('development', process.cwd()).VITE_SUPABASE_ANON_KEY
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const credentials = await hiddenInput(
  [
    { name: 'email', type: 'email', label: 'Correo de Kevin o administración (cuenta existente)' },
    { name: 'password', label: 'Contraseña actual de esa cuenta (no se cambiará)' },
  ],
  { port: 8792 },
)
credentials.email = credentials.email.trim().toLowerCase()
async function run(origin, credentials) {
  const admin = client()
  const login = await admin.auth.signInWithPassword(credentials)
  if (login.error)
    throw new Error(
      `Administrator login rejected: ${login.error.code || 'AUTH_ERROR'} (HTTP ${login.error.status || 'unknown'}); no password changed`,
    )
  const manager = login.data.user.id,
    token = login.data.session.access_token
  const role = await admin.rpc('beta_session_access')
  if (!['admin', 'operator'].includes(role.data?.role)) throw new Error('Administrative role required')
  console.info(
    'Existing administrative password login confirmed; waiting for local checks and migration readiness.',
  )
  const report = { origin, checks: [], errors: [], cleanup: null }
  let project,
    workers = [],
    browser
  const tokens = [token]
  async function api(bearer, action = '', body) {
    if(action==='clock'&&body?.kind==='in'&&!body.location)body={...body,location:{latitude:34.0522,longitude:-118.2437,accuracy:25,capturedAt:new Date().toISOString()}} // controlled QA coordinates, not physical GPS
    const response = await fetch(`${origin}/api/workers/${action}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${bearer}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, data: await response.json() }
  }
  function check(ok, code) {
    if (!ok) throw new Error(code)
    report.checks.push(code)
  }
  try {
    if (origin.startsWith('http://')) {
      let ready = false
      for (let n = 0; n < 160; n++) {
        try {
          await access('evidence/workers/local-ready.json')
          ready = true
          break
        } catch {
          await new Promise((r) => setTimeout(r, 15000))
        }
      }
      if (!ready) throw new Error('Local readiness timeout')
    }
    const made = await admin
      .from('projects')
      .insert({ name: `QA Workers ${Date.now()}`, address: 'Synthetic QA site' })
      .select('id')
      .single()
    check(!made.error, 'manager creates own test project')
    project = made.data.id
    for (let n = 0; n < 2; n++) {
      const password = `QA-${randomUUID()}!`,
        email = `qa-workers-${randomUUID()}@example.invalid`,
        id = randomUUID(),
        name = `QA Worker ${n + 1} ${id.slice(0, 8)}`
      // Retain reservation identity even if a later operation fails.
      workers.push({ id, email, password })
      const created = await api(token, 'create', { id, email, password, name })
      check(created.status === 200, `create worker ${n + 1}`)
      const retry = await api(token, 'create', { id, email, password, name })
      check(retry.data.user_id === created.data.user_id, 'creation retry returns same account')
      Object.assign(workers[n], created.data)
      const db = client(),
        signed = await db.auth.signInWithPassword({ email, password })
      check(!signed.error, `worker ${n + 1} password login`)
      workers[n].db = db
      workers[n].token = signed.data.session.access_token
      tokens.push(workers[n].token)
    }
    const [a, b] = workers
    check((await api(b.token)).data.projects.length === 0, 'unassigned worker empty state')
    check(
      (await api(token, 'update', { workerId: a.id, name: a.name, active: true, projects: [project] }))
        .status === 200,
      'manager assigns project',
    )
    const dash = await api(a.token)
    check(
      dash.data.projects.length === 1 && !('owner_id' in dash.data.projects[0]),
      'worker receives only safe assigned project fields',
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
      const r = await a.db.from(table).select('*').limit(1)
      check(!r.error && r.data.length === 0, `worker denied CRM ${table}`)
    }
    check(
      (await api(a.token, 'update', { workerId: a.id, name: 'Forged', active: true, projects: [project] }))
        .status === 403,
      'worker cannot administer assignments',
    )
    check(
      (await a.db.from('workers').update({ manager_id: a.user_id }).eq('id', a.id)).error,
      'worker cannot modify role/owner',
    )
    check(
      (await a.db.auth.updateUser({ password: randomUUID() })).error,
      'worker cannot change password directly',
    )
    const forged = await a.db.auth.updateUser({ data: { role: 'admin' } })
    check(!forged.error, 'user-editable metadata accepted as data only')
    check(
      (
        await api(a.token, 'create', {
          id: randomUUID(),
          email: `qa-forgery-${randomUUID()}@example.invalid`,
          name: 'Forgery',
          password: randomUUID(),
        })
      ).status === 403,
      'forged metadata does not grant administration',
    )
    const anon = client()
    check((await anon.from('workers').select('*')).error, 'anonymous workers read denied')
    const jpg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#e87620' } })
      .jpeg()
      .toBuffer()
    const evidenceId = randomUUID()
    const reservation = await api(a.token, 'reserve', {
      id: evidenceId,
      projectId: project,
      mime: 'image/jpeg',
      bytes: jpg.length,
    })
    check(reservation.status === 200, 'reserve progress upload')
    const upload = await a.db.storage
      .from('worker-progress')
      .upload(reservation.data.path, jpg, { contentType: 'image/jpeg' })
    check(!upload.error, 'authenticated assigned worker uploads private photo')
    check((await api(a.token, 'finish', { evidenceId })).status === 200, 'server verifies uploaded photo')
    const viewing = await api(a.token, 'view', { evidenceId })
    check(
      viewing.status === 200 && (await fetch(viewing.data.url)).ok,
      'authorized short-lived viewing URL works',
    )
    check(
      (await api(b.token, 'view', { evidenceId })).status === 403,
      'worker B cannot view worker A evidence',
    )
    check(
      (await b.db.storage.from('worker-progress').download(reservation.data.path)).error,
      'direct foreign storage download denied',
    )
    check(
      (await anon.storage.from('worker-progress').download(reservation.data.path)).error,
      'anonymous storage access denied',
    )
    const concurrent = await Promise.all([
      api(a.token, 'clock', { id: randomUUID(), kind: 'in', projectId: project }),
      api(a.token, 'clock', { id: randomUUID(), kind: 'in', projectId: project }),
    ])
    check(concurrent.filter((r) => r.status === 200).length === 1, 'two devices cannot open two shifts')
    const shift = concurrent.find((r) => r.status === 200).data
    const breakId = randomUUID()
    check(
      (await api(a.token, 'clock', { id: breakId, kind: 'break_start', projectId: project })).status === 200,
      'start break',
    )
    check(
      (await api(a.token, 'clock', { id: breakId, kind: 'break_start', projectId: project })).status === 200,
      'lost-response retry is idempotent',
    )
    check(
      (await api(a.token, 'clock', { id: randomUUID(), kind: 'out', projectId: project })).data.error ===
        'CONFIRM_BREAK_CLOSE',
      'break close requires confirmation',
    )
    check(
      (await api(token, 'update', { workerId: a.id, name: a.name, active: false, projects: [] })).data
        .error === 'OPEN_SHIFT_RESOLUTION_REQUIRED',
      'open shift prevents silent deactivation',
    )
    check(
      (await api(a.token, 'clock', { id: randomUUID(), kind: 'break_end', projectId: project })).status ===
        200,
      'return from break',
    )
    check(
      (await api(a.token, 'clock', { id: randomUUID(), kind: 'out', projectId: project })).status === 200,
      'clock out',
    )
    const requested = await api(a.token, 'correction', {
      shiftId: shift.id,
      eventId: shift.events[0].id,
      kind: null,
      at: new Date(Date.parse(shift.started_at) - 60000).toISOString(),
      reason: 'QA entry correction',
    })
    check(requested.status === 200, 'worker requests correction')
    const approved = await api(token, 'review', {
      correctionId: requested.data.id,
      decision: 'approve',
      reason: 'QA verified original record',
    })
    check(
      approved.status === 200 && approved.data.before_events && approved.data.after_events,
      'correction approval preserves audit',
    )
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const [i, worker] of workers.entries()) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      await page.goto(origin + '/contacts')
      await page.getByLabel('Email', { exact: true }).fill(worker.email)
      await page.getByLabel('Password', { exact: true }).fill(worker.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'My work', exact: true })).toBeVisible()
      await expect(page.locator('.sidebar')).toHaveCount(0)
      if (i === 0) {
        await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'View', exact: true }).first().click()
        await expect(page.locator('.worker-media img')).toBeVisible()
        await page.getByRole('button', { name: 'Close', exact: true }).click()
      } else await expect(page.getByRole('heading', { name: 'No assigned projects' })).toBeVisible()
      await page.getByRole('button', { name: 'Español', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Mi trabajo', exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Mi trabajo', exact: true })).toBeVisible()
      await expect(page.getByText('Cargando…', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await mkdir('evidence/workers', { recursive: true })
      await page.screenshot({
        path: `evidence/workers/${origin.startsWith('https') ? 'beta' : 'local'}-worker-${i + 1}.png`,
        fullPage: true,
      })
      await page.close()
      check(true, `worker ${i + 1} real mobile browser login, direct CRM route guard, EN/ES and reload`)
    }
    const managerPage = await browser.newPage()
    await managerPage.goto(origin + '/workers')
    await managerPage.getByLabel('Email', { exact: true }).fill(credentials.email)
    await managerPage.getByLabel('Password', { exact: true }).fill(credentials.password)
    await managerPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(managerPage.getByRole('heading', { name: 'Workers', exact: true })).toBeVisible()
    await expect(
      managerPage
        .getByRole('article')
        .filter({ hasText: a.email })
        .getByRole('heading', { name: a.name, exact: true }),
    ).toBeVisible()
    await managerPage.goto(`${origin}/projects/${project}/hours`)
    await expect(managerPage.getByRole('heading', { name: 'Hours', exact: true })).toBeVisible()
    await managerPage.goto(`${origin}/projects/${project}/progress`)
    await expect(managerPage.getByRole('button', { name: 'View', exact: true })).toBeVisible()
    check(true, 'real administrator browser sees workers, project hours and progress')
    check(
      (await api(token, 'update', { workerId: a.id, name: a.name, active: true, projects: [] })).status ===
        200,
      'remove assignment',
    )
    check((await api(a.token, 'view', { evidenceId })).status === 403, 'unassignment blocks new viewing URL')
    check(
      (
        await api(a.token, 'reserve', {
          id: randomUUID(),
          projectId: project,
          mime: 'image/jpeg',
          bytes: jpg.length,
        })
      ).status === 403,
      'unassignment blocks uploads',
    )
    check(
      (await api(token, 'update', { workerId: a.id, name: a.name, active: false, projects: [] })).status ===
        200,
      'deactivate worker',
    )
    check([401, 403].includes((await api(a.token)).status), 'existing disabled worker session blocked')
    const newPassword = `QA-reset-${randomUUID()}`
    check(
      (await api(token, 'password', { workerId: b.id, password: newPassword })).status === 200,
      'administrative password reset',
    )
    check([401, 403].includes((await api(b.token)).status), 'password reset revokes old session')
    const relogin = await client().auth.signInWithPassword({ email: b.email, password: newPassword })
    check(!relogin.error, 'new password works')
    tokens.push(relogin.data.session.access_token)
    check(
      (await client().auth.signInWithPassword({ email: b.email, password: b.password })).error,
      'old password rejected',
    )
  } catch (e) {
    report.errors.push(e.message)
    process.exitCode = 1
  } finally {
    await browser?.close()
    const failures = []
    for (const w of workers) {
      const objects = await service.from('worker_evidence').select('path').eq('worker_id', w.id)
      if (objects.data?.length) {
        const r = await service.storage.from('worker-progress').remove(objects.data.map((x) => x.path))
        if (r.error) failures.push('storage')
      }
      const shifts = await service.from('worker_shifts').select('id').eq('worker_id', w.id)
      if (shifts.data?.length) {
        const r = await service
          .from('worker_corrections')
          .delete()
          .in(
            'shift_id',
            shifts.data.map((s) => s.id),
          )
        if (r.error) failures.push('corrections')
      }
      for (const table of ['worker_commands', 'worker_evidence', 'worker_shifts', 'worker_assignments']) {
        const r = await service.from(table).delete().eq('worker_id', w.id)
        if (r.error) failures.push(table)
      }
      const record = await service.from('workers').select('user_id').eq('id', w.id).maybeSingle()
      const removed = await service.from('workers').delete().eq('id', w.id).eq('manager_id', manager)
      if (removed.error) failures.push('workers')
      const userId = record.data?.user_id || w.user_id
      if (!removed.error && userId) {
        const removedUser = await service.auth.admin.deleteUser(userId)
        if (removedUser.error) failures.push('auth')
      }
    }
    if (project) {
      const r = await admin.from('projects').delete().eq('id', project)
      if (r.error) failures.push('project')
    }
    // Revoke only sessions created by this script, not the user's other browser sessions.
    for (const bearer of tokens) await service.auth.admin.signOut(bearer, 'local').catch(() => {})
    report.cleanup = { failures }
    if (failures.length) process.exitCode = 1
    await mkdir('evidence/workers', { recursive: true })
    await writeFile(
      `evidence/workers/${origin.startsWith('https') ? 'beta' : 'local'}-remote.json`,
      JSON.stringify(report, null, 2) + '\n',
    )
    console.info(JSON.stringify(report))
  }

  return report
}
try {
  const first = await run(origin, credentials)
  if (!first.errors.length && !first.cleanup.failures.length && process.env.WORKERS_TEST_BOTH === '1') {
    console.info(
      'Local administrative verification passed. Credentials stay only in memory while awaiting verified beta publication.',
    )
    let ready = false
    for (let n = 0; n < 240; n++) {
      try {
        await access('evidence/workers/beta-ready.json')
        ready = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 15000))
      }
    }
    if (!ready) throw new Error('Beta publication wait timed out')
    await run('https://onestop-beta.netlify.app', credentials)
  }
} catch (error) {
  console.info(error.message)
  process.exitCode = 1
} finally {
  credentials.password = ''
}
