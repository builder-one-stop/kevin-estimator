import { SupabaseRepository } from './repository.js'
import { ResponsesProvider } from './openai.js'
import { createEstimatorServer } from './http.js'
const url=process.env.SUPABASE_URL
if(url!=='https://vtpciccluvpaclbeqxih.supabase.co')throw new Error('SUPABASE_URL must target the verified kevin-estimator project')
if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY on the server only')
const repo=new SupabaseRepository(url,process.env.SUPABASE_SERVICE_ROLE_KEY)
const {server}=createEstimatorServer({repo,provider:new ResponsesProvider(),origin:process.env.APP_ORIGIN||'http://127.0.0.1:5173'})
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.info('Estimator API listening on loopback; secrets and job content are not logged'))
