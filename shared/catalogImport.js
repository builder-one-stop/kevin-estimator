import {researchCatalog,researchBindingIssue} from './researchCatalog.js'
import {catalogSchema} from './aiSchemas.js'
import {offerIdentity} from './priceOffers.js'
import {packageGallons} from './materialTakeoff.js'
import {assessPrice} from './priceEvidence.js'
const identity=row=>offerIdentity(row.sku?{...row,product:'',brand:'',model:''}:row)
const content=row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>!['priceVersion','priceHistory'].includes(k)).sort(([a],[b])=>a.localeCompare(b))))
// Pure preview: no persistence/network, no date/price normalization, no partial import.
export function previewCatalogImport(input,{previous=[],mode='merge',today=new Date().toISOString().slice(0,10),idFactory=()=>crypto.randomUUID()}={}){
 const errors=[],warnings=[],rows=[]
 const issue=(list,row,code,field='')=>list.push({row,code,field})
 if(!Array.isArray(input)||input.length>500||!['merge','replace'].includes(mode))return {valid:false,errors:[{row:0,code:'INVALID_BATCH',field:''}],warnings,rows,catalog:null,counts:{inserted:0,updated:0,unchanged:0,removed:0}}
 for(const [index,raw]of input.entries()){
  const number=index+1
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){issue(errors,number,'INVALID_RECORD');continue}
  let id=raw.id
  if(!id){
   const matches=previous.filter(old=>{try{return identity(old)===identity(raw)}catch{return false}})
   id=matches.length===1?matches[0].id:idFactory()
  }
  const parsed=catalogSchema.safeParse({...raw,id})
  if(!parsed.success){for(const error of parsed.error.issues)issue(errors,number,'INVALID_RECORD',error.path.join('.'));rows.push({row:number,product:String(raw.product||''),id,action:'invalid'});continue}
  const entry=parsed.data,bindingIssue=researchBindingIssue(entry);if(bindingIssue)issue(errors,number,bindingIssue,'sourceId')
  const old=previous.find(r=>r.id===id),action=old?(content(entry)===content(old)?'unchanged':'updated'):'inserted'
  rows.push({row:number,...entry,action})
  if(!['ea','gal','qt','sf','lf'].includes(entry.unit))issue(errors,number,'MATERIAL_UNIT_REQUIRED','unit')
  if(entry.unitCost!==null&&!entry.package)issue(errors,number,'PRICE_PACKAGE_MISSING','package')
  const research=researchCatalog.find(r=>r.sourceId===entry.sourceId&&r.package===entry.package)
  const gallons=packageGallons(research?{...research,...entry}:entry)
  if((entry.unit==='gal'&&gallons!==1)||(entry.unit==='qt'&&gallons!==0.25)||(['sf','lf'].includes(entry.unit)&&gallons>0))issue(errors,number,'PACKAGE_UNIT_MISMATCH','unit')
  if(/paint|primer|pintura|esmalte/i.test(entry.product)&&!(gallons>0))issue(warnings,number,'PACKAGE_TAKEOFF_PENDING','package')
  if(entry.checkedAt>today)issue(errors,number,'FUTURE_SOURCE_DATE','checkedAt')
  if(entry.validUntil&&entry.validUntil<entry.checkedAt)issue(errors,number,'INVALID_VALIDITY','validUntil')
  const assessment=assessPrice(entry,entry.verifiedZip||'',today)
  if(['SOURCE_REVIEW_DUE','PRICE_EXPIRED'].includes(assessment.reason))issue(warnings,number,'STALE_REFERENCE','checkedAt')
  if(entry.status==='verified'&&assessment.status!=='verified'&&action!=='unchanged')issue(errors,number,'LOCAL_EVIDENCE_REQUIRED','status')
  if(assessment.reason==='MARKET_MISMATCH')issue(errors,number,'MARKET_MISMATCH','country')
  if(!entry.sku)issue(warnings,number,'SKU_MISSING','sku')
  if(!entry.url||!entry.evidence)issue(warnings,number,'SOURCE_INCOMPLETE','url')
  if(old&&offerIdentity(old)!==offerIdentity(entry))issue(warnings,number,'OFFER_IDENTITY_CHANGED','id')
 }
 const ids=new Map(),identities=new Map(),sources=new Map()
 const validateDuplicate=(entry,row)=>{
  for(const [map,key,code]of [[ids,entry.id,'DUPLICATE_ID'],[identities,identity(entry),'DUPLICATE_OFFER'],[sources,entry.sourceId,'DUPLICATE_SOURCE']]){
   if(!key)continue;if(map.has(key)){issue(errors,row,code);continue}map.set(key,row)
  }
 }
 const validRows=rows.filter(r=>r.action!=='invalid')
 for(const row of validRows)validateDuplicate(row,row.row)
 const byId=new Map((mode==='replace'?[]:previous).map(row=>[row.id,structuredClone(row)]))
 for(const row of validRows){const entry={...row};delete entry.row;delete entry.action;byId.set(entry.id,entry)}
 const catalog=[...byId.values()]
 ids.clear();identities.clear();sources.clear()
 for(const entry of catalog)validateDuplicate(entry,validRows.find(r=>r.id===entry.id)?.row||0)
 if(catalog.length>500)issue(errors,0,'CATALOG_LIMIT')
 const counts={inserted:validRows.filter(r=>r.action==='inserted').length,updated:validRows.filter(r=>r.action==='updated').length,unchanged:validRows.filter(r=>r.action==='unchanged').length,removed:mode==='replace'?previous.filter(r=>!byId.has(r.id)).length:0}
 return {valid:errors.length===0,errors,warnings,rows,catalog:errors.length?null:catalog,counts}
}
