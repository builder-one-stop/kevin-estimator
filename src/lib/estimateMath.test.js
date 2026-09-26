import { describe, expect, it } from 'vitest'
import { SAMPLE_EST } from '../mocks/data.js'
import { markup, subtotal, total } from './estimateMath.js'

describe('estimate math', () => {
  it('calculates the sample subtotal from line items', () => {
    expect(subtotal(SAMPLE_EST)).toBe(11475)
  })

  it('rounds markup to currency precision', () => {
    expect(markup(11475, 0.36)).toBe(4131)
    expect(markup(10.01, 0.36)).toBe(3.6)
  })

  it('adds subtotal and markup', () => {
    expect(total(11475, 4131)).toBe(15606)
  })

  it('handles an empty estimate', () => {
    expect(subtotal([])).toBe(0)
  })
})
