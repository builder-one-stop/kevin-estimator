import {useState} from 'react'
import {offerContextSchema,supplierConnections} from '../../../shared/priceOffers.js'
export default function PriceLocationEditor({document,language='en',onChange}){
 const es=language==='es',tr=(en,sp)=>es?sp:en
 const [value,setValue]=useState(()=>({...offerContextSchema.parse({}),jobZip:document.scope?.plan?.zip||'',...document.pricingContext}))
 const [error,setError]=useState('')
 function save(){
  const parsed=offerContextSchema.safeParse(value)
  if(!parsed.success){setError(tr('ZIP must be blank or five digits.','El ZIP debe estar vacío o tener cinco dígitos.'));return}
  onChange({...document,pricingContext:parsed.data});setError('')
 }
 return <details className="ai-card"><summary>{tr('Optional price location','Ubicación opcional de precios')}</summary>
  <p>{tr('Leave unknown fields blank. Saving this context does not refresh prices or change saved offers. Estimates remain editable without a ZIP.','Deja vacíos los datos desconocidos. Guardar este contexto no actualiza precios ni cambia ofertas guardadas. Puedes editar el preliminar sin ZIP.')}</p>
  <div className="ai-grid">{[['jobZip','Job ZIP','ZIP del trabajo'],['supplierId','Supplier ID','ID del proveedor'],['storeId','Store ID','ID de tienda'],['storeZip','Store ZIP','ZIP de tienda']].map(([key,en,sp])=><label key={key}>{tr(en,sp)}<input value={value[key]} maxLength={key.endsWith('Zip')?5:100} onChange={e=>setValue({...value,[key]:e.target.value})}/></label>)}
  <label>{tr('Fulfillment','Modalidad')}<select value={value.fulfillment} onChange={e=>setValue({...value,fulfillment:e.target.value})}><option value="unspecified">{tr('Unspecified','Sin definir')}</option><option value="pickup">{tr('Pickup','Retiro')}</option><option value="delivery">{tr('Delivery','Entrega')}</option></select></label></div>
  <button type="button" onClick={save}>{tr('Save price location','Guardar ubicación de precios')}</button>{error&&<p role="alert">{error}</p>}
  {supplierConnections.map(s=><p key={s.id}>{s.name}: {tr('connection not configured','conexión no configurada')} · <a href={s.source} target="_blank" rel="noreferrer">{tr('Official information','Información oficial')}</a></p>)}
 </details>
}
