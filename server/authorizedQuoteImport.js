// Local normalization contract for explicitly authorized supplier quote/CSV rows.
// Not an API connector. Does not read files, persist settings or contact suppliers.
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {catalogSchema} from '../shared/aiSchemas.js'
import {offerContextSchema} from '../shared/priceOffers.js'
const amount=z.number().finite().nonnegative().max(1000000).nullable()
export const authorizedQuoteRowSchema=z.object({
 quoteId:z.string().min(1).max(100),product:z.string().min(1).max(200),brand:z.string().min(1).max(100),sku:z.string().min(1).max(100),model:z.string().max(100).default(''),variant:z.string().max(200).default(''),
 package:z.string().min(1).max(100),unit:z.literal('ea'),unitCost:amount,currency:z.literal('USD'),vendor:z.string().min(1).max(200),
 checkedAt:z.string().date(),validUntil:z.string().date().nullable(),url:z.string().url().refine(s=>s.startsWith('https://')),
 offer:offerContextSchema,taxUsd:amount,freightUsd:amount,stockQuantity:amount,
}).strict()
export function normalizeAuthorizedQuotes(rows,{authorized=false}={}){
 if(!authorized)throw Error('QUOTE_IMPORT_AUTHORIZATION_REQUIRED')
 if(!Array.isArray(rows)||rows.length>500)throw Error('QUOTE_IMPORT_LIMIT')
 const result=rows.map(raw=>{
  const row=authorizedQuoteRowSchema.parse(raw)
  const digest=createHash('sha256').update(JSON.stringify([row.vendor,row.quoteId,row.sku,row.model,row.variant,row.package,row.unit,row.offer])).digest('hex')
  const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`
  return catalogSchema.parse({id,product:row.product,brand:row.brand,sku:row.sku,model:row.model,variant:row.variant,package:row.package,unit:row.unit,unitCost:row.unitCost,currency:row.currency,vendor:row.vendor,location:row.offer.storeId,url:row.url,checkedAt:row.checkedAt,validUntil:row.validUntil,status:row.unitCost===null?'quote_required':'provisional',verifiedZip:null,offer:row.offer,country:'US',region:'CA',city:'Los Angeles',evidenceKind:'authorized-quote',procurement:{taxUsd:row.taxUsd,freightUsd:row.freightUsd,stockQuantity:row.stockQuantity},evidence:`Explicitly authorized quote import ${row.quoteId}; exact product/package and offer retained. Import alone does not establish local verification.`,localPriceEvidence:''})
 })
 if(new Set(result.map(r=>r.id)).size!==result.length)throw Error('DUPLICATE_QUOTE_OFFER')
 return result
}
