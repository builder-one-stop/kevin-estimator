import {hasMissingPrices} from '../../shared/estimatePricing.js'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBetaAccess } from '../components/auth/BetaAccessContext.jsx'
import { aiRequest } from '../services/ai.js'
import { useAiText } from '../components/ai/strings.js'
import Plan from '../components/ai/Plan.jsx'
import { calculateEstimate } from '../lib/estimateDocument.js'
import '../styles/ai.css'

const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export default function AdminReview() {
  const { id } = useParams()
  const access = useBetaAccess()
  const { t, i18n } = useTranslation()
  const { a } = useAiText()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    if (access?.role === 'admin') aiRequest(`admin/conversations${id ? `/${id}` : ''}`)
      .then(value => { if (active) setData(value) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [id, access?.role, retry])
  if (access?.role !== 'admin') return <Navigate to="/" replace />
  const date = value => value ? new Date(value).toLocaleString(i18n.language) : '—'
  const row = id ? data?.conversation : null
  const estimate = id ? data?.estimate : null
  return <div className="page ai-page admin-review">
    <p className="ai-banner" role="note">{t('beta.reviewingKevin')}</p>
    <div className="page-head"><h1>{t('beta.review')}</h1><Link to="/chat">{t('beta.returnOwn')}</Link></div>
    <p>{t('beta.readOnlyDetail')}</p>
    {id && <Link to="/admin/review">← {t('beta.history')}</Link>}
    {error ? <p role="alert">{t('beta.reviewError')} <button onClick={() => { setData(null); setError(false); setRetry(value => value + 1) }}>{a('retry')}</button></p>
      : data === null ? <p role="status">{a('loading')}</p>
        : !id ? <>{!data.length && <p>{t('beta.empty')}</p>}{data.map(item => <Link className="ai-history-row" to={`/admin/review/${item.id}`} key={item.id}><b>{item.title}</b><time>{date(item.updated_at)}</time></Link>)}</>
          : row && <>
            <h2>{row.title}</h2><p>{t('beta.created')}: {date(row.created_at)} · {t('beta.updated')}: {date(row.updated_at)}</p>
            <h2>{t('beta.messages')}</h2>
            <div className="ai-messages">{row.state.messages.map(message => <article className={`ai-message ${message.role}`} key={message.id}>
              <b>{message.role === 'user' ? 'Kevin' : t('beta.assistant')}</b><time>{date(message.createdAt)}</time><p>{message.content}</p>
            </article>)}</div>
            {row.state.run && <p>{t('beta.runState')}: {row.state.run.status} · {date(row.state.run.startedAt)}</p>}
            {row.state.plan && <section className="ai-card"><h2>{a('plan')} · {a('revision')} {row.state.planRevision}</h2>
              <p>{t('beta.approvedRevision')}: {row.state.approvedRevision ?? '—'}</p><Plan plan={row.state.plan} />
            </section>}
            {row.state.pending?.plan && <section className="ai-card"><h2>{a('changes')}</h2><Plan plan={row.state.pending.plan} /></section>}
            {estimate && <section className="ai-card" data-testid="review-estimate"><h2>{estimate.title}</h2>
              <p>{a('revision')} {estimate.version} · {date(estimate.updated_at)}</p>
              {estimate.document.sections.map(section => <section key={section.id}><h3>{section.title}</h3>
                <div className="review-table-wrap"><table><thead><tr><th>{t('beta.description')}</th><th>{t('beta.quantity')}</th><th>{t('beta.unitCost')}</th></tr></thead>
                  <tbody>{section.items.map(item => <tr key={item.id}><td>{item.description}</td><td>{item.quantity} {item.unit}</td><td>{money(Math.round(Number(item.unitCost) * 100))}</td></tr>)}</tbody></table></div>
              </section>)}
              <strong>{t(hasMissingPrices(estimate.document)?'commercial.knownSubtotal':'beta.saleTotal')}: {money(calculateEstimate(estimate.document, estimate.markup_bps).priceCents)}</strong>
              <h3>{a('revisions')}</h3>{data.revisions.map(revision => <p key={revision.id}>{a('revision')} {revision.version} · {revision.origin} · {date(revision.created_at)}</p>)}
            </section>}
          </>}
  </div>
}
