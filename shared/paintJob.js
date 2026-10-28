import {laborBasis,burdenItem} from './laborBasis.js'
import Decimal from 'decimal.js'
import { measureRooms,convertMeasurement } from './estimatingMarket.js'
import { paintPackages, packageGallons } from './materialTakeoff.js'
import { applyCatalogPrice,catalogPriceSnapshot } from './catalogPricing.js'
import { paintParameterEvidence } from './paintEvidence.js'
import { reconcilePaintExpenses } from './paintReconciliation.js'
import { supplementalPaintItems } from './paintMaterials.js'
import { consumablePhase } from './materialSelection.js'
import { matchesMaterialRole } from './materialSelection.js'
import { itemCostCents } from '../src/lib/estimateDocument.js'

export const PAINT_RULE_VERSION = 'interior-walls-1'
export const defaultPaintTemplate = () => ({
  coats: 2, coverageSqFtPerGallon: 350, wastePercent: 10, patchCount: 1, repairPackages: 1,
  paintCatalogId: '00000000-0000-4000-8000-000000000001',
  repairCatalogId: '00000000-0000-4000-8000-000000000003',
  hourlyRate: 75, expensesPercent: 5, marginPercent: 25,
  productivity: { protection: 800, preparation: 350, repair: 8, painting: 150, cleanup: 1000 },
  consumablesUsdPerSqFt: { protection: 0.08, preparation: 0.06, cleanup: 0.03 },
})

const positive = (value, label, allowZero = false) => {
  if (value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) || (allowZero ? Number(value) < 0 : Number(value) <= 0)) throw Error(`INVALID_${label}`)
  return Number(value)
}
const round = (value, places = 2) => new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber()
const hours = (work, rate) => new Decimal(work).div(positive(rate, 'PRODUCTIVITY')).toDecimalPlaces(2, Decimal.ROUND_UP).toNumber()
const has = (task, word) => `${task.work?.en || ''} ${task.included?.en || ''}`.toLowerCase().includes(word)
export const isInteriorWallPaint = task => has(task, 'paint') && has(task, 'wall') && !/exterior/i.test(`${task.work?.en} ${task.included?.en}`)

