import { chromium, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { hiddenInput } from './hidden-beta-input.mjs'
import { passwordFields, initializeExistingAdmin } from './beta-password-setup.mjs'
import { calculateEstimate } from '../src/lib/estimateDocument.js'

const project = 'vtpciccluvpaclbeqxih', beta = 'https://onestop-beta.netlify.app'
const url = process.env.SUPABASE_URL
if (url !== `https://${project}.supabase.co`) throw new Error('Unexpected Supabase project')
const env = loadEnv('development', process.cwd())
if (env.VITE_SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') !== url) throw new Error('Frontend/backend Supabase mismatch')
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const publicKey = env.VITE_SUPABASE_ANON_KEY
const roles = { operator: 'homecolor45@gmail.com', admin: 'builderonestop44@gmail.com' }
const report = { project, checks: [], errors: [], accounts: {}, realQuote: null }
const sessions = [], conversations = [], estimates = []
let credentials, outsider, stage = 'Account preflight'
function assert(ok, code) { if (!ok) throw Object.assign(new Error(code), { code }) }
async function auth(email, password) {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.auth.signInWithPassword({ email, password })
  assert(!result.error && result.data.session, 'PASSWORD_LOGIN_FAILED')
  sessions.push(result.data.session.access_token)
  return { client, session: result.data.session }
}
async function token(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'))
    return key && JSON.parse(localStorage.getItem(key) || 'null')?.access_token
  })
}
async function api(page, path, body, method = body ? 'POST' : 'GET') {
  return page.evaluate(async ({ path, body, method }) => {
    const key = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'))
    const bearer = key && JSON.parse(localStorage.getItem(key) || 'null')?.access_token
    const response = await fetch(`/api/ai/${path}`, { method, headers: { Authorization: `Bearer ${bearer}`, ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
    return { status: response.status, data: await response.json() }
  }, { path, body, method })
}
async function runReady(page, id, previous = null) {
  for (let deadline = Date.now() + 150000; Date.now() < deadline;) {
    const { status, data } = await api(page, `conversations/${id}`)
    assert(status === 200, 'CONVERSATION_READ_FAILED')
    if (data.state.run && data.state.run.id !== previous) {
      assert(data.state.run.status !== 'error', data.state.run.error || 'MODEL_RUN_FAILED')
      if (data.state.run.status === 'ready') return data
    }
    await page.waitForTimeout(2000)
  }
  throw Object.assign(new Error('MODEL_TIMEOUT'), { code: 'MODEL_TIMEOUT' })
}
async function quote(page, owner) {
  stage = 'Online synthetic development quote'
  await page.goto(`${beta}/chat`)
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(page.getByRole('heading', { name: 'New conversation' })).toBeVisible()
  const id = page.url().split('/').at(-1); conversations.push({ id, owner })
  const input = page.getByRole('textbox', { name: 'Describe the work or request a change' })
  await input.fill('hola'); await page.getByRole('button', { name: 'Send', exact: true }).click()
  const hello = await runReady(page, id)
  assert(hello.state.messages.at(-1)?.role === 'assistant', 'HELLO_RESPONSE_MISSING')
  await input.fill('Synthetic beta validation in my development account: paint walls only in one 10 ft by 12 ft bedroom with 8 ft height, two coats. Exclude ceiling, trim and doors. Patch nail holes and spot-prime patches only. Confirmed provisional quantities and costs: paint 2 GAL at $65/GAL; preparation 1 LS at $25; labor 3 HR at $75/HR, including all preparation and painting. Markup 36% on cost; no tax, shipping or discount. ZIP 90001. Generic interior eggshell paint; brand and color will be selected later, and supplier prices are not verified. Client and address are pending and are not required for this synthetic quote. Present an editable plan with these confirmed facts, quantities, preparation, exclusions and assumptions.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  let plan = await runReady(page, id, hello.state.run.id)
  if (plan.state.plan?.pending.length) {
    await input.fill('All dimensions, quantities, labor hours and provisional unit costs above are confirmed for this synthetic estimate. Brand, color, client and address are intentionally pending nonblocking details. Resolve the answered questions and present the approvable plan, preserving those provisional assumptions.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    plan = await runReady(page, id, plan.state.run.id)
  }
  if (plan.state.plan?.pending.length && plan.state.plan.pending.every(q => /non.?block/i.test(q.en))) {
    await page.getByRole('button', { name: 'Edit plan' }).click()
    const questions = page.locator('.ai-plan h3').filter({ hasText: 'Questions to resolve before approval' }).locator('xpath=following-sibling::div')
    for (let n = 0; n < plan.state.plan.pending.length; n++) await questions.first().getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('button', { name: 'Save plan revision' }).click()
  }
  await expect(page.getByRole('button', { name: 'Approve this revision' })).toBeEnabled({ timeout: 10000 })
  await page.getByRole('button', { name: 'Approve this revision' }).click()
  await page.getByRole('button', { name: 'Generate estimate' }).click()
  const result = await runReady(page, id, plan.state.run.id)
  assert(result.estimate_id, 'ESTIMATE_MISSING'); estimates.push({ id: result.estimate_id, owner })
  await page.getByRole('link', { name: 'Open estimate' }).click()
  const quantity = page.getByLabel('Qty', { exact: true }).first()
  await expect(quantity).toBeVisible({ timeout: 15000 })
  const edited = String(Number(await quantity.inputValue()) + 1)
  await quantity.fill(edited)
  await expect(page.locator('.estimate-save')).toContainText('Saved', { timeout: 15000 })
  await page.reload()
  await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue(edited, { timeout: 15000 })
  const record = (await api(page, `conversations/${id}/estimate`)).data
  await page.getByRole('button', { name: 'Client proposal', exact: true }).click()
  await expect(page.locator('.ai-proposal')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream(), chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const pdf = Buffer.concat(chunks)
  assert(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 1000, 'PDF_INVALID')
  report.realQuote = { hello: hello.state.run.metrics, plan: plan.state.run.metrics, generation: result.state.run.metrics,
    lineCount: record.document.sections.reduce((n, s) => n + s.items.length, 0), editedTotalCents: calculateEstimate(record.document, record.markup_bps).priceCents, pdfBytes: pdf.length }
  report.checks.push('Real online AI: hello, approved plan, persisted editable estimate, reload, proposal and PDF; synthetic content only in development account')
}
async function browser(origin, role, owner) {
  stage = `${role} browser access at ${origin}`
  const profile = await mkdtemp(join(tmpdir(), 'one-stop-beta-'))
  await mkdir(join(profile, 'Default'))
  await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }))
  let context
  try {
    const open = () => chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 }, args: ['--disable-save-password-bubble'] })
    context = await open(); let page = context.pages()[0]
    await page.goto(origin)
    await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15000 })
    assert(await page.locator('.sidebar').count() === 0, 'LOGIN_EXPOSES_MODULES')
    await page.getByRole('button', { name: 'Español' }).click()
    await expect(page.getByText('Contacta al administrador')).toBeVisible()
    await page.getByRole('button', { name: 'English' }).click()
    if (origin === beta && role === 'admin') await page.screenshot({ path: 'evidence/beta-access/login-online.png', fullPage: true })
    await page.getByLabel('Email').fill(roles[role])
    await page.getByLabel('Password', { exact: true }).fill(credentials[role])
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Recent estimates' })).toBeVisible({ timeout: 20000 })
    const bearer = await token(page); sessions.push(bearer)
    assert((await api(page, 'status')).status === 200, 'AI_ACCESS_FAILED')
    if (role === 'admin') {
      await page.getByRole('link', { name: 'Review Kevin’s activity', exact: true }).click()
      await expect(page.getByText('Reviewing Kevin — read only')).toBeVisible()
      const review = await api(page, 'admin/conversations'); assert(review.status === 200 && Array.isArray(review.data), 'ADMIN_REVIEW_FAILED')
      if (review.data.length) {
        await page.goto(`${origin}/admin/review/${review.data[0].id}`)
        await expect(page.getByRole('heading', { name: 'Questions and AI responses' })).toBeVisible()
        assert(await page.locator('.admin-review').getByRole('textbox').count() === 0, 'ADMIN_REVIEW_EDITABLE')
      } else await expect(page.getByText('Kevin has no conversations yet.')).toBeVisible()
      assert((await api(page, 'admin/conversations', { action: 'message' })).status === 405, 'REVIEW_MUTATION_ALLOWED')
      report.checks.push(`Admin read-only review and separate development workspace at ${origin}`)
    } else {
      assert((await api(page, 'admin/conversations')).status === 403, 'OPERATOR_ADMIN_ACCESS')
      assert(await page.getByRole('link', { name: 'Review Kevin’s activity', exact: true }).count() === 0, 'OPERATOR_ADMIN_LINK')
      await page.goto(`${origin}/admin/review`)
      await expect(page.getByRole('heading', { name: 'Recent estimates' })).toBeVisible()
      report.checks.push(`Kevin has no administrative review access at ${origin}; no Kevin test content created`)
    }
    if (origin === beta && role === 'admin') await quote(page, owner)
    await page.goto(origin); await page.reload()
    await expect(page.getByRole('heading', { name: 'Recent estimates' })).toBeVisible()
    await context.close(); context = await open(); page = context.pages()[0]
    await page.goto(origin)
    await expect(page.getByRole('heading', { name: 'Recent estimates' })).toBeVisible({ timeout: 20000 })
    const latest = await token(page); sessions.push(latest)
    await page.locator('.company').click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15000 })
    assert(await page.locator('.sidebar').count() === 0, 'SIGNOUT_EXPOSES_MODULES')
    const replay = await fetch(`${origin}/api/ai/status`, { headers: { Authorization: `Bearer ${latest}` } })
    assert([401, 403].includes(replay.status), 'SIGNED_OUT_TOKEN_ACCEPTED')
    await page.reload(); await expect(page.locator('.login-screen')).toBeVisible()
    report.checks.push(`${role}: password login EN/ES, reload, browser reopen, local sign-out and rejected token replay at ${origin}`)
  } finally { await context?.close(); await rm(profile, { recursive: true, force: true }) }
}
try {
  await mkdir('evidence/beta-access', { recursive: true })
  const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert(!list.error, 'ACCOUNT_LOOKUP_FAILED')
  const accounts = Object.fromEntries(Object.entries(roles).map(([role, email]) => [role, list.data.users.find(u => u.email?.toLowerCase() === email)]))
  const initializeAdmin = process.argv.includes('--initialize-admin')
  credentials = await hiddenInput(passwordFields(accounts, initializeAdmin))
  // Refresh identity snapshots after hidden input; never recreate a user that
  // appeared while the form was open or replace an existing account's owner.
  const latest = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert(!latest.error, 'ACCOUNT_LOOKUP_FAILED')
  for (const [role, email] of Object.entries(roles)) {
    const existing = latest.data.users.find(u => u.email?.toLowerCase() === email)
    assert(!accounts[role] || existing?.id === accounts[role].id, 'ACCOUNT_IDENTITY_CHANGED')
    accounts[role] = existing
  }
  stage = 'Authorized initial administration password setup'
  if (!accounts.admin) {
    const created = await db.auth.admin.createUser({ email: roles.admin, password: credentials.admin, email_confirm: true })
    assert(!created.error, 'ADMIN_ACCOUNT_CREATION_FAILED'); accounts.admin = created.data.user
    report.accounts.admin = 'Created missing authorized administration identity with initial password'
  } else {
    const registered = await db.rpc('beta_register_accounts'); assert(!registered.error, 'ACCOUNT_GRANTS_FAILED')
    const initialized = await initializeExistingAdmin(db, accounts.admin, credentials, initializeAdmin)
    report.accounts.admin = initialized ? 'Initial password configured administratively; existing identity, metadata, data and permissions preserved' : 'Existing identity and password preserved'
  }
  stage = 'Verify administration password before preparing operator'
  const adminLogin = await auth(roles.admin, credentials.admin)
  assert(adminLogin.session.user.id === accounts.admin.id, 'ADMIN_IDENTITY_MISMATCH')
  await adminLogin.client.auth.signOut({ scope: 'local' })
  if (!accounts.operator) {
    const result = await db.auth.admin.createUser({ email: roles.operator, password: credentials.operator, email_confirm: true })
    assert(!result.error, 'ACCOUNT_CREATION_FAILED'); accounts.operator = result.data.user; report.accounts.operator = 'Created missing authorized identity with initial password'
  } else report.accounts.operator = 'Existing identity and password preserved'
  const register = await db.rpc('beta_register_accounts'); assert(!register.error, 'ACCOUNT_GRANTS_FAILED')
  const membership = await db.from('beta_accounts').select('user_id,role')
  assert(!membership.error && membership.data.length === 2 && membership.data.every(x => accounts[x.role]?.id === x.user_id), 'AUTHORIZED_IDENTITIES_MISMATCH')
  report.checks.push('Exactly the two approved identities hold beta grants; existing administration identity preserved')
  for (const role of ['operator', 'admin']) await browser('http://localhost:5173', role, accounts[role].id)
  console.info('PASS: both local password journeys. Waiting for the beta implementation commit if needed.')
  // During development this process holds credentials only in memory while the
  // agent commits/pushes the implementation. No further password entry is needed.
  for (;;) {
    const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const cli = process.env.NETLIFY_CLI || 'netlify'
    let deployed
    try { const site = JSON.parse(execFileSync(cli, ['api', 'getSite', '--data', JSON.stringify({ site_id: 'ce81887b-c941-40c3-8da4-13d6fc833290' })], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); deployed = site.published_deploy?.commit_ref } catch { /* retry without exposing API output */ }
    if (deployed === localHead) { report.testedCommit = localHead; break }
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
  for (const role of ['operator', 'admin']) await browser(beta, role, accounts[role].id)
  stage = 'Direct unauthorized Auth and database checks'
  const outsiderPassword = `QA-${crypto.randomUUID()}!`, newPassword = `Rejected-${crypto.randomUUID()}!`
  const tempEmail = `qa-beta-${Date.now()}@example.invalid`
  const signup = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: tempEmail, password: outsiderPassword }) })
  assert(!signup.ok && ['signup_disabled', 'email_signup_disabled'].includes((await signup.json()).error_code), 'PUBLIC_SIGNUP_NOT_DISABLED')
  const created = await db.auth.admin.createUser({ email: tempEmail, password: outsiderPassword, email_confirm: true, app_metadata: { role: 'admin' } })
  assert(!created.error, 'OUTSIDER_FIXTURE_FAILED'); outsider = created.data.user.id
  const login = await auth(tempEmail, outsiderPassword)
  const access = await login.client.rpc('beta_session_access'); assert(!access.error && access.data.role === null, 'OUTSIDER_PERMISSION_GRANTED')
  for (const table of ['clients', 'projects', 'estimates', 'estimate_messages', 'ai_conversations', 'ai_settings', 'ai_attachments', 'estimate_revisions']) {
    const result = await login.client.from(table).select(table === 'ai_settings' ? 'owner_id' : 'id').limit(1)
    assert(!result.error && !result.data.length, 'OUTSIDER_DATA_ACCESS')
  }
  assert((await login.client.from('clients').insert({ name: 'Rejected QA write' })).error, 'OUTSIDER_WRITE_ALLOWED')
  assert((await login.client.rpc('beta_review', { p_actor: accounts.admin.id })).error, 'DIRECT_REVIEW_RPC_ALLOWED')
  assert((await login.client.rpc('beta_register_accounts')).error, 'DIRECT_ACCOUNT_GRANT_ALLOWED')
  const change = await login.client.auth.updateUser({ password: newPassword }); assert(change.error, 'PUBLIC_PASSWORD_CHANGE_ALLOWED')
  const stillOld = await auth(tempEmail, outsiderPassword); await stillOld.client.auth.signOut({ scope: 'local' })
  for (const origin of ['http://localhost:5173', beta]) {
    const denied = await fetch(`${origin}/api/ai/status`, { headers: { Authorization: `Bearer ${login.session.access_token}` } }); assert(denied.status === 403, 'OUTSIDER_AI_ALLOWED')
  }
  report.checks.push('Direct signup rejected; unauthorized authenticated identity and forged admin metadata cannot read/write data, review or use AI; direct password update rejected and original password preserved')
} catch (error) {
  report.errors.push({ stage, code: /^[A-Z_]+$/.test(error.code || '') ? error.code : error.name })
  process.exitCode = 1
} finally {
  if (credentials) for (const key of Object.keys(credentials)) credentials[key] = ''
  for (const bearer of sessions) await db.auth.admin.signOut(bearer, 'local').catch(() => {})
  const cleanupErrors = []
  for (const [table, records] of [['ai_conversations', conversations], ['estimates', estimates]]) for (const record of records) {
    const result = await db.from(table).delete().eq('id', record.id).eq('owner_id', record.owner)
    const remaining = await db.from(table).select('id').eq('id', record.id).eq('owner_id', record.owner)
    if (result.error || remaining.error || remaining.data?.length) cleanupErrors.push(table)
  }
  if (outsider) {
    const deleted = await db.auth.admin.deleteUser(outsider)
    const remaining = await db.auth.admin.getUserById(outsider)
    if (deleted.error || remaining.data?.user || remaining.error?.status !== 404) cleanupErrors.push('temporary outsider')
  }
  report.cleanup = { errors: cleanupErrors, scope: 'Only exact synthetic development conversation/estimate IDs and the temporary outsider created by this run; authorized users retained; no Kevin test content' }
  if (cleanupErrors.length) process.exitCode = 1
  await writeFile('evidence/beta-access/browser-results.json', JSON.stringify(report, null, 2) + '\n')
  console.info(JSON.stringify({ checks: report.checks.length, errors: report.errors, cleanupErrors }))
}
