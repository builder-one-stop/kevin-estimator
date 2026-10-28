import {describe,it,expect} from 'vitest'
import {defaultPaintTemplate,makePaintItems,paintDimensions,paintMarkupBps,paintMarginPercent,recalculatePaintDocument} from '../../shared/paintJob.js'
import {paintPackages} from '../../shared/materialTakeoff.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import {reconcilePaintExpenses,paintLineNotes} from '../../shared/paintReconciliation.js'
import {itemCostCents,calculateEstimate,proposalPrices} from '../../src/lib/estimateDocument.js'
import {directEstimateChange} from '../../shared/estimateCommands.js'
import {paintPlan} from './paintProvider.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'
const input={lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true,openingsSqFt:0}
const template=defaultPaintTemplate()
const row=(d,key)=>d.sections[0].items.find(x=>x.ruleKey===key)
function document(t=template,catalog=researchCatalog){const result=makePaintItems('bedroom-walls',input,t,catalog);return {language:'en',business:{name:'Synthetic QA'},proposal:{},scope:{plan:structuredClone(paintPlan),revision:1},sections:[{id:'bedroom-walls',title:'Synthetic room',items:result.items}],rules:{paint:{'bedroom-walls':{template:t,inputs:input,catalogSnapshots:catalog,areaSqFt:352,version:'interior-walls-1'}}}}}
describe('painting precision audit matrix',()=>{
 it.each([[350,1,0,1,1,1],[350,2,10,1,2.2,3],[350,2,10,5,2.2,1],[1750,1,0,5,5,1],[1750.00001,1,0,5,5.0001,2],[350,1,0,.25,1,4]])('whole package boundary area %s coats %s waste %s pack %s',(area,coats,waste,pack,gallons,count)=>{expect(paintPackages({areaSqFt:area,coats,coverageSqFtPerGallon:350,wastePercent:waste,packageGallons:pack})).toEqual({requiredGallons:gallons,packages:count})})
 it.each(['-12 x10 x8 ft','12 x -10 x8 ft','12 x10 x−8 ft','1,5 x10 x8 ft','1e3 x10 x8 ft','12 ft x10 x2 m','5 ft 6 in x10 x8 ft'])('does not guess invalid or ambiguous geometry %s',text=>expect(paintDimensions({measurements:{en:text}})).toBeNull())
 it('converts inches and exact metric lengths without rounding dimensions before area',()=>{
  const task=text=>({measurements:{en:text}})
  expect(paintDimensions(task('144 x120 x96 in'))).toEqual(input)
  expect(paintDimensions(task('12 x10 x8 ft; SKU MODEL-123'))).toEqual(input)
  expect(paintDimensions(task('3.6576 x3.048 x2.4384 m'))).toEqual(input)
  expect(paintDimensions(task('1 x1 x1 m')).lengthFt).toBeCloseTo(1/.3048,12)
  expect(paintDimensions(task('12 ft x120 in x2.4384 m'))).toEqual(input)
 })
 it('waste affects only paint, coats only painting labor, consumables use wall area once and openings deduct once',()=>{
  const one=makePaintItems('t',input,{...template,coats:1,wastePercent:0},researchCatalog)
  const two=makePaintItems('t',input,{...template,coats:2,wastePercent:100},researchCatalog)
  const find=(r,key)=>r.items.find(x=>x.ruleKey===key)
  expect(two.takeoff.requiredGallons).toBe(4.0229)
  expect(find(two,'painting:labor').quantity).toBe(4.7)
  for(const phase of ['protection','preparation','cleanup'])expect(find(two,phase+':material')).toMatchObject({quantity:352,unitCost:find(one,phase+':material').unitCost})
  expect(makePaintItems('t',{...input,openingsSqFt:32,useGrossWalls:false},template,researchCatalog).areaSqFt).toBe(320)
  expect(makePaintItems('t',{...input,openingsSqFt:32},template,researchCatalog).areaSqFt).toBe(352)
 })
 it('keeps repair labor counts separate from an explicit whole purchase allowance and retains legacy templates',()=>{
  const doc=document({...template,patchCount:8,repairPackages:1})
  expect(row(doc,'repair:material').quantity).toBe(1);expect(row(doc,'repair:labor').quantity).toBe(1)
  expect(row(doc,'repair:material').notes).toContain('not yield per hole')
  const legacy={...template,patchCount:8};delete legacy.repairPackages
  expect(row(document(legacy),'repair:material').quantity).toBe(8)
  expect(row(document({...template,patchCount:0,repairPackages:1}),'repair:material').quantity).toBe(0)
  expect(()=>document({...template,repairPackages:1.5})).toThrow('INVALID_REPAIR_PACKAGES')
 })
 it('uses per-package cost for a five-gallon pail and rejects incompatible price units',()=>{
  const p={...researchCatalog[0],id:'synthetic-five',package:'5 US gal',packageData:null,conversion:null,unit:'ea',unitCost:100}
  expect(row(document({...template,paintCatalogId:p.id},[p]),'painting:material')).toMatchObject({quantity:1,unit:'ea',unitCost:100,takeoff:{packages:1,packageGallons:5}})
  expect(()=>document({...template,paintCatalogId:p.id},[{...p,unit:'gal'}])).toThrow('PRODUCT_COVERAGE_MISMATCH')
  const nominal=researchCatalog.find(r=>r.sourceId==='LO01')
  expect(row(document({...template,paintCatalogId:nominal.id}),'painting:material')).toMatchObject({unit:'ea',quantity:3,takeoff:{packageGallons:.96875}})
 })
 it('rounds costs consistently in generation, recalculation and proposal cent allocation',()=>{
  const p={...researchCatalog[0],id:'synthetic-price',unitCost:.335}
  const doc=document({...template,paintCatalogId:p.id,expensesPercent:100},[p])
  const after=reconcilePaintExpenses(doc)
  expect(row(doc,'expenses:expenses').unitCost).toBe(row(after,'expenses:expenses').unitCost)
  const cost=doc.sections[0].items.filter(x=>x.ruleKey!=='expenses:expenses').reduce((sum,r)=>sum+itemCostCents(r),0)
  expect(row(doc,'expenses:expenses').unitCost).toBe(cost/100)
  expect([...proposalPrices(doc,3333).values()].reduce((a,b)=>a+b,0)).toBe(calculateEstimate(doc,3333).priceCents)
  expect(paintMarkupBps(25)).toBe(3333);expect(paintMarginPercent(2500)).toBe(20)
 })
 it.each([{lengthFt:0},{openingsSqFt:352,useGrossWalls:false},{lengthFt:1e8}])('rejects zero or out-of-range surface without generating a priced order %j',changes=>expect(()=>makePaintItems('t',{...input,...changes},template,researchCatalog)).toThrow())
 it('rejects arithmetic overflow without imposing an invented coverage rate',()=>expect(()=>paintPackages({areaSqFt:352,coats:2,coverageSqFtPerGallon:1e-300,wastePercent:0,packageGallons:1})).toThrow('INVALID_PAINT_TAKEOFF'))
 it('keeps known package quantities when price is missing, and excludes unknowns from expenses',()=>{
  const p={...researchCatalog[0],unitCost:null,status:'quote_required'}
  const doc=document(template,[p]),paint=row(doc,'painting:material')
  expect(paint).toMatchObject({quantity:3,priceMissing:true,price:{unitCost:null}})
  expect(itemCostCents(paint)).toBe(0)
  expect(row(reconcilePaintExpenses(doc),'expenses:expenses').unitCost).toBe(row(doc,'expenses:expenses').unitCost)
 })
 it('preserves manual quantities on recalculation but requires confirmation after changing the purchase package',()=>{
  let doc=document();Object.assign(row(doc,'painting:material'),{quantity:4,ruleOverrides:{quantity:true},takeoff:undefined})
  const five={...researchCatalog[0],id:'synthetic-five',unit:'ea',package:'5 US gal',packageData:null,conversion:null}
  doc=recalculatePaintDocument(doc,'bedroom-walls',{paintCatalogId:five.id},{},[five])
  expect(row(doc,'painting:material')).toMatchObject({quantity:4,quantityPending:true,quantityPendingReason:'PACKAGE_CHANGED',previousPurchaseQuantity:{quantity:4,unit:'gal'}})
  doc=recalculatePaintDocument(doc,'bedroom-walls',{}, {lengthFt:13})
  expect(row(doc,'painting:material').quantityPending).toBe(true)
  const record={id:'synthetic',version:1,markup_bps:3333,title:'Synthetic',created_at:'2026-10-28',document:doc}
  const changed=directEstimateChange(record,'Set BEHR ULTRA to 1 ea',2)
  expect(changed.pending).toBeTruthy()
  const resolved=changed.pending.document
  expect(row(resolved,'painting:material')).toMatchObject({quantity:1,quantityPending:false})
  expect(row(recalculatePaintDocument(resolved,'bedroom-walls',{},{}),'painting:material').quantityPending).toBe(false)
  for(const language of ['en','es']){
   const restored=JSON.parse(JSON.stringify({...record,document:{...doc,language}}))
   expect(estimatePresentation(restored).scope[0].blocks.find(x=>x.key==='product').value).toContain(language==='es'?'Referencia del plan aprobado':'Approved plan reference')
   expect(estimatePresentation(restored).assumptions).toContain(language==='es'?'Supuestos del plan original':'Original plan assumptions')
   expect(estimatePresentation(restored).sums.priceCents).toBe(calculateEstimate(doc,3333).priceCents)
   expect(paintLineNotes(row(doc,'painting:material'),null,language)).toContain(language==='es'?'confirma una nueva cantidad':'confirm a new purchase quantity')
   expect(buildApprovedPdf(restored).output()).toContain(language==='es'?'PRESUPUESTO PRELIMINAR':'PRELIMINARY BUDGET')
  }
 })
})
