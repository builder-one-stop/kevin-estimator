import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'

export const ref = 'vtpciccluvpaclbeqxih'

// Only this Node process sees the admin key. Chrome authenticates as a temporary
// normal user through a real one-time link. generateLink never sends an email.
export async function withFixture(run, { origin = 'http://127.0.0.1:5173' } = {}) {
  if (!['http://127.0.0.1:5173', 'http://localhost:5173', 'https://onestop-beta.netlify.app'].includes(origin)) throw new Error('Unexpected browser origin')
  const env = loadEnv('development', process.cwd())
  const url = env.VITE_SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  if (new URL(url).hostname !== `${ref}.supabase.co`) throw new Error('Unexpected Supabase project')
  const cli = process.env.SUPABASE_CLI || 'supabase'
  let key
  try {
    const keys = JSON.parse(execFileSync(cli, ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }))
    key = keys.find((entry) => entry.name === 'service_role')?.api_key
  } catch { throw new Error('Supabase CLI fixture credential lookup failed (output withheld)') }
  if (!key) throw new Error('Administrative test fixture access unavailable')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const betaGate = await admin.from('beta_accounts').select('user_id').limit(1)
  if (!betaGate.error) throw new Error('Closed beta: temporary magic-link fixtures are disabled. Use npm run test:beta:browser.')
  const tag = `QA-BROWSER-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`
  const email = `${tag.toLowerCase()}@example.invalid`
  let userId
  const problems = []
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email, options: { redirectTo: `${origin}/` },
    })
    if (error) throw new Error(`Cannot create test login: ${error.code || error.status}`)
    userId = data.user.id
    const redirect = new URL(data.properties.action_link).searchParams.get('redirect_to')
    console.log(JSON.stringify({ step: 'test-login-generated-without-email', redirectOrigin: redirect ? new URL(redirect).origin : null }))
    await run({ tag, actionLink: data.properties.action_link })
  } catch (error) { problems.push(error) }

  // Cleanup also runs after a failed browser assertion, and never replaces that
  // failure. A failed deletion prevents deletion of the fixture account.
  const failuresBeforeCleanup = problems.length
  if (userId) {
    for (const table of ['estimates', 'projects', 'clients']) {
      try {
        const { error } = await admin.from(table).delete().eq('owner_id', userId)
        if (error) throw new Error(`Test cleanup failed for ${table}: ${error.code}`)
        const remaining = await admin.from(table).select('id', { count: 'exact', head: true }).eq('owner_id', userId)
        if (remaining.error || remaining.count !== 0) throw new Error(`Test records remain in ${table}`)
      } catch (error) { problems.push(error) }
    }
    if (problems.length === failuresBeforeCleanup) {
      try {
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw new Error(`Test user cleanup failed: ${error.code || error.status}`)
        const check = await admin.auth.admin.getUserById(userId)
        if (check.data?.user || check.error?.status !== 404) throw new Error('Test account deletion could not be verified')
        writeFileSync('evidence/browser-validation/cleanup.json', JSON.stringify({
          project: ref, testDataRemaining: 0, temporaryAccountDeleted: true,
          scope: 'Only the exact user created by this run; no existing user or customer data touched',
        }, null, 2) + '\n')
        console.log('PASS: deleted only this run’s test records and temporary account; verified zero remaining records and account removal')
      } catch (error) { problems.push(error) }
    }
  }
  if (problems.length) throw new AggregateError(problems, 'Browser validation or fixture cleanup failed')
}
