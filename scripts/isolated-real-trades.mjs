import {parseEnv} from 'node:util'
import {readFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {LocalActualCosts} from '../server/localActualCosts.js'
import {IsolatedTradeProvider} from '../server/isolatedTradeProvider.js'
import {startHarness} from './ai-local-harness.mjs'
import {observationSchema} from '../shared/localPriceLibrary.js'
// Expected private file only; OpenAI fields are passed only to this provider.
// Never construct a Supabase client/runtime or log/write credential values.
const stored=parseEnv(readFileSync(resolve('.env.server.local'),'utf8'))
const env={ONE_STOP_ISOLATED_REAL_TRADES:'1'}
for(const key of ['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_REASONING_EFFORT','OPENAI_INPUT_USD_PER_MILLION','OPENAI_CACHED_USD_PER_MILLION','OPENAI_OUTPUT_USD_PER_MILLION','OPENAI_PRICING_VERSION','OPENAI_PRICING_EFFECTIVE_DATE','OPENAI_PRICING_SOURCE_URL'])if(stored[key])env[key]=stored[key]
for(const key of Object.keys(process.env))if(key.startsWith('SUPABASE_'))delete process.env[key]
const root=resolve('.local-review/real-ai-isolated');mkdirSync(root,{recursive:true})
const rateFile=resolve('.local-review/api-rate-card.json')
if(existsSync(rateFile)){
 for(const key of ['OPENAI_INPUT_USD_PER_MILLION','OPENAI_CACHED_USD_PER_MILLION','OPENAI_OUTPUT_USD_PER_MILLION'])delete env[key]
 try{
 const tariff=JSON.parse(readFileSync(rateFile,'utf8')),rates=tariff.ratesUsdPerMillionTokens
 const valid=typeof tariff.version==='string'&&tariff.version.length>0&&tariff.version.length<100&&tariff.model===(env.OPENAI_MODEL||'gpt-6.1-sol')&&rates&&['input','cached','output'].every(k=>rates[k]===null||Number.isFinite(rates[k])&&rates[k]>=0)
 for(const key of ['OPENAI_INPUT_USD_PER_MILLION','OPENAI_CACHED_USD_PER_MILLION','OPENAI_OUTPUT_USD_PER_MILLION'])delete env[key]
 if(valid){
  env.OPENAI_PRICING_VERSION=tariff.version
  env.OPENAI_PRICING_EFFECTIVE_DATE=tariff.effectiveDate||'';env.OPENAI_PRICING_SOURCE_URL=tariff.sourceUrl||''
  for(const[k,key]of Object.entries({input:'OPENAI_INPUT_USD_PER_MILLION',cached:'OPENAI_CACHED_USD_PER_MILLION',output:'OPENAI_OUTPUT_USD_PER_MILLION'}))if(rates[k]!==null)env[key]=String(rates[k])
 }else console.warn('Local API tariff does not match the model/schema; cost remains unknown. Estimating remains available.')
 }catch{console.warn('Local API tariff is unreadable; cost remains unknown. Estimating remains available.')}
}

const libraryFile=resolve('.local-review/price-library.json'),library=existsSync(libraryFile)?JSON.parse(readFileSync(libraryFile,'utf8')):undefined
if(library)for(const row of library.records){const {version,batchId,importedAt,history,...record}=row;observationSchema.parse(record);if(!version||!batchId||!importedAt||!Array.isArray(history))throw Error('INVALID_LOCAL_LIBRARY')}
const provider=new IsolatedTradeProvider(env,{library});provider.actualCosts=new LocalActualCosts(resolve(root,'actual-costs.json'))
const h=await startHarness({provider,dataDir:resolve(root,'database'),port:5186,apiPort:8796})
console.info('REAL OPENAI / ISOLATED PGLITE: '+h.url+'/__fixture/session — synthetic data only; no production Supabase; usage may incur cost.')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await h.close();process.exit(0)})
