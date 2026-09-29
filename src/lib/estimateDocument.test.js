import { describe, expect, it } from 'vitest'
import { calculateEstimate, duplicateDocument, itemCostCents, moveInArray, proposalPrices, validateEstimate } from './estimateDocument.js'

const doc = { sections: [{ id: 'a', title: 'Demo', items: [
  { id: 'i1', description: 'One', quantity: 1, unit: 'ea', unitCost: 0.01, costType: 'material' },
  { id: 'i2', description: 'Two', quantity: 1, unit: 'ea', unitCost: 0.02, costType: 'labor' },
] }], proposal: {} }

describe('persisted estimate calculations', () => {
  it('uses cents and separates markup from sale margin', () => {
    const result = calculateEstimate(doc, 3600)
    expect(result).toMatchObject({ costCents: 3, markupCents: 1, profitCents: 1, priceCents: 4 })
    expect(result.marginPercent).toBe(25)
    expect([...proposalPrices(doc, 3600).values()].reduce((a, b) => a + b, 0)).toBe(result.priceCents)
  })
  it('rounds quantity times unit cost once per item', () => {
    expect(itemCostCents({ quantity: 1.5, unitCost: 0.01 })).toBe(2)
  })
  it('duplicates IDs independently and preserves manual content', () => {
    const copy = duplicateDocument(doc)
    expect(copy.sections[0].id).not.toBe('a')
    expect(copy.sections[0].items[0].id).not.toBe('i1')
    expect(copy.sections[0].items[0].description).toBe('One')
    copy.sections[0].items[0].description = 'Changed'
    expect(doc.sections[0].items[0].description).toBe('One')
  })
  it('validates prices and moves within boundaries', () => {
    expect(validateEstimate(doc, 3600)).toBeNull()
    expect(validateEstimate(doc, -1)).toBeTruthy()
    expect(validateEstimate({ ...doc, sections: [{ ...doc.sections[0], items: [{ ...doc.sections[0].items[0], quantity: -1 }] }] }, 3600)).toBeTruthy()
    expect(moveInArray(['a', 'b'], 0, 1)).toEqual(['b', 'a'])
    expect(moveInArray(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
})
