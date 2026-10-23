import Decimal from 'decimal.js'
import {constructionLibrary} from './constructionLibrary.js'
import {libraryCatalog} from './localPriceLibrary.js'
import {applyCatalogPrice} from './catalogPricing.js'
import {laborBasis,burdenItem} from './laborBasis.js'
const finite=(v,key,zero=false)=>{if(!Number.isFinite(v)||(zero?v<0:v<=0))throw Error('INVALID_'+key);return v}
export function drywallFinishingItems(config,language='en',library=constructionLibrary){
 const area=finite(config.boardAreaSqFt,'BOARD_AREA'),waste=finite(config.wastePercent,'WASTE',true);if(waste>100)throw Error('INVALID_WASTE')
 const es=language==='es',compound=library.records.find(r=>r.id==='ace-12922'),tape=library.records.find(r=>r.id==='ace-12931')
 if(compound?.model!=='380501'||compound.coverage?.quantity!==450||tape?.model!=='382175'||tape.coverage?.quantity!==250)throw Error('FINISH_REFERENCE_MISMATCH')
 const joint=config.measuredJointLengthFt;if(joint!==null&&joint!==undefined)finite(joint,'JOINT_LENGTH',true)
 const material=(key,product,quantity,pending,note)=>{let i={id:crypto.randomUUID(),ruleKey:key,quantity:quantity??1,quantityPending:pending,unit:'ea',unitCost:0,costType:'material',origin:'rule-engine',needsReview:true,markupBps:null,notes:note};if(product.unitCost!==null)i=applyCatalogPrice(i,libraryCatalog({records:[product]})[0],'',language);else i={...i,description:product.product,price:{...structuredClone(product),status:'provisional',unitCost:null,reason:'PRICE_MISSING'},priceSource:es?'Precio de producto pendiente':'Product price pending',priceDate:product.checkedAt};return{...i,origin:'rule-engine',quantityPending:pending,priceMissing:product.unitCost===null}}
 const factor=new Decimal(1).plus(waste/100),items=[
 material('finish:compound',compound,new Decimal(area).times(factor).div(450).ceil().toNumber(),false,es?'Tratamiento estándar de juntas; rendimiento aproximado derivado10gal/1000sf. No skimcoat ni Level5. Merma editable.':'Standard joint treatment; approximate coverage derived from10gal/1000sf. Not skimcoat or Level5. Editable waste.'),
 material('finish:tape',tape,joint===null||joint===undefined?null:new Decimal(joint).times(factor).div(250).ceil().toNumber(),joint===null||joint===undefined,es?'Longitud de juntas medida; nunca perímetro del cuarto ni área.':'Measured joint length; never room perimeter or surface area.'),
 ]
 const pending=(key,en,sp,type='material')=>({id:crypto.randomUUID(),ruleKey:key,description:es?sp:en,translations:{en,es:sp},quantity:1,quantityPending:true,unit:'lot',unitCost:0,priceMissing:true,costType:type,markupBps:null,origin:'pending-scope',needsReview:true,price:{status:'provisional',source:'rule-assumption',unitCost:null},priceSource:es?'Cantidad/base de compra o precio pendiente':'Quantity/purchase basis or price pending',notes:es?'Excluido del subtotal conocido; no se supone gratuito.':'Excluded from known subtotal; not assumed free.'})
 items.push(pending('finish:sanding','Sanding supplies — pack/use pending','Consumibles de lijado — envase/consumo pendiente'))
 const basis=laborBasis(config),productivity=config.finishingSqFtPerHour
 if(productivity!==null&&productivity!==undefined)finite(productivity,'FINISH_PRODUCTIVITY')
 const labor={...pending('trade:labor','Joint finishing labor','Mano de obra de tratamiento de juntas','labor'),quantity:productivity?new Decimal(area).div(productivity).toDecimalPlaces(2,Decimal.ROUND_UP).toNumber():1,quantityPending:!productivity,unit:'hr',unitCost:basis.baseRate,priceMissing:basis.basePending,rateBasis:basis}
 labor.price={status:'provisional',source:'rule-assumption',unitCost:basis.basePending?null:basis.baseRate};labor.priceSource=es?'Tarifa/productividad editables, no verificadas localmente':'Editable rate/productivity, not locally verified';items.push(labor);const burden=burdenItem(labor,basis,language);if(burden)items.push(burden)
 if(config.includeFasteners)items.push(pending('finish:fasteners','Fasteners — substrate/schedule pending','Fijaciones — soporte/patrón pendiente'))
 if(config.includeCorners)items.push(pending('finish:corners','Corner bead — measured length/pack pending','Esquinas — longitud/envase pendiente'))
 if(config.includeRemoval)items.push(pending('finish:removal','Removal/haul-off — quantity and quote pending','Retirada/transporte — cantidad y cotización pendientes','other'))
 const percent=finite(config.expensesPercent,'EXPENSES',true);if(percent>100)throw Error('INVALID_EXPENSES')
 const cents=items.filter(i=>!i.priceMissing&&!i.quantityPending&&['material','labor'].includes(i.costType)).reduce((n,i)=>n.plus(new Decimal(i.quantity).times(new Decimal(i.unitCost).times(100).toDecimalPlaces(0)).toDecimalPlaces(0)),new Decimal(0))
 items.push({id:crypto.randomUUID(),ruleKey:'trade:expenses',description:es?'Gastos del acabado sobre costos conocidos':'Finishing expenses on known costs',quantity:1,unit:'lot',unitCost:cents.times(percent).div(10000).toDecimalPlaces(2).toNumber(),costType:'other',markupBps:null,origin:'rule-engine',needsReview:true,price:{status:'provisional',source:'rule-assumption'},priceSource:es?'Porcentaje editable, aplicado una sola vez':'Editable percentage, applied once'})
 return items
}
export function addDrywallFinishing(document,baseSectionId,config,{scopeConfirmed=false}={}){
 if(!scopeConfirmed)throw Error('SCOPE_CONFIRMATION_REQUIRED')
 const rule=document.rules?.trades?.[baseSectionId];if(rule?.trade!=='drywall')throw Error('DRYWALL_RULE_REQUIRED')
 if(Object.entries(document.rules?.finishing||{}).some(([id,r])=>r.baseSectionId===baseSectionId&&document.sections.some(s=>s.id===id)))throw Error('DUPLICATE_FINISHING_SCOPE')
 const next=structuredClone(document),id=crypto.randomUUID(),items=drywallFinishingItems(config,next.language),es=next.language==='es'
 next.sections.push({id,title:es?'Adición confirmada: tratamiento de juntas':'Confirmed addition: joint treatment',items:items.map(i=>({...i,taskId:id}))})
 next.rules.finishing={...next.rules.finishing,[id]:{baseSectionId,parameters:structuredClone(config),scopeConfirmed:true,version:'drywall-joints-1'}}
 const note=es?'Adición de alcance confirmada por el vendedor: tratamiento estándar de juntas. Sustituye solo la exclusión original de acabado de juntas. No skimcoat, Level5, fuego, humedad ni estructura. Las partidas pendientes no se incluyen en el subtotal conocido.':'Seller-confirmed scope addition: standard joint treatment. This replaces only the original joint-finishing exclusion. No skimcoat, Level5, fire/wet systems or structural work. Pending lines are excluded from known subtotal.'
 next.proposal={...next.proposal,scope:[next.proposal?.scope,note].filter(Boolean).join('\n')}
 if(!next.scope?.plan?.tasks)throw Error('APPROVED_PLAN_REQUIRED')
 const originalPlan=next.scope.originalPlan||structuredClone(next.scope.plan),baseTask=next.scope.plan.tasks.find(t=>t.id===baseSectionId),bi=x=>({en:x,es:x})
 const added={...structuredClone(baseTask),id,work:{en:'Standard joint treatment — seller-confirmed addition',es:'Tratamiento estándar de juntas — adición confirmada por vendedor'},included:{en:'Joint compound, measured joint tape and disclosed labor/consumable allowances.',es:'Compuesto de juntas, cinta según juntas medidas y partidas explícitas de mano de obra/consumibles.'},excluded:{en:'No skimcoat, Level5, framing, rated or wet assemblies.',es:'Sin skimcoat, Level5, estructura ni sistemas resistentes al fuego o húmedos.'},measurements:bi(`${config.boardAreaSqFt} sf; joints ${config.measuredJointLengthFt??'pending'} lf`),preparation:bi('Suitable installed boards assumed; field review pending.'),product:bi('USG3805014.5gal; USG382175250ft; other supplies pending'),assumptions:bi(note),provenance:bi('Seller-confirmed scope addition; Ace/USG public sources2026-10-22; no LA store/ZIP confirmation.'),confirmed:true,components:items.map(i=>i.translations||bi(i.description))}
 next.scope={...next.scope,originalPlan,plan:{...next.scope.plan,tasks:[...next.scope.plan.tasks,added]}}
 next.scope={...next.scope,localAmendments:[...(next.scope?.localAmendments||[]),{type:'seller-confirmed-joint-finishing',sectionId:id,baseSectionId,confirmedAt:new Date().toISOString(),text:note}]}
 return next
}
