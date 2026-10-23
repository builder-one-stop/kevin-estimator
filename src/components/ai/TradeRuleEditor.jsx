import {calculationIssue} from '../../../shared/calculationIssue.js'
import {useState} from 'react'
import {hasMissingPrices} from '../../../shared/estimatePricing.js'
import {recalculateTradeDocument} from '../../../shared/tradeRules.js'
export default function TradeRuleEditor({document,sectionId,language,onChange}){
 const rule=document.rules.trades[sectionId],es=language==='es'
 const [inputs,setInputs]=useState(rule.inputs),[parameters,setParameters]=useState(rule.parameters),[error,setError]=useState('')
 const fields=[['lengthFt',es?'Largo neto (ft)':'Net length (ft)'],...(rule.trade==='baseboard'?[]:[['widthFt',es?'Ancho (ft)':'Width (ft)']])]
 return <details className="ai-card trade-rule-editor"><summary>{es?'Cálculo del rubro y precios pendientes':'Trade calculation and pending prices'} · {rule.trade}</summary>
  <p>{rule.product.product} · {rule.product.package}</p><p><a href={rule.product.coverage.sourceUrl} target="_blank" rel="noreferrer">{es?'Fuente de presentación':'Package source'}</a> · {rule.product.coverage.quantity} {rule.product.coverage.unit}/{rule.product.package.split(':')[0]}</p>
  <p>{es?'Precio de material público indexado; tarifa y productividad de contratista no verificadas. Desperdicio editable.':'Public indexed material price; contractor rate and productivity unverified. Editable waste.'}</p>
  <p>{es?'Las ediciones manuales de partidas prevalecen sobre esta plantilla y se conservan al recalcular.':'Manual line edits override this template and survive recalculation.'}</p>
  {hasMissingPrices(document)&&<p className="estimate-error" role="status">{es?'Faltan precios: subtotal parcial; puedes guardar, finalizar la revisión y exportar como preliminar.':'Missing prices: partial subtotal; you can save, finalize the document review and export a preliminary estimate.'}</p>}
  <div className="ai-grid">{fields.map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="any" value={inputs[key]} onChange={event=>setInputs({...inputs,[key]:Number(event.target.value)})}/></label>)}
   {[["wastePercent",es?'Desperdicio supuesto (%)':'Assumed waste (%)'],['hourlyRate',es?'Tarifa supuesta (USD/hr), falta si0':'Assumed rate (USD/hr), missing if0'],['productivityPerHour',es?'Productividad supuesta por hora':'Assumed productivity per hour'],['expensesPercent',es?'Gastos del rubro (%)':'Trade expenses (%)']].map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="any" value={parameters[key]} onChange={event=>setParameters({...parameters,[key]:Number(event.target.value)})}/></label>)}
  <label>{es?'Base de la tarifa':'Rate basis'}<select value={parameters.laborRateMode||'contractor_cost'} onChange={e=>setParameters({...parameters,laborRateMode:e.target.value,laborBurdenPercent:null})}><option value="contractor_cost">{es?'Costo contratista/subcontrata todo incluido':'All-in contractor/subcontractor procurement cost'}</option><option value="direct_cost">{es?'Costo directo más carga separada':'Direct cost plus separate burden'}</option></select></label>{parameters.laborRateMode==='direct_cost'&&<label>{es?'Carga (%) — vacío pendiente':'Burden (%) — blank pending'}<input type="number" min="0" max="100" value={parameters.laborBurdenPercent??''} onChange={e=>setParameters({...parameters,laborBurdenPercent:e.target.value===''?null:Number(e.target.value)})}/></label>}
  </div><button type="button" onClick={()=>{try{onChange(recalculateTradeDocument(document,sectionId,inputs,parameters));setError('')}catch(cause){setError(calculationIssue(cause,language))}}}>{es?'Recalcular rubro':'Recalculate trade'}</button>{error&&<p role="alert">{error}</p>}
 </details>
}
