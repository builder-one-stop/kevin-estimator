import research from './research/la-pricing-phase-a.json' with { type: 'json' }

export const RESEARCH_SOURCE = 'https://github.com/builder-one-stop/kevin-estimator/issues/2#issuecomment-6241898228'
export const RESEARCH_CATALOG_VERSION = research.schema_version
export const researchEvidence = research

const supplierById = new Map(research.suppliers.map(supplier => [supplier.id, supplier]))
const presentation = observation => {
  const pack = observation.package
  if (!pack) return ''
  const label = { US_gallon: 'US gal', US_quart: 'US qt', oz_as_labeled: 'oz as labeled' }[pack.unit] || pack.unit
  return [`${pack.amount} ${label}`, pack.sheen, pack.color, pack.grit && `${pack.grit} grit`].filter(Boolean).join(' · ')
}
const purchaseUnit = observation => {
  if (observation.package?.unit !== 'US_gallon') return 'ea'
  // A nominal one-gallon can has 124 fl oz in one observed variant.
  // Its price is per can, not per full US gallon of liquid.
  if (observation.conversion?.to_unit === 'US_gallon' && observation.conversion.factor !== observation.package.amount) return 'ea'
  if (observation.conversion?.to_unit === 'US_fl_oz' && observation.conversion.factor !== observation.package.amount * 128) return 'ea'
  return 'gal'
}

// Versioned, read-only evidence. A supplier's LA presence is never a local price match.
export const researchCatalog = Object.freeze(research.observations.map((observation, index) => {
  const supplier = supplierById.get(observation.supplier_id)
  return Object.freeze({
    id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
    sourceId: observation.id,
    sourceVersion: research.schema_version,
    category: observation.category,
    product: observation.product,
    brand: observation.brand,
    package: presentation(observation),
    packageData: observation.package,
    conversion: observation.conversion,
    unit: purchaseUnit(observation),
    unitCost: observation.price_usd,
    currency: 'USD',
    vendor: supplier.name,
    location: supplier.location || '',
    supplierCoverage: supplier.coverage,
    supplierUrl: supplier.source,
    url: observation.url,
    sku: observation.sku || '',
    model: observation.model || '',
    checkedAt: observation.observed_date,
    priceVersion: 1,
    validUntil: null,
    verifiedZip: null,
    status: observation.price_usd === null ? 'quote_required' : 'public_observed',
    evidence: observation.evidence_method,
    evidenceMethod: observation.evidence_method,
    freshness: observation.freshness,
    localContext: observation.local_context,
    limitations: observation.limitations,
    salesTax: observation.sales_tax,
    freight: observation.freight,
    paintcareFee: observation.paintcare_fee,
    inventoryVerified: false,
    sourceUrl: RESEARCH_SOURCE,
  })
}))

export function effectiveCatalog(managed = []) {
  const overrides = new Map(managed.filter(entry => entry.sourceId).map(entry => [entry.sourceId, entry]))
  return [...researchCatalog.map(entry => {
    const override = overrides.get(entry.sourceId)
    return override ? { ...entry, ...override, packageData: override.package === entry.package ? entry.packageData : null,
      conversion: override.package === entry.package ? entry.conversion : null } : entry
  }), ...managed.filter(entry => !entry.sourceId)]
}

export function exactCatalogMatch(entry, query) {
  if (!entry || !query) return false
  return entry.product === query.product && entry.brand === query.brand &&
    entry.package === query.package && entry.unit === query.unit &&
    (entry.verifiedZip || null) === (query.verifiedZip || null)
}

const revisionFields = ['product','brand','package','unit','unitCost','vendor','location','url','sku','model','checkedAt','status','evidence','verifiedZip','validUntil','localPriceEvidence','country','region','city']
export function versionManagedCatalog(previous = [], next = []) {
  const oldById = new Map(previous.map(entry => [entry.id, entry]))
  return next.map(entry => {
    const old = oldById.get(entry.id)
    if (!old) return { ...entry, priceVersion: 1, priceHistory: [] }
    const changed = revisionFields.some(key => (entry[key] ?? null) !== (old[key] ?? null))
    const history = old.priceHistory || []
    if (!changed) return { ...entry, priceVersion: old.priceVersion || 1, priceHistory: history }
    const prior = { version: old.priceVersion || 1, product: old.product, brand: old.brand, package: old.package,
      unit: old.unit, vendor: old.vendor, location: old.location, url: old.url, sku: old.sku,
      unitCost: old.unitCost, status: old.status, checkedAt: old.checkedAt,
      validUntil: old.validUntil || null, verifiedZip: old.verifiedZip || null, evidence: old.evidence || '',
      localPriceEvidence: old.localPriceEvidence || '',country:old.country,region:old.region,city:old.city,model:old.model }
    return { ...entry, priceVersion: prior.version + 1, priceHistory: [...history, prior].slice(-100) }
  })
}
