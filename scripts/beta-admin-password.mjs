import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { hiddenInput } from './hidden-beta-input.mjs'

// Explicit local administration only; never imported by Netlify or the frontend.
const role = process.argv[2]
if (!['operator', 'admin'].includes(role)) throw new Error('Choose operator or admin as the account alias')
if (process.env.SUPABASE_URL !== 'https://vtpciccluvpaclbeqxih.supabase.co') throw new Error('Unexpected Supabase project')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: account, error } = await db.from('beta_accounts').select('user_id').eq('role', role).single()
if (error) throw new Error('Authorized account unavailable')
const input = await hiddenInput([{ name: 'password', label: `${role === 'operator' ? 'Kevin' : 'Administración'} — nueva contraseña`, minimum: 8, maximumBytes: 72 }, { name: 'confirm', label: 'Confirma la nueva contraseña', minimum: 8, maximumBytes: 72, confirmOf: 'password' }])
try {
  if (input.password !== input.confirm || Buffer.byteLength(input.password) > 72) throw new Error('Passwords must match and use at most 72 UTF-8 bytes')
  const hash = await bcrypt.hash(input.password, 10)
  const result = await db.rpc('beta_admin_set_password', { p_user: account.user_id, p_hash: hash })
  if (result.error) throw new Error('Administrative password update rejected (details withheld)')
  console.info('Password updated administratively; pending tokens and sessions revoked. No plaintext password was written or printed.')
} finally { input.password = ''; input.confirm = '' }
