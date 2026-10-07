import { useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { calculateEstimate, ESTIMATE_STATUSES } from '../lib/estimateDocument.js'
import { createEstimate, deleteEstimate, duplicateEstimate, listEstimates } from '../services/estimates.js'
import { formatMoney } from '../lib/money.js'
import { useAiText } from '../components/ai/strings.js'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function Estimates() {
  const { t } = useTranslation()
  const { a } = useAiText()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    listEstimates().then((data) => { if (active) { setRows(data); setError(''); setLoading(false) } })
      .catch(() => { if (active) { setError(t('estimateEditor.loadError')); setLoading(false) } })
    return () => { active = false }
  }, [retry, t])

  const visible = useMemo(() => rows.filter((row) => {
    const needle = query.trim().toLowerCase()
    return (!status || row.status === status) && (!needle || [row.title, row.client?.name, row.project?.name].some((value) => value?.toLowerCase().includes(needle)))
  }), [rows, query, status])

  async function create() {
    if (busy) return
    setBusy(true); setError('')
    try { const row = await createEstimate({ title: t('estimateEditor.untitled') }); navigate(`/estimates/${row.id}`) }
    catch { setError(t('estimateEditor.loadError')); setBusy(false) }
  }
  async function copy(row) {
    setBusy(true); setError('')
    try { const created = await duplicateEstimate(row); setRows((current) => [created, ...current]) }
    catch { setError(t('estimateEditor.loadError')) }
    finally { setBusy(false) }
  }
  async function remove(row) {
    if (!window.confirm(t('estimateEditor.deleteConfirm', { name: row.title }))) return
    setBusy(true); setError('')
    try { await deleteEstimate(row.id); setRows((current) => current.filter((item) => item.id !== row.id)) }
    catch { setError(t('estimateEditor.loadError')) }
    finally { setBusy(false) }
  }

  return <div className="page estimates-page">
    <div className="page-head"><div><h1>{t('estimates.title')}</h1><p className="estimates-intro">{t('estimates.intro')}</p></div>
      <button type="button" className="btn btn-primary" onClick={create} disabled={busy}><Plus size={18} />{t('estimates.create')}</button></div>
    <p><Link to="/chat">{a('chat')} · {a('history')}</Link></p>
    <div className="filters"><label className="project-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('estimates.search')} aria-label={t('estimates.search')} /></label>
      <select className="project-filter-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('estimates.filterStatus')}>
        <option value="">{t('estimates.allStatuses')}</option>{ESTIMATE_STATUSES.map((value) => <option key={value} value={value}>{t(`estimateStatus.${value}`)}</option>)}
      </select></div>
    {error && <div className="estimate-error" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{t('home.retry')}</button></div>}
    {loading ? <p role="status">{t('estimateEditor.loading')}</p> : error && rows.length === 0 ? null : rows.length === 0 ? <EmptyState icon={FileText} title={t('estimates.empty')} description={t('estimates.emptyDetail')} cta={t('estimates.create')} onAction={create} />
      : visible.length === 0 ? <p className="contact-message">{t('estimateEditor.noResults')}</p>
        : <div className="estimate-list"><div className="estimate-list-head"><span>{t('estimateEditor.name')}</span><span>{t('estimateEditor.client')}</span><span>{t('estimateEditor.total')}</span><span>{t('estimateEditor.status')}</span><span>{t('estimateEditor.modified')}</span><span /></div>
          {visible.map((row) => <div className="estimate-list-row" key={row.id}><Link to={`/estimates/${row.id}`} className="estimate-list-name">{row.title}</Link><span>{row.client?.name || '—'}</span>
            <strong>{formatMoney(calculateEstimate(row.document, row.markup_bps).priceCents / 100)}</strong><span className="tag">{t(`estimateStatus.${row.status}`)}</span>
            <time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleDateString()}</time><div className="estimate-row-actions"><button type="button" disabled={busy} onClick={() => copy(row)}>{t('estimateEditor.duplicate')}</button><button type="button" disabled={busy} onClick={() => remove(row)}>{t('estimateEditor.delete')}</button></div></div>)}
        </div>}
  </div>
}
