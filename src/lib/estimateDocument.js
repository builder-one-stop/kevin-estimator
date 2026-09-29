export const ESTIMATE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected']
export const COST_TYPES = ['material', 'labor', 'equipment', 'other']
export const UNITS = ['ea', 'sf', 'lf', 'hr', 'day', 'cy', 'lot']

export const emptyDocument = () => ({ sections: [], proposal: { intro: '', scope: '', notes: '', exclusions: '', terms: '' } })
export const newSection = () => ({ id: crypto.randomUUID(), title: 'New section', collapsed: false, items: [] })
export const newItem = () => ({ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'ea', unitCost: 0, costType: 'material', notes: '', priceSource: '', priceDate: '', needsReview: false })

export function moneyCents(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.round((number + Number.EPSILON) * 100)
}

export function itemCostCents(item) {
  const quantity = Number(item.quantity)
  return Number.isFinite(quantity) && quantity >= 0 ? Math.round(quantity * moneyCents(item.unitCost)) : 0
}

export function calculateEstimate(document, markupBps = 3600) {
  const sections = (document?.sections ?? []).map((section) => ({
    id: section.id,
    costCents: (section.items ?? []).reduce((sum, item) => sum + itemCostCents(item), 0),
  }))
  const costCents = sections.reduce((sum, section) => sum + section.costCents, 0)
  const markupCents = Math.round(costCents * Number(markupBps || 0) / 10000)
  const priceCents = costCents + markupCents
  return { sections, costCents, markupCents, profitCents: markupCents, priceCents,
    marginPercent: priceCents ? markupCents / priceCents * 100 : 0 }
}

// Allocate rounding cents so displayed client line prices sum to the final sale price.
export function proposalPrices(document, markupBps = 3600) {
  const rate = 1 + markupBps / 10000
  const items = (document?.sections ?? []).flatMap((section) => section.items ?? [])
  const priced = items.map((item, index) => {
    const exact = itemCostCents(item) * rate
    return { id: item.id, index, cents: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let remainder = calculateEstimate(document, markupBps).priceCents - priced.reduce((sum, item) => sum + item.cents, 0)
  for (const item of [...priced].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remainder <= 0) break
    item.cents += 1; remainder -= 1
  }
  return new Map(priced.map((item) => [item.id, item.cents]))
}

export function duplicateDocument(document) {
  return { ...structuredClone(document), sections: document.sections.map((section) => ({
    ...structuredClone(section), id: crypto.randomUUID(), items: section.items.map((item) => ({ ...structuredClone(item), id: crypto.randomUUID() })),
  })) }
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
      if (typeof item.description !== 'string' || !COST_TYPES.includes(item.costType) || !UNITS.includes(item.unit)) return 'Invalid item'
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 || !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0) return 'Invalid quantity or cost'
    }
  }
  return null
}
