import { useState } from 'react'
import { packageGallons } from '../../../shared/materialTakeoff.js'

const configFields = [
  ['coats','Coats','Manos'],['coverageSqFtPerGallon','Coverage (sf/gal)','Rendimiento (sf/gal)'],
  ['wastePercent','Waste (%)','Desperdicio (%)'],['patchCount','Minor patches','Reparaciones menores'],
  ['hourlyRate','Labor rate (USD/hr)','Tarifa de mano de obra (USD/hr)'],
  ['expensesPercent','Expenses (%)','Gastos (%)'],['marginPercent','Margin of sale (%)','Margen sobre venta (%)'],
]
const dimensionFields = [['lengthFt','Length (ft)','Largo (ft)'],['widthFt','Width (ft)','Ancho (ft)'],['heightFt','Height (ft)','Alto (ft)'],['openingsSqFt','Openings deducted (sf)','Aberturas descontadas (sf)']]
export default function PaintRuleEditor({ rule, catalog, language = 'en', onRecalculate }) {
  const es = language === 'es'
  const [inputs, setInputs] = useState(rule.inputs)
  const [template, setTemplate] = useState(rule.template)
  const [error, setError] = useState('')
  const value = (key, group) => group ? template[group][key] : template[key]
  const update = (key, next, group) => setTemplate(current => group ? { ...current, [group]: { ...current[group], [key]: next } } : { ...current, [key]: next })
  const recalculate = () => { try { onRecalculate(template, inputs); setError('') } catch { setError(es ? 'Revisa medidas, rendimientos, gastos y margen.' : 'Check dimensions, productivity, expenses and margin.') } }
  return <details className="ai-card paint-rule-editor"><summary>{es ? 'Reglas de pintura y recálculo' : 'Painting rules and recalculation'} · {rule.areaSqFt} sf · {rule.version}</summary>
    <p>{es ? 'Los valores son supuestos editables guardados con este estimado. Los cambios manuales de partidas se conservan al recalcular.' : 'These editable assumptions are saved with this estimate. Manual line edits survive recalculation.'}</p>
    <div className="ai-grid">{dimensionFields.map(([key,en,esLabel]) => <label key={key}>{es ? esLabel : en}<input type="number" min="0" step="any" value={inputs[key]} onChange={event => setInputs(current => ({ ...current, [key]: Number(event.target.value) }))}/></label>)}
      <label>{es ? 'Descontar aberturas' : 'Deduct openings'}<input type="checkbox" checked={!inputs.useGrossWalls} onChange={event => setInputs(current => ({ ...current, useGrossWalls: !event.target.checked }))}/></label>
      {configFields.map(([key,en,esLabel]) => <label key={key}>{es ? esLabel : en}<input type="number" min="0" step="any" value={value(key)} onChange={event => update(key, Number(event.target.value))}/></label>)}
      {Object.entries(template.productivity).map(([key,amount]) => <label key={key}>{(es ? 'Productividad' : 'Productivity') + ' — ' + key} ({key === 'repair' ? 'ea' : 'sf'}/hr)<input type="number" min="0" step="any" value={amount} onChange={event => update(key, Number(event.target.value), 'productivity')}/></label>)}
      {Object.entries(template.consumablesUsdPerSqFt).map(([key,amount]) => <label key={key}>{(es ? 'Consumibles' : 'Consumables') + ' — ' + key} (USD/sf)<input type="number" min="0" step="any" value={amount} onChange={event => update(key, Number(event.target.value), 'consumablesUsdPerSqFt')}/></label>)}
      {[['paintCatalogId',es ? 'Pintura' : 'Paint'],['repairCatalogId',es ? 'Reparación' : 'Repair']].map(([key,label]) => <label key={key}>{label}<select value={template[key] || ''} onChange={event => update(key,event.target.value || null)}><option value="">{es ? 'Sin precio respaldado' : 'No backed price'}</option>{catalog.filter(row => row.unitCost !== null && (key === 'paintCatalogId' ? packageGallons(row) > 0 : row.unit === 'ea' && (row.category === 'patch' || (!row.category && /spackl|patch|filler/i.test(row.product))))).map(row => <option key={row.id} value={row.id}>{row.vendor} · {row.brand} {row.product} · {row.package} · USD {row.unitCost}/{row.unit}</option>)}</select></label>)}
    </div><button type="button" className="btn btn-primary" onClick={recalculate}>{es ? 'Recalcular pintura' : 'Recalculate painting'}</button>{error && <p role="alert">{error}</p>}
  </details>
}
