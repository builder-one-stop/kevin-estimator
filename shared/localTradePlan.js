import {constructionLibrary,tradeDefaultProducts} from './constructionLibrary.js'
import {calculateTrade,tradeDefaults,tradeLabels,TRADE_RULE_VERSION} from './tradeRules.js'
import {ESTIMATING_MARKET,convertMeasurement} from './estimatingMarket.js'
const bi=(en,es=en)=>({en,es})
export function localTradeInput(messages){
 const text=messages.filter(row=>row.role==='user').map(row=>row.content).join('\n'),normalized=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 const trade=/baseboard|zocalo/.test(normalized)?'baseboard':/drywall|panel de yeso/.test(normalized)?'drywall':/\blvp\b|vinyl plank|vinilo/.test(normalized)?'lvp':null
 if(!trade)return null
 if(trade==='baseboard'){
  const match=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(lf|linear\s*ft|linear\s*feet|ft|pies|m|metros?)\b/gi)].at(-1)
  return{trade,inputs:match?{lengthFt:Number(convertMeasurement(Number(match[1]),/^(m|metro)/i.test(match[2])?'m':'ft','ft').toFixed(6))}:null}
 }
 const match=[...text.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|feet|pies|m|metros?)\b/gi)].at(-1)
 const unit=match&&/^(m|metro)/i.test(match[3])?'m':'ft'
 return{trade,inputs:match?{lengthFt:Number(convertMeasurement(Number(match[1]),unit,'ft').toFixed(6)),widthFt:Number(convertMeasurement(Number(match[2]),unit,'ft').toFixed(6))}:null}
}
export function localTradePlan({trade,inputs},library=constructionLibrary){
 const product=library.records.find(row=>row.id===tradeDefaultProducts[trade]),label=tradeLabels[trade]
 const measurement=inputs?(trade==='baseboard'?`${inputs.lengthFt} lf`:`${inputs.lengthFt} x ${inputs.widthFt} ft`):'Measurements missing'
 const exclusions={drywall:bi('Board-only quantity and labor allowance. No framing, screws, tape, joint finishing, fire-rated or wet-area assemblies, demolition or painting.','Solo cantidad de panel y mano de obra supuesta. Sin estructura, tornillos, cinta, acabado de juntas, sistemas resistentes al fuego, áreas húmedas, demolición ni pintura.'),baseboard:bi('No removal, caulk, fasteners or painting. Net measured length; cut list and miters must be checked.','Sin retiro, sellado, fijaciones ni pintura. Largo neto medido; revisar lista de cortes e ingletes.'),lvp:bi('No demolition, leveling, moisture remediation, stairs, transitions or trim. Verify exact SKU installation guide; do not add a second pad automatically.','Sin demolición, nivelación, tratamiento de humedad, escaleras, transiciones ni molduras. Revisar guía del producto; no agregar segunda base automáticamente.')}
 return{title:bi(`LOCAL QA — ${label.en}`,`QA LOCAL — ${label.es}`),address:'',zip:'',markupBps:2500,
  pending:inputs?[]:[trade==='baseboard'?bi('What is the measured net baseboard length, for example120 lf?','¿Cuál es el largo neto medido de zócalos, por ejemplo120lf?'):bi('What are the two measured dimensions, for example20 x20 ft?','¿Cuáles son las dos medidas, por ejemplo20x20ft?')],
  assumptions:bi('Controlled local provider. LA, CA, US; USD. Public indexed material references are not local quotes.10% waste and productivity are editable assumptions. Contractor hourly rate is missing until explicitly supplied; known subtotal is not a final quote.25% markup on cost.','Proveedor local controlado. LA, CA, US; USD. Referencias públicas indexadas, no cotizaciones locales. Desperdicio10% y productividad supuestos editables. Falta tarifa contratista hasta indicarla; subtotal conocido no es cotización final. Recargo25% sobre costo.'),
  tasks:[{id:'local-trade-'+trade,room:bi('Synthetic work area','Área sintética'),work:label,included:bi(`${label.en}; exact product packages plus provisional labor and trade expenses.`,`${label.es}; presentaciones del producto más mano de obra y gastos provisionales.`),excluded:exclusions[trade],measurements:inputs?bi(measurement):bi('Measurements missing','Medidas pendientes; sin cantidad asumida'),preparation:bi('Existing suitable substrate assumed; suitability not field verified.','Se supone soporte existente adecuado; no verificado en terreno.'),product:bi(product.product+' | '+product.package),finish:bi('Exact selected product; no substitution.','Producto seleccionado; sin sustitución.'),assumptions:bi('10% estimating waste; whole packages. Labor productivity is provisional, hourly rate pending.','Desperdicio supuesto10%; envases enteros. Productividad provisional, tarifa por hora pendiente.'),provenance:bi(`${product.url}; consulted2026-10-21. Store, ZIP, stock, tax and delivery unverified.`,`${product.url}; consulta2026-10-21. Sucursal, ZIP, stock, impuestos y entrega sin verificar.`),confirmed:Boolean(inputs),components:[bi(product.product),bi(label.en+' — labor',label.es+' — mano de obra'),bi('Trade expenses','Gastos del rubro')]}]}
}
export function buildLocalTradeDocument(plan,language,business={},revision=1,library=constructionLibrary){
 if(plan.tasks.length!==1)throw Error('LOCAL_TRADE_SCOPE_MISMATCH')
 if(plan.tasks[0].id==='local-trade-pending'||plan.tasks[0].measurements.en==='Measurements missing')return pendingTradeDocument(plan,language,business,revision)
 const task=plan.tasks[0],trade=task.id.replace(/^local-trade-/,''),product=library.records.find(row=>row.id===tradeDefaultProducts[trade])
 if(!product||task.product.en!==product.product+' | '+product.package)throw Error('LOCAL_TRADE_PRODUCT_MISMATCH')
 const parsed=localTradeInput([{role:'user',content:trade+' '+task.measurements.en}])
 if(!parsed?.inputs)throw Error('LOCAL_TRADE_MEASUREMENTS_MISSING')
 const parameters=structuredClone(tradeDefaults[trade]),result=calculateTrade(trade,parsed.inputs,parameters,product,language)
 return{language,market:{...ESTIMATING_MARKET},business:structuredClone(business),proposal:{intro:'',scope:'',notes:'',exclusions:'',terms:''},scope:{plan:structuredClone(plan),revision,approvalType:'plan'},sections:[{id:task.id,title:task.room[language],items:result.items.map(item=>({...item,taskId:task.id}))}],rules:{trades:{[task.id]:{version:TRADE_RULE_VERSION,trade,inputs:parsed.inputs,parameters,product:structuredClone(product),incompletePrice:result.incompletePrice,limitations:result.limitations}}}}
}
export function pendingTradeDocument(plan,language,business={},revision=1){
 const task=plan.tasks[0],es=language==='es'
 return{language,market:{...ESTIMATING_MARKET},business:structuredClone(business),proposal:{intro:'',scope:'',notes:es?'Partida pendiente, no incluida en el subtotal conocido. Sin cálculo automático ni precio confirmado.':'Pending item excluded from known subtotal. No automatic quantity or confirmed price.',exclusions:'',terms:''},scope:{plan:structuredClone(plan),revision,approvalType:'plan'},sections:[{id:task.id,title:task.room[language],items:[{id:crypto.randomUUID(),taskId:task.id,description:task.components[0][language],translations:task.components[0],quantity:1,quantityPending:true,unit:'lot',unitCost:0,priceMissing:true,costType:'material',markupBps:null,origin:'pending-scope',needsReview:true,price:{status:'provisional',source:'rule-assumption',unitCost:null,reason:'SCOPE_OR_MEASUREMENT_PENDING'},priceSource:es?'Por definir, no incluido':'To be defined, not included',notes:es?'Faltan medidas o definición técnica del alcance. No se asumió cantidad ni precio.':'Measurements or technical scope remain undefined. No quantity or price was assumed.'}]}]}
}
