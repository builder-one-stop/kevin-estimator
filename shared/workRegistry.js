import {z} from 'zod'
import {workChoices} from './workChoices.js'
import {constructionLibrary,tradeDefaultProducts} from './constructionLibrary.js'
import {localTradeInput,localTradePlan,pendingTradeDocument} from './localTradePlan.js'
import {researchCatalog} from './researchCatalog.js'
import {paintDimensions,PAINT_RULE_VERSION} from './paintJob.js'
import {TRADE_RULE_VERSION} from './tradeRules.js'
import {assessPrice} from './priceEvidence.js'

export const WORK_REGISTRY_VERSION='hybrid-work-registry-1'
const bi=(en,es=en)=>({en,es})
export const workRegistry=Object.freeze({
 paint:{label:bi('Interior wall painting','Pintura interior de paredes'),engine:PAINT_RULE_VERSION,productId:'00000000-0000-4000-8000-000000000001',unit:'gal',dimensions:3},
 lvp:{label:bi('Click-lock LVP floor','Piso LVP de encaje'),engine:TRADE_RULE_VERSION,productId:tradeDefaultProducts.lvp,unit:'ea',dimensions:2},
 baseboard:{label:bi('Interior baseboard','Zócalo interior'),engine:TRADE_RULE_VERSION,productId:tradeDefaultProducts.baseboard,unit:'ea',dimensions:1},
 drywall:{label:bi('Simple interior drywall board','Paño simple de drywall interior'),engine:TRADE_RULE_VERSION,productId:tradeDefaultProducts.drywall,unit:'ea',dimensions:2},
})
export const workSelectionSchema=z.object({status:z.enum(['supported','clarify','unsupported']),trade:z.enum(['paint','lvp','baseboard','drywall']).nullable(),measurementQuote:z.string().max(300),scopeQuote:z.string().max(1000),productId:z.string().nullable(),reason:z.string().max(500)}).strict()
export const workSelectionJsonSchema={type:'object',additionalProperties:false,properties:{status:{type:'string',enum:['supported','clarify','unsupported']},trade:{type:['string','null'],enum:[...Object.keys(workChoices),null]},measurementQuote:{type:'string'},scopeQuote:{type:'string'},productId:{type:['string','null']},reason:{type:'string'}},required:['status','trade','measurementQuote','scopeQuote','productId','reason']}
export function selectedPublicReferences(trade,library=constructionLibrary){
 const work=workRegistry[trade];if(!work)return[]
 const ids=trade==='paint'?[work.productId,'00000000-0000-4000-8000-000000000003']:[work.productId]
 return ids.map(id=>[...library.records,...researchCatalog].find(row=>row.id===id)).filter(Boolean)
}
export function retrieveWorkReferences({trade,productId,unit,owner,privateReferences=[],today=new Date().toISOString().slice(0,10),library=constructionLibrary}){
 if(!workRegistry[trade])return[]
 // Public sources and explicitly current-owner references are separate provenance classes.
 const rows=[...selectedPublicReferences(trade,library).map(row=>({...row,referenceScope:'public-research'})),...privateReferences.filter(row=>owner&&row.ownerId===owner).map(row=>({...row,referenceScope:'current-owner'}))]
 return rows.filter(row=>(!productId||row.id===productId||row.sourceId===productId)&&(!unit||row.unit===unit)&&(!row.country||row.country==='US')&&(!row.region||row.region==='CA')&&(!row.city||row.city==='Los Angeles'))
  .map(row=>({id:row.id,product:row.product,brand:row.brand,package:row.package,unit:row.unit,unitCost:row.unitCost,currency:'USD',model:row.model||'',url:row.priceSourceUrl||row.url,checkedAt:row.checkedAt,version:row.version||row.priceVersion||1,referenceScope:row.referenceScope,assessment:assessPrice({...row,status:row.status||(row.unitCost===null?'quote_required':'public_observed')},'',today),localVerified:false,externallyQueried:false}))
  .sort((a,b)=>(b.checkedAt||'').localeCompare(a.checkedAt||'')).slice(0,6)
}
export function workPromptContext(library=constructionLibrary){
 // Bounded five default product identities; no full catalog or private history in the prompt.
 return{registryVersion:WORK_REGISTRY_VERSION,market:{country:'US',region:'CA',city:'Los Angeles',currency:'USD'},works:Object.entries(workRegistry).map(([trade,work])=>({trade,label:work.label,engineVersion:work.engine,dimensions:work.dimensions,defaultProducts:selectedPublicReferences(trade,library).map(p=>({id:p.id,product:p.product,package:p.package,unit:p.unit,coverage:p.coverage||null,provisional:true}))}))}
}
export function validateWorkSelection(raw,messages,library=constructionLibrary){
 const selection=workSelectionSchema.parse(raw),text=messages.filter(x=>x.role==='user').map(x=>x.content).join('\n')
 if(selection.status!=='supported')return{selection,inputs:null}
 const work=workRegistry[selection.trade]
 if(!work||selection.productId!==work.productId)throw Error('TRADE_SELECTION_INVALID')
 const product=selectedPublicReferences(selection.trade,library)[0]
 if(!product||(selection.trade!=='paint'&&!product.autoEligible))throw Error('TRADE_SELECTION_INVALID')
 if(!selection.scopeQuote||!text.includes(selection.scopeQuote)||!selection.measurementQuote||!text.includes(selection.measurementQuote))throw Error('TRADE_EVIDENCE_MISSING')
 const inputs=selection.trade==='paint'?paintDimensions({measurements:bi(selection.measurementQuote)}):localTradeInput([{role:'user',content:selection.trade+' '+selection.measurementQuote}])?.inputs
 if(!inputs||Object.entries(inputs).some(([key,value])=>typeof value==='number'&&(!Number.isFinite(value)||value<0||(key!=='openingsSqFt'&&value===0)||value>10000)))throw Error('TRADE_MEASUREMENTS_INVALID')
 return{selection,inputs}
}
const preparation=bi('Additional preparation allowance — pending','Preparación adicional — pendiente')
const equipment=bi('Additional equipment allowance — pending','Equipo adicional — pendiente')
export function createWorkPlan({selection,inputs},library=constructionLibrary,settings={}){
 const trade=selection.trade,work=workRegistry[trade]
 let plan
 if(selection.status==='unsupported'||!work){
  plan=localTradePlan({trade:'lvp',inputs:null},library);const requested=selection.scopeQuote||'Scope to be defined'
  Object.assign(plan.tasks[0],{id:'local-trade-pending',work:bi('Scope pending technical definition','Alcance pendiente de definición técnica'),included:bi(requested),excluded:bi('No automatic takeoff; the requested work is retained pending technical definition.','Sin cálculo automático; se conserva el alcance hasta definirlo.'),product:bi('To be defined','Por definir'),components:[bi(requested)],provenance:bi('Seller request; no priced reference selected.','Pedido del vendedor; sin referencia de precio seleccionada.')})
 }else if(trade!=='paint')plan=localTradePlan({trade,inputs},library)
 else{
  const [paint,patch]=selectedPublicReferences('paint',library)
  plan={title:work.label,address:'',zip:'',markupBps:2500,pending:[],assumptions:bi('Gross wall area; two coats, 350 sf/gal/coat and 10% waste are editable rule assumptions. No confirmed local prices. Contractor rate, productivity, consumables and additional equipment remain provisional.','Paredes brutas; dos manos,350sf/gal/mano y10%merma son supuestos editables. Sin precios locales confirmados. Tarifa, productividad, consumibles y equipo adicional provisionales.'),tasks:[{id:'hybrid-paint-walls',room:bi('Work area','Área de trabajo'),work:work.label,included:bi('Interior walls, protection, minor nail-hole preparation and cleanup.','Paredes interiores, protección, preparación menor de clavos y limpieza.'),excluded:bi('Ceilings, trim, doors, full primer, major patches, structural, wet or rated assemblies.','Techos, molduras, puertas, imprimación completa, parches mayores, estructura y sistemas húmedos o resistentes al fuego.'),measurements:inputs?bi(`${inputs.lengthFt} x ${inputs.widthFt} x ${inputs.heightFt} ft; gross walls`):bi('Measurements missing','Medidas pendientes; sin cantidad asumida'),preparation:bi('Minor nail holes only; no duplicate preparation charges.','Solo agujeros menores de clavos; sin duplicar preparación.'),product:bi(`${paint.brand} ${paint.product} ${paint.package}; ${patch.brand} ${patch.product} ${patch.package}`),finish:bi('Selected provisional products, two coats; no silent substitutions.','Productos provisionales seleccionados, dos manos; sin sustituciones.'),assumptions:bi('Review editable template assumptions before approval. Extra equipment is a pending allowance.','Revisar supuestos editables antes de aprobar. Equipo extra como partida pendiente.'),provenance:bi(paint.url+'; '+patch.url),confirmed:Boolean(inputs),components:[bi('Interior wall painting materials','Materiales de pintura interior de paredes')]}]}
 }
 plan.pending=[]
 plan.assumptions.en=plan.assumptions.en.replace('Controlled local provider.','Real OpenAI interpretation; deterministic local template.')
 plan.assumptions.es=plan.assumptions.es.replace('Proveedor local controlado.','Interpretación real OpenAI; plantilla determinista local.')
 if(trade==='paint')plan.assumptions=bi(plan.assumptions.en+' Editable template contractor rate USD'+(settings.paintTemplate?.hourlyRate??75)+'/hr; 5% job expenses on material and labor. Provisional assumptions, not researched local contractor prices.',plan.assumptions.es+' Tarifa editable de plantilla USD'+(settings.paintTemplate?.hourlyRate??75)+'/hr; gastos5% de materiales y mano de obra. Supuestos provisionales, no tarifas locales investigadas.')
 plan.title=bi('LOCAL HYBRID QA - '+plan.tasks[0].work.en,'QA HÍBRIDO LOCAL - '+plan.tasks[0].work.es)
 plan.assumptions=bi(plan.assumptions.en+' Local hybrid workflow; no live lookup. Missing quantities or prices remain exportable preliminary items. 25% markup on cost.','Flujo híbrido local; sin consulta en vivo. '+plan.assumptions.es+' Cantidades o precios faltantes quedan pendientes exportables. Recargo25%sobre costo.')
 if(work&&selection.status!=='unsupported'){
  const pending=trade==='paint'?[equipment]:[preparation,equipment]
  plan.tasks[0].components.push(...pending)
  plan.tasks[0].included=bi(plan.tasks[0].included.en+' Additional preparation/equipment allowances are shown separately as pending when not priced.',plan.tasks[0].included.es+' Preparación/equipo adicional se muestran aparte como pendientes si falta precio.')
 }
 return plan
}
export function attachHybridBudget(document,plan,library=constructionLibrary){
 const task=plan.tasks[0],trade=task.id==='hybrid-paint-walls'?'paint':task.id.replace('local-trade-',''),work=workRegistry[trade]
 const result=structuredClone(document)
 if(work){for(const label of trade==='paint'?[equipment]:[preparation,equipment]){
  if(!task.components.some(c=>c.en===label.en&&c.es===label.es))continue
  result.sections[0].items.push({id:crypto.randomUUID(),taskId:task.id,description:label[result.language],translations:label,quantity:1,unit:'lot',unitCost:0,costType:label===equipment?'equipment':'labor',markupBps:null,priceMissing:true,origin:'hybrid-template',needsReview:true,price:{status:'provisional',source:'rule-assumption',unitCost:null,reason:'ALLOWANCE_PENDING'},notes:result.language==='es'?'Por definir; no incluido en el subtotal conocido. Puede cotizarse manualmente o excluirse explícitamente.':'To be defined; excluded from known subtotal. Can be priced manually or explicitly excluded.'})
 }}
 result.hybrid={registryVersion:WORK_REGISTRY_VERSION,trade:work?trade:'pending',engineVersion:work?.engine||null,referenceSnapshot:work?retrieveWorkReferences({trade,library}):[],referenceLookup:'local-versioned-snapshot',liveLookup:false,calibration:'manual-actuals-only-no-learning',costCategories:['materials','waste-in-purchased-packages','preparation','labor','equipment','expenses','markup-on-cost']}
 return result
}
export function pendingPaintDocument(plan,language,business,revision){return pendingTradeDocument(plan,language,business,revision)}
