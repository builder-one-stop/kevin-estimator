import {assessPrice} from './priceEvidence.js'
import {priceFreshness} from './priceOffers.js'
export function lineCostEvidence(item,document={},markupBps=0,today){
 const p=item.price||{},task=item.taskId,trade=document.rules?.trades?.[task]||document.rules?.finishing?.[task],paint=document.rules?.paint?.[task],rule=trade||paint
 const assessment=assessPrice({...p,unitCost:item.priceMissing?null:item.unitCost,checkedAt:p.checkedAt||item.priceDate},document.pricingContext?.jobZip??document.scope?.plan?.zip??'',today)
 const amountPending=Boolean(item.priceMissing||item.quantityPending),product=Boolean(p.product&&p.package&&p.url)
 const confidence=amountPending?'pending':assessment.status==='verified'?'documented_local':product&&p.purchaseBasis!=='pack_pending'&&assessment.status==='public_observed'?'public_not_local':item.origin==='manual'||p.source==='manual-entry'?'manual_assumption':'editable_assumption'
 return {id:item.id,description:item.description,costType:item.costType,quantity:item.quantityPending?null:item.quantity,unit:item.unit,unitCost:item.priceMissing?null:item.unitCost,confidence,
  referenceKind:amountPending?'missing':p.source==='manual-entry'?'manual':p.reusedFrom||p.freshness==='stale'?'historical':assessment.status==='verified'?'local-verified':p.evidenceKind==='authorized-quote'?'authorized-quote':p.source==='phase-a-research'||p.status==='public_observed'?'public-web':'assumption',
  product:p.product||null,package:p.package||null,purchaseUnit:p.unit||item.unit,sourceUrl:p.priceSourceUrl||p.url||null,sourceDate:p.checkedAt||item.priceDate||null,sourceLabel:item.priceSource||null,
  market:{country:'US',region:'CA',city:'Los Angeles',currency:'USD'},localVerified:confidence==='documented_local',assessment,freshness:p.freshness==='stale'?'stale':priceFreshness(assessment),offer:p.offer||null,
  coverage:item.tradeCalculation||item.takeoff||null,wastePercent:item.tradeCalculation?.wastePercent??item.takeoff?.wastePercent??rule?.parameters?.wastePercent??rule?.template?.wastePercent??null,
  laborBasis:item.costType==='labor'?(item.rateBasis||{mode:rule?.parameters?.laborRateMode||rule?.template?.laborRateMode||'contractor_cost',source:'editable-cost-assumption',statisticalWage:false}):null,
  productivity:item.costType==='labor'?(trade?.parameters?.productivityPerHour??trade?.parameters?.finishingSqFtPerHour??paint?.template?.productivity?.[item.ruleKey?.split(':')[0]]??null):null,productivityUnit:trade?.trade==='baseboard'?'lf':paint&&item.ruleKey?.startsWith('repair:')?'ea':paint&&item.ruleKey?.startsWith('painting:')?'coat-sf':'sf',markupBps:item.markupBps??markupBps,expensesPercent:trade?.parameters?.expensesPercent??paint?.template?.expensesPercent??null,
  pricingScope:'before-unprovided-tax-shipping',pending:amountPending}
}
export function estimateCostEvidence(record,today){
 const lines=(record.document?.sections||[]).flatMap(s=>s.items.map(i=>lineCostEvidence({...i,taskId:i.taskId||s.id},record.document,record.markup_bps,today)))
 const duplicateRuleLines=[]
 for(const section of record.document?.sections||[]){const seen=new Set();for(const i of section.items){if(i.ruleKey&&seen.has(i.ruleKey))duplicateRuleLines.push({sectionId:section.id,ruleKey:i.ruleKey});if(i.ruleKey)seen.add(i.ruleKey)}}
 return {lines,counts:Object.fromEntries(['pending','documented_local','public_not_local','manual_assumption','editable_assumption'].map(k=>[k,lines.filter(x=>x.confidence===k).length])),duplicateRuleLines,
  taxes:'not-assumed',shipping:'not-assumed',removal:'only-explicit-approved-lines',priceVerificationIsNotApproval:true,statisticalWageIsNotContractorRate:true}
}
