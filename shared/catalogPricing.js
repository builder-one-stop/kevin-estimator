import { exactCatalogMatch } from './researchCatalog.js'
import { assessPrice } from './priceEvidence.js'
import {priceFreshness} from './priceOffers.js'

export const webReferenceNotice=(language='en')=>language==='es'
 ? 'Los precios web sirven como referencia para presupuestar. No necesitas cuenta ni contacto de proveedor, tienda elegida o ZIP de obra. El precio de compra, impuestos y flete pueden variar. Elegir una tienda no actualiza la fecha observada.'
 : 'Web prices are budgeting references. No supplier account or contact, selected store or job ZIP is required. Purchase prices, tax and delivery may vary. Selecting a store does not refresh the observed date.'
export function priceSourceLabel(entry, price, language = 'en') {
  const es = language === 'es'
  const state = entry.evidenceKind==='authorized-quote'&&price.freshness!=='stale'?(es?'cotización importada autorizada; sin verificación local':'authorized imported quote; not locally verified'):price.freshness === 'stale'
    ? (es ? `precio anterior vencido; revisar (${entry.checkedAt})` : `stale previous price; review (${entry.checkedAt})`)
    : price.status === 'verified'
    ? (es ? `precio documentado para Los Ángeles, CA, US, ZIP ${entry.verifiedZip}` : `documented price for Los Angeles, CA, US, ZIP ${entry.verifiedZip}`)
    : price.status === 'public_observed'
      ? (es ? 'precio público online; sucursal/ZIP no verificados' : 'public online price; branch/ZIP unverified')
      : (es ? 'precio provisional; revisar' : 'provisional price; review')
  const identity=[entry.sku&&`SKU ${entry.sku}`,entry.model&&`model ${entry.model}`,entry.variant,entry.offer?.storeId&&`store ${entry.offer.storeId}`,entry.offer?.storeZip&&`store ZIP ${entry.offer.storeZip}`,entry.offer?.jobZip&&`job ZIP ${entry.offer.jobZip}`,entry.unit,entry.url].filter(Boolean).join(' | ')
  const alternative=entry.referenceSelection?.kind==='accepted-alternative'?(es?`Alternativa referencial aceptada para ${entry.referenceSelection.requested}; sin equivalencia confirmada. `:`Accepted budgeting alternative for ${entry.referenceSelection.requested}; equivalence not confirmed. `):''
  return `${alternative}${identity} | ${entry.vendor} · ${entry.product} · ${entry.package} · ${state}`
}

export function catalogPriceSnapshot(entry, jobZip = '') {
  const verification = assessPrice(entry, jobZip)
  const localVerified = verification.status === 'verified'
  return {
    ...structuredClone(entry),
    status: verification.status,
    category: localVerified ? 'local-source' : verification.status === 'public_observed' ? 'public-online-reference' : 'provisional-assumption',
    source: entry.provenanceClass==='current-owner'||entry.source==='owner-catalog'?'owner-catalog':entry.sourceId ? 'phase-a-research' : 'owner-catalog',
    reason: verification.reason, verification,
    freshness:priceFreshness(verification),observationFreshness:entry.freshness||null,
    internalPriceApproval: 'not-recorded',
  }
}

export function applyCatalogPrice(item, entry, jobZip = '', language = 'en') {
  if (item.costType !== 'material') throw new Error('CATALOG_MATERIAL_ONLY')
  if (!entry.package || entry.unitCost === null) throw new Error('CATALOG_PRICE_MISSING')
  const price = catalogPriceSnapshot(entry, jobZip)
  if (price.reason === 'MARKET_MISMATCH') throw new Error('CATALOG_MARKET_MISMATCH')
  const namedProduct = entry.product.toLowerCase().startsWith(entry.brand.toLowerCase()) ? entry.product : `${entry.brand} ${entry.product}`
  return {
    ...item, description: `${namedProduct} · ${entry.package}`,
    translations: undefined, origin: 'manual', catalogId: entry.id, unit: entry.unit, unitCost: entry.unitCost,
    previousCatalogId: undefined,
    takeoff: item.catalogId === entry.id || item.previousCatalogId === entry.id ? item.takeoff : undefined,
    price, priceSource: priceSourceLabel(entry, price, language),
    priceDate: entry.checkedAt, needsReview: price.status !== 'verified',
  }
}

export function exactPrice(catalog, query) {
  const matches=catalog.filter(entry => exactCatalogMatch(entry, query) && entry.unitCost !== null &&
    (!entry.validUntil || entry.validUntil >= new Date().toISOString().slice(0, 10)))
  return matches.length===1?matches[0]:null
}
