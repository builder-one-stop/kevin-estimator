import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {requestedMaterials,prepareMaterialPlan,MaterialCatalogService} from '../../server/materialCatalog.js'
import {makePaintItems,defaultPaintTemplate,recalculatePaintDocument} from '../../shared/paintJob.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import {defaultSettings} from '../../shared/aiSchemas.js'
import {paintPlan} from './paintProvider.js'
import {MaterialChatProvider} from './materialChatProvider.js'
import {localDatabase,LocalRepository,A} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {calculateEstimate,itemCostCents,reviseManualPrice,validateEstimate} from '../../src/lib/estimateDocument.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
const messages=text=>[{role:'user',content:text}],input={lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true,openingsSqFt:0}
const content='Paint walls 12 x10 x8 ft; paint SKU 433052; primer SKU UGPR00-1-WH-1; protection SKU 590695; protection SKU 3487100; abrasive SKU 6014059'
const extras=doc=>doc.sections[0].items.filter(x=>x.materialSelectionId)
const key=(doc,k)=>doc.sections[0].items.find(x=>x.ruleKey===k)
const settings=defaultSettings()
async function fixture(text=content){const p=await prepareMaterialPlan(paintPlan,settings,messages(text));const materialSelections=p.plan.materialEvidence.filter(x=>!['paint','repair'].includes(x.role)).map(x=>({selectionId:x.selectionId,role:x.role,catalogId:x.id,purchaseQuantity:x.role==='protection'&&x.label.includes('590695')?2:x.role==='abrasive'?3:1,requestedLabel:x.label}));const template={...defaultPaintTemplate(),materialSelections};const r=makePaintItems('bedroom-walls',input,template,p.snapshots);return {language:'en',scope:{plan:p.plan,revision:1},business:{name:'Synthetic QA'},proposal:{},materialPricing:{externallyQueried:false,tax:null,freight:null,stock:null},sections:[{id:'bedroom-walls',title:'Bedroom',items:r.items}],rules:{paint:{'bedroom-walls':{template,inputs:input,catalogSnapshots:p.snapshots,areaSqFt:352,version:'interior-walls-1'}}}}}
describe('painting multiple SKU functions',()=>{
 it('routes multiple exact identifiers by explicit role or unique catalog category, without using the last SKU as paint',()=>{
  const a=requestedMaterials(messages(content),researchCatalog)
  expect(a.find(x=>x.role==='paint')).toMatchObject({sku:'433052'})
  expect(a.filter(x=>x.role==='protection')).toHaveLength(2)
  expect(a.find(x=>x.role==='primer')).toMatchObject({sku:'UGPR00-1-WH-1'})
  expect(a.find(x=>x.role==='abrasive')).toMatchObject({sku:'6014059'})
  expect(requestedMaterials(messages('SKU 433052; SKU 590695; SKU 6014059'),researchCatalog).map(x=>x.role)).toEqual(['paint','protection','abrasive'])
  expect(requestedMaterials(messages('SKU 590695; protection SKU 590695'),researchCatalog)).toHaveLength(1)
  expect(requestedMaterials(messages(content),researchCatalog)).toEqual(a)
  expect(requestedMaterials(messages('primer SKU UGPR00-1-WH-1; primer SKU ugpr00-1-wh-1'),researchCatalog)).toHaveLength(1)
  expect(requestedMaterials(messages('consumibles SKU MISSING'),researchCatalog)[0].role).toBe('unassigned')
  const replaced=requestedMaterials([...messages(content),...messages('Change primer SKU 650132764')],researchCatalog)
  expect(replaced.filter(x=>x.role==='primer')).toHaveLength(1);expect(replaced.find(x=>x.role==='primer').sku).toBe('650132764');expect(replaced.filter(x=>x.role==='protection')).toHaveLength(2)
 })
 it('keeps multiple different paints in one request ambiguous and leaves unassigned unknown identifiers out of paint',async()=>{
  const result=await prepareMaterialPlan(paintPlan,settings,messages('Paint SKU 433052; paint SKU 31103; primer SKU NOT-EXISTING'))
  expect(result.plan.materialEvidence.find(x=>x.role==='paint')).toMatchObject({id:null,unitCost:null,reason:'MULTIPLE_PRODUCTS_FOR_ROLE'})
  expect(result.plan.materialEvidence.find(x=>x.role==='paint').label).toContain('433052 / sku 31103')
  expect(requestedMaterials(messages('SKU 433052; SKU UNKNOWN-X'),researchCatalog).find(x=>x.role==='unassigned')).toMatchObject({sku:'UNKNOWN-X'})
 })
 it.each(['primer','protection','abrasive'])('does not accept a finish-paint SKU as %s, or reuse its price',async role=>{
  const result=await prepareMaterialPlan(paintPlan,settings,messages(`Paint SKU 433052; ${role} SKU 433052`))
  expect(result.plan.materialEvidence.find(x=>x.role===role)).toMatchObject({id:null,unitCost:null,reason:'WRONG_MATERIAL_ROLE'})
  expect(result.plan.materialEvidence.find(x=>x.role==='paint')).toMatchObject({unitCost:46.98})
 })
 it('separates primer and two protection packs, replaces phase allowances once, and counts no inferred primer labor',async()=>{
  const doc=await fixture()
  expect(extras(doc)).toHaveLength(4)
  expect(extras(doc).find(x=>x.materialRole==='primer')).toMatchObject({quantity:1,unitCost:69,unit:'gal',price:{sku:'UGPR00-1-WH-1',checkedAt:'2026-10-17'}})
  expect(extras(doc).filter(x=>x.materialRole==='protection').map(x=>x.quantity)).toEqual([2,1])
  expect(key(doc,'protection:material')).toBeUndefined();expect(key(doc,'preparation:material')).toBeUndefined()
  expect(key(doc,'cleanup:material')).toBeTruthy()
  expect(doc.sections[0].items.filter(x=>x.costType==='labor'&&!x.quantityPending)).toHaveLength(5)
  expect(key(doc,'supplement:primer:labor')).toMatchObject({quantityPending:true,unitCost:75,unit:'hr'})
  expect(itemCostCents(key(doc,'supplement:primer:labor'))).toBe(0)
  expect(calculateEstimate(doc,3333).costCents).toBe(81003)
 })
 it('keeps missing primer price and quantities pending while preserving calculated finish paint and labor',async()=>{
  const p=await prepareMaterialPlan(paintPlan,settings,messages('Paint SKU 433052; primer SKU 650132764'))
  const s=p.plan.materialEvidence.find(x=>x.role==='primer')
  const r=makePaintItems('t',input,{...defaultPaintTemplate(),materialSelections:[{selectionId:s.selectionId,role:'primer',catalogId:s.id,purchaseQuantity:null}]},p.snapshots)
  const primer=r.items.find(x=>x.materialRole==='primer')
  expect(primer).toMatchObject({quantityPending:true,priceMissing:true,price:{unitCost:null,sku:'650132764'}})
  expect(r.items.find(x=>x.ruleKey==='painting:material')).toMatchObject({quantity:3,unitCost:46.98})
  expect(r.items.find(x=>x.ruleKey==='painting:labor').quantity).toBe(4.7)
  expect(itemCostCents(primer)).toBe(0)
 })
 it('recalculates geometry without scaling manual consumption, preserves overrides and keeps prior function snapshots after a substitution',async()=>{
  let doc=await fixture(),primer=extras(doc).find(x=>x.materialRole==='primer'),oldId=primer.catalogId
  Object.assign(primer,reviseManualPrice(primer,{unitCost:70}),{quantity:2,quantityPending:false,ruleOverrides:{price:true,quantity:true}})
  doc=recalculatePaintDocument(doc,'bedroom-walls',{}, {lengthFt:13})
  expect(extras(doc).find(x=>x.materialRole==='primer')).toMatchObject({quantity:2,unitCost:70,price:{status:'manual',previousSnapshot:{unitCost:69}}})
  expect(key(doc,'painting:labor').quantity).toBe(4.91)
  const next=researchCatalog.find(x=>x.sourceId==='CA02'),selections=doc.rules.paint['bedroom-walls'].template.materialSelections.map(x=>x.role==='primer'?{...x,catalogId:next.id,purchaseQuantity:null}:x)
  doc=recalculatePaintDocument(doc,'bedroom-walls',{materialSelections:selections},{},[next])
  primer=extras(doc).find(x=>x.materialRole==='primer')
  expect(primer).toMatchObject({unitCost:52.1,quantityPending:true,quantityPendingReason:'PACKAGE_CHANGED',previousMaterialSelection:{price:{status:'manual',previousSnapshot:{sku:'UGPR00-1-WH-1'}}}})
  expect(oldId).not.toBe(primer.catalogId)
  expect(key(doc,'painting:material').price.sku).toBe('433052')
  const restored=recalculatePaintDocument(JSON.parse(JSON.stringify(doc)),'bedroom-walls',{}, {})
  expect(extras(restored).find(x=>x.materialRole==='primer').quantityPending).toBe(true)
 })
 it('leaves pending primer labor and direct-cost burden explicit without deriving extra hours',async()=>{
  const doc=await fixture(),t={...doc.rules.paint['bedroom-walls'].template,laborRateMode:'direct_cost',laborBurdenPercent:null}
  const items=makePaintItems('t',input,t,researchCatalog).items
  expect(items.find(x=>x.ruleKey==='supplement:primer:burden')).toMatchObject({priceMissing:true,quantityPending:true})
 })
 it('removes only explicitly removed functions and restores their phase allowance without compounding',async()=>{
  const doc=await fixture(),materialSelections=doc.rules.paint['bedroom-walls'].template.materialSelections.filter(x=>x.role!=='protection')
  const rebuilt=recalculatePaintDocument(doc,'bedroom-walls',{materialSelections})
  expect(extras(rebuilt).some(x=>x.materialRole==='protection')).toBe(false)
  expect(key(rebuilt,'protection:material')).toMatchObject({quantity:352,unitCost:.08})
  expect(key(rebuilt,'preparation:material')).toBeUndefined()
  expect(recalculatePaintDocument(rebuilt,'bedroom-walls')).toEqual(rebuilt)
 })
 it('preserves a manual phase allowance as inactive history while itemized, and restores it only after removing that function',async()=>{
  const doc=await fixture(),without=doc.rules.paint['bedroom-walls'].template.materialSelections.filter(x=>x.role!=='protection')
  let changed=recalculatePaintDocument(doc,'bedroom-walls',{materialSelections:without})
  const allowance=key(changed,'protection:material');Object.assign(allowance,reviseManualPrice(allowance,{unitCost:.2}),{ruleOverrides:{price:true}})
  changed=recalculatePaintDocument(changed,'bedroom-walls',{materialSelections:doc.rules.paint['bedroom-walls'].template.materialSelections})
  expect(key(changed,'protection:material')).toBeUndefined()
  expect(changed.rules.paint['bedroom-walls'].retiredMaterialAllowances['protection:material']).toMatchObject({unitCost:.2,price:{status:'manual'}})
  changed=recalculatePaintDocument(changed,'bedroom-walls',{materialSelections:without},{lengthFt:13})
  expect(key(changed,'protection:material')).toMatchObject({quantity:368,unitCost:.2,price:{status:'manual'}})
 })
 it('rejects fractional purchase packages but allows a pending line and fractional labor hours',async()=>{
  const doc=await fixture();extras(doc)[0].quantity=1.5
  expect(validateEstimate(doc,3333)).toBe('Purchase packages must be whole numbers')
  extras(doc)[0].quantity=null;expect(validateEstimate(doc,3333)).toBe('Purchase packages must be whole numbers')
  extras(doc)[0].quantityPending=true
  expect(validateEstimate(doc,3333)).toBeNull()
 })
 it('does not carry a manual unknown-primer price into a different material function',async()=>{
  let doc=await fixture('Paint SKU 433052; primer SKU MISSING-PRIMER')
  const primer=extras(doc)[0];Object.assign(primer,reviseManualPrice(primer,{unitCost:70}),{quantity:2,quantityPending:false,ruleOverrides:{price:true,quantity:true}})
  const materialSelections=doc.rules.paint['bedroom-walls'].template.materialSelections.map(x=>({...x,role:'protection',catalogId:null}))
  doc=recalculatePaintDocument(doc,'bedroom-walls',{materialSelections})
  expect(extras(doc)[0]).toMatchObject({priceMissing:true,quantityPending:true,unitCost:0,previousMaterialSelection:{price:{status:'manual'}}})
  expect(extras(doc)[0].price.unitCost).toBeNull()
 })
 it('keeps an incompatible price-per-linear-foot entry pending instead of pricing a complete package as one foot',()=>{
  const source={...researchCatalog.find(x=>x.sourceId==='LO04'),unit:'lf'}
  const items=makePaintItems('t',input,{...defaultPaintTemplate(),materialSelections:[{selectionId:'test-unit',role:'protection',catalogId:source.id,purchaseQuantity:1}]},[...researchCatalog.filter(x=>x.id!==source.id),source]).items
  expect(items.find(x=>x.materialSelectionId)).toMatchObject({quantityPending:true,quantityPendingReason:'PURCHASE_UNIT_REVIEW',unit:'lf',unitCost:8.28})
  expect(itemCostCents(items.find(x=>x.materialSelectionId))).toBe(0)
  const line=items.find(x=>x.materialSelectionId);line.quantityPending=false
  const doc={sections:[{title:'Synthetic',items}],proposal:{}}
  expect(validateEstimate(doc,3333)).toBe('Review purchase package price unit')
  Object.assign(line,reviseManualPrice(line,{unit:'ea',unitCost:10}))
  expect(validateEstimate(doc,3333)).toBeNull()
 })
 it('does not change exact role lookup into equivalence or permit duplicate selection keys',async()=>{
  expect(new MaterialCatalogService().search({role:'primer',sku:'433052'}).total).toBe(0)
  const p=structuredClone(paintPlan);p.materialRequests=[{taskId:'bedroom-walls',role:'paint',sku:'433052'},{taskId:'bedroom-walls',role:'paint',sku:'31103'}]
  await expect(prepareMaterialPlan(p,settings,[])).rejects.toThrow('DUPLICATE_MATERIAL_SELECTION')
 })
 it.each(['en','es'])('persists independently approved function snapshots, manual quantities, reload and history restoration with matching PDF in %s',async language=>{
  const db=await localDatabase()
  try{
   const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new MaterialChatProvider(),{logger:()=>{}})
   let row=await engine.create(A,{id:randomUUID(),title:'Synthetic material functions QA',language})
   const command=async(action,extra={})=>{row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action,...extra});for(let i=0;i<400&&row.state.run?.status==='working';i++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)};expect(row.state.run?.status).not.toBe('error')}
   await command('message',{content});expect(row.state.plan.pending).toEqual([])
   const plan=structuredClone(row.state.plan);for(const s of plan.materialRequests)if(!['paint','repair'].includes(s.role))s.purchaseQuantity=1
   await command('savePlan',{plan});await command('approve',{revision:row.state.planRevision});await command('generate')
   const original=await repo.estimate(A,row.estimate_id)
   expect(extras(original.document)).toHaveLength(4)
   expect(original.document.rules.paint['bedroom-walls'].catalogSnapshots.some(x=>x.sku==='UGPR00-1-WH-1')).toBe(true)
   let doc=recalculatePaintDocument(original.document,'bedroom-walls',{}, {lengthFt:13})
   const primer=extras(doc).find(x=>x.materialRole==='primer');Object.assign(primer,{quantity:2,quantityPending:false,ruleOverrides:{quantity:true}})
   doc=recalculatePaintDocument(doc,'bedroom-walls')
   row=await repo.commit(A,row,row.version,{...original,document:doc},original.version,'synthetic-manual-qa')
   const saved=await repo.estimate(A,row.estimate_id)
   expect(extras(saved.document).find(x=>x.materialRole==='primer').quantity).toBe(2)
   const view=estimatePresentation(saved),pdf=buildApprovedPdf(saved).output()
   expect(view.incomplete).toBe(true);expect(pdf).toContain('UGPR00-1-WH-1');expect(pdf).toContain('590695');expect(pdf).toContain(language==='es'?'PRESUPUESTO PRELIMINAR':'PRELIMINARY BUDGET')
   expect(view.sums).toEqual(calculateEstimate(saved.document,saved.markup_bps))
   await command('restore',{estimateVersion:saved.version,restoreVersion:original.version})
   const restored=await repo.estimate(A,row.estimate_id)
   expect(restored.document.rules.paint['bedroom-walls'].areaSqFt).toBe(352)
   expect(extras(restored.document).find(x=>x.materialRole==='primer')).toMatchObject({quantity:1,price:{sku:'UGPR00-1-WH-1',checkedAt:'2026-10-17'}})
  }finally{await db.close()}
 },30000)
})
