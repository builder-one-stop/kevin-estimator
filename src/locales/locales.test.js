import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? keys(item, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

describe('interface translations', () => {
  it('keeps English and Spanish keys aligned', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort())
  })

  it('labels the main Estimates route in both languages', () => {
    expect(en.nav.estimates).toBe('Estimates')
    expect(es.nav.estimates).toBe('Estimados')
  })
})
