import Decimal from 'decimal.js'
import { takeoffSummary } from './materialTakeoff.js'

const cost = item => new Decimal(item.quantity).times(new Decimal(item.unitCost).times(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP)).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber()
export const manualPaintExpense = item => Boolean(item.ruleOverrides?.price || item.ruleOverrides?.quantity || item.unit !== 'lot' || item.costType !== 'other')

// Percent expenses apply to material + labor in the same room, including manual additions.
// Equipment/other expenses and the expense itself are excluded. Never compound the allowance.
export function reconcilePaintExpenses(document) {
  if (!document?.rules?.paint) return document
  return { ...document, sections: document.sections.map(section => {
    const rule = document.rules.paint[section.id]
    if (!rule) return section
    const percent = Number(rule.template.expensesPercent)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw Error('INVALID_EXPENSES')
    const baseCents = section.items.filter(item => item.ruleKey !== 'expenses:expenses' && !item.priceMissing && !item.quantityPending && ['material','labor'].includes(item.costType)).reduce((sum,item)=>sum+cost(item),0)
    const amountCents = new Decimal(baseCents).times(percent).div(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber()
    return { ...section, items: section.items.map(item => {
      if (item.ruleKey !== 'expenses:expenses') return item
      const manual = manualPaintExpense(item)
      return { ...item, ...(manual ? {} : { quantity:1, unitCost:amountCents/100 }),
        expenseCalculation: { mode:manual?'manual':'percentage', percent, baseCents, amountCents:manual?cost(item):amountCents } }
    }) }
  }) }
}

export function resetPaintExpense(item) {
  const ruleOverrides = { ...item.ruleOverrides }
  delete ruleOverrides.price
  delete ruleOverrides.quantity
  return { ...item,quantity:1,unit:'lot',costType:'other',ruleOverrides,origin:'rule-engine',needsReview:true,
    price:{status:'provisional',source:'rule-assumption',reason:'EXPENSES_ALLOWANCE',internalPriceApproval:'not-required'} }
}

export function markReviewedPaintChange(previous, next) {
  if (!previous?.ruleKey) return next
  const quantity = Number(previous.quantity) !== Number(next.quantity) || Boolean(previous.quantityPending)!==Boolean(next.quantityPending)
  const price = Number(previous.unitCost) !== Number(next.unitCost) || previous.unit !== next.unit || previous.costType !== next.costType
  return { ...next, ruleOverrides:{...previous.ruleOverrides,...next.ruleOverrides,...(quantity?{quantity:true}:{}),...(price?{price:true}:{})},
    ...(quantity?{takeoff:undefined}:{}) }
}

export function paintLineNotes(item, rule, language = 'en') {
  const es = language === 'es'
  const local = value => typeof value === 'string' ? value : value?.[language] || value?.en || ''
  const custom = item.ruleOverrides?.notes ? item.notes : ''
  if (item.ruleKey === 'expenses:expenses' && rule) {
    const explanation = manualPaintExpense(item)
      ? es ? 'Gasto ajustado manualmente. Sustituye la regla porcentual; se conserva hasta restablecerla explícitamente.' : 'Manual expense override. Replaces the percentage rule and remains until explicitly reset.'
      : es ? `${rule.template.expensesPercent}% del costo de materiales y mano de obra de este ambiente; recalculado tras editar. Excluye esta partida, equipos y otros gastos. Impuestos y flete no confirmados.`
        : `${rule.template.expensesPercent}% of this room’s material and labor cost; recalculated after edits. Excludes this line, equipment and other expenses. Tax and freight unconfirmed.`
    return [custom,explanation].filter(Boolean).join('\n')
  }
  if(item.quantityPending && item.quantityPendingReason==='PACKAGE_CHANGED')return [custom,es?'Cambió el producto o envase: confirma una nueva cantidad de compra; la cantidad manual anterior se conserva como antecedente.':'Product or package changed: confirm a new purchase quantity; the earlier manual quantity is retained as history.'].filter(Boolean).join('\n')
  if(item.quantityPending)return [custom,es?'Producto o envase sin resolver; cantidad de compra pendiente. Las medidas originales se conservan en el plan.':'Product or purchase package unresolved; purchase quantity pending. Original measurements remain in the plan.'].filter(Boolean).join('\n')
  const quantityChanged = item.ruleOverrides?.quantity || (item.takeoff && Number(item.quantity) !== Number(item.takeoff.packages))
  if (item.ruleKey && quantityChanged) {
    const explanation = es ? `Cantidad ajustada manualmente: ${item.quantity} ${item.unit}. Sustituye la cantidad calculada; no se afirma el cálculo anterior como cantidad actual.`
      : `Manual quantity override: ${item.quantity} ${item.unit}. Replaces the calculated quantity; the earlier takeoff is not the current order.`
    return [custom,explanation].filter(Boolean).join('\n')
  }
  const notes = item.ruleNotes ? local(item.ruleNotes) : item.basis && [item.basis.en,item.basis.es].includes(item.notes) ? local(item.basis) : item.notes
  return [notes,takeoffSummary(item.takeoff,language)].filter(Boolean).join('\n')
}
