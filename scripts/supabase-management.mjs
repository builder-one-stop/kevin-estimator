import { execFileSync } from 'node:child_process'

export const projectRef = 'vtpciccluvpaclbeqxih'
let token
export async function management(path, body, method = body ? 'POST' : 'GET') {
  if (!token) {
    token = process.env.SUPABASE_ACCESS_TOKEN
    if (!token) try {
      token = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
        { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch { throw new Error('Supabase Management authentication unavailable (credential output withheld)') }
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Supabase Management ${path}: HTTP ${response.status} (response withheld)`)
  return response.json()
}
export const query = sql => management('database/query', { query: sql })
