// Provider boundary. No external connectors are registered in this delivery.
// A future connector must receive an authorized job location, use server credentials,
// and return exact product/package/unit matches with evidence; no silent substitutions.
import { catalogSchema } from '../shared/aiSchemas.js'
import { exactCatalogMatch } from '../shared/researchCatalog.js'
import { catalogPriceSnapshot } from '../shared/catalogPricing.js'
export class InternalCatalogProvider {
 constructor(entries){this.entries=entries.map(x=>catalogSchema.parse(x))}
 async lookup({product,brand,package:pack,unit,location}, {signal}={}) {
  signal?.throwIfAborted()
  const matches=this.entries.filter(x=>exactCatalogMatch(x,{product,brand,package:pack,unit,verifiedZip:location || null}))
  return {status:matches.length?'available':'unavailable',source:'user-catalog',prices:matches,queriedExternally:false}
 }
}
export async function resolvePrice(provider,query,prior,{signal}={}) {
 try{
  const result=await provider.lookup(query,{signal})
  const exact=result.prices?.find(x=>exactCatalogMatch(x,{...query,verifiedZip:query.location || null}))
  if(!exact)return {...prior,status:'provisional',reason:'NO_EQUIVALENT_PRODUCT',substitution:false}
  if(exact.unitCost===null)return {...prior,status:'provisional',reason:'PRICE_MISSING',substitution:false}
  if(exact.validUntil && exact.validUntil < new Date().toISOString().slice(0,10))return {...prior,status:'provisional',reason:'PRICE_EXPIRED',substitution:false}
  return {...catalogPriceSnapshot(catalogSchema.parse(exact),query.location || ''),substitution:false}
 }catch(error){if(signal?.aborted)throw error;return {...prior,status:'provisional',reason:'PROVIDER_UNAVAILABLE',substitution:false}}
}
