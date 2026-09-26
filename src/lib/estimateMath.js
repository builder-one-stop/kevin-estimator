const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100

export function subtotal(sections) {
  return roundCurrency(sections.reduce((sum, section) => (
    sum + section.items.reduce((sectionSum, [, quantity, , unitPrice]) => sectionSum + quantity * unitPrice, 0)
  ), 0))
}

export function markup(amount, rate = 0.36) {
  return roundCurrency(amount * rate)
}

export function total(amount, markupAmount) {
  return roundCurrency(amount + markupAmount)
}
