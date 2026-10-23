import {it,expect,vi} from 'vitest'
import {releaseConfigurationIssues} from '../../shared/releaseSafety.js'
import {HybridWorkProvider} from '../../server/hybridWorkProvider.js'
import {ResponsesProvider} from '../../server/openai.js'
import {createRuntime} from '../../server/runtime.js'
import {createEstimatorHandler} from '../../server/http.js'
const publicEnv={VITE_SUPABASE_URL:'https://vtpciccluvpaclbeqxih.supabase.co',VITE_SUPABASE_ANON_KEY:'sb_publishable_synthetic_validation_only'}
it('rejects a fixture backend, elevated browser credentials and synthetic deployment flags',()=>{
 expect(releaseConfigurationIssues(publicEnv)).toEqual([])
 expect(releaseConfigurationIssues({...publicEnv,VITE_SUPABASE_URL:publicEnv.VITE_SUPABASE_URL+'/rest/v1/'})).toEqual([])
 const wrongProject=['e30',btoa(JSON.stringify({role:'anon',ref:'another-project'})),'synthetic'].join('.')
 expect(releaseConfigurationIssues({...publicEnv,VITE_SUPABASE_ANON_KEY:wrongProject})).toContain('PUBLIC_SUPABASE_KEY_INVALID')
 expect(releaseConfigurationIssues({...publicEnv,VITE_SUPABASE_URL:'http://localhost:8792'})).toContain('PUBLIC_SUPABASE_TARGET_INVALID')
 const service=['e30',btoa(JSON.stringify({role:'service_role'})),'synthetic'].join('.')
 expect(releaseConfigurationIssues({...publicEnv,VITE_SUPABASE_ANON_KEY:service})).toContain('PUBLIC_SUPABASE_KEY_INVALID')
 expect(releaseConfigurationIssues({...publicEnv,VITE_OPENAI_API_KEY:'synthetic'})).toContain('PRIVATE_VARIABLE_EXPOSED_TO_VITE')
 expect(releaseConfigurationIssues({...publicEnv,VITE_LOCAL_SALES:'true'})).toContain('SYNTHETIC_MODE_IN_PRODUCTION')
})
it('selects the real hybrid provider explicitly without enabling an isolated identity',()=>{
 const env={SUPABASE_URL:publicEnv.VITE_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only'}
 expect(createRuntime(env).provider).toBeInstanceOf(ResponsesProvider)
 const p=createRuntime({...env,ONE_STOP_HYBRID_ENABLED:'true'}).provider
 expect(p).toBeInstanceOf(HybridWorkProvider)
 expect(p.hybridWork).toBe(true);expect(p.isolatedRealTrades).toBeUndefined()
 expect(p.library.records.length).toBeGreaterThan(0)
})
it('preserves existing photograph, manual-change and legacy-plan processing',async()=>{
 const fallback=vi.spyOn(ResponsesProvider.prototype,'run').mockResolvedValue({result:'existing behavior'})
 try{
 const p=new HybridWorkProvider({})
 for(const input of [{mode:'plan',images:[{mime:'image/png'}]},{mode:'edit',images:[]},{mode:'generate',images:[],context:{plan:{tasks:[{id:'legacy-paint'}]}}}]){
  expect(await p.run(input)).toEqual({result:'existing behavior'})
 }
 expect(fallback).toHaveBeenCalledTimes(3)
 }finally{fallback.mockRestore()}
})
it('calculates approved hybrid generation without making an OpenAI call',async()=>{
 const p=new HybridWorkProvider({})
 p.client={responses:{create:vi.fn(()=>{throw Error('Generation must not call the model')})}}
 const r=await p.run({mode:'generate',images:[],context:{documentLanguage:'en',plan:{tasks:[{id:'local-trade-lvp'}]}}})
 expect(r.metrics.apiCalls).toBe(0);expect(p.client.responses.create).not.toHaveBeenCalled()
})
it('exposes public research through authenticated production routes without enabling fixture mode or local costs',async()=>{
 const repo={authenticate:async()=> 'synthetic-owner',access:async()=> 'operator'}
 const {handle}=createEstimatorHandler({repo,provider:new HybridWorkProvider({})})
 const get=async(path,token=true)=>{
  const r=await handle(new Request('https://onestop-beta.netlify.app/api/ai/'+path,{headers:token?{Authorization:'Bearer synthetic'}:{}}))
  return {status:r.status,data:await r.json()}
 }
 expect((await get('pricing/local-library',false)).status).toBe(401)
 const status=await get('status');expect(status.data).toMatchObject({mode:'real',localLibraryAvailable:true,actualCostsAvailable:false})
 const library=await get('pricing/local-library?limit=6');expect(library.status).toBe(200)
 expect(library.data.scope).toBe('versioned-public-references');expect(library.data.counts.localVerified).toBe(0)
 expect(library.data.rows.length).toBeLessThanOrEqual(6)
})
