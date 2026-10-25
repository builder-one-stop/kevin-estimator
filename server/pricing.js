// Explicit internal/imported observations only. No external connectors are registered.
import {catalogSchema} from '../shared/aiSchemas.js'
import {exactCatalogMatch} from '../shared/researchCatalog.js'
import {catalogPriceSnapshot} from '../shared/catalogPricing.js'
import {offerIdentity,sameOffer} from '../shared/priceOffers.js'
const caches=new WeakMap()
const normalizedQuery=query=>({...query,verifiedZip:(/^[0-9]{5}$/.test(query.location||'')?query.location:query.verifiedZip)||null})
export class InternalCatalogProvider {
 constructor(entries){this.entries=entries.map(x=>catalogSchema.parse(x))}
 async lookup(query,{signal}={}) {
  signal?.throwIfAborted()
  const prices=this.entries.filter(x=>exactCatalogMatch(x,normalizedQuery(query)))
  return {status:prices.length?'available':'unavailable',source:'user-catalog',prices,queriedExternally:false}
 }
}
async function boundedLookup(provider,query,signal,timeoutMs){
 signal?.throwIfAborted()
 const controller=new AbortController()
 let timer,onAbort
 try{
  return await Promise.race([
   Promise.resolve().then(()=>provider.lookup(query,{signal:controller.signal})),
   new Promise((_,reject)=>{
    onAbort=()=>{controller.abort(signal.reason);reject(signal.reason||new Error('ABORTED'))}
    signal?.addEventListener('abort',onAbort,{once:true})
    timer=setTimeout(()=>{const error=new Error('PROVIDER_TIMEOUT');controller.abort(error);reject(error)},timeoutMs)
   }),
  ])
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort)}
}
export async function resolvePrice(provider,query,prior={}, {signal,timeoutMs=3000,cacheTtlMs=300000,now=Date.now,cache:providedCache}={}) {
 if(prior.status==='manual'||prior.source==='manual-entry')return {...structuredClone(prior),substitution:false}
 let cached,cache,key
 const fallback=reason=>{
  const compatible=!prior.product||sameOffer(prior,normalizedQuery(query))
  const candidate=compatible&&Number.isFinite(prior.unitCost)?prior:cached?.price||(compatible?prior:{unitCost:null})
  // Preserve evidence under its original offer; never relabel it as a newly queried offer.
  return {...structuredClone(candidate),unitCost:candidate.unitCost??null,status:'provisional',
   freshness:Number.isFinite(candidate.unitCost)&&candidate.checkedAt?'stale':'unavailable',reason,substitution:false,externallyQueried:false}
 }
 try{
  key=offerIdentity(normalizedQuery(query))
  cache=providedCache||caches.get(provider)
  if(!cache){cache=new Map();caches.set(provider,cache)}
  cached=cache.get(key)
  if(cached&&now()-cached.at<cacheTtlMs){
   const price=catalogPriceSnapshot(cached.price,query.offer?.jobZip??normalizedQuery(query).verifiedZip??'')
   return {...price,cacheHit:true,substitution:false,externallyQueried:false}
  }
  const result=await boundedLookup(provider,query,signal,Math.max(1,Math.min(timeoutMs,30000)))
  const matches=(result.prices||[]).filter(x=>exactCatalogMatch(x,normalizedQuery(query)))
  if(matches.length!==1)return fallback(matches.length?'AMBIGUOUS_OFFER':'NO_EQUIVALENT_PRODUCT')
  const exact=catalogSchema.parse(matches[0])
  if(exact.unitCost===null)return fallback('PRICE_MISSING')
  const price=catalogPriceSnapshot(exact,query.offer?.jobZip??normalizedQuery(query).verifiedZip??'')
  if(price.reason==='MARKET_MISMATCH')return fallback('MARKET_MISMATCH')
  if(price.freshness==='stale'&&Number.isFinite(prior.unitCost))return fallback(price.reason)
  if(price.freshness==='unavailable')return fallback(price.reason)
  if(cache.size>=100&&!cache.has(key))cache.delete(cache.keys().next().value)
  cache.set(key,{at:now(),price:structuredClone(exact)})
  return {...price,cacheHit:false,substitution:false,externallyQueried:false}
 }catch(error){if(signal?.aborted)throw error;return fallback(error.message==='PROVIDER_TIMEOUT'?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE')}
}
