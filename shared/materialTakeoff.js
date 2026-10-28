import Decimal from 'decimal.js'

export function paintPackages({ areaSqFt, coats, coverageSqFtPerGallon, wastePercent = 0, packageGallons }) {
  const values = [areaSqFt, coats, coverageSqFtPerGallon, packageGallons]
  if (values.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0) ||
    !Number.isFinite(Number(wastePercent)) || Number(wastePercent) < 0 || Number(wastePercent) > 100) throw new Error('INVALID_PAINT_TAKEOFF')
  const requiredGallons = new Decimal(areaSqFt).times(coats).times(new Decimal(1).plus(new Decimal(wastePercent).div(100))).div(coverageSqFtPerGallon)
  const packages = requiredGallons.div(packageGallons).ceil().toNumber()
  if(!Number.isSafeInteger(packages) || !requiredGallons.isFinite() || requiredGallons.gt(Number.MAX_SAFE_INTEGER)) throw Error('INVALID_PAINT_TAKEOFF')
  return { requiredGallons: requiredGallons.toDecimalPlaces(4, Decimal.ROUND_UP).toNumber(), packages }
}

export function packageGallons(entry) {
  if (entry?.conversion?.to_unit === 'US_gallon') return Number(entry.conversion.factor)
  if (entry?.conversion?.to_unit === 'US_fl_oz' && entry?.conversion?.factor) return new Decimal(entry.conversion.factor).div(128).toNumber()
  if (entry?.packageData?.unit === 'US_gallon') return Number(entry.packageData.amount)
  if (entry?.packageData?.unit === 'US_fl_oz') return new Decimal(entry.packageData.amount).div(128).toNumber()
  // Managed products may state an explicit US package size without research conversion metadata.
  const stated = entry?.package?.match(/^(\d+(?:\.\d+)?)\s+US\s+(gal|qt|fl oz)\b/i)
  if (stated) return new Decimal(stated[1]).div({ gal: 1, qt: 4, 'fl oz': 128 }[stated[2].toLowerCase()]).toNumber()
  return null
}

export function takeoffSummary(takeoff, language = 'en') {
  if (!takeoff?.packages) return ''
  const { areaSqFt, coats, coverageSqFtPerGallon, wastePercent, requiredGallons, packageGallons: pack, packages } = takeoff
  return language === 'es'
    ? `${areaSqFt} sf × ${coats} manos × (1 + ${wastePercent}% merma) ÷ ${coverageSqFtPerGallon} sf/gal = ${requiredGallons} gal; ${packages} envases de ${pack} gal. Rendimiento y merma son supuestos editables.`
    : `${areaSqFt} sf × ${coats} coats × (1 + ${wastePercent}% waste) ÷ ${coverageSqFtPerGallon} sf/gal = ${requiredGallons} gal; ${packages} × ${pack} gal package(s). Coverage and waste are editable assumptions.`
}
