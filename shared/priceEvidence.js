// Evidence criteria are independent of scope approval, commercial status, and account identity.
import {sameOffer,priceFreshness,priceJobZip} from './priceOffers.js'
export const PRICE_POLICY_VERSION = 'source-evidence-1'
export const PRICE_REVIEW_DAYS = 30
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
const link = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) } catch { return false } }

export function assessPrice(entry, jobZip = '', today = new Date().toISOString().slice(0, 10)) {
  let reason = null
  const ageDays = day(entry?.checkedAt) ? Math.floor((Date.parse(today) - Date.parse(entry.checkedAt)) / 86400000) : null
  if (!Number.isFinite(entry?.unitCost) || entry.unitCost < 0) reason = 'PRICE_MISSING'
  else if ((entry.country && entry.country !== 'US') || (entry.region && entry.region !== 'CA') || (entry.city && entry.city !== 'Los Angeles')) reason = 'MARKET_MISMATCH'
  else if (!day(entry.checkedAt)) reason = 'SOURCE_DATE_MISSING'
  else if (ageDays < 0) reason = 'SOURCE_DATE_IN_FUTURE'
  else if (entry.validUntil && (!day(entry.validUntil) || entry.validUntil < today || entry.validUntil < entry.checkedAt)) reason = 'PRICE_EXPIRED'
  else if (ageDays > PRICE_REVIEW_DAYS) reason = 'SOURCE_REVIEW_DUE'
  else if (!entry.product || !entry.brand || !entry.package || !entry.unit || !entry.vendor || !link(entry.url)) reason = 'PRODUCT_SOURCE_INCOMPLETE'
  else if (!entry.evidence) reason = 'SOURCE_EVIDENCE_MISSING'
  let status = entry?.status === 'manual' ? 'manual' : 'provisional'
  if (!reason && entry.status === 'public_observed') status = 'public_observed'
  if (!reason && entry.status === 'verified') {
    if (entry.country !== 'US' || entry.region !== 'CA' || entry.city !== 'Los Angeles') reason = 'MARKET_UNCONFIRMED'
    else if (!/^\d{5}$/.test(jobZip) || entry.verifiedZip !== jobZip) reason = 'JOB_LOCATION_UNCONFIRMED'
    else if (!entry.location || !entry.localPriceEvidence) reason = 'BRANCH_EVIDENCE_MISSING'
    else if (!entry.validUntil) reason = 'VALIDITY_UNSPECIFIED'
    else status = 'verified'
  }
  return { policyVersion: PRICE_POLICY_VERSION, status, reason, ageDays, reviewAfterDays: PRICE_REVIEW_DAYS,
    checkedAt: entry?.checkedAt || null, validUntil: entry?.validUntil || null,
    productMatched: Boolean(entry?.product && entry?.brand && entry?.package && entry?.unit),
    branchZipMatched: status === 'verified', market: { city:'Los Angeles', region:'CA', country:'US', currency:'USD' }, externallyQueried: false }
}

export function collectPriceReferences(records, owner, today) {
  const references = []
  for (const record of records) {
    // Defense in depth: callers must also filter by owner in the database query.
    if (record.owner_id !== owner) continue
    const market = record.document?.market
    if (market && ((market.country && !['US','United States'].includes(market.country)) || (market.region && !['CA','California'].includes(market.region)) || (market.city && market.city !== 'Los Angeles'))) continue
    for (const section of record.document?.sections || []) for (const item of section.items || []) {
      if (!Number.isFinite(item.unitCost) || item.unitCost < 0 || !item.unit) continue
      const price = structuredClone(item.price || { status: 'manual', unitCost: item.unitCost })
      price.unitCost = item.unitCost
      const assessment = assessPrice(price, priceJobZip(record.document||{}), today)
      references.push({ id: `${record.id}:${item.id}`, description: item.description, unit: item.unit,
        costType: item.costType, unitCost: item.unitCost, catalogId: item.catalogId || null,
        price: { ...price, status: assessment.status, verification: assessment },
        source: { estimateId: record.id, estimateVersion: record.version, itemId: item.id, savedAt: record.updated_at } })
      if (references.length >= 200) return references
    }
  }
  return references
}

export function referenceMatches(item, reference) {
  if (item.unit !== reference.unit || item.costType !== reference.costType) return false
  if (item.price?.product || reference.price?.product) {
    return Boolean(item.price?.product && reference.price?.product) && sameOffer(item.price,reference.price)
  }
  return item.description.trim().toLowerCase() === reference.description.trim().toLowerCase()
}

export function applyPriceReference(item, reference, jobZip = '', today) {
  if (!referenceMatches(item, reference)) throw Error('REFERENCE_PRODUCT_MISMATCH')
  const verification = assessPrice(reference.price, jobZip, today)
  if (verification.reason === 'MARKET_MISMATCH') throw Error('REFERENCE_MARKET_MISMATCH')
  return { ...item, unitCost: reference.unitCost, origin: 'reference-reuse', needsReview: verification.status !== 'verified',
    price: { ...structuredClone(reference.price), status: verification.status, verification,freshness:priceFreshness(verification),
      reusedFrom: structuredClone(reference.source), internalPriceApproval: 'not-required' },
    priceDate: reference.price.checkedAt || '',
    priceSource: `${reference.price.vendor || 'Saved reference'} | ${verification.status} | ${reference.source.estimateId.slice(0, 8)} v${reference.source.estimateVersion}`,
    ...(item.ruleKey ? { ruleOverrides: { ...item.ruleOverrides, price: true } } : {}) }
}
