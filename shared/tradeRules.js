import {laborBasis,burdenItem} from './laborBasis.js'
import Decimal from 'decimal.js'
import { libraryCatalog } from './localPriceLibrary.js'
import { applyCatalogPrice } from './catalogPricing.js'

export const TRADE_RULE_VERSION='local-trades-1'
export const tradeLabels={drywall:{en:'Simple interior drywall panel',es:'Paño simple de drywall interior'},baseboard:{en:'Interior baseboard',es:'Zócalo interior'},lvp:{en:'Click-lock LVP floor',es:'Piso LVP de encaje'}}
export const tradeDefaults={drywall:{wastePercent:10,productivityPerHour:32,hourlyRate:0,expensesPercent:5},baseboard:{wastePercent:10,productivityPerHour:20,hourlyRate:0,expensesPercent:5},lvp:{wastePercent:10,productivityPerHour:30,hourlyRate:0,expensesPercent:5}}
const finite=(value,name,zero=false)=>{if(!Number.isFinite(value)||(zero?value<0:value<=0))throw Error('INVALID_'+name);return new Decimal(value)}
const round=value=>new Decimal(value).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber()
const cost=item=>new Decimal(item.quantity).times(new Decimal(item.unitCost).times(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP)).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber()
export function tradeQuantity(trade,inputs){
 if(!tradeLabels[trade])throw Error('UNSUPPORTED_TRADE')
 if(trade==='baseboard')return finite(inputs.lengthFt,'LENGTH').toNumber()
 return finite(inputs.lengthFt,'LENGTH').times(finite(inputs.widthFt,'WIDTH')).toNumber()
}
export function calculateTrade(trade,inputs,parameters,product,language='en',jobZip=''){
 const measureUnit=trade==='baseboard'?'lf':'sf',quantity=tradeQuantity(trade,inputs)
 if(product?.autoEligible!==true)throw Error('PRODUCT_REQUIRES_SPEC_REVIEW')
 const waste=finite(parameters.wastePercent,'WASTE',true);if(waste.gt(100))throw Error('INVALID_WASTE')
 if(!product||product.category!==trade||!product.coverage||product.coverage.unit!==measureUnit)throw Error('PRODUCT_COVERAGE_MISMATCH')
 const coverage=finite(product.coverage.quantity,'PACKAGE_COVERAGE')
 const required=new Decimal(quantity).times(waste.div(100).plus(1)),packages=required.div(coverage).ceil().toNumber()
 const laborHours=new Decimal(quantity).div(finite(parameters.productivityPerHour,'PRODUCTIVITY')).toDecimalPlaces(2,Decimal.ROUND_UP).toNumber()
 finite(parameters.hourlyRate,'HOURLY_RATE',true);const rateBasis=laborBasis(parameters)
 const es=language==='es',label=tradeLabels[trade]
 let material={id:crypto.randomUUID(),ruleKey:'trade:material',quantity:packages,unit:product.unit,unitCost:product.unitCost??0,costType:'material',markupBps:null,description:product.product,translations:{en:product.product,es:product.product},origin:'rule-engine',needsReview:true,
   price:{status:'provisional',source:'rule-assumption',reason:'PRICE_MISSING'},priceSource:es?'Falta precio: total parcial':'Missing price: partial total',priceDate:'',notes:'',ruleVersion:TRADE_RULE_VERSION}
 if(product.unitCost!==null)material=applyCatalogPrice(material,libraryCatalog({records:[product]})[0],jobZip,language)
 material={...material,origin:'rule-engine',ruleKey:'trade:material',ruleVersion:TRADE_RULE_VERSION,tradeCalculation:{measuredQuantity:quantity,measureUnit,wastePercent:parameters.wastePercent,packageCoverage:coverage.toNumber(),requiredQuantity:required.toNumber(),packages,coverageSource:product.coverage.sourceUrl,coverageBasis:product.coverage.basis}}
 const labor={id:crypto.randomUUID(),ruleKey:'trade:labor',quantity:laborHours,unit:'hr',unitCost:parameters.hourlyRate,costType:'labor',markupBps:null,description:label[language]+(es?' — mano de obra':' — labor'),translations:{en:label.en+' — labor',es:label.es+' — mano de obra'},origin:'rule-engine',needsReview:true,ruleVersion:TRADE_RULE_VERSION,
   price:{status:'provisional',source:'rule-assumption',reason:'UNVERIFIED_CONTRACTOR_RATE'},priceSource:es?'Tarifa y productividad provisionales':'Provisional contractor rate and productivity',priceDate:'',notes:es?`${quantity} ${measureUnit} ÷ ${parameters.productivityPerHour}/hr; rendimiento supuesto editable.`:`${quantity} ${measureUnit} ÷ ${parameters.productivityPerHour}/hr; editable productivity assumption.`}
 labor.rateBasis=rateBasis;const burden=burdenItem(labor,rateBasis,language);const extra=burden?[burden]:[]
 const base=cost(material)+cost(labor)+extra.filter(i=>!i.priceMissing).reduce((sum,i)=>sum+cost(i),0),percent=finite(parameters.expensesPercent,'EXPENSES',true);if(percent.gt(100))throw Error('INVALID_EXPENSES')
 const expenses={id:crypto.randomUUID(),ruleKey:'trade:expenses',quantity:1,unit:'lot',unitCost:round(new Decimal(base).times(percent).div(10000)),costType:'other',markupBps:null,description:es?'Gastos del rubro':'Trade expenses',translations:{en:'Trade expenses',es:'Gastos del rubro'},origin:'rule-engine',needsReview:true,ruleVersion:TRADE_RULE_VERSION,price:{status:'provisional',source:'rule-assumption'},priceSource:es?'Supuesto editable':'Editable assumption',priceDate:'',notes:''}
 // Numeric zero is only an internal arithmetic placeholder; never a quoted free material/rate.
 material.priceMissing=product.unitCost===null;labor.priceMissing=parameters.hourlyRate===0
 if(material.priceMissing)material.price.unitCost=null
 const incompletePrice=material.priceMissing||labor.priceMissing||extra.some(i=>i.priceMissing)
 return {items:[material,labor,...extra,expenses],quantity,measureUnit,packages,laborHours,incompletePrice,materialSubtotalCents:material.priceMissing?null:cost(material),totalCents:incompletePrice?null:base+cost(expenses),limitations:trade==='drywall'?['NO_FRAMING','NO_FIRE_RATING','NO_WET_AREA','FINISHING_AND_FASTENERS_NOT_INCLUDED']:trade==='baseboard'?['NO_PAINT_CAULK_FASTENERS','NO_REMOVAL','NO_COMPLEX_PROFILE']:['NO_DEMOLITION','NO_LEVELING','NO_MOISTURE_REMEDIATION','NO_STAIRS_TRANSITIONS_TRIM']}
}
export function reconcileTradeExpenses(document){
 if(!document.rules?.trades&&!document.rules?.finishing)return document
 return{...document,sections:document.sections.map(section=>{const rule=document.rules.trades?.[section.id]||document.rules.finishing?.[section.id];if(!rule)return section
  const base=section.items.filter(item=>!item.priceMissing&&!item.quantityPending&&item.ruleKey!=='trade:expenses'&&['material','labor'].includes(item.costType)).reduce((sum,item)=>sum+cost(item),0)
  const percent=finite(rule.parameters.expensesPercent,'EXPENSES',true);if(percent.gt(100))throw Error('INVALID_EXPENSES')
  return{...section,items:section.items.map(item=>item.ruleKey==='trade:expenses'&&!item.ruleOverrides?.price&&!item.ruleOverrides?.quantity&&item.unit==='lot'&&item.costType==='other'?{...item,unitCost:round(new Decimal(base).times(percent).div(10000))}:item)}
 })}
}
export function recalculateTradeDocument(document,sectionId,inputs,parameters){
 const rule=document.rules?.trades?.[sectionId];if(!rule)throw Error('TRADE_RULE_MISSING')
 const nextInputs={...rule.inputs,...inputs},nextParameters={...rule.parameters,...parameters},fresh=calculateTrade(rule.trade,nextInputs,nextParameters,rule.product,document.language,document.pricingContext?.jobZip??document.scope?.plan?.zip??'')
 const section=document.sections.find(row=>row.id===sectionId),old=new Map(section.items.map(item=>[item.ruleKey,item]))
 const items=fresh.items.map(item=>{const previous=old.get(item.ruleKey);if(!previous)return{...item,taskId:sectionId}
  const flags=previous.ruleOverrides||{}
  return{...item,id:previous.id,taskId:sectionId,ruleOverrides:flags,...(flags.quantity?{quantity:previous.quantity}:{}),...(flags.price?{unitCost:previous.unitCost,unit:previous.unit,costType:previous.costType,price:previous.price,priceSource:previous.priceSource,priceDate:previous.priceDate,needsReview:previous.needsReview,priceMissing:previous.priceMissing??false}:{}),...(flags.notes?{notes:previous.notes}:{}),...(flags.description?{description:previous.description,translations:previous.translations}:{}),...(flags.markupBps?{markupBps:previous.markupBps}:{})}
 })
 return reconcileTradeExpenses({...document,sections:document.sections.map(row=>row.id===sectionId?{...row,items:[...items,...row.items.filter(item=>!item.ruleKey)]}:row),rules:{...document.rules,trades:{...document.rules.trades,[sectionId]:{...rule,inputs:nextInputs,parameters:nextParameters,incompletePrice:items.some(item=>item.priceMissing)}}}})
}
export function tradeLineNotes(item,rule,language='en'){
 if(!rule)return null
 const es=language==='es'
 if(item.ruleKey==='trade:labor'&&!item.ruleOverrides?.notes&&!item.ruleOverrides?.quantity)return es?`${item.quantity} hr según productividad provisional de ${rule.parameters.productivityPerHour} ${rule.trade==='baseboard'?'lf':'sf'}/hr; supuesto editable.`:`${item.quantity} hr using provisional productivity ${rule.parameters.productivityPerHour} ${rule.trade==='baseboard'?'lf':'sf'}/hr; editable assumption.`
 if(item.ruleKey==='trade:expenses'&&rule.incompletePrice&&!item.ruleOverrides?.price&&!item.ruleOverrides?.quantity)return es?`${rule.parameters.expensesPercent}% solo de costos conocidos; gasto parcial hasta completar precios pendientes.`:`${rule.parameters.expensesPercent}% of known costs only; partial expense until missing prices are supplied.`
 if(item.ruleOverrides?.quantity&&item.ruleKey==='trade:labor')return es?`Horas ajustadas manualmente: ${item.quantity} hr; sustituyen las calculadas.`:`Manual labor hours: ${item.quantity} hr; replace calculated hours.`
 if(item.ruleKey==='trade:material'){
  if(item.ruleOverrides?.quantity)return es?`Cantidad manual vigente: ${item.quantity} ${item.unit}; sustituye el cálculo de compra.`:`Current manual quantity: ${item.quantity} ${item.unit}; replaces calculated purchase.`
  const c=item.tradeCalculation
  return c?(es?`${c.measuredQuantity} ${c.measureUnit} × (1 + ${c.wastePercent}%) ÷ ${c.packageCoverage} por envase = ${c.packages} envases enteros. Desperdicio editable.`:`${c.measuredQuantity} ${c.measureUnit} × (1 + ${c.wastePercent}%) ÷ ${c.packageCoverage} per package = ${c.packages} whole packages. Editable waste.`):item.notes
 }
 if(item.ruleKey==='trade:expenses')return item.ruleOverrides?.price||item.ruleOverrides?.quantity?(es?'Gasto manual; sustituye el porcentaje.':'Manual expense override; replaces percentage.'):(es?`${rule.parameters.expensesPercent}% de materiales y mano de obra del rubro; sin acumular gastos.`:`${rule.parameters.expensesPercent}% of trade material and labor costs; never compounded.`)
 return item.notes
}
