import {hasMissingPrices} from '../../../shared/estimatePricing.js'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { FileText, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { createEstimate, listEstimates } from '../../services/estimates.js'
import { calculateEstimate } from '../../lib/estimateDocument.js'
import { formatMoney } from '../../lib/money.js'
import { supabase } from '../../supabaseClient.js'
import {localSalesEnabled,salesRequest} from '../../services/sales.js'
import EstimateDocument from '../estimates/EstimateDocument.jsx'

export default function ProjectEstimates({ compact = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { project } = useOutletContext()
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [authTick, setAuthTick] = useState(0)
  const [preview,setPreview]=useState(null),[linkId,setLinkId]=useState(''),[ownDocuments,setOwnDocuments]=useState([])
  useEffect(()=>{if(localSalesEnabled)listEstimates().then(setOwnDocuments).catch(()=>{})},[authTick])
  async function openDocument(row){if(!localSalesEnabled){navigate(`/estimates/${row.id}`);return}const {data}=await supabase.auth.getUser();if(data.user?.id===row.owner_id){navigate(`/estimates/${row.id}`);return}try{setPreview(await salesRequest('document',{id:row.id}))}catch{setError(t('estimateEditor.loadError'))}}
  async function linkDocument(){setBusy(true);try{await salesRequest('link-document',{projectId:project.id,id:linkId});setAuthTick(x=>x+1);setLinkId('')}catch(cause){setError(t(cause.message?.includes('SALES_STANDALONE_DOCUMENT_REQUIRED')?'sales.standalone':'sales.linkError'))}finally{setBusy(false)}}
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
      : rows.length ? <div className="home-project-list">{rows.map((row) => <button className="btn btn-ghost" key={row.id} onClick={()=>openDocument(row)}><span className="home-project-title">{row.title}</span><span className="home-project-meta">{t(`estimateStatus.${row.status}`)} · {hasMissingPrices(row.document)&&<span>{t('commercial.knownSubtotal')} · </span>}{formatMoney(calculateEstimate(row.document, row.markup_bps).priceCents / 100)}</span></button>)}</div>
        : <div className="workspace-empty"><FileText size={22} /><div><b>{t('workspace.noEstimates')}</b><p>{state === 'signedOut' ? t('estimateEditor.signInDetail') : t('workspace.noEstimatesDetail')}</p></div></div>}
    <button className="btn btn-ghost" onClick={create} disabled={busy}>{t('estimates.create')}</button>
    {localSalesEnabled&&<><Link className="btn btn-ghost" to="/chat">{t('sales.quote',{defaultValue:'Online estimator'})}</Link><label>{t('sales.link',{defaultValue:'Link my existing estimate'})}<select value={linkId} onChange={e=>setLinkId(e.target.value)}><option value="">—</option>{ownDocuments.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button className="btn btn-ghost" disabled={!linkId||busy} onClick={linkDocument}>{t('sales.link',{defaultValue:'Link my existing estimate'})}</button></>}
    {error&&state!=='error'&&<p role="alert">{error}</p>}
    {preview&&<div className="sales-document-preview"><p>{t('sales.readOnly',{defaultValue:'Organization supervision · read only'})}</p><button className="btn btn-ghost" onClick={()=>setPreview(null)}>{t('sales.close',{defaultValue:'Close preview'})}</button><EstimateDocument record={preview}/></div>}
  </section>
}
