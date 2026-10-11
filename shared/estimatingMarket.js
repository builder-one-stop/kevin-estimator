import Decimal from 'decimal.js'
import { z } from 'zod'

// Application configuration, independent of interface/document language and user prose.
export const ESTIMATING_MARKET = Object.freeze({ id: 'us-ca-los-angeles', city: 'Los Angeles', region: 'California', country: 'US', currency: 'USD', lengthUnit: 'ft', areaUnit: 'sf' })
export const pricingAvailability = () => ({
  approvedHistory: { status: 'unavailable', reason: 'NO_INTERNAL_PRICE_APPROVAL_RECORDS' },
  localConnector: { status: 'not-connected' },
  catalog: { scope: 'current-owner-only', externallyQueried: false },
  approvals: { plan: 'scope-and-assumptions-only', internalPrice: 'not-recorded', client: 'separate-commercial-status-not-price-approval' },
})

const units = { ft: ['length', '0.3048'], in: ['length', '0.0254'], m: ['length', '1'], cm: ['length', '0.01'], mm: ['length', '0.001'], sf: ['area', '0.09290304'], m2: ['area', '1'], cy: ['volume', '0.764554857984'], m3: ['volume', '1'], gal: ['liquid', '3.785411784'], l: ['liquid', '1'] }
const quantity = z.number().min(0).max(1000000)
const measureUnit = z.enum(Object.keys(units))
export const conversionsSchema = z.object({ measurements: z.array(z.object({ value: quantity, from: measureUnit, to: measureUnit }).strict()).min(1).max(40) }).strict()
export function convertMeasurement(value, from, to) {
  if (!Number.isFinite(value) || value < 0 || !units[from] || !units[to] || units[from][0] !== units[to][0]) throw new Error('INVALID_MEASUREMENT')
  return new Decimal(value).times(units[from][1]).div(units[to][1]).toNumber()
}
const length = z.object({ value: quantity, unit: z.enum(['ft', 'in', 'm', 'cm', 'mm']) }).strict()
export const roomsSchema = z.object({ rooms: z.array(z.object({
  id: z.string().min(1).max(80), length, width: length, height: length.nullable(),
  openings: z.object({ value: quantity, unit: z.enum(['sf', 'm2']) }).strict(),
  useGrossWalls: z.boolean(),
}).strict()).min(1).max(40) }).strict()
export function measureRooms(input) {
  return roomsSchema.parse(input).rooms.map(room => {
    const feet = x => new Decimal(convertMeasurement(x.value, x.unit, 'ft'))
    const l = feet(room.length), w = feet(room.width), h = room.height && feet(room.height)
    const gross = h ? l.plus(w).times(2).times(h) : null
    const deductions = room.useGrossWalls ? new Decimal(0) : new Decimal(convertMeasurement(room.openings.value, room.openings.unit, 'sf'))
    if ((!gross && deductions.gt(0)) || (gross && deductions.gt(gross))) throw new Error('INVALID_OPENINGS')
    return { id: room.id, input: room, floorSqFt: l.times(w).toNumber(), grossWallSqFt: gross?.toNumber() ?? null,
      deductedSqFt: deductions.toNumber(), wallSqFt: gross?.minus(deductions).toNumber() ?? null,
      formula: '2 × (length + width) × height; floor = length × width', dimensionsVerified: false }
  })
}
