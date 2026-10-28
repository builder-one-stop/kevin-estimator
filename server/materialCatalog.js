import {z} from 'zod'
import {effectiveCatalog} from '../shared/researchCatalog.js'
import {catalogPriceSnapshot} from '../shared/catalogPricing.js'
import {defaultPaintTemplate,isInteriorWallPaint} from '../shared/paintJob.js'
import {matchesMaterialRole,materialTextSuggestion,materialRoles} from '../shared/materialSelection.js'
import {catalogSchema} from '../shared/aiSchemas.js'
import {InternalCatalogProvider,resolvePrice} from './pricing.js'
import {requestedMaterials,materialSlot} from './materialIntent.js'
export {requestedMaterial,requestedMaterials} from './materialIntent.js'
const normalize=x=>String(x??'').trim().toLowerCase()
export const materialQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(40).default(40),offset:z.coerce.number().int().min(0).max(1000).default(0),id:z.string().max(80).optional(),sku:z.string().max(100).optional(),model:z.string().max(100).optional(),variant:z.string().max(200).optional(),package:z.string().max(200).optional(),vendor:z.string().max(200).optional(),storeId:z.string().max(100).optional(),storeZip:z.string().regex(/^\d{5}$/).optional(),role:z.enum(materialRoles).optional(),q:z.string().max(200).optional()}).strict()
export class MaterialCatalogService{
 constructor(settings={}){this.rows=settings.catalogIsEffective?settings.catalog:effectiveCatalog(settings.catalog||[])}
 search(raw={}){
  const query=materialQuerySchema.parse(raw)
  const rows=this.rows.filter(row=>matchesMaterialRole(row,query.role)&&['id','sku','model','variant','package','vendor'].every(key=>!query[key]||normalize(row[key])===normalize(query[key]))&&
   (!query.storeId||row.offer?.storeId===query.storeId)&&(!query.storeZip||row.offer?.storeZip===query.storeZip)&&
   (!query.q||materialTextSuggestion(row,query.q)))
  const {offset,limit}=query
  return {rows:rows.slice(offset,offset+limit),total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,matchType:query.q?'suggestions':Object.keys(query).some(k=>!['role','offset','limit'].includes(k))?'exact':'catalog',externallyQueried:false}
 }
 async resolve(entry,jobZip=''){
  if(entry.unitCost===null)return {...structuredClone(entry),...catalogPriceSnapshot(entry,jobZip),category:entry.category}
  const canonical=catalogSchema.parse(Object.fromEntries(Object.keys(catalogSchema.shape).filter(k=>Object.hasOwn(entry,k)).map(k=>[k,entry[k]])))
  const price=await resolvePrice(new InternalCatalogProvider([canonical]),canonical,catalogPriceSnapshot(entry,jobZip), {timeoutMs:500})
  return {...structuredClone(entry),...price,category:entry.category,priceCategory:price.category,unitCost:price.unitCost??null}
 }
}
export async function prepareMaterialPlan(plan,settings,messages=[]){
 const result=structuredClone(plan),service=new MaterialCatalogService(settings),snapshots=[]
 const template={...defaultPaintTemplate(),...settings.paintTemplate},explicit=requestedMaterials(messages,service.rows)
 const requests=[],evidence=[],seen=new Set()
 for(const task of result.tasks.filter(isInteriorWallPaint)){
 const selections=plan.materialRequests?.filter(r=>r.taskId===task.id)
 const active=selections?.length?selections:[...['paint','repair'].map(role=>explicit.find(r=>r.role===role)||{role}),...explicit.filter(r=>!['paint','repair'].includes(r.role))]
 for(const chosen of active){
  const role=chosen.role
  const selectionKey=task.id+':'+(chosen.selectionId||role)
  if(seen.has(selectionKey))throw Error('DUPLICATE_MATERIAL_SELECTION')
  seen.add(selectionKey)
  const defaultId=template[role==='paint'?'paintCatalogId':role==='repair'?'repairCatalogId':'no-default']
  const approvedText=[task.product.en,task.product.es].join(' ').toLowerCase()
  const defaultRow=service.rows.find(row=>row.id===defaultId)
  const useDefault=defaultRow&&approvedText.includes(defaultRow.product.toLowerCase())&&approvedText.includes(defaultRow.brand.toLowerCase())
  const hasQuery=['id','sku','model'].some(k=>Object.hasOwn(chosen,k))
  const query=hasQuery?(chosen.id===''?{id:'unselected'}:Object.fromEntries(['id','sku','model','variant','package','vendor','storeId','storeZip'].filter(k=>chosen[k]).map(k=>[k,chosen[k]]))):{id:useDefault?defaultId:'unselected'}
  const alternative=chosen?.alternativeFor?{alternativeFor:chosen.alternativeFor,alternativeAccepted:chosen.alternativeAccepted===true}:{}
  const found=service.search({...query,role}),entry=found.rows.length===1&&(!alternative.alternativeFor||alternative.alternativeAccepted)?found.rows[0]:null
  const resolved=entry?await service.resolve(entry,result.pricingContext?.jobZip??result.zip):null
  if(resolved){if(alternative.alternativeAccepted)resolved.referenceSelection={kind:'accepted-alternative',requested:alternative.alternativeFor,accepted:true};snapshots.push(resolved)}
  const details=Object.fromEntries(['selectionId','purchaseQuantity','requestedLabel','selectionReason'].filter(k=>chosen[k]!==undefined).map(k=>[k,chosen[k]]))
  if(!['paint','repair'].includes(role))details.selectionId=chosen.selectionId||materialSlot(role,query)
  const request={taskId:task.id,role,...details,...query,...alternative}
  requests.push(request)
  const label=resolved?`${resolved.vendor} | ${resolved.brand} ${resolved.product} | ${resolved.package} | SKU ${resolved.sku||'-'} | ${resolved.unit}`:`${role}: ${chosen.requestedLabel||Object.entries(query).map(([k,v])=>`${k} ${v}`).join(', ')} - product/price pending / producto/precio pendiente`
  evidence.push({taskId:task.id,role,...details,...alternative,id:resolved?.id||null,label,unitCost:resolved?.unitCost??null,unit:resolved?.unit||'',checkedAt:resolved?.checkedAt||'',url:resolved?.url||'',status:resolved?.status||'quote_required',freshness:resolved?.freshness||'unavailable',reason:chosen.selectionReason||resolved?.reason||(alternative.alternativeFor&&!alternative.alternativeAccepted?'ALTERNATIVE_NOT_ACCEPTED':found.total>1?'AMBIGUOUS_OFFER':resolved?null:service.search(query).total?'WRONG_MATERIAL_ROLE':'NO_EXACT_PRODUCT')})
 }
 }
 if(!requests.length)return {plan:result,snapshots:[],enabled:false}
 result.materialRequests=requests;result.materialEvidence=evidence
 for(const task of result.tasks.filter(isInteriorWallPaint)){
  const rows=evidence.filter(r=>r.taskId===task.id)
  task.product={en:rows.map(r=>(r.alternativeAccepted?`Accepted budgeting alternative for ${r.alternativeFor}; equivalence not confirmed. `:'')+r.label).join('; '),es:rows.map(r=>(r.alternativeAccepted?`Alternativa referencial aceptada para ${r.alternativeFor}; sin equivalencia confirmada. `:'')+r.label).join('; ')}
  task.provenance={en:'Exact internal catalog selection; public web observations or current-owner imports. No live supplier query; job ZIP and buying store are separate.',es:'Selección exacta del catálogo interno; observaciones web públicas o importaciones de esta cuenta. Sin consulta en vivo; ZIP de obra y tienda de compra son distintos.'}
 }
 return {plan:result,snapshots,enabled:true}
}
