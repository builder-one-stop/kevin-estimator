export const USAGE_SCHEMA_VERSION='api-usage-1'
const finite=value=>Number.isFinite(value)&&value>=0
const number=value=>typeof value==='string'&&value.trim()!==''?Number(value):NaN
const hash=value=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(16)}
export function apiRateCard(env={},model='gpt-6.1-sol'){
 const rates={input:number(env.OPENAI_INPUT_USD_PER_MILLION),cached:number(env.OPENAI_CACHED_USD_PER_MILLION),output:number(env.OPENAI_OUTPUT_USD_PER_MILLION)}
 const configured=Object.values(rates).every(finite)
 return{schemaVersion:USAGE_SCHEMA_VERSION,version:env.OPENAI_PRICING_VERSION||(configured?'env-rates-'+hash(JSON.stringify(rates)):'unconfigured-1'),model,currency:'USD',unit:'per-million-tokens',effectiveDate:/^\d{4}-\d{2}-\d{2}$/.test(env.OPENAI_PRICING_EFFECTIVE_DATE||'')?env.OPENAI_PRICING_EFFECTIVE_DATE:null,sourceUrl:/^https?:\/\//.test(env.OPENAI_PRICING_SOURCE_URL||'')?env.OPENAI_PRICING_SOURCE_URL:null,status:configured?'configured-unverified':'unconfigured',rates:Object.fromEntries(Object.entries(rates).map(([k,v])=>[k,finite(v)?v:null])),billingVerified:false}
}
export function normalizedUsage(usage){
 if(!usage)return null
 const input=usage.input_tokens,output=usage.output_tokens,cached=usage.cached_tokens??usage.input_tokens_details?.cached_tokens??0
 if(![input,output,cached].every(x=>Number.isSafeInteger(x)&&x>=0)||cached>input)return null
 return{input_tokens:input,output_tokens:output,cached_tokens:cached}
}
export function usageCost(usage,card){
 const u=normalizedUsage(usage),r=card?.rates
 if(!u||!r||!Object.values(r).every(finite))return null
 return((u.input_tokens-u.cached_tokens)*r.input+u.cached_tokens*r.cached+u.output_tokens*r.output)/1e6
}
export function apiEvent(response,card,index=0){
 const usage=normalizedUsage(response.usage)
 return{id:response.id||null,index,model:response.model||card.model,usage,rateCard:structuredClone(card),estimatedCostUsd:usageCost(usage,card),billingVerified:false}
}
export function summarizeConversationUsage(state={}){
 const runs=new Map();for(const run of [...(state.runs||[]),state.run].filter(Boolean))if(run.id)runs.set(run.id,run)
 const seen=new Set(),summary={schemaVersion:USAGE_SCHEMA_VERSION,apiCalls:0,legacyRunsWithUnknownCallCount:0,inputTokens:0,cachedTokens:0,outputTokens:0,knownEstimatedCostUsd:0,estimatedCostUsd:null,unpricedEvents:0,unmeteredCalls:0,rateVersions:[],billingVerified:false,scope:'OpenAI API only; excludes ChatGPT subscription, hosting, Netlify and Supabase charges.'}
 const versions=new Set()
 for(const run of runs.values()){
  const m=run.metrics;if(!m)continue
  const measured=Number.isSafeInteger(m.apiCalls)&&m.apiCalls>=0
  const events=Array.isArray(m.apiEvents)?m.apiEvents:[]
  if(measured)summary.apiCalls+=m.apiCalls
  else if(normalizedUsage(m.usage))summary.legacyRunsWithUnknownCallCount++
  if(measured)summary.unmeteredCalls+=Math.max(0,m.apiCalls-events.length)
  const fallback=!events.length&&normalizedUsage(m.usage)&&(!measured||m.apiCalls>0)?[{id:null,index:0,usage:m.usage,rateCard:m.rateCard,estimatedCostUsd:m.rateCard?usageCost(m.usage,m.rateCard):null}]:[]
  for(const event of [...events,...fallback]){
   const key=event.id||run.id+':'+event.index;if(seen.has(key))continue;seen.add(key)
   const u=normalizedUsage(event.usage);if(u){summary.inputTokens+=u.input_tokens;summary.cachedTokens+=u.cached_tokens;summary.outputTokens+=u.output_tokens}
   if(event.rateCard?.version)versions.add(event.rateCard.version)
   if(finite(event.estimatedCostUsd))summary.knownEstimatedCostUsd+=event.estimatedCostUsd;else summary.unpricedEvents++
  }
 }
 summary.rateVersions=[...versions]
 if(!summary.unpricedEvents&&!summary.unmeteredCalls&&!summary.legacyRunsWithUnknownCallCount)summary.estimatedCostUsd=summary.knownEstimatedCostUsd
 return summary
}
