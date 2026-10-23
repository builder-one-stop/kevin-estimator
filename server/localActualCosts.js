import {readFile,writeFile,rename,mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import {z} from 'zod'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
import {hasMissingPrices} from '../shared/estimatePricing.js'
export const actualCostSchema=z.object({requestId:z.string().uuid(),category:z.enum(['material','labor','equipment','other']),amountUsd:z.number().finite().min(0).max(1000000),date:z.string().date(),note:z.string().min(3).max(500),currency:z.literal('USD')}).strict()
// Constructed only by the explicitly isolated launcher; never an external database migration.
export class LocalActualCosts{
 constructor(file){this.file=file;this.queue=Promise.resolve()}
 async read(){try{const data=JSON.parse(await readFile(this.file,'utf8'));if(data.schemaVersion!=='manual-actual-costs-1'||!Array.isArray(data.records))throw Error('INVALID_ACTUAL_COST_STORE');return data}catch(e){if(e.code==='ENOENT')return{schemaVersion:'manual-actual-costs-1',records:[]};throw e}}
 async list(owner,estimateId){const data=await this.read();return data.records.filter(x=>x.ownerId===owner&&x.estimateId===estimateId)}
 async add(owner,estimate,body){
  const input=actualCostSchema.parse(body)
  if(estimate.owner_id!==owner)throw Object.assign(Error('FORBIDDEN_RELATION'),{code:'FORBIDDEN_RELATION',status:403})
  const write=async()=>{
   const data=await this.read(),signature=JSON.stringify(input),old=data.records.find(x=>x.ownerId===owner&&x.requestId===input.requestId)
   if(old){if(old.estimateId!==estimate.id||old.signature!==signature)throw Object.assign(Error('ACTUAL_COST_CONFLICT'),{code:'ACTUAL_COST_CONFLICT',status:409});return old}
   if(data.records.length>=10000)throw Error('LOCAL_ACTUAL_COST_CAPACITY')
   const sums=calculateEstimate(estimate.document,estimate.markup_bps)
   const row={...input,signature,ownerId:owner,estimateId:estimate.id,estimateVersion:estimate.version,recordedAt:new Date().toISOString(),amountCents:Math.round(input.amountUsd*100),budgetSnapshot:{knownCostCents:sums.costCents,costsByType:sums.costsByType,incomplete:hasMissingPrices(estimate.document)},source:'manual-actual-cost',automaticLearning:false,priceVerification:false}
   data.records.push(row);await mkdir(dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(data,null,2));await rename(temporary,this.file);return row
  }
  const next=this.queue.then(write);this.queue=next.catch(()=>{});return next
 }
}
export function actualCostComparison(estimate,records){
 const sums=calculateEstimate(estimate.document,estimate.markup_bps),actual=records.reduce((n,r)=>n+r.amountCents,0),incomplete=hasMissingPrices(estimate.document)
 return{knownBudgetCostCents:sums.costCents,recordedActualCostCents:actual,varianceAgainstKnownBudgetCents:actual-sums.costCents,budgetIncomplete:incomplete,actualsComplete:false,automaticLearning:false,priceVerification:false,meaning:'Recorded actuals versus known budget only. No full job variance until budget and actual costs are complete.'}
}
