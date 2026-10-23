import { SupabaseRepository } from './repository.js'
import { ResponsesProvider } from './openai.js'
import { HybridWorkProvider } from './hybridWorkProvider.js'
import { SupabaseActualCosts } from './supabaseActualCosts.js'

export function createRuntime(env = process.env) {
  const url = env.SUPABASE_URL
  if (url !== 'https://vtpciccluvpaclbeqxih.supabase.co') throw new Error('SUPABASE_URL must target the verified kevin-estimator project')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY on the server only')
  const salesEnabled=env.ONE_STOP_SALES_ENABLED==='true'
  if(env.ONE_STOP_ACTUAL_COSTS_ENABLED==='true'&&(!salesEnabled||env.ONE_STOP_HYBRID_ENABLED!=='true'))throw new Error('Actual costs require the reviewed sales schema and hybrid runtime')
  const repo=new SupabaseRepository(url,env.SUPABASE_SERVICE_ROLE_KEY,{salesEnabled})
  const provider=env.ONE_STOP_HYBRID_ENABLED==='true'?new HybridWorkProvider(env):new ResponsesProvider(env)
  if(env.ONE_STOP_ACTUAL_COSTS_ENABLED==='true'){provider.actualCosts=new SupabaseActualCosts(repo);provider.durableActualCosts=true}
  return {repo,provider}
}
