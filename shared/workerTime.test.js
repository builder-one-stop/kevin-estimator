import { it, expect } from 'vitest'
import { shiftTotals, proposedInstant, localDate } from './workerTime.js'
const events = (values) => values.map(([kind, at]) => ({ kind, at }))
it('sums multiple breaks without interpreting remuneration', () => {
  expect(
    shiftTotals(
      events([
        ['in', '2026-10-15T16:00:00Z'],
        ['break_start', '2026-10-15T17:00:00Z'],
        ['break_end', '2026-10-15T17:15:00Z'],
        ['break_start', '2026-10-15T18:00:00Z'],
        ['break_end', '2026-10-15T18:30:00Z'],
        ['out', '2026-10-15T20:00:00Z'],
      ]),
    ),
  ).toEqual({
    elapsed: 14400000,
    breaks: 2700000,
    working: 11700000,
    breakCount: 2,
    provisional: false,
    state: 'closed',
  })
})
it('keeps open shifts provisional including an ongoing break', () => {
  const x = shiftTotals(
    events([
      ['in', '2026-10-15T16:00:00Z'],
      ['break_start', '2026-10-15T17:00:00Z'],
    ]),
    Date.parse('2026-10-15T17:30:00Z'),
  )
  expect(x).toMatchObject({
    elapsed: 5400000,
    breaks: 1800000,
    working: 3600000,
    provisional: true,
    state: 'break',
  })
})
it('handles midnight and DST by elapsed instants rather than wall clock subtraction', () => {
  const x = shiftTotals(
    events([
      ['in', '2026-11-01T07:30:00Z'],
      ['out', '2026-11-01T10:30:00Z'],
    ]),
  )
  expect(x.elapsed).toBe(10800000)
  expect(localDate('2026-11-01T06:30:00Z')).toBe('2026-10-31')
})
it('requires explicit DST ambiguity resolution and rejects nonexistent local time', () => {
  expect(proposedInstant('2026-11-01T01:30', '-07:00')).toBe('2026-11-01T08:30:00.000Z')
  expect(proposedInstant('2026-11-01T01:30', '-08:00')).toBe('2026-11-01T09:30:00.000Z')
  expect(() => proposedInstant('2026-03-08T02:30', '-08:00')).toThrow('INVALID_LOCAL_TIME')
})
