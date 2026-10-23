import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { aiRequest } from '../../services/ai.js'
import { referenceMatches, assessPrice } from '../../../shared/priceEvidence.js'

export default function PriceReferences({ item, jobZip, language, onApply }) {
  const es = language === 'es'
  const [rows, setRows] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    aiRequest('pricing/references').then(data => { if (active) { setRows(data.references); setError(false) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [retry])
  const matches = (rows || []).filter(row => referenceMatches(item, row))
  const reason = value => ({
    PRICE_MISSING: ['Price pending','Precio pendiente'], SOURCE_DATE_MISSING:['Source date missing','Sin fecha de fuente'],
    SOURCE_DATE_IN_FUTURE:['Check the source date','Revisar fecha de fuente'], PRICE_EXPIRED:['Expired','Vencido'],
    SOURCE_REVIEW_DUE:['Source needs a freshness review','Actualizar la fuente'], PRODUCT_SOURCE_INCOMPLETE:['Product or source incomplete','Producto o fuente incompletos'],
    SOURCE_EVIDENCE_MISSING:['Source evidence missing','Falta respaldo de fuente'], JOB_LOCATION_UNCONFIRMED:['Job ZIP not confirmed','ZIP del trabajo sin confirmar'],
    BRANCH_EVIDENCE_MISSING:['Branch evidence missing','Falta respaldo de sucursal'], VALIDITY_UNSPECIFIED:['Validity not recorded','Vigencia sin registrar'],
    MARKET_UNCONFIRMED:['Los Angeles, CA, US not documented','Los Ángeles, CA, EE. UU. sin documentar'], MARKET_MISMATCH:['Outside Los Angeles, CA, US','Fuera de Los Ángeles, CA, EE. UU.'],
  }[value]?.[es ? 1 : 0] || '')
  const state = value => ({verified:es?'Precio local documentado':'Documented local price',public_observed:es?'Referencia pública; sucursal sin confirmar':'Public reference; branch unconfirmed',manual:es?'Precio manual provisional':'Provisional manual price',provisional:es?'Provisional':'Provisional'}[value])
  return <details className="price-references"><summary>{es ? 'Reutilizar una referencia propia' : 'Reuse my price references'}</summary>
    <p>{es ? 'Solo registros de tu cuenta. Se compara producto, presentación y unidad. Reutilizar no actualiza el precio con el proveedor; la verificación depende de la evidencia.' : 'Only your account records. Product, package and unit must match. Reusing a reference does not refresh its supplier price; verification depends on evidence.'}</p>
    {error ? <p role="alert">{es ? 'No se pudieron cargar las referencias.' : 'References could not be loaded.'} <button onClick={() => setRetry(x => x + 1)}>{es ? 'Reintentar' : 'Retry'}</button></p> : !rows ? <p role="status">{es ? 'Cargando…' : 'Loading…'}</p> : !matches.length ? <p>{es ? 'No hay referencias propias con producto y unidad coincidentes.' : 'No own references match this product and unit.'}</p> : matches.map(row => {
      const evidence = assessPrice(row.price, jobZip)
      return <article key={row.id}><p>{row.description} · USD {row.unitCost}/{row.unit} · {state(evidence.status)} · {row.price.checkedAt || (es ? 'sin fecha' : 'undated')}{evidence.reason ? ` · ${reason(evidence.reason)}` : ''}</p>
        <Link to={`/estimates/${row.source.estimateId}`}>{es ? 'Ver estimado de origen' : 'Open source estimate'} · v{row.source.estimateVersion}</Link>{' '}
        <button type="button" disabled={evidence.reason === 'PRICE_EXPIRED'} onClick={() => onApply(row)}>{es ? 'Usar este precio unitario' : 'Use this unit price'}</button>
      </article>
    })}
  </details>
}
