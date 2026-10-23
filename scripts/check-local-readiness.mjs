// Run locally. Reports only booleans/statuses: never prints env values or SDK errors.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
const expected = 'https://vtpciccluvpaclbeqxih.supabase.co'
const load = file => {
  const values = {}
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}
const server = load('.env.server.local'), frontend = load('.env.local')
const present = value => Boolean(value && !/[•●*…]|\.{3}/.test(value))
let ignored = false
try { execFileSync('git', ['check-ignore', '--quiet', '.env.server.local'], { stdio: 'ignore' }); ignored = true } catch { /* Report only. */ }
const result = { environment: 'Windows One Stop local readiness; no credentials displayed', serverFileExists: existsSync('.env.server.local'),
  serverFileGitIgnored: ignored, verifiedSupabaseTarget: server.SUPABASE_URL === expected,
  supabaseServerKeyPresent: present(server.SUPABASE_SERVICE_ROLE_KEY), openAIKeyPresent: present(server.OPENAI_API_KEY),
  frontendUsesLocalFixture: /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(frontend.VITE_SUPABASE_URL || ''),
  frontendContainsPrivateKeyNames: ['OPENAI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_OPENAI_API_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'].some(key => Boolean(frontend[key])),
  realServicesTested: false, reviewCommand: 'npm run dev:review', privateConfigPath: resolve('.env.server.local') }
console.info(JSON.stringify(result, null, 2))
if (result.frontendContainsPrivateKeyNames || !ignored) process.exitCode = 1
