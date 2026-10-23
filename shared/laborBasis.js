import Decimal from 'decimal.js'
// Values are supplied assumptions or contractor procurement costs, never inferred wages.
export function laborBasis(parameters={}){
 const rate=Number(parameters.hourlyRate),mode=parameters.laborRateMode||'contractor_cost',burden=parameters.laborBurdenPercent
 if(!Number.isFinite(rate)||rate<0)throw Error('INVALID_HOURLY_RATE')
 if(!['contractor_cost','direct_cost'].includes(mode))throw Error('INVALID_LABOR_BASIS')
 if(burden!==undefined&&burden!==null&&(!Number.isFinite(burden)||burden<0||burden>100))throw Error('INVALID_LABOR_BURDEN')
 if(mode==='contractor_cost'&&burden>0)throw Error('LABOR_BURDEN_ALREADY_INCLUDED')
 return {mode,baseRate:rate,basePending:rate===0,separateBurden:mode==='direct_cost',burdenPercent:burden??null,
  burdenRate:mode==='direct_cost'&&burden!==undefined&&burden!==null&&rate>0?new Decimal(rate).times(burden).div(100).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber():null,
  source:'editable-cost-assumption',verifiedContractorPrice:false,statisticalWage:false}
}
export function burdenItem(base,basis,language='en'){
 if(!basis.separateBurden)return null
 const es=language==='es',missing=basis.burdenRate===null
 return {...base,id:crypto.randomUUID(),ruleKey:base.ruleKey.replace(/labor$/,'burden'),description:es?'Carga sobre costo directo de mano de obra':'Burden on direct labor cost',translations:{en:'Burden on direct labor cost',es:'Carga sobre costo directo de mano de obra'},unitCost:basis.burdenRate??0,priceMissing:missing,rateBasis:basis,
  price:{status:'provisional',source:'rule-assumption',reason:missing?'LABOR_BURDEN_PENDING':'EDITABLE_LABOR_BURDEN',unitCost:basis.burdenRate},priceSource:es?'Porcentaje editable del costo directo; no tarifa local verificada':'Editable percent of direct cost; not a verified local rate',priceDate:'',
  notes:missing?(es?'Falta porcentaje/base de carga; no incluido en el subtotal conocido.':'Burden percent/base is missing; excluded from known subtotal.'):`${basis.burdenPercent}% × USD ${basis.baseRate}/hr`,ruleNotes:undefined}
}
