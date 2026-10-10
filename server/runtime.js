import { SupabaseRepository } from './repository.js'
import { ResponsesProvider } from './openai.js'

export function createRuntime(env = process.env) {
  const url = env.SUPABASE_URL
  if (url !== 'https://vtpciccluvpaclbeqxih.supabase.co') throw new Error('SUPABASE_URL must target the verified kevin-estimator project')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY on the server only')
  return { repo: new SupabaseRepository(url, env.SUPABASE_SERVICE_ROLE_KEY), provider: new ResponsesProvider(env) }
}
