import Decimal from 'decimal.js'
export const ESTIMATE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected']
export const COST_TYPES = ['material', 'labor', 'equipment', 'other']
export const UNITS = ['ea', 'sf', 'lf', 'hr', 'day', 'cy', 'lot', 'gal', 'qt']

export const emptyDocument = () => ({ sections: [], proposal: { intro: '', scope: '', notes: '', exclusions: '', terms: '' } })
export const newSection = () => ({ id: crypto.randomUUID(), title: 'New section', collapsed: false, items: [] })
export const newItem = (language = 'en') => reviseManualPrice({ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'ea', unitCost: 0, costType: 'material', notes: '' }, {}, language)

// A changed cost/unit is new manual evidence, never a verified catalog quote.
export function reviseManualPrice(item, changes, language = 'en') {
  const priceOnly = Object.keys(changes).every(key => key === 'unitCost')
  return { ...item, ...changes, catalogId: null, origin: 'manual', needsReview: true,
    previousCatalogId: priceOnly ? item.catalogId || item.previousCatalogId || null : null,
    takeoff: priceOnly ? item.takeoff : undefined,
    priceSource: language === 'es' ? 'Entrada manual — provisional' : 'Manual entry — provisional', priceDate: '',
    price: { status: 'manual', source: 'manual-entry', category: 'provisional-assumption', internalPriceApproval: 'not-recorded',
      previousSource: item.price?.previousSource || item.price?.source || null,
      previousEvidence: item.price?.previousEvidence || { source: item.priceSource || '', date: item.priceDate || '' } } }
}

export function moneyCents(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return new Decimal(number).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function itemCostCents(item) {
  const quantity = Number(item.quantity)
  return Number.isFinite(quantity) && quantity >= 0 ? new Decimal(quantity).times(moneyCents(item.unitCost)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() : 0
}

export function itemUnitSaleCents(item, markupBps = 3600) {
  return new Decimal(moneyCents(item.unitCost)).times(new Decimal(item.markupBps ?? markupBps).div(10000).plus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function calculateEstimate(document, markupBps = 3600) {
  const sections = (document?.sections ?? []).map((section) => ({
    id: section.id,
    costCents: (section.items ?? []).reduce((sum, item) => sum + itemCostCents(item), 0),
  }))
  const costCents = sections.reduce((sum, section) => sum + section.costCents, 0)
  const exactMarkup = (document?.sections ?? []).flatMap(s => s.items ?? []).reduce((sum, item) =>
    sum.plus(new Decimal(itemCostCents(item)).times(item.markupBps ?? markupBps ?? 0).div(10000)), new Decimal(0))
  const markupCents = exactMarkup.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  const priceCents = costCents + markupCents
  const items = (document?.sections ?? []).flatMap(s => s.items ?? [])
  const costsByType = Object.fromEntries(COST_TYPES.map(type => [type, items.filter(i => i.costType === type).reduce((n, i) => n + itemCostCents(i), 0)]))
  const laborHours = items.filter(i => i.costType === 'labor' && i.unit === 'hr').reduce((n, i) => n.plus(Number(i.quantity) || 0), new Decimal(0)).toNumber()
  return { sections, costsByType, laborHours, costCents, markupCents, profitCents: markupCents, priceCents,
    marginPercent: priceCents ? markupCents / priceCents * 100 : 0 }
}

// Allocate rounding cents so displayed client line prices sum to the final sale price.
export function proposalPrices(document, markupBps = 3600) {
  const items = (document?.sections ?? []).flatMap((section) => section.items ?? [])
  const priced = items.map((item, index) => {
    const exact = new Decimal(itemCostCents(item)).times(new Decimal(item.markupBps ?? markupBps).div(10000).plus(1))
    return { id: item.id, index, cents: exact.floor().toNumber(), remainder: exact.minus(exact.floor()).toNumber() }
  })
  let remainder = calculateEstimate(document, markupBps).priceCents - priced.reduce((sum, item) => sum + item.cents, 0)
  for (const item of [...priced].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remainder <= 0) break
    item.cents += 1; remainder -= 1
  }
  return new Map(priced.map((item) => [item.id, item.cents]))
}

export function duplicateDocument(document) {
  const result = structuredClone(document)
  const sectionIds = new Map(document.sections.map(s => [s.id, crypto.randomUUID()]))
  result.sections = document.sections.map(section => ({ ...structuredClone(section), id: sectionIds.get(section.id),
    items: section.items.map(item => ({ ...structuredClone(item), id: crypto.randomUUID(), ...(item.taskId ? { taskId: sectionIds.get(section.id) } : {}) })) }))
  if (result.scope) result.scope.plan.tasks = result.scope.plan.tasks.map(task => ({ ...task, id: sectionIds.get(task.id) }))
  delete result.conversationId
  return result
}

export function moveInArray(array, index, direction) {
  const target = index + direction
  if (target < 0 || target >= array.length) return array
  const next = [...array]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function validateEstimate(document, markupBps) {
  if (!Number.isInteger(markupBps) || markupBps < 0 || markupBps > 100000) return 'Invalid markup'
  if (!Array.isArray(document?.sections) || !document.proposal || typeof document.proposal !== 'object') return 'Invalid estimate'
  for (const section of document.sections) {
    if (typeof section.title !== 'string' || !Array.isArray(section.items)) return 'Invalid section'
    for (const item of section.items) {
      if (item.markupBps != null && (!Number.isInteger(item.markupBps) || item.markupBps < 0 || item.markupBps > 100000)) return 'Invalid item markup'
      if (typeof item.description !== 'string' || !COST_TYPES.includes(item.costType) || !UNITS.includes(item.unit)) return 'Invalid item'
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 || !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0) return 'Invalid quantity or cost'
    }
  }
  return null
}
