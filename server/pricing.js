// Provider boundary. No external connectors are registered in this delivery.
// A future connector must receive an authorized job location, use server credentials,
// and return exact product/package/unit matches with evidence; no silent substitutions.
import { catalogSchema } from '../shared/aiSchemas.js'
export class InternalCatalogProvider {
 constructor(entries){this.entries=entries.map(x=>catalogSchema.parse(x))}
 async lookup({product,brand,package:pack,unit,location}, {signal}={}) {
  signal?.throwIfAborted()
  const matches=this.entries.filter(x=>x.product===product&&x.brand===brand&&x.package===pack&&x.unit===unit&&x.location===location)
  return {status:matches.length?'available':'unavailable',source:'user-catalog',prices:matches,queriedExternally:false}
 }
}
export async function resolvePrice(provider,query,prior,{signal}={}) {
 try{
  const result=await provider.lookup(query,{signal})
  const exact=result.prices?.find(x=>x.product===query.product&&x.brand===query.brand&&x.package===query.package&&x.unit===query.unit&&x.location===query.location)
  if(!exact)return {...prior,status:'provisional',reason:'NO_EQUIVALENT_PRODUCT',substitution:false}
  return {...catalogSchema.parse(exact),substitution:false}
 }catch(error){if(signal?.aborted)throw error;return {...prior,status:'provisional',reason:'PROVIDER_UNAVAILABLE',substitution:false}}
}
