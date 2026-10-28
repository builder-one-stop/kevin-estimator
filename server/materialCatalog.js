import {z} from 'zod'
import {effectiveCatalog} from '../shared/researchCatalog.js'
import {catalogPriceSnapshot} from '../shared/catalogPricing.js'
import {defaultPaintTemplate,isInteriorWallPaint} from '../shared/paintJob.js'
import {packageGallons} from '../shared/materialTakeoff.js'
import {catalogSchema} from '../shared/aiSchemas.js'
import {InternalCatalogProvider,resolvePrice} from './pricing.js'
const normalize=x=>String(x??'').trim().toLowerCase()
export const materialQuerySchema=z.object({id:z.string().max(80).optional(),sku:z.string().max(100).optional(),model:z.string().max(100).optional(),variant:z.string().max(200).optional(),package:z.string().max(200).optional(),vendor:z.string().max(200).optional(),storeId:z.string().max(100).optional(),storeZip:z.string().regex(/^\d{5}$/).optional(),role:z.enum(['paint','repair']).optional(),q:z.string().max(200).optional()}).strict()
const eligible=(row,role)=>!role||(role==='paint'?['interior_paint','paint'].includes(row.category)||(!row.category&&packageGallons(row)>0):row.category==='patch'||(!row.category&&/spackl|patch|filler/i.test(row.product)))
export class MaterialCatalogService{
 constructor(settings={}){this.rows=settings.catalogIsEffective?settings.catalog:effectiveCatalog(settings.catalog||[])}
 search(raw={}){
  const query=materialQuerySchema.parse(raw)
  const rows=this.rows.filter(row=>eligible(row,query.role)&&['id','sku','model','variant','package','vendor'].every(key=>!query[key]||normalize(row[key])===normalize(query[key]))&&
   (!query.storeId||row.offer?.storeId===query.storeId)&&(!query.storeZip||row.offer?.storeZip===query.storeZip)&&
   (!query.q||normalize([row.product,row.brand,row.sku,row.model,row.package,row.vendor].join(' ')).includes(normalize(query.q))))
  return {rows:rows.slice(0,40),total:rows.length,matchType:query.q?'suggestions':Object.keys(query).some(k=>k!=='role')?'exact':'catalog',externallyQueried:false}
 }
 async resolve(entry,jobZip=''){
  if(entry.unitCost===null)return {...structuredClone(entry),...catalogPriceSnapshot(entry,jobZip),category:entry.category}
  const canonical=catalogSchema.parse(Object.fromEntries(Object.keys(catalogSchema.shape).filter(k=>Object.hasOwn(entry,k)).map(k=>[k,entry[k]])))
  const price=await resolvePrice(new InternalCatalogProvider([canonical]),canonical,catalogPriceSnapshot(entry,jobZip), {timeoutMs:500})
  return {...structuredClone(entry),...price,category:entry.category,priceCategory:price.category,unitCost:price.unitCost??null}
 }
}
export function requestedMaterial(messages=[]){
 const text=messages.filter(x=>x.role==='user').map(x=>x.content).join('\n')
 const match=[...text.matchAll(/\b(SKU|model|modelo)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,99})\b/gi)].at(-1)
 return match?{[match[1].toLowerCase()==='sku'?'sku':'model']:match[2]}:null
}
const bi=text=>({en:text,es:text})
export async function prepareMaterialPlan(plan,settings,messages=[]){
 const result=structuredClone(plan),service=new MaterialCatalogService(settings),snapshots=[]
 const template={...defaultPaintTemplate(),...settings.paintTemplate},explicit=requestedMaterial(messages)
 const requests=[],evidence=[]
 for(const task of result.tasks.filter(isInteriorWallPaint))for(const role of ['paint','repair']){
  const chosen=plan.materialRequests?.find(r=>r.taskId===task.id&&r.role===role)
  const defaultId=template[role==='paint'?'paintCatalogId':'repairCatalogId']
  const approvedText=[task.product.en,task.product.es].join(' ').toLowerCase()
  const defaultRow=service.rows.find(row=>row.id===defaultId)
  const useDefault=defaultRow&&approvedText.includes(defaultRow.product.toLowerCase())&&approvedText.includes(defaultRow.brand.toLowerCase())
  const query=chosen?Object.fromEntries(['id','sku','model','variant','package','vendor','storeId','storeZip'].filter(k=>chosen[k]).map(k=>[k,chosen[k]])):role==='paint'&&explicit?explicit:{id:useDefault?defaultId:'unselected'}
  const found=service.search({...query,role}),entry=found.rows.length===1?found.rows[0]:null
  const resolved=entry?await service.resolve(entry,result.pricingContext?.jobZip??result.zip):null
  if(resolved)snapshots.push(resolved)
  const request={taskId:task.id,role,...query}
  requests.push(request)
  const label=resolved?`${resolved.vendor} | ${resolved.brand} ${resolved.product} | ${resolved.package} | SKU ${resolved.sku||'-'} | ${resolved.unit}`:`${role}: ${Object.entries(query).map(([k,v])=>`${k} ${v}`).join(', ')} - product/price pending / producto/precio pendiente`
  evidence.push({taskId:task.id,role,id:resolved?.id||null,label,unitCost:resolved?.unitCost??null,unit:resolved?.unit||'',checkedAt:resolved?.checkedAt||'',url:resolved?.url||'',status:resolved?.status||'quote_required',freshness:resolved?.freshness||'unavailable',reason:resolved?.reason||(found.total>1?'AMBIGUOUS_OFFER':resolved?null:'NO_EXACT_PRODUCT')})
 }
 if(!requests.length)return {plan:result,snapshots:[],enabled:false}
 result.materialRequests=requests;result.materialEvidence=evidence
 for(const task of result.tasks.filter(isInteriorWallPaint)){
  const rows=evidence.filter(r=>r.taskId===task.id)
  task.product=bi(rows.map(r=>r.label).join('; '))
  task.provenance={en:'Exact internal catalog selection; public web observations or current-owner imports. No live supplier query; job ZIP and buying store are separate.',es:'Selección exacta del catálogo interno; observaciones web públicas o importaciones de esta cuenta. Sin consulta en vivo; ZIP de obra y tienda de compra son distintos.'}
 }
 return {plan:result,snapshots,enabled:true}
}
