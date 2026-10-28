import {coverageEvidence} from './technicalCoverage.js'
// Technical guidance does not validate a price, contractor rate or on-site productivity.
// Historical2050 reference only; it does not enable an active exact-product match.
export const PAINT_GUIDANCE = Object.freeze({
  product: 'BEHR PREMIUM PLUS Interior Eggshell 2050',
  sourceUrl: 'https://s7d9.scene7.com/is/content/behr/2050_tds_us',
  documentRevision: '05/2025', consultedAt: '2026-10-21',
  coverageRangeSqFtPerGallon: [250, 400],
  limitations: 'Product-specific guidance; surface/application affect coverage. Does not include spray losses. Not BEHR ULTRA 275001.',
})
export function paintParameterEvidence(template, catalog = []) {
  const product = catalog.find(row => row.id === template.paintCatalogId)
  return { coverage: coverageEvidence(product,template.technicalProfile,template.coverageSqFtPerGallon),
    waste: { value: template.wastePercent, status: 'provisional', reason: 'Editable allowance, not manufacturer-verified loss.' },
    labor: { value: template.hourlyRate, status: 'provisional', reason: 'Contractor charge assumption; not a BLS wage conversion.' },
    productivity: { values: structuredClone(template.productivity), status: 'provisional', reason: 'Requires measured job results for calibration.' } }
}
