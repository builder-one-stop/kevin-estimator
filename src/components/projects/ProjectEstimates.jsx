import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { FileText, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { createEstimate, listEstimates } from '../../services/estimates.js'
import { calculateEstimate } from '../../lib/estimateDocument.js'
import { formatMoney } from '../../lib/money.js'
import { supabase } from '../../supabaseClient.js'

export default function ProjectEstimates({ compact = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { project } = useOutletContext()
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [authTick, setAuthTick] = useState(0)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setRows([]); setState('signedOut') }
      setAuthTick((value) => value + 1)
    })
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) { setRows([]); setState('signedOut'); return }
      listEstimates({ projectId: project.id }).then((records) => { if (active) { setRows(records); setState('ready') } })
        .catch(() => { if (active) { setError(t('estimateEditor.loadError')); setState('error') } })
    })
    return () => { active = false }
  }, [project.id, authTick, t])
  async function create() {
    if (state === 'signedOut') { navigate('/estimates'); return }
    setBusy(true)
    try { const row = await createEstimate({ project, title: t('estimateEditor.projectTitle', { name: project.name }) }); navigate(`/estimates/${row.id}`) }
    catch { setError(t('estimateEditor.loadError')); setState('error') }
    finally { setBusy(false) }
  }
  return <section className={`workspace-section ${compact ? 'workspace-section-compact' : ''}`}>
    <div className="workspace-section-head"><h2>{t('workspace.estimates')}</h2><Link to="/estimates">{t('workspace.viewEstimates')}<ArrowUpRight size={16} /></Link></div>
    {state === 'loading' ? <p role="status">{t('estimateEditor.loading')}</p> : state === 'error' ? <p role="alert">{error} <button onClick={() => { setState('loading'); setAuthTick((value) => value + 1) }}>{t('home.retry')}</button></p>
      : rows.length ? <div className="home-project-list">{rows.map((row) => <Link key={row.id} to={`/estimates/${row.id}`}><span className="home-project-title">{row.title}</span><span className="home-project-meta">{t(`estimateStatus.${row.status}`)} · {formatMoney(calculateEstimate(row.document, row.markup_bps).priceCents / 100)}</span></Link>)}</div>
        : <div className="workspace-empty"><FileText size={22} /><div><b>{t('workspace.noEstimates')}</b><p>{state === 'signedOut' ? t('estimateEditor.signInDetail') : t('workspace.noEstimatesDetail')}</p></div></div>}
    <button className="btn btn-ghost" onClick={create} disabled={busy}>{t('estimates.create')}</button>
  </section>
}
