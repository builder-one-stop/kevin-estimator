import {packageGallons} from './materialTakeoff.js'
import {applyCatalogPrice,catalogPriceSnapshot,priceSourceLabel} from './catalogPricing.js'
import {matchesMaterialRole,consumablePhase,supplementalMaterialRoles,materialRoleLabel} from './materialSelection.js'
// Additional functions have no inherited paint yield or added labor. Quantities are explicit purchase packages.
export function supplementalPaintItems(taskId,selections=[],catalog=[],language='en',zip=''){
 const ids=new Set()
 return selections.map(selection=>{
  if(!selection.selectionId||ids.has(selection.selectionId)||!supplementalMaterialRoles.includes(selection.role))throw Error('INVALID_MATERIAL_SELECTION')
  ids.add(selection.selectionId)
  const quantity=selection.purchaseQuantity
  if(quantity!==null&&quantity!==undefined&&(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000))throw Error('INVALID_PURCHASE_QUANTITY')
  const entry=catalog.find(x=>x.id===selection.catalogId&&matchesMaterialRole(x,selection.role)),phase=consumablePhase(selection.role)
  const supportedUnit=entry&&(entry.unit==='ea'||entry.unit==='gal'&&packageGallons(entry)===1||entry.unit==='qt'&&packageGallons(entry)===.25)
  const note={en:`${materialRoleLabel(selection.role,'en')}: manual whole purchase packages; no coverage or consumption inferred from wall paint. No consumable labor added; primer application hours are reviewed separately.${phase?` Replaces the ${phase} consumables allowance; review completeness of itemized materials.`:''}`,es:`${materialRoleLabel(selection.role,'es')}: envases completos de compra manuales; sin inferir rendimiento ni consumo desde la pintura. Sin mano de obra adicional para consumibles; las horas de imprimación se revisan aparte.${phase?` Sustituye el supuesto de consumibles de ${phase==='protection'?'protección':'preparación'}; revisa que las partidas cubran todos los materiales.`:''}`}
  let item={id:crypto.randomUUID(),taskId,ruleKey:`supplement:${selection.selectionId}:material`,ruleVersion:'interior-walls-1',materialSelectionId:selection.selectionId,materialRole:selection.role,
   description:entry?`${entry.brand} ${entry.product} - ${entry.package}`:`${materialRoleLabel(selection.role,language)} - ${selection.requestedLabel||'Product/package pending / Producto/envase pendiente'}`,quantity:quantity??1,quantityPending:quantity==null||!entry?.package||!supportedUnit,...(entry&&!supportedUnit?{quantityPendingReason:'PURCHASE_UNIT_REVIEW'}:{}),unit:entry?.unit||'ea',unitCost:entry?.unitCost??0,costType:'material',markupBps:null,origin:'rule-engine',needsReview:true,ruleNotes:note,notes:note[language],priceDate:entry?.checkedAt||'',
   price:entry?catalogPriceSnapshot(entry,zip):{status:'provisional',source:'rule-assumption',reason:'NO_EXACT_PRODUCT',unitCost:null},priceMissing:!entry||entry.unitCost===null}
  item.priceSource=entry?priceSourceLabel(entry,item.price,language):(language==='es'?'Producto exacto pendiente; sin precio observado':'Exact product pending; no observed price')
  if(entry?.unitCost!=null)item=applyCatalogPrice(item,entry,zip,language)
  item.origin='rule-engine';item.translations={en:item.description,es:item.description}
  return item
 })
}