// Dimensions come from the approved plan, not a model-proposed quantity. No height means no rule result.
export function paintDimensions(task) {
  const description = task.measurements?.en || ''
  // Reject signed values and decimal commas instead of matching a positive suffix.
  if (/(?<![\w])[−–+-]\s*\d|\d,\d/.test(description) || /\d\s*(?:ft|feet|')\s*\d+\s*(?:in|inches|")/i.test(description)) return null
  const measured=description.match(/(?<![\w.,+\-−–])(\d+(?:\.\d+)?)\s*(ft|feet|inches|in|metros?|m|pies|pulgadas)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|feet|inches|in|metros?|m|pies|pulgadas)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|feet|inches|in|metros?|m|pies|pulgadas)\b/i)
  if(measured){
   if(measured[2] && !measured[4] && measured[2].toLowerCase()!==measured[6].toLowerCase()) return null
   const unit=u=>/^(in|pulg)/i.test(u)?'in':/^(m|metro)/i.test(u)?'m':'ft'
   const value=(n,u)=>convertMeasurement(Number(n),unit(u),'ft')
   return {lengthFt:value(measured[1],measured[2]||measured[6]),widthFt:value(measured[3],measured[4]||measured[6]),heightFt:value(measured[5],measured[6]),openingsSqFt:0,useGrossWalls:true}
  }
  const match = description.match(/(?<![\w.,+\-−–])(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*(?:[×xX]|[,;]?\s*(?:height|h|high)\s*)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i)
  if (!match) return null
  return { lengthFt: Number(match[1]), widthFt: Number(match[2]), heightFt: Number(match[3]), openingsSqFt: 0, useGrossWalls: true }
}

export function paintArea(inputs) {
  const [room] = measureRooms({ rooms: [{ id: 'paint-room', length: { value: positive(inputs.lengthFt, 'LENGTH'), unit: 'ft' },
    width: { value: positive(inputs.widthFt, 'WIDTH'), unit: 'ft' }, height: { value: positive(inputs.heightFt, 'HEIGHT'), unit: 'ft' },
    openings: { value: positive(inputs.openingsSqFt ?? 0, 'OPENINGS', true), unit: 'sf' }, useGrossWalls: Boolean(inputs.useGrossWalls) }] })
  return room.wallSqFt
}

const labels = {
  protection: { en: 'Protect floor and furnishings', es: 'Proteger piso y muebles' },
  preparation: { en: 'Prepare wall surfaces', es: 'Preparar superficies de pared' },
  repair: { en: 'Minor wall patch material', es: 'Material para reparación menor' },
  painting: { en: 'Interior wall paint', es: 'Pintura interior de paredes' },
  cleanup: { en: 'Clean and remove protection', es: 'Limpiar y retirar protecciones' },
  expenses: { en: 'Job expenses allowance', es: 'Supuesto de gastos del trabajo' },
}
const provisional = (reason, language) => ({ price: { status: 'provisional', source: 'rule-assumption', category: 'provisional-assumption', reason, internalPriceApproval: 'not-recorded' },
  priceSource: language === 'es' ? 'Supuesto provisional editable — sin precio local confirmado' : 'Editable provisional assumption — no confirmed local price', priceDate: '', needsReview: true })

export function makePaintItems(taskId, inputs, template, catalog, language = 'en', zip = '') {
  const areaSqFt = paintArea(inputs)
  // Quantity depends on the saved package, not the economic validity of its price.
  const available = x => Boolean(x)
  const paint = catalog.find(x => x.id === template.paintCatalogId && available(x) && matchesMaterialRole(x,'paint') && packageGallons(x) > 0)
  const repair = catalog.find(x => x.id === template.repairCatalogId && available(x) && x.unit === 'ea' &&
    matchesMaterialRole(x,'repair'))
  const parameterEvidence=paintParameterEvidence(template,catalog)
  const coverageMismatch=parameterEvidence.coverage.status==='product-mismatch'
  const pack = packageGallons(paint) || 1
  if(paint && (!['ea','gal','qt'].includes(paint.unit) || paint.unit==='gal' && pack!==1 || paint.unit==='qt' && pack!==0.25)) throw Error('PRODUCT_COVERAGE_MISMATCH')
  const takeoff = { areaSqFt, coats: positive(template.coats, 'COATS'), coverageSqFtPerGallon: positive(template.coverageSqFtPerGallon, 'COVERAGE'),
    wastePercent: positive(template.wastePercent, 'WASTE', true), packageGallons: pack }
  Object.assign(takeoff, paintPackages(takeoff))
  if(!paint){takeoff.packageGallons=null;takeoff.packages=null}
  if(coverageMismatch){takeoff.requiredGallons=null;takeoff.packages=null}
  const patchCount = positive(template.patchCount, 'PATCH_COUNT', true)
  const repairPackages = patchCount===0 ? 0 : positive(template.repairPackages ?? patchCount, 'REPAIR_PACKAGES', true)
  if(!Number.isSafeInteger(patchCount) || !Number.isSafeInteger(repairPackages)) throw Error('INVALID_REPAIR_PACKAGES')
  const laborRate = positive(template.hourlyRate, 'HOURLY_RATE', true),rateBasis=laborBasis(template)
  const item = (phase, kind, quantity, unit, unitCost, note) => ({
    id: crypto.randomUUID(), taskId, ruleKey: `${phase}:${kind}`, ruleVersion: PAINT_RULE_VERSION,
    description: labels[phase][language] + (kind === 'labor' ? (language === 'es' ? ' — mano de obra' : ' — labor') : ''),
    translations: kind === 'labor' ? { en: `${labels[phase].en} — labor`, es: `${labels[phase].es} — mano de obra` } : labels[phase],
    quantity, unit, unitCost: round(unitCost), costType: kind === 'labor' ? 'labor' : kind === 'expenses' ? 'other' : 'material',
    markupBps: null, origin: 'rule-engine', notes: note[language], ruleNotes: note,
    ...provisional(kind === 'labor' ? 'ASSUMED_PRODUCTIVITY_AND_RATE' : 'NO_BACKED_PRICE', language),
  })
  const jobs = [
    ['protection', areaSqFt, template.productivity.protection],
    ['preparation', areaSqFt, template.productivity.preparation],
    ['repair', patchCount, template.productivity.repair],
    ['painting', new Decimal(areaSqFt).times(template.coats).toNumber(), template.productivity.painting],
    ['cleanup', areaSqFt, template.productivity.cleanup],
  ]
  const selections=template.materialSelections||[]
  const itemizedPhases=new Set(selections.map(x=>consumablePhase(x.role)).filter(Boolean))
  const entries = []
  for (const [phase, work, rate] of jobs) {
    if (phase === 'painting') {
      let material = item(phase, 'material', takeoff.packages??1, paint?.unit || 'gal', paint?.unitCost ?? 0,
        { en: 'Whole purchasable packages; coverage and waste are editable assumptions.', es: 'Envases completos; rendimiento y desperdicio son supuestos editables.' })
      if (paint?.unitCost!==null&&paint) material = applyCatalogPrice(material, paint, zip, language)
      if(!paint||paint.unitCost===null){material.priceMissing=true;material.price=paint?catalogPriceSnapshot(paint,zip):material.price;material.price.unitCost=null;if(paint){material.description=paint.product+' - '+paint.package;material.priceDate=paint.checkedAt}}
      if(!paint||coverageMismatch)material.quantityPending=true
      if(template.technicalProfile)material.technicalCoverage=parameterEvidence.coverage
      material.origin = 'rule-engine'; material.ruleKey = `${phase}:material`; material.ruleVersion = PAINT_RULE_VERSION; material.takeoff = takeoff
      if (paint) material.translations = { en: material.description, es: material.description }
      entries.push(material)
    } else if (phase === 'repair') {
      let material = item(phase, 'material', repairPackages, repair?.unit || 'ea', repair?.unitCost ?? 0,
        { en: `${repairPackages} whole repair package(s): editable purchase allowance, not yield per hole. ${template.repairPackages===undefined?'Legacy allowance retained; review separately from patch labor.':''} Preparation excludes this material.`, es: `${repairPackages} envases completos para reparación: supuesto de compra editable, no rendimiento por agujero. ${template.repairPackages===undefined?'Supuesto anterior conservado; revisar separado de la mano de obra.':''} La preparación excluye este material.` })
      if (repair?.unitCost!==null&&repair) material = applyCatalogPrice(material, repair, zip, language)
      if((!repair||repair.unitCost===null)&&repairPackages>0){material.priceMissing=true;material.price=repair?catalogPriceSnapshot(repair,zip):material.price;material.price.unitCost=null;if(repair){material.description=repair.product+' - '+repair.package;material.priceDate=repair.checkedAt}}
      material.origin = 'rule-engine'; material.ruleKey = `${phase}:material`; material.ruleVersion = PAINT_RULE_VERSION
      if (repair) material.translations = { en: material.description, es: material.description }
      entries.push(material)
    } else if (!itemizedPhases.has(phase) && (phase !== 'preparation' || template.consumablesUsdPerSqFt.preparation > 0)) {
      entries.push(item(phase, 'material', areaSqFt, 'sf', positive(template.consumablesUsdPerSqFt[phase], 'CONSUMABLES', true),
        { en: 'Consumables allowance only; excludes separately counted paint and patch material.', es: 'Supuesto solo para consumibles; excluye pintura y material de reparación contados aparte.' }))
    }
    const laborItem=item(phase, 'labor', hours(work, rate), 'hr', laborRate,
      { en: `${round(work, 4)} ${phase === 'repair' ? 'patches' : phase === 'painting' ? 'coat-sf' : 'sf'} ÷ ${rate} per hour; rounded up to 0.01 hr.`,
        es: `${round(work, 4)} ${phase === 'repair' ? 'reparaciones' : phase === 'painting' ? 'sf-mano' : 'sf'} ÷ ${rate} por hora; redondeado hacia arriba a 0.01 hr.` })
    if(laborRate===0&&laborItem.quantity>0){laborItem.priceMissing=true;laborItem.price.unitCost=null}
    laborItem.rateBasis=rateBasis;entries.push(laborItem);const burden=burdenItem(laborItem,rateBasis,language);if(burden)entries.push(burden)
  }
  entries.push(...supplementalPaintItems(taskId,selections,catalog,language,zip,areaSqFt))
  if(selections.some(x=>x.role==='primer')){
   const note={en:'Primer application labor hours pending. Finish-paint coats/productivity do not establish primer labor. Confirm incremental hours, or explicitly enter zero if already included; no extra hours assumed.',es:'Horas de aplicación de imprimante pendientes. Las manos/productividad de terminación no determinan este trabajo. Confirma horas adicionales o indica cero explícitamente si ya están incluidas; sin horas adicionales supuestas.'}
   const primerLabor={id:crypto.randomUUID(),taskId,ruleKey:'supplement:primer:labor',ruleVersion:PAINT_RULE_VERSION,description:language==='es'?'Aplicación de imprimante - mano de obra':'Primer application - labor',translations:{en:'Primer application - labor',es:'Aplicación de imprimante - mano de obra'},quantity:1,quantityPending:true,unit:'hr',unitCost:laborRate,costType:'labor',markupBps:null,origin:'rule-engine',needsReview:true,notes:note[language],ruleNotes:note,...provisional('PRIMER_LABOR_HOURS_PENDING',language),...(laborRate===0?{priceMissing:true}:{})}
   primerLabor.rateBasis=rateBasis;entries.push(primerLabor);const primerBurden=burdenItem(primerLabor,rateBasis,language);if(primerBurden)entries.push(primerBurden)
  }
  const baseCents = entries.reduce((sum, row) => sum + itemCostCents(row), 0)
  if(!Number.isSafeInteger(baseCents)) throw Error('AMOUNT_LIMIT')
  if(Number(template.expensesPercent)>100) throw Error('INVALID_EXPENSES')
  const expenses = round(new Decimal(baseCents).times(positive(template.expensesPercent, 'EXPENSES', true)).div(10000))
  entries.push(item('expenses', 'expenses', 1, 'lot', expenses,
    { en: `${template.expensesPercent}% of material and labor cost; excludes this expenses line. No tax or freight claim.`,
      es: `${template.expensesPercent}% del costo de materiales y mano de obra; excluye esta partida. No incluye impuestos ni flete confirmados.` }))
  return { items: entries, areaSqFt, takeoff, parameterEvidence }
}

export function paintMarkupBps(marginPercent) {
  const margin = positive(marginPercent, 'MARGIN', true)
  if (margin >= 100) throw Error('INVALID_MARGIN')
  return new Decimal(margin).div(new Decimal(100).minus(margin)).times(10000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function paintMarginPercent(markupBps) {
  const markup = positive(markupBps, 'MARKUP', true)
  return new Decimal(markup).times(100).div(new Decimal(10000).plus(markup)).toNumber()
}

export function recalculatePaintDocument(document, taskId, templateChanges = {}, inputChanges = {}, catalog = [], options = {}) {
  const rule = document.rules?.paint?.[taskId]
  if (!rule) throw Error('NO_PAINT_RULE')
  const template = { ...rule.template, ...templateChanges, productivity: { ...rule.template.productivity, ...templateChanges.productivity },
    consumablesUsdPerSqFt: { ...rule.template.consumablesUsdPerSqFt, ...templateChanges.consumablesUsdPerSqFt } }
  const inputs = { ...rule.inputs, ...inputChanges }
  const selected = [template.paintCatalogId, template.repairCatalogId,...(template.materialSelections||[]).map(x=>x.catalogId)]
  const snapshots = selected.filter(Boolean).map(id => {
    const original = rule.catalogSnapshots?.find(x => x.id === id)
    return original || catalog.find(x => x.id === id)
  }).filter(Boolean).map(x => structuredClone(x))
  const fresh = makePaintItems(taskId, inputs, template, snapshots, document.language, document.pricingContext?.jobZip ?? document.scope?.plan?.zip ?? '')
  const section = document.sections.find(x => x.id === taskId)
  const retiredMaterialAllowances={...rule.retiredMaterialAllowances}
  for(const row of section.items.filter(x=>['protection:material','preparation:material'].includes(x.ruleKey)))if(!fresh.items.some(x=>x.ruleKey===row.ruleKey))retiredMaterialAllowances[row.ruleKey]=structuredClone(row)
  const old = new Map([...Object.values(retiredMaterialAllowances),...section.items.filter(x => x.ruleKey)].map(x => [x.ruleKey, x]))
  const items = fresh.items.map(next => {
    const previous = old.get(next.ruleKey)
    if (!previous) return {...next,ruleOverrides:{}}
    const switched = next.ruleKey === 'painting:material' && template.paintCatalogId !== rule.template.paintCatalogId ||
      next.ruleKey === 'repair:material' && template.repairCatalogId !== rule.template.repairCatalogId ||
      next.materialSelectionId && ['catalogId','role'].some(field=>template.materialSelections?.find(x=>x.selectionId===next.materialSelectionId)?.[field] !== rule.template.materialSelections?.find(x=>x.selectionId===next.materialSelectionId)?.[field])
    const overrides = switched ? { ...previous.ruleOverrides, price: true } : {...previous.ruleOverrides}
    if(options.resetQuantityKeys?.includes(next.ruleKey))delete overrides.quantity
    return { ...next, id: previous.id, ...(switched?{previousMaterialSelection:{price:structuredClone(previous.price),quantity:previous.quantity,quantityPending:previous.quantityPending??false,unit:previous.unit,catalogId:previous.catalogId??null}}:previous.previousMaterialSelection?{previousMaterialSelection:previous.previousMaterialSelection}:{}), ruleOverrides: overrides, ...(Object.keys(overrides).length ? { origin: switched ? 'manual' : previous.origin } : {}),
      ...(overrides.quantity ? { quantity: previous.quantity, takeoff: previous.takeoff, quantityPending: switched || previous.quantityPending===true || next.quantityPendingReason==='PURCHASE_UNIT_REVIEW'&&!(overrides.price&&previous.unit==='ea'&&previous.price?.status==='manual'), ...(switched ? { quantityPendingReason:'PACKAGE_CHANGED', previousPurchaseQuantity:{quantity:previous.quantity,unit:previous.unit,catalogId:previous.catalogId??null} } : {quantityPendingReason:previous.quantityPendingReason,previousPurchaseQuantity:previous.previousPurchaseQuantity}) } : {}),
      ...(overrides.price && !switched ? { unitCost: previous.unitCost, unit: previous.unit, catalogId: previous.catalogId, costType: previous.costType,
        price: previous.price, priceSource: previous.priceSource, priceDate: previous.priceDate, needsReview: previous.needsReview, priceMissing:previous.priceMissing??false,
        description: previous.description, translations: previous.translations } : {}),
      ...(overrides.description ? { description: previous.description } : {}),
      ...(overrides.notes ? { notes: previous.notes, ruleNotes: undefined } : {}),
      ...(overrides.markupBps ? { markupBps: previous.markupBps } : {}),
    }
  })
  const unrelated = section.items.filter(x => !x.ruleKey)
  return reconcilePaintExpenses({ ...document, sections: document.sections.map(x => x.id === taskId ? { ...x, items: [...items, ...unrelated] } : x),
    rules: { ...document.rules, paint: { ...document.rules.paint, [taskId]: { ...rule, retiredMaterialAllowances, version: PAINT_RULE_VERSION, inputs, template, catalogSnapshots: snapshots, areaSqFt: fresh.areaSqFt, parameterEvidence: fresh.parameterEvidence } } } })
}
