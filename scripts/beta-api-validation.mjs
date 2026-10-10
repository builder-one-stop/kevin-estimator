import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const url = 'https://vtpciccluvpaclbeqxih.supabase.co'
if (process.env.SUPABASE_URL !== url) throw new Error('Unexpected project')
const env = loadEnv('development', process.cwd())
const key = env.VITE_SUPABASE_ANON_KEY
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const origins = ['http://localhost:5173', ...(process.env.BETA_API_ONLINE === '1' ? ['https://onestop-beta.netlify.app'] : [])]
const report = { origins, project: 'vtpciccluvpaclbeqxih', checks: [], errors: [], cleanup: null }
const sessions = []
let userId, fixtureId, browser
const assert = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }) }
const email = `qa-beta-guard-${Date.now()}@example.invalid`, password = crypto.randomUUID(), rejectedPassword = crypto.randomUUID()
async function login() {
  const db = client(), result = await db.auth.signInWithPassword({ email, password })
  assert(!result.error && result.data.session, 'FIXTURE_LOGIN_FAILED')
  sessions.push(result.data.session.access_token)
  return { db, token: result.data.session.access_token }
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'admin' } })
  assert(!created.error, 'FIXTURE_CREATION_FAILED'); userId = created.data.user.id
  const owned = await admin.from('clients').insert({ owner_id: userId, name: 'Synthetic unauthorized fixture' }).select('id').single()
  assert(!owned.error, 'FIXTURE_DATA_FAILED'); fixtureId = owned.data.id
  const { db, token } = await login()
  const access = await db.rpc('beta_session_access')
  assert(!access.error && access.data.role === null, 'UNAUTHORIZED_GRANT')
  for (const table of ['clients', 'projects', 'estimates', 'estimate_messages', 'ai_conversations', 'ai_settings', 'ai_attachments', 'estimate_revisions']) {
    const result = await db.from(table).select(table === 'ai_settings' ? 'owner_id' : 'id').limit(1)
    assert(!result.error && result.data.length === 0, 'UNAUTHORIZED_READ')
  }
  assert((await db.from('clients').insert({ name: 'Rejected synthetic write' })).error, 'UNAUTHORIZED_WRITE')
  assert((await db.rpc('beta_register_accounts')).error, 'UNAUTHORIZED_ACCOUNT_GRANT')
  assert((await db.rpc('beta_review', { p_actor: userId })).error, 'UNAUTHORIZED_REVIEW_RPC')
  assert((await db.auth.updateUser({ password: rejectedPassword })).error, 'DIRECT_PASSWORD_UPDATE_ALLOWED')
  const unchanged = await login(); await unchanged.db.auth.signOut({ scope: 'local' })
  for (const origin of origins) {
    const denied = await fetch(`${origin}/api/ai/status`, { headers: { Authorization: `Bearer ${token}` } })
    assert(denied.status === 403, 'UNAUTHORIZED_AI')
  }
  report.checks.push('Real Supabase: unauthorized password session and forged admin metadata denied all data tables, including its own preserved fixture; writes/grant/review RPC denied')
  report.checks.push('Direct Supabase password update rejected; original temporary password still works; local AI denies unauthorized identity')
  // A service-generated recovery link sends no email. Consume only this fixture token.
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email })
  assert(!recovery.error, 'RECOVERY_FIXTURE_FAILED')
  const recoveryClient = client()
  const verified = await recoveryClient.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: 'recovery' })
  assert(!verified.error && verified.data.session, 'RECOVERY_VERIFY_FAILED')
  sessions.push(verified.data.session.access_token)
  const recoveryAccess = await recoveryClient.rpc('beta_session_access')
  assert(!recoveryAccess.error && recoveryAccess.data.role === null, 'RECOVERY_ACCESS_ALLOWED')
  assert((await recoveryClient.auth.updateUser({ password: rejectedPassword })).error, 'RECOVERY_PASSWORD_UPDATE_ALLOWED')
  await login()
  report.checks.push('Real recovery session generated without sending email: no beta access, password update blocked and original password preserved')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const origin of origins) {
  const page = await browser.newPage()
  await page.goto(origin)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This account does not have beta access.', { timeout: 20000 })
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.reload()
  await expect(page.locator('.login-screen')).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  report.checks.push(`Real Chrome + Supabase password login at ${origin}: unauthorized fixture sees access-denied message, no modules, cleared password and logged-out reload`)
  await page.close()
  }
} catch (error) {
  report.errors.push(error.code || error.name)
  process.exitCode = 1
} finally {
  await browser?.close()
  for (const token of sessions) await admin.auth.admin.signOut(token, 'local').catch(() => {})
  const errors = []
  if (fixtureId) {
    const deleted = await admin.from('clients').delete().eq('id', fixtureId).eq('owner_id', userId)
    const remaining = await admin.from('clients').select('id').eq('id', fixtureId)
    if (deleted.error || remaining.error || remaining.data?.length) errors.push('client')
  }
  if (userId && !errors.length) {
    const deleted = await admin.auth.admin.deleteUser(userId)
    const remaining = await admin.auth.admin.getUserById(userId)
    if (deleted.error || remaining.data?.user || remaining.error?.status !== 404) errors.push('user')
  }
  report.cleanup = { errors, scope: 'Only exact temporary outsider and client created by this run; no authorized account password changed; no email sent' }
  if (errors.length) process.exitCode = 1
  await writeFile('evidence/beta-access/unauthorized-api-browser.json', JSON.stringify(report, null, 2) + '\n')
  console.info(JSON.stringify({ checks: report.checks.length, errors: report.errors, cleanupErrors: errors }))
}
