import { ESTIMATING_MARKET } from './estimatingMarket.js'
import { planSchema, outputSchema } from './aiSchemas.js'
import { calculateEstimate, validateEstimate } from '../src/lib/estimateDocument.js'
import { catalogPriceSnapshot, priceSourceLabel } from './catalogPricing.js'
export const localText = (value, language = 'en') => typeof value === 'string' ? value : value?.[language] || value?.en || ''
export const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
export function assertPlan(plan, approvable = false) {
  planSchema.parse(plan)
  if (new Set(plan.tasks.map(x => x.id)).size !== plan.tasks.length) throw fail('DUPLICATE_ID')
  if (approvable && plan.pending.length) throw fail('PLAN_HAS_QUESTIONS')
  if (approvable && plan.tasks.some(t => !t.included.en.trim() || !t.included.es.trim() || t.components.some(c => !c.en.trim() || !c.es.trim()) || (!t.confirmed && !t.assumptions.en.trim()))) throw fail('PLAN_UNCONFIRMED')
  return plan
}
function itemFromLine(line, catalog, language, jobZip = '') {
  const entry = catalog.find(x => x.id === line.catalogId)
  if (line.catalogId && (!entry || entry.unit !== line.unit || !entry.package || entry.unitCost === null ||
    (entry.status === 'verified' && entry.verifiedZip !== jobZip) ||
    (entry.validUntil && entry.validUntil < new Date().toISOString().slice(0, 10)))) throw fail('CATALOG_MISMATCH')
  const price = entry ? catalogPriceSnapshot(entry, jobZip) : { status: 'provisional', source: 'model-proposal', category: 'provisional-assumption', internalPriceApproval: 'not-recorded', reason: 'NO_BACKED_PRICE' }
  return { ...line, description: localText(line.description, language), translations: line.description,
    unitCost: entry?.unitCost ?? line.unitCost,
    price,
    priceSource: entry ? priceSourceLabel(entry, price, language) : (language === 'es' ? 'Supuesto provisional — sin precio local verificado' : 'Provisional assumption — no verified local price'),
    priceDate: entry?.checkedAt || '', needsReview: price.status !== 'verified',
    notes: localText(line.basis, language), origin: 'ai-proposal' }
}
export function documentFromLines(plan, lines, language, catalog = [], business = {}, revision = 1) {
  assertPlan(plan, true)
  if (!lines.length || new Set(lines.map(x => x.id)).size !== lines.length) throw fail('INVALID_LINES')
  const taskIds = new Set(plan.tasks.map(x => x.id))
  if (lines.some(x => !taskIds.has(x.taskId))) throw fail('OUTSIDE_APPROVED_SCOPE')
  if (plan.tasks.some(t => !lines.some(x => x.taskId === t.id))) throw fail('UNPRICED_SCOPE')
  const doc = { sections: plan.tasks.map(task => ({ id: task.id, title: localText(task.room, language),
    items: lines.filter(x => x.taskId === task.id).map(x => itemFromLine(x, catalog, language, plan.zip)) })),
    proposal: { intro: '', scope: '', notes: '', exclusions: '', terms: '' },
    scope: { plan: structuredClone(plan), revision, approvalType: 'plan' }, market: { ...ESTIMATING_MARKET }, language, business: structuredClone(business) }
  for (const item of doc.sections.flatMap(s => s.items)) {
    if (item.price?.status === 'verified' && item.price.verifiedZip !== plan.zip) {
      item.price.status = 'provisional'; item.price.category = 'provisional-assumption'; item.price.reason = 'JOB_LOCATION_UNCONFIRMED'; item.needsReview = true
    }
  }
  assertDocument(doc, plan.markupBps)
  return doc
}
export function assertDocument(doc, markup) {
  const invalid = validateEstimate(doc, markup)
  if (invalid) throw fail('INVALID_ESTIMATE')
  const sums = calculateEstimate(doc, markup)
  if (!Number.isSafeInteger(sums.costCents) || !Number.isSafeInteger(sums.priceCents)) throw fail('AMOUNT_LIMIT')
  const ids = doc.sections.flatMap(s => [s.id,...s.items.map(i => i.id)])
  if (new Set(ids).size !== ids.length) throw fail('DUPLICATE_ID')
  if (doc.scope) {
    assertPlan(doc.scope.plan, true)
    const tasks = new Set(doc.scope.plan.tasks.map(t => t.id))
    for (const section of doc.sections) {
      const task = doc.scope.plan.tasks.find(t => t.id === section.id)
      for (const item of section.items) {
        if (item.origin === 'ai-proposal' && !task?.components.some(c => c.en === item.translations?.en && c.es === item.translations?.es)) throw fail('UNAPPROVED_DESCRIPTION')
        if (item.origin === 'ai-proposal' && item.price?.product) {
          const approvedText = [task?.product.en, ...task?.components.map(c=>c.en)||[]].join(' ').toLowerCase()
          if (['product','brand','package'].some(key => item.price[key] && !approvedText.includes(item.price[key].toLowerCase()))) throw fail('UNAPPROVED_PRODUCT')
        }
      }
    }
    if (doc.sections.some(s => !tasks.has(s.id) || s.items.some(i => i.taskId !== s.id)) || doc.scope.plan.tasks.some(t => !doc.sections.some(s => s.id === t.id && s.items.length))) throw fail('OUTSIDE_APPROVED_SCOPE')
  }
  return doc
}
export function proposedChange(estimate, output, catalog, revision) {
  outputSchema.parse(output)
  const plan = output.plan ?? { ...estimate.document.scope.plan, markupBps: estimate.markup_bps }
  assertPlan(plan, true)
  const document = structuredClone(estimate.document)
  const before = new Map(document.sections.flatMap(s => s.items.map(i => [i.id,i])))
  const changed = new Set()
  for (const op of output.changes) {
    if (changed.has(op.id)) throw fail('DUPLICATE_OPERATION')
    changed.add(op.id)
    if (op.action === 'add' ? before.has(op.id) : !before.has(op.id)) throw fail('UNKNOWN_LINE')
    for (const s of document.sections) s.items = s.items.filter(i => i.id !== op.id)
    if (op.action !== 'remove') {
      if (!op.line || op.line.id !== op.id) throw fail('INVALID_CHANGE')
      let section = document.sections.find(s => s.id === op.line.taskId)
      if (!section) {
        const task = plan.tasks.find(t => t.id === op.line.taskId)
        if (!task) throw fail('OUTSIDE_APPROVED_SCOPE')
        section = { id: task.id, title: localText(task.room, document.language), items: [] }; document.sections.push(section)
      }
      const proposedItem = itemFromLine(op.line, catalog, document.language, plan.zip)
      const previousItem = before.get(op.id)
      const samePrice = previousItem && Number(previousItem.unitCost) === proposedItem.unitCost && previousItem.unit === proposedItem.unit && (previousItem.catalogId ?? null) === op.line.catalogId
      const item = { ...previousItem, ...proposedItem,
        ...(previousItem?.origin === 'manual' ? { notes: previousItem.notes } : {}),
        ...(samePrice ? { price: previousItem.price, priceSource: previousItem.priceSource, priceDate: previousItem.priceDate, needsReview: previousItem.needsReview } : {}) }
      const oldSection = estimate.document.sections.find(s => s.items.some(i => i.id === op.id))
      const index = oldSection?.id === section.id ? oldSection.items.findIndex(i => i.id === op.id) : section.items.length
      section.items.splice(index, 0, item)
    }
  }
  document.sections = document.sections.filter(s => plan.tasks.some(t => t.id === s.id))
  // A removed task must explicitly remove every line; no implicit loss of manual work.
  if (estimate.document.sections.some(s => !plan.tasks.some(t => t.id === s.id) && s.items.some(i => !output.changes.some(o => o.id === i.id && o.action === 'remove')))) throw fail('IMPLICIT_DELETION')
  document.scope = { plan: structuredClone(plan), revision, approvalType: 'plan' }
  for (const item of document.sections.flatMap(s => s.items)) {
    if (item.price?.status === 'verified' && item.price.verifiedZip !== plan.zip) {
      item.price.status = 'provisional'; item.price.category = 'provisional-assumption'; item.price.reason = 'JOB_LOCATION_UNCONFIRMED'; item.needsReview = true
    }
  }
  assertDocument(document, plan.markupBps)
  const next = { ...estimate, document, markup_bps: plan.markupBps }
  const prior = calculateEstimate(estimate.document, estimate.markup_bps), after = calculateEstimate(document, next.markup_bps)
  return { estimateVersion: estimate.version, document, markupBps: next.markup_bps, plan,
    operations: output.changes.map(o => ({ action: o.action, id: o.id, before: before.get(o.id) || null, after: document.sections.flatMap(s => s.items).find(i => i.id === o.id) || null })),
    costDelta: after.costCents - prior.costCents, saleDelta: after.priceCents - prior.priceCents }
}
export function proposalView(estimate, language = estimate.document.language || 'en') {
  assertDocument(estimate.document, estimate.markup_bps)
  const scope = estimate.document.scope
  return { language, title: scope && Object.values(scope.plan.title).includes(estimate.title) ? localText(scope.plan.title, language) : estimate.title,
    revision: estimate.version, scopeRevision: scope?.revision, business: estimate.document.business || {},
    client: estimate.client?.name || '', address: scope?.plan.address || estimate.project?.address || '',
    tasks: scope?.plan.tasks.map(t => ({ ...t, room: localText(t.room, language), work: localText(t.work, language),
      included: localText(t.included, language), excluded: localText(t.excluded, language), measurements: localText(t.measurements, language),
      preparation: localText(t.preparation, language), product: localText(t.product, language), finish: localText(t.finish, language),
      assumptions: localText(t.assumptions, language), provenance: localText(t.provenance, language) })) || [],
    assumptions: scope ? localText(scope.plan.assumptions, language) : '',
    sums: calculateEstimate(estimate.document, estimate.markup_bps),
    provisional: estimate.document.sections.flatMap(s => s.items).some(i => i.needsReview || i.price?.status === 'provisional') }
}
