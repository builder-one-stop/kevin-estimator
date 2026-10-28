import {effectiveCatalog} from './researchCatalog.js'
import {assessPrice} from './priceEvidence.js'
import {packageGallons} from './materialTakeoff.js'
export function catalogMaintenance(managed=[],today=new Date().toISOString().slice(0,10)){
 const records=effectiveCatalog(managed),reviews=records.map(row=>{
  const assessment=assessPrice(row,row.verifiedZip||'',today),reasons=[]
  if(row.unitCost===null)reasons.push('PRICE_MISSING')
  if(!row.package)reasons.push('PACKAGE_MISSING')
  if(!row.sku)reasons.push('SKU_MISSING')
  if(assessment.reason&&!reasons.includes(assessment.reason))reasons.push(assessment.reason)
  const paint=row.category==='interior_paint'||(!row.category&&/paint|pintura/i.test(row.product))
  if(paint&&!(packageGallons(row)>0)&&row.package)reasons.push('PACKAGE_TAKEOFF_PENDING')
  return {id:row.id,product:row.product,sku:row.sku,package:row.package,unit:row.unit,unitCost:row.unitCost,checkedAt:row.checkedAt,url:row.url,reasons}
 })
 return {records:records.length,withAmount:records.filter(r=>r.unitCost!==null).length,withoutAmount:records.filter(r=>r.unitCost===null).length,
  stale:reviews.filter(r=>r.reasons.some(reason=>['SOURCE_REVIEW_DUE','PRICE_EXPIRED'].includes(reason))).length,
  queue:reviews.filter(r=>r.reasons.length).sort((a,b)=>Number(b.unitCost===null)-Number(a.unitCost===null)||(a.checkedAt||'').localeCompare(b.checkedAt||'')),externallyQueried:false}
}
