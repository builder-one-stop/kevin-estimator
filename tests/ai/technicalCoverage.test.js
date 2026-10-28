import {describe,it,expect} from 'vitest'
import {technicalCoverageFor,acceptedTechnicalCoverage,validTechnicalSnapshot} from '../../shared/technicalCoverage.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import {defaultPaintTemplate,makePaintItems,recalculatePaintDocument} from '../../shared/paintJob.js'
import {paintParameterEvidence} from '../../shared/paintEvidence.js'
import {paintPlan} from './paintProvider.js'
import {itemCostCents,reviseManualPrice,calculateEstimate} from '../../src/lib/estimateDocument.js'
import {paintLineNotes} from '../../shared/paintReconciliation.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'
import {paintTemplateSchema} from '../../shared/aiSchemas.js'
const paint=researchCatalog.find(x=>x.sourceId==='HD01'),primer=researchCatalog.find(x=>x.sourceId==='HD02'),input={lengthFt:12,widthFt:10,heightFt:8,openingsSqFt:0,useGrossWalls:true}
const row=(doc,key)=>doc.sections[0].items.find(x=>x.ruleKey===key)
const profile=technicalCoverageFor(paint,'paint'),primerProfile=technicalCoverageFor(primer,'primer')
const selection=changes=>({selectionId:'technical-primer',role:'primer',catalogId:primer.id,purchaseQuantity:null,quantityMode:'documented-coverage',technicalProfile:structuredClone(primerProfile),coverageSqFtPerGallon:300,coats:1,wastePercent:10,coverageAreaMode:'room-walls',...changes})
function document(template=defaultPaintTemplate()){const result=makePaintItems('bedroom-walls',input,template,researchCatalog);return {language:'en',proposal:{},business:{name:'Synthetic QA'},scope:{plan:structuredClone(paintPlan),revision:1},materialPricing:{externallyQueried:false,tax:null,freight:null,stock:null},sections:[{id:'bedroom-walls',title:'Bedroom',items:result.items}],rules:{paint:{'bedroom-walls':{version:'interior-walls-1',inputs:input,template,catalogSnapshots:researchCatalog,areaSqFt:352,parameterEvidence:result.parameterEvidence}}}}}
describe('explicit exact-product technical coverage',()=>{
 it('binds only the two exact existing identities, with original technical revisions, range and consulted date distinct from prices',()=>{
  expect(profile).toMatchObject({manufacturerNumber:'2750',base:'Ultra Pure White',sheen:'eggshell',range:[250,400],revision:'11/2020',consultedAt:'2026-10-28',manufacturerGuarantee:false,coverageUnit:'sf/USgal/coat'})
  expect(primerProfile).toMatchObject({manufacturerNumber:'2000',range:[300,400],revision:'03/2019 (legacy header 6/2014)'})
  expect(profile.pdfSha256).toBe('8e88f1fa499c0735d9bbc0ff40ad7e069f45010c1c2f6b677ae363cc70b916e8')
  expect(primerProfile.bridgeUrl).toContain('20941/100096395')
  expect(technicalCoverageFor({...primer,sku:'140770'},'primer')).toEqual(primerProfile)
  expect(researchCatalog.filter(x=>technicalCoverageFor(x))).toHaveLength(2)
 })
 it.each([{model:'275301'},{sku:'OTHER'},{package:'5 US gal',unit:'ea'},{product:'BEHR PREMIUM PLUS Interior Eggshell',model:'205001'},{variant:'Blue'},{brand:'Different'},{category:'primer'}])('does not transfer the BEHR sheet to altered identity %j',change=>expect(technicalCoverageFor({...paint,...change},'paint')).toBeNull())
 it('does not mutate defaults, previously reviewed documents, prices or quantities when a technical profile merely becomes available',()=>{
  const template=defaultPaintTemplate(),doc=document(template),before=JSON.stringify(doc)
  technicalCoverageFor(paint)
  expect(JSON.stringify(doc)).toBe(before);expect(row(doc,'painting:material')).toMatchObject({quantity:3,unitCost:46.98,priceDate:'2026-10-17'})
  expect(paintParameterEvidence(template,researchCatalog).coverage.status).toBe('provisional')
  expect(template).toMatchObject({coverageSqFtPerGallon:350,coats:2,wastePercent:10})
 })
 it('changes quantities only on explicit recalculation, uses the low range bound, applies coats/waste once and buys whole cans',()=>{
  const old=document(),next=recalculatePaintDocument(old,'bedroom-walls',{technicalProfile:profile,coverageSqFtPerGallon:250})
  expect(row(old,'painting:material').quantity).toBe(3)
  expect(row(next,'painting:material')).toMatchObject({quantity:4,unitCost:46.98,priceDate:'2026-10-17',takeoff:{areaSqFt:352,coats:2,wastePercent:10,requiredGallons:3.0976,packages:4},technicalCoverage:{status:'documented-range-assumption',criterion:'lower-range-bound-estimating-choice',manufacturerGuarantee:false}})
  expect(row(next,'painting:labor').quantity).toBe(row(old,'painting:labor').quantity)
  expect(next.scope).toEqual(old.scope)
 })
 it('computes primer from its separate range and explicit area/coats/waste while preserving pending labor and unknown fees',()=>{
  const doc=document({...defaultPaintTemplate(),materialSelections:[selection()]})
  expect(row(doc,'supplement:technical-primer:material')).toMatchObject({quantity:2,unit:'gal',unitCost:22.98,takeoff:{areaSqFt:352,coats:1,wastePercent:10,requiredGallons:1.2907,packages:2},technicalCoverage:{profile:{manufacturerNumber:'2000'}}})
  expect(row(doc,'supplement:primer:labor').quantityPending).toBe(true)
  expect(itemCostCents(row(doc,'supplement:primer:labor'))).toBe(0)
  expect(doc.materialPricing).toMatchObject({tax:null,freight:null,stock:null})
  const two=document({...defaultPaintTemplate(),materialSelections:[selection({coats:2})]})
  expect(row(two,'supplement:technical-primer:material')).toMatchObject({quantity:3,takeoff:{requiredGallons:2.5814,packages:3}})
  const missing=researchCatalog.map(x=>x.id===primer.id?{...x,unitCost:null,status:'quote_required'}:x),pending=makePaintItems('t',input,{...defaultPaintTemplate(),materialSelections:[selection()]},missing)
  expect(pending.items.find(x=>x.materialRole==='primer')).toMatchObject({quantity:2,quantityPending:false,priceMissing:true,price:{unitCost:null}})
  expect(pending.items.find(x=>x.ruleKey==='painting:material')).toMatchObject({quantity:3,unitCost:46.98})
 })
 it.each([{coats:null},{coverageAreaMode:null},{coverageAreaMode:'manual-area',coverageAreaSqFt:null},{coverageSqFtPerGallon:null},{wastePercent:null},{technicalProfile:null}])('keeps incomplete primer consumption pending without blocking finish paint %j',change=>{
  const doc=document({...defaultPaintTemplate(),materialSelections:[selection(change)]})
  expect(row(doc,'supplement:technical-primer:material').quantityPending).toBe(true)
  expect(row(doc,'painting:material')).toMatchObject({quantity:3,unitCost:46.98})
  expect(itemCostCents(row(doc,'supplement:technical-primer:material'))).toBe(0)
 })
 it('preserves manually scoped partial primer area across room edits, and updates explicitly selected full-wall area by code',()=>{
  const doc=document({...defaultPaintTemplate(),materialSelections:[selection()]})
  const next=recalculatePaintDocument(doc,'bedroom-walls',{}, {lengthFt:30})
  expect(row(next,'supplement:technical-primer:material')).toMatchObject({quantity:3,takeoff:{areaSqFt:640,requiredGallons:2.3467}})
  const partial=document({...defaultPaintTemplate(),materialSelections:[selection({coverageAreaMode:'manual-area',coverageAreaSqFt:100})]})
  const resized=recalculatePaintDocument(partial,'bedroom-walls',{}, {lengthFt:30})
  expect(row(resized,'supplement:technical-primer:material')).toMatchObject({quantity:1,takeoff:{areaSqFt:100,requiredGallons:.3667}})
 })
 it('preserves manual quantity/price overrides until explicitly resetting only the quantity',()=>{
  const doc=document(),item=row(doc,'painting:material');Object.assign(item,reviseManualPrice(item,{unitCost:49}),{quantity:7,ruleOverrides:{price:true,quantity:true},takeoff:undefined})
  const template={technicalProfile:profile,coverageSqFtPerGallon:250},held=recalculatePaintDocument(doc,'bedroom-walls',template)
  expect(row(held,'painting:material')).toMatchObject({quantity:7,unitCost:49,ruleOverrides:{price:true,quantity:true}})
  const reset=recalculatePaintDocument(held,'bedroom-walls',{}, {},[],{resetQuantityKeys:['painting:material']})
  expect(row(reset,'painting:material')).toMatchObject({quantity:4,unitCost:49,price:{status:'manual',previousSnapshot:{unitCost:46.98}}})
  expect(row(reset,'painting:material').ruleOverrides.quantity).toBeUndefined()
  expect(row(doc,'painting:material').ruleOverrides.quantity).toBe(true)
 })
 it('does not reuse documented coverage after a SKU change; manual fallback requires an explicit action',()=>{
  const doc=document({...defaultPaintTemplate(),technicalProfile:profile,coverageSqFtPerGallon:250})
  const other=researchCatalog.find(x=>x.sourceId==='LO01'),next=recalculatePaintDocument(doc,'bedroom-walls',{paintCatalogId:other.id})
  expect(row(next,'painting:material')).toMatchObject({quantityPending:true,unitCost:25.98,technicalCoverage:{status:'product-mismatch'},takeoff:{packages:null,requiredGallons:null}})
  const manual=recalculatePaintDocument(next,'bedroom-walls',{technicalProfile:null,coverageSqFtPerGallon:350})
  expect(row(manual,'painting:material').quantity).toBe(3);expect(row(manual,'painting:material').technicalCoverage).toBeUndefined()
  expect(manual.rules.paint['bedroom-walls'].parameterEvidence.coverage.status).toBe('provisional')
 })
 it('leaves another primer pending when the old KILZ profile no longer matches, rather than borrowing paint or primer yield',()=>{
  const doc=document({...defaultPaintTemplate(),materialSelections:[selection()]}),other=researchCatalog.find(x=>x.sourceId==='DE03')
  const next=recalculatePaintDocument(doc,'bedroom-walls',{materialSelections:[selection({catalogId:other.id})]})
  expect(row(next,'supplement:technical-primer:material')).toMatchObject({quantityPending:true,unitCost:69,technicalCoverage:{status:'product-mismatch'}})
  const manual=recalculatePaintDocument(next,'bedroom-walls',{materialSelections:[selection({catalogId:other.id,quantityMode:'manual',technicalProfile:null,purchaseQuantity:1})]})
  expect(row(manual,'supplement:technical-primer:material')).toMatchObject({quantity:1,unitCost:69,quantityPending:false})
 })
 it('retains manual purchase quantities for primer unless explicitly reset to calculation, while dimensions can change',()=>{
  const doc=document({...defaultPaintTemplate(),materialSelections:[selection()]});const item=row(doc,'supplement:technical-primer:material');Object.assign(item,{quantity:8,quantityPending:false,ruleOverrides:{quantity:true},takeoff:undefined})
  expect(row(recalculatePaintDocument(doc,'bedroom-walls',{}, {lengthFt:30}),'supplement:technical-primer:material').quantity).toBe(8)
  const reset=recalculatePaintDocument(doc,'bedroom-walls',{}, {lengthFt:30},[],{resetQuantityKeys:['supplement:technical-primer:material']})
  expect(row(reset,'supplement:technical-primer:material').quantity).toBe(3)
 })
 it('rejects modified technical evidence and keeps seller coverage overrides distinct from the manufacturer range',()=>{
  const altered={...profile,range:[1000,2000]};expect(validTechnicalSnapshot(altered)).toBe(false);expect(acceptedTechnicalCoverage(paint,altered,'paint')).toBeNull()
  expect(()=>paintTemplateSchema.parse({...defaultPaintTemplate(),technicalProfile:altered})).toThrow()
  const doc=document({...defaultPaintTemplate(),technicalProfile:profile,coverageSqFtPerGallon:200})
  expect(row(doc,'painting:material')).toMatchObject({quantity:4,technicalCoverage:{status:'manual-outside-documented-range',criterion:'seller-edited-estimating-value',range:[250,400]}})
  expect(paintLineNotes(row(doc,'painting:material'),null)).toContain('Outside published range')
 })
 it.each(['en','es'])('preserves technical/price snapshots through serialization, recalculation and coherent PDF in %s',language=>{
  const doc=document({...defaultPaintTemplate(),technicalProfile:profile,coverageSqFtPerGallon:250,materialSelections:[selection()]}),record={id:'synthetic-technical',title:'Synthetic coverage QA',version:1,status:'Draft',created_at:'2026-10-28',markup_bps:3333,document:{...doc,language}}
  Object.assign(row(record.document,'painting:material'),reviseManualPrice(row(record.document,'painting:material'),{unitCost:49},language))
  const restored=JSON.parse(JSON.stringify(record)),view=estimatePresentation(restored),pdf=buildApprovedPdf(restored).output()
  expect(view.incomplete).toBe(true);expect(view.sums).toEqual(calculateEstimate(doc,3333))
  expect(pdf).toContain('275001');expect(pdf).toContain('20941');expect(pdf).toContain('2026-10-17');expect(pdf).toContain('2026-10-28')
  expect(pdf).toContain(language==='es'?'no garant':'not a guarantee')
  expect(restored.document.rules.paint['bedroom-walls'].template.technicalProfile).toEqual(profile)
 })
})
