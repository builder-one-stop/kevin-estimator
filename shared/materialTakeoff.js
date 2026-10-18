import Decimal from 'decimal.js'

export function paintPackages({ areaSqFt, coats, coverageSqFtPerGallon, wastePercent = 0, packageGallons }) {
  const values = [areaSqFt, coats, coverageSqFtPerGallon, packageGallons]
  if (values.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0) ||
    !Number.isFinite(Number(wastePercent)) || Number(wastePercent) < 0 || Number(wastePercent) > 100) throw new Error('INVALID_PAINT_TAKEOFF')
  const requiredGallons = new Decimal(areaSqFt).times(coats).times(new Decimal(1).plus(new Decimal(wastePercent).div(100))).div(coverageSqFtPerGallon)
  return { requiredGallons: requiredGallons.toDecimalPlaces(4, Decimal.ROUND_UP).toNumber(),
    packages: requiredGallons.div(packageGallons).ceil().toNumber() }
}

export function packageGallons(entry) {
  if (entry?.conversion?.to_unit === 'US_gallon') return Number(entry.conversion.factor)
  if (entry?.conversion?.to_unit === 'US_fl_oz' && entry?.conversion?.factor) return new Decimal(entry.conversion.factor).div(128).toNumber()
  if (entry?.packageData?.unit === 'US_gallon') return Number(entry.packageData.amount)
  if (entry?.packageData?.unit === 'US_fl_oz') return new Decimal(entry.packageData.amount).div(128).toNumber()
  return null
}

export function takeoffSummary(takeoff, language = 'en') {
  if (!takeoff?.packages) return ''
  const { areaSqFt, coats, coverageSqFtPerGallon, wastePercent, requiredGallons, packageGallons: pack, packages } = takeoff
  return language === 'es'
    ? `${areaSqFt} sf × ${coats} manos × (1 + ${wastePercent}% merma) ÷ ${coverageSqFtPerGallon} sf/gal = ${requiredGallons} gal; ${packages} envases de ${pack} gal. Rendimiento y merma son supuestos editables.`
    : `${areaSqFt} sf × ${coats} coats × (1 + ${wastePercent}% waste) ÷ ${coverageSqFtPerGallon} sf/gal = ${requiredGallons} gal; ${packages} × ${pack} gal package(s). Coverage and waste are editable assumptions.`
}
