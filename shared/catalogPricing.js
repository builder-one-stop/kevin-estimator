import { exactCatalogMatch } from './researchCatalog.js'
import { assessPrice } from './priceEvidence.js'

export function priceSourceLabel(entry, price, language = 'en') {
  const es = language === 'es'
  const state = price.status === 'verified'
    ? (es ? `precio documentado para Los Ángeles, CA, US, ZIP ${entry.verifiedZip}` : `documented price for Los Angeles, CA, US, ZIP ${entry.verifiedZip}`)
    : price.status === 'public_observed'
      ? (es ? 'precio público online; sucursal/ZIP no verificados' : 'public online price; branch/ZIP unverified')
      : (es ? 'precio provisional; revisar' : 'provisional price; review')
  return `${entry.vendor} · ${entry.product} · ${entry.package} · ${state}`
}

export function catalogPriceSnapshot(entry, jobZip = '') {
  const verification = assessPrice(entry, jobZip)
  const localVerified = verification.status === 'verified'
  return {
    ...structuredClone(entry),
    status: verification.status,
    category: localVerified ? 'local-source' : verification.status === 'public_observed' ? 'public-online-reference' : 'provisional-assumption',
    source: entry.sourceId ? 'phase-a-research' : 'owner-catalog',
    reason: verification.reason, verification,
    internalPriceApproval: 'not-recorded',
  }
}

export function applyCatalogPrice(item, entry, jobZip = '', language = 'en') {
  if (item.costType !== 'material') throw new Error('CATALOG_MATERIAL_ONLY')
  if (!entry.package || entry.unitCost === null) throw new Error('CATALOG_PRICE_MISSING')
  if (entry.status === 'verified' && entry.verifiedZip !== jobZip) throw new Error('CATALOG_ZONE_MISMATCH')
  if (entry.validUntil && entry.validUntil < new Date().toISOString().slice(0, 10)) throw new Error('CATALOG_PRICE_EXPIRED')
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
  return catalog.find(entry => exactCatalogMatch(entry, query) && entry.unitCost !== null &&
    (!entry.validUntil || entry.validUntil >= new Date().toISOString().slice(0, 10))) || null
}
