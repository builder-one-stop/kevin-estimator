import {it,expect} from 'vitest'
import {constructionLibrary,tradeDefaultProducts} from '../../shared/constructionLibrary.js'
import {drywallObservations,excludedResearch,laborBenchmarks} from '../../shared/research/drywallSources.js'
import {calculateTrade,tradeDefaults} from '../../shared/tradeRules.js'
import {makePaintItems,defaultPaintTemplate} from '../../shared/paintJob.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import {laborBasis} from '../../shared/laborBasis.js'
import {drywallFinishingItems,addDrywallFinishing} from '../../shared/drywallFinishing.js'
import {localTradePlan,buildLocalTradeDocument} from '../../shared/localTradePlan.js'
import {estimateCostEvidence} from '../../shared/costEvidence.js'
import {combineApprovedEstimates} from '../../shared/mixedWork.js'
import {calculateEstimate} from '../../src/lib/estimateDocument.js'
import {reconcileEstimateExpenses} from '../../shared/estimateReconciliation.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {assertDocument} from '../../shared/aiDomain.js'
const p=trade=>constructionLibrary.records.find(r=>r.id===tradeDefaultProducts[trade])
const base=()=>{const plan=localTradePlan({trade:'drywall',inputs:{lengthFt:40,widthFt:8}});return buildLocalTradeDocument(plan,'en')}
it('imports four primary public references, retains panel price missing and excludes out-of-market defaults/benchmarks',()=>{
 expect(drywallObservations).toHaveLength(4);expect(p('drywall').unitCost).toBeNull();expect(constructionLibrary.records).toHaveLength(34)
 expect(drywallObservations.every(r=>r.localVerified===false&&r.autoEligible===false)).toBe(true)
 expect(constructionLibrary.records.some(r=>r.model==='114CDWS1')).toBe(false);expect(excludedResearch[0].reason).toContain('TN');expect(laborBenchmarks.autoDefault).toBe(false)
})
it('separates direct rate and burden, never doubles burden on contractor cost or substitutes statistical wages',()=>{
 expect(()=>laborBasis({hourlyRate:30,laborRateMode:'contractor_cost',laborBurdenPercent:25})).toThrow('LABOR_BURDEN_ALREADY_INCLUDED')
 const result=calculateTrade('lvp',{lengthFt:20,widthFt:20},{...tradeDefaults.lvp,hourlyRate:30,laborRateMode:'direct_cost',laborBurdenPercent:25},p('lvp'))
 expect(result.items.find(i=>i.ruleKey==='trade:burden').unitCost).toBe(7.5)
 expect(result.items.filter(i=>i.ruleKey==='trade:labor')).toHaveLength(1)
 const missing=calculateTrade('lvp',{lengthFt:20,widthFt:20},{...tradeDefaults.lvp,hourlyRate:30,laborRateMode:'direct_cost',laborBurdenPercent:null},p('lvp'));expect(missing.incompletePrice).toBe(true);expect(missing.items.find(i=>i.ruleKey==='trade:burden').priceMissing).toBe(true)
 expect(calculateTrade('lvp',{lengthFt:20,widthFt:20},{...tradeDefaults.lvp,hourlyRate:30},p('lvp')).items.some(i=>i.ruleKey==='trade:burden')).toBe(false)
})
it('calculates paint labor burden by phase once and keeps unknown burden excluded from known expenses',()=>{
 const template={...defaultPaintTemplate(),laborRateMode:'direct_cost',hourlyRate:30,laborBurdenPercent:25},inputs={lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true}
 const x=makePaintItems('paint',inputs,template,researchCatalog)
 expect(x.items.filter(i=>i.ruleKey.endsWith(':burden'))).toHaveLength(5);expect(x.items.filter(i=>i.ruleKey.endsWith(':labor'))).toHaveLength(5)
 for(const item of x.items.filter(i=>i.ruleKey.endsWith(':burden')))expect(item.unitCost).toBe(7.5)
})
it.each(['en','es'])('adds joint finishing only on confirmed scope, calculates pails/tape and exports pending suppliers in %s',language=>{
 const config={boardAreaSqFt:320,measuredJointLengthFt:44,wastePercent:10,finishingSqFtPerHour:null,hourlyRate:0,expensesPercent:5,includeFasteners:true,includeRemoval:true}
 const items=drywallFinishingItems(config,language)
 expect(items.find(i=>i.ruleKey==='finish:compound')).toMatchObject({quantity:1,unitCost:26.99})
 expect(items.find(i=>i.ruleKey==='finish:tape')).toMatchObject({quantity:1,unitCost:6.59})
 expect(items.find(i=>i.ruleKey==='finish:sanding').priceMissing).toBe(true)
 const doc={...base(),language},id=doc.sections[0].id
 expect(()=>addDrywallFinishing(doc,id,config)).toThrow('SCOPE_CONFIRMATION_REQUIRED')
 const added=addDrywallFinishing(doc,id,config,{scopeConfirmed:true});assertDocument(added,2500)
 expect(()=>addDrywallFinishing(added,id,config,{scopeConfirmed:true})).toThrow('DUPLICATE_FINISHING_SCOPE')
 expect(reconcileEstimateExpenses(reconcileEstimateExpenses(added))).toEqual(reconcileEstimateExpenses(added))
 const pdf=buildApprovedPdf({id:'qa',title:'QA drywall joint finish',version:1,markup_bps:2500,document:added}).output();expect(pdf).toContain(language==='es'?'PRESUPUESTO PRELIMINAR':'PRELIMINARY BUDGET')
 expect(drywallFinishingItems({...config,measuredJointLengthFt:null},language).find(i=>i.ruleKey==='finish:tape').quantityPending).toBe(true)
 const missingLibrary=structuredClone(constructionLibrary);missingLibrary.records.find(r=>r.id==='ace-12922').unitCost=null
 expect(drywallFinishingItems(config,language,missingLibrary).find(i=>i.ruleKey==='finish:compound').priceMissing).toBe(true)
})
it('keeps evidence categorical, package-specific and never upgrades public or manual prices to LA verified',()=>{
 const record={markup_bps:2500,document:base()},e=estimateCostEvidence(record,'2026-10-22')
 expect(e.lines.find(i=>i.costType==='material').confidence).toBe('pending');expect(e.lines.every(i=>!i.localVerified)).toBe(true)
 expect(e.taxes).toBe('not-assumed');expect(e.shipping).toBe('not-assumed')
 const item={id:'manual',unit:'ea',unitCost:25,quantity:1,costType:'material',origin:'manual',price:{source:'manual-entry'}}
 expect(estimateCostEvidence({markup_bps:2500,document:{sections:[{id:'m',items:[item]}]}}).lines[0].confidence).toBe('manual_assumption')
})
it('composes approved mixed trades without second labor/overhead/markup and preserves valid scopes when another source is invalid',()=>{
 const records=['lvp','baseboard','drywall'].map((trade,n)=>{const inputs=trade==='baseboard'?{lengthFt:120}:{lengthFt:20,widthFt:20},plan=localTradePlan({trade,inputs});return {zone:'zone'+n,record:{id:trade,owner_id:'owner',version:1,markup_bps:2500,document:buildLocalTradeDocument(plan,'en')}}})
 const mixed=combineApprovedEstimates('owner',records)
 const direct=records.reduce((sum,x)=>sum+calculateEstimate(x.record.document,2500).costCents,0)
 expect(calculateEstimate(mixed.document,0).costCents).toBe(direct)
 expect(mixed.document.sections.flatMap(s=>s.items).filter(i=>i.ruleKey==='trade:labor')).toHaveLength(3)
 expect(mixed.document.sections.flatMap(s=>s.items).filter(i=>i.ruleKey==='trade:expenses')).toHaveLength(3)
 const duplicate=combineApprovedEstimates('owner',[records[0],records[0]]);expect(duplicate.document.composition.issues[0].reason).toBe('DUPLICATE_WORK_SCOPE')
 const invalid=structuredClone(records[1]);invalid.record.document.sections[0].items[0].quantity=-1
 expect(combineApprovedEstimates('owner',[records[0],invalid]).document.composition.issues[0].reason).toBe('INVALID_SOURCE_MATH_OR_SCOPE')
 expect(()=>combineApprovedEstimates('other',records)).toThrow('OWNER_MISMATCH')
})
