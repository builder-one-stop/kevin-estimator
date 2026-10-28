import {coverageEvidence} from './technicalCoverage.js'
import {packageGallons,paintPackages} from './materialTakeoff.js'
import {applyCatalogPrice,catalogPriceSnapshot,priceSourceLabel} from './catalogPricing.js'
import {matchesMaterialRole,consumablePhase,supplementalMaterialRoles,materialRoleLabel} from './materialSelection.js'
// Additional functions have no inherited paint yield or added labor. Quantities are explicit purchase packages.
export function supplementalPaintItems(taskId,selections=[],catalog=[],language='en',zip='',roomWallAreaSqFt){
 const ids=new Set()
 return selections.map(selection=>{
  if(!selection.selectionId||ids.has(selection.selectionId)||!supplementalMaterialRoles.includes(selection.role))throw Error('INVALID_MATERIAL_SELECTION')
  ids.add(selection.selectionId)
  let quantity=selection.purchaseQuantity
  if(quantity!==null&&quantity!==undefined&&(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000))throw Error('INVALID_PURCHASE_QUANTITY')
  const entry=catalog.find(x=>x.id===selection.catalogId&&matchesMaterialRole(x,selection.role)),phase=consumablePhase(selection.role)
  const supportedUnit=entry&&(entry.unit==='ea'||entry.unit==='gal'&&packageGallons(entry)===1||entry.unit==='qt'&&packageGallons(entry)===.25)
  const calculatedMode=selection.quantityMode==='documented-coverage'
  let takeoff=null,technicalCoverage=null,coveragePending=false
  if(calculatedMode){
   technicalCoverage=coverageEvidence(entry,selection.technicalProfile,selection.coverageSqFtPerGallon,'primer')
   const areaSqFt=selection.coverageAreaMode==='room-walls'?roomWallAreaSqFt:selection.coverageAreaMode==='manual-area'?selection.coverageAreaSqFt:null
   const complete=[selection.coats,selection.coverageSqFtPerGallon,selection.wastePercent,areaSqFt].every(v=>v!=null&&typeof v==='number'&&Number.isFinite(v))
   if(selection.role==='primer'&&technicalCoverage.profile&&complete&&packageGallons(entry)>0){
    if(!Number.isFinite(selection.coats)||selection.coats<=0||selection.coats>10)throw Error('INVALID_COATS')
    takeoff={areaSqFt,areaSource:selection.coverageAreaMode,coats:selection.coats,coverageSqFtPerGallon:selection.coverageSqFtPerGallon,wastePercent:selection.wastePercent,packageGallons:packageGallons(entry)}
    Object.assign(takeoff,paintPackages(takeoff));quantity=takeoff.packages
   }else{quantity=null;coveragePending=true}
  }
  const note={en:`${materialRoleLabel(selection.role,'en')}: ${calculatedMode?(takeoff?'whole packages calculated from explicitly selected sheet and editable job inputs':'automatic purchase quantity pending; review exact sheet and job inputs'):'manual whole purchase packages; no coverage or consumption inferred from wall paint'}. No consumable labor added; primer application hours are reviewed separately.${phase?` Replaces the ${phase} consumables allowance; review completeness of itemized materials.`:''}`,es:`${materialRoleLabel(selection.role,'es')}: ${calculatedMode?(takeoff?'envases completos calculados con la ficha elegida y parámetros editables de obra':'cantidad automática pendiente; revisa ficha exacta y parámetros de obra'):'envases completos de compra manuales; sin inferir rendimiento ni consumo desde la pintura'}. Sin mano de obra adicional para consumibles; las horas de imprimación se revisan aparte.${phase?` Sustituye el supuesto de consumibles de ${phase==='protection'?'protección':'preparación'}; revisa que las partidas cubran todos los materiales.`:''}`}
  let item={id:crypto.randomUUID(),taskId,ruleKey:`supplement:${selection.selectionId}:material`,ruleVersion:'interior-walls-1',materialSelectionId:selection.selectionId,materialRole:selection.role,
   description:entry?`${entry.brand} ${entry.product} - ${entry.package}`:`${materialRoleLabel(selection.role,language)} - ${selection.requestedLabel||'Product/package pending / Producto/envase pendiente'}`,quantity:quantity??1,quantityPending:quantity==null||!entry?.package||!supportedUnit,...(entry&&!supportedUnit?{quantityPendingReason:'PURCHASE_UNIT_REVIEW'}:coveragePending?{quantityPendingReason:'COVERAGE_INPUTS_PENDING'}:{}),unit:entry?.unit||'ea',unitCost:entry?.unitCost??0,costType:'material',markupBps:null,origin:'rule-engine',needsReview:true,ruleNotes:note,notes:note[language],priceDate:entry?.checkedAt||'',
   price:entry?catalogPriceSnapshot(entry,zip):{status:'provisional',source:'rule-assumption',reason:'NO_EXACT_PRODUCT',unitCost:null},priceMissing:!entry||entry.unitCost===null}
  item.priceSource=entry?priceSourceLabel(entry,item.price,language):(language==='es'?'Producto exacto pendiente; sin precio observado':'Exact product pending; no observed price')
  if(entry?.unitCost!=null)item=applyCatalogPrice(item,entry,zip,language)
  if(calculatedMode){item.technicalCoverage=technicalCoverage;item.takeoff=takeoff}
  item.origin='rule-engine';item.translations={en:item.description,es:item.description}
  return item
 })
}
