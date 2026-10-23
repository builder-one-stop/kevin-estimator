import {hasMissingPrices} from '../../shared/estimatePricing.js'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, BriefcaseBusiness, FileText, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Composer from '../components/chat/Composer.jsx'
import { LogoMark } from '../components/layout/Sidebar.jsx'
import { useBetaAccess } from '../components/auth/BetaAccessContext.jsx'
import HistoryDrawer from '../components/ai/HistoryDrawer.jsx'
import { compactTitle } from '../../shared/chatPresentation.js'
import { getRecentProjects } from '../services/projects.js'
import { createEstimate, listEstimates } from '../services/estimates.js'
import { calculateEstimate } from '../lib/estimateDocument.js'
import { formatMoney } from '../lib/money.js'
import { supabase } from '../supabaseClient.js'
import { STAGE_KEYS, STATUS_COLORS } from '../lib/projectData.js'
import { createConversation, command } from '../services/ai.js'
import { useAiText } from '../components/ai/strings.js'
import Button from '../components/ui/Button.jsx'
import StatusDot from '../components/ui/StatusDot.jsx'

export default function Home() {
  const { t } = useTranslation()
  const { a, language } = useAiText()
  const access = useBetaAccess()
  const sendLock = useRef(false)
  const sendAttempt = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { showSoon } = useOutletContext()
  const [draft, setDraft] = useState('')
  const [recentProjects, setRecentProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectsError, setProjectsError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [recentEstimates, setRecentEstimates] = useState([])
  const [estimateState, setEstimateState] = useState('loading')
  const [estimateError, setEstimateError] = useState('')
  const [estimateBusy, setEstimateBusy] = useState(false)
  const [authTick, setAuthTick] = useState(0)
  const composerRef = useRef(null)
  const [hour] = useState(() => new Date().getHours())
  const greeting = hour < 12 ? t('greet.morning') : hour < 19 ? t('greet.afternoon') : t('greet.evening')
  const send = async () => {
    if (sendLock.current || estimateBusy || !draft.trim()) return
    sendLock.current = true
    setEstimateBusy(true)
    const content = draft.trim()
    if (sendAttempt.current?.content !== content) sendAttempt.current = { content, id: crypto.randomUUID(), requestId: crypto.randomUUID() }
    const attempt = sendAttempt.current
    try { const row = await createConversation(compactTitle(content), language, attempt.id); await command(row, 'message', { content }, attempt.requestId); sendAttempt.current = null; navigate(`/chat/${row.id}`) }
    catch { setEstimateError(a('unavailable')); setEstimateState('error') }
    finally { sendLock.current = false; setEstimateBusy(false) }
  }

  useEffect(() => {
    if (location.state?.focusComposer) composerRef.current?.focus()
  }, [location.state])

  useEffect(() => {
    let active = true
    getRecentProjects(5).then((rows) => {
      if (active) { setRecentProjects(rows); setLoadingProjects(false); setProjectsError(false) }
    }).catch((cause) => {
      console.error('Failed to load recent projects', cause)
      if (active) { setLoadingProjects(false); setProjectsError(true) }
    })
    return () => { active = false }
  }, [retry])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setRecentEstimates([]); setEstimateState('signedOut') }
      setAuthTick((value) => value + 1)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) { setRecentEstimates([]); setEstimateState('signedOut'); return }
      listEstimates({ limit: 5 }).then((rows) => { if (active) { setRecentEstimates(rows); setEstimateState('ready') } })
        .catch(() => { if (active) { setEstimateError(t('estimateEditor.loadError')); setEstimateState('error') } })
    })
    return () => { active = false }
  }, [retry, authTick, t])

  async function createNewEstimate(title = '') {
    const { data } = await supabase.auth.getSession()
    if (!data.session) { navigate('/estimates'); return }
    setEstimateBusy(true)
    try { const row = await createEstimate({ title: typeof title === 'string' && title ? title.slice(0, 120) : t('estimateEditor.untitled') }); navigate(`/estimates/${row.id}`) }
    catch { setEstimateError(t('estimateEditor.loadError')); setEstimateState('error'); setEstimateBusy(false) }
  }

  return (
    <div className="home home-dashboard">
      <div className="home-top"><HistoryDrawer /></div>
      <section className="home-hero" aria-label={t('home.askTitle')}>
        <LogoMark size={42} />
        <h1 className="greet">{access?.role === 'operator' ? t('home.greeting', { greeting, name: 'Kevin' }) : greeting}</h1>
        <p>{t('home.askTitle')}</p>
        <Composer simple busy={estimateBusy} inputRef={composerRef} value={draft} onChange={setDraft} onSend={send} onSoon={showSoon} />
      </section>
      <div className="home-recent">
        <section className="home-section">
          <div className="home-section-head"><div><span className="home-eyebrow">{t('home.work')}</span><h2>{t('home.recentEstimates')}</h2></div><Link to="/estimates">{t('home.viewAll')}<ArrowRight size={16} /></Link></div>
          {estimateState === 'loading' ? <p role="status" className="muted">{t('estimateEditor.loading')}</p>
            : estimateState === 'error' ? <div className="home-section-empty"><FileText size={22} /><div><b>{estimateError}</b><button className="text-action" onClick={() => setRetry((value) => value + 1)}>{t('home.retry')}</button></div></div>
              : recentEstimates.length ? <div className="home-project-list">{recentEstimates.map((row) => <Link key={row.id} to={`/estimates/${row.id}`}><span className="home-project-title">{row.title}</span><span className="home-project-meta">{t(`estimateStatus.${row.status}`)} · {hasMissingPrices(row.document)&&<span>{t('commercial.knownSubtotal')} · </span>}{formatMoney(calculateEstimate(row.document, row.markup_bps).priceCents / 100)}{row.client && ` · ${row.client.name}`}</span></Link>)}</div>
                : <div className="home-section-empty"><FileText size={22} /><div><b>{t('home.noEstimates')}</b><p>{estimateState === 'signedOut' ? t('estimateEditor.signInDetail') : t('home.noEstimatesDetail')}</p></div></div>}
          <Button variant="ghost" onClick={createNewEstimate} disabled={estimateBusy}>{t('home.createEstimate')}</Button>
        </section>
        <section className="home-section">
          <div className="home-section-head"><div><span className="home-eyebrow">{t('home.work')}</span><h2>{t('home.recentProjects')}</h2></div><Link to="/projects">{t('home.viewAll')}<ArrowRight size={16} /></Link></div>
          {loadingProjects ? <p className="muted" role="status">{t('home.loadingProjects')}</p>
            : projectsError ? <div className="home-section-empty"><BriefcaseBusiness size={22} /><div><b>{t('home.projectsError')}</b><button type="button" className="text-action" onClick={() => { setLoadingProjects(true); setRetry((value) => value + 1) }}>{t('home.retry')}</button></div></div>
              : recentProjects.length ? <div className="home-project-list">{recentProjects.map((project) => <Link key={project.id} to={`/projects/${project.id}`}>
                <span className="home-project-title">{project.name}</span>
                <span className="home-project-meta"><StatusDot color={STATUS_COLORS[project.stage]} />{t(`status.${STAGE_KEYS[project.stage]}`)}{project.client && <span>· {project.client.name}</span>}{project.address && <span>· {project.address}</span>}</span>
              </Link>)}</div>
                : <div className="home-section-empty"><BriefcaseBusiness size={22} /><div><b>{t('home.noProjects')}</b><p>{t('home.noProjectsDetail')}</p></div></div>}
        </section>
      </div>
      <section className="home-attention"><Sparkles size={20} /><div><h2>{t('home.needsAttention')}</h2><p>{t('home.noAttention')}</p></div></section>
    </div>
  )
}
