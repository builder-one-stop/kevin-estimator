import { z } from 'zod'
import { assessPrice } from './priceEvidence.js'

export const LIBRARY_VERSION='local-library-1'
const day=z.string().date()
const webUrl=z.string().url().refine(value=>['http:','https:'].includes(new URL(value).protocol),'HTTP source required')
export const observationSchema=z.object({
  id:z.string().min(1).max(100),category:z.enum(['paint','drywall','baseboard','lvp','tile','accessory']),
  product:z.string().min(1).max(300),brand:z.string().min(1).max(100),vendor:z.string().min(1).max(200),
  sku:z.string().max(100).default(''),model:z.string().max(100).default(''),
  retailerProductId:z.string().max(100).optional(),
  package:z.string().min(1).max(200),unit:z.enum(['ea','sf','lf','gal','qt']),
  unitCost:z.number().finite().min(0).max(1000000).nullable(),currency:z.literal('USD'),
  url:webUrl,checkedAt:day,evidenceMethod:z.enum(['indexed_public_price','public_page_price','manufacturer_specification','public_specification']),
  evidence:z.string().min(1).max(2000),country:z.literal('US'),region:z.literal('CA'),city:z.literal('Los Angeles'),
  // A target market is not proof of branch pricing. Imported public records can never claim local verification.
  localVerified:z.literal(false),laPriceVerified:z.literal(false).default(false),laInventoryVerified:z.literal(false).default(false),tax:z.null().default(null),delivery:z.null().default(null),branch:z.string().max(200).default(''),zip:z.string().regex(/^\d{5}$/).nullable().default(null),
  coverage:z.object({quantity:z.number().finite().positive(),unit:z.enum(['sf','lf','ea']),sourceUrl:webUrl,basis:z.enum(['documented_package','editable_assumption','manufacturer_derived'])}).strict().nullable().default(null),
  limitations:z.array(z.string().max(500)).max(15).default([]),
  purchaseBasis:z.enum(['documented_package','pack_pending']).default('documented_package'),packQuantity:z.number().positive().nullable().default(null),
  priceSourceUrl:webUrl.optional(),specSourceUrl:webUrl.optional(),autoEligible:z.boolean().default(false),
}).strict().superRefine((row,ctx)=>{if(row.purchaseBasis==='pack_pending'&&row.autoEligible)ctx.addIssue({code:'custom',message:'Unconfirmed package cannot be auto eligible'});if(row.unitCost!==null&&row.evidenceMethod.includes('specification'))ctx.addIssue({code:'custom',message:'Specification alone cannot establish a price'})})
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
export const libraryIdentity=row=>[row.vendor,row.retailerProductId||(row.vendor==='The Home Depot'&&/^hd-\d+$/.test(row.id)?row.id.slice(3):row.sku||row.model||row.product),row.brand,row.package,row.unit,row.country,row.region,row.city,row.branch,row.zip||''].map(normalize).join('|')
const evidenceFields=['product','brand','sku','model','retailerProductId','unitCost','url','checkedAt','evidenceMethod','evidence','coverage','limitations','autoEligible','priceSourceUrl','specSourceUrl','purchaseBasis','packQuantity']

export function importLibrary(previous,incoming,{batchId,importedAt=new Date().toISOString()}={}){
  if(!batchId||!Array.isArray(incoming)||incoming.length>1000)throw Error('INVALID_LIBRARY_BATCH')
  const records=new Map((previous?.records||[]).map(row=>[libraryIdentity(row),structuredClone(row)]))
  const report={inserted:0,updated:0,unchanged:0,stale:0,duplicates:0,priorDuplicatesCollapsed:(previous?.records?.length||0)-records.size}
  const seen=new Set()
  // Validate the complete batch before merging, so invalid input cannot partly update a library.
  const valid=incoming.map(row=>observationSchema.parse(row))
  for(const row of valid){
    const key=libraryIdentity(row)
    if(seen.has(key))report.duplicates++
    seen.add(key)
    const old=records.get(key)
    if(old&&row.checkedAt<old.checkedAt){report.stale++;continue}
    if(old&&evidenceFields.every(field=>JSON.stringify(old[field])===JSON.stringify(row[field]))){report.unchanged++;continue}
    const history=old?[...(old.history||[]),{version:old.version,unitCost:old.unitCost,checkedAt:old.checkedAt,url:old.url,evidenceMethod:old.evidenceMethod}].slice(-50):[]
    records.set(key,{...row,id:old?.id||row.id,version:(old?.version||0)+1,batchId,importedAt,history})
    report[old?'updated':'inserted']++
  }
  return {schemaVersion:LIBRARY_VERSION,records:[...records.values()].sort((a,b)=>a.id.localeCompare(b.id)),report}
}

export function queryLibrary(library,{query='',category='',offset=0,limit=24}={}){
  const bounded=Math.min(100,Math.max(1,Math.trunc(limit)||24)),start=Math.max(0,Math.trunc(offset)||0),terms=normalize(query).split(' ').filter(Boolean)
  const rows=library.records.filter(row=>(!category||row.category===category)&&terms.every(term=>normalize([row.product,row.brand,row.sku,row.model,row.package,row.vendor].join(' ')).includes(term)))
  return {total:rows.length,offset:start,limit:bounded,rows:rows.slice(start,start+bounded)}
}
export function libraryCounts(library){return{records:library.records.length,withPrice:library.records.filter(row=>row.unitCost!==null).length,withoutPrice:library.records.filter(row=>row.unitCost===null).length,localVerified:library.records.filter(row=>row.localVerified).length}}
export function libraryCatalog(library){return library.records.map(row=>({...row,sourceId:row.id,sourceVersion:LIBRARY_VERSION,location:row.branch,priceVersion:row.version,status:row.unitCost===null?'quote_required':'public_observed',verifiedZip:null,validUntil:null,evidence:row.evidence,localPriceEvidence:'',sourceUrl:row.url,inventoryVerified:false}))}
export const libraryAssessment=row=>assessPrice({...row,status:row.unitCost===null?'quote_required':'public_observed'})
