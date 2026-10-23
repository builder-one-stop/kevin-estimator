import {actualCostSchema} from './localActualCosts.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
import {hasMissingPrices} from '../shared/estimatePricing.js'
import {fail} from '../shared/aiDomain.js'
// Durable DB-backed store. No filesystem, synthetic identities or environment secrets.
export class SupabaseActualCosts{
 constructor(repo){this.repo=repo}
 async list(owner,estimateId){return this.repo.result(this.repo.db.rpc('actual_cost_gateway',{p_owner:owner,p_estimate:estimateId,p_input:null,p_snapshot:null,p_version:null}))}
 async add(owner,estimate,body){
  const input=actualCostSchema.parse(body)
  if(estimate.owner_id!==owner)throw fail('FORBIDDEN_RELATION',403)
  const sums=calculateEstimate(estimate.document,estimate.markup_bps)
  return this.repo.result(this.repo.db.rpc('actual_cost_gateway',{p_owner:owner,p_estimate:estimate.id,p_input:input,p_version:estimate.version,
   p_snapshot:{knownCostCents:sums.costCents,costsByType:sums.costsByType,incomplete:hasMissingPrices(estimate.document)}}))
 }
}
