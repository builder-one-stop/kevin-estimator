import { reviseManualPrice } from '../lib/estimateDocument.js'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Download, Plus, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getEstimate, saveEstimate, finalizeEstimate } from '../services/estimates.js'
import { getClients } from '../services/clients.js'
import { getProjects } from '../services/projects.js'
import { calculateEstimate, COST_TYPES, ESTIMATE_STATUSES, itemCostCents, moveInArray, newItem, newSection, UNITS, validateEstimate } from '../lib/estimateDocument.js'
import ApprovedProposal from '../components/ai/ApprovedProposal.jsx'
import { useAiText } from '../components/ai/strings.js'
import { draftStore } from '../lib/estimateDrafts.js'
import { formatMoney } from '../lib/money.js'
import EstimateDocument from '../components/estimates/EstimateDocument.jsx'
import { bridgeText } from '../../shared/estimatePresentation.js'
import { assertDocument } from '../../shared/aiDomain.js'
import { aiRequest } from '../services/ai.js'
import { effectiveCatalog } from '../../shared/researchCatalog.js'
import { applyCatalogPrice } from '../../shared/catalogPricing.js'
import { paintPackages, packageGallons, takeoffSummary } from '../../shared/materialTakeoff.js'
import { recalculatePaintDocument, paintMarkupBps } from '../../shared/paintJob.js'
import PaintRuleEditor from '../components/ai/PaintRuleEditor.jsx'

const editable = (record) => ({ title: record.title, client_id: record.client_id, project_id: record.project_id, status: record.status, markup_bps: record.markup_bps, document: record.document })
const money = (cents) => formatMoney(cents / 100)

export default function EstimateWorkspace({ estimateId, embedded = false, editorRef, onSaved, disabled = false }) {
  const params = useParams()
  const id = estimateId || params.id
  const { t } = useTranslation()
  const { a, language } = useAiText()
  const b = bridgeText(language)
  const [editing, setEditing] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const actionLock = useRef(false), finalRequest = useRef(null), onSavedRef = useRef(onSaved)
  useEffect(() => { onSavedRef.current = onSaved }, [onSaved])
  const [draft, setDraft] = useState(null)
  const [savedVersion, setSavedVersion] = useState(null)
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState('saved')
  const [conflict, setConflict] = useState(false)
  const [view, setView] = useState('estimate')
  const [assistantOpen, setAssistantOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 720)
  const [assistantWidth, setAssistantWidth] = useState(285)
  const [detailId, setDetailId] = useState(null)
  const [catalog, setCatalog] = useState(() => effectiveCatalog())
  const [retry, setRetry] = useState(0)
  const savedRef = useRef(null)
  const draftRef = useRef(null)
  const queueRef = useRef(Promise.resolve())
  const conflictRef = useRef(false)
  const storeRef = useRef(null)
  const revisionRef = useRef(null)
  const sourceRef = useRef(null)
  const activeRef = useRef(false)
  const [backups, setBackups] = useState([])
  const [legacy, setLegacy] = useState(null)
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  function refreshBackups() {
    try { setBackups(storeRef.current?.list().filter((entry) => entry.key !== revisionRef.current && entry.key !== sourceRef.current) || []) }
    catch { setError(tRef.current('estimateEditor.backupError')) }
  }
  function writeBackup(version, value) {
    try {
      revisionRef.current = storeRef.current.write(version, editable(value), revisionRef.current)
      refreshBackups()
      return true
    } catch { setError(tRef.current('estimateEditor.backupError')); return false }
  }
  function clearBackup(key) {
    try { storeRef.current.remove(key) }
    catch { setError(tRef.current('estimateEditor.backupError')) }
  }

  useEffect(() => {
    let active = true
    activeRef.current = true
    Promise.all([getEstimate(id), getClients(), getProjects(), aiRequest('settings').catch(() => null)]).then(([record, clientRows, projectRows, settings]) => {
      if (!active) return
      if (!record) { setError(tRef.current('estimateEditor.notFound')); return }
      savedRef.current = record; setSavedVersion(record.version)
      storeRef.current = draftStore(localStorage, record.owner_id, id)
      let initial = record
      try {
        const pending = storeRef.current.list()
        const backup = pending[0]
        if (backup) {
          initial = { ...record, ...editable(backup.draft) }
          sourceRef.current = backup.key
          writeBackup(backup.version, initial)
          const changedRemotely = backup.version !== record.version
          conflictRef.current = changedRemotely
          setConflict(changedRemotely)
          setSaveStatus(changedRemotely ? 'error' : 'saving')
          if (changedRemotely) setError(tRef.current('estimateEditor.conflictRecovered'))
        }
        setLegacy(storeRef.current.legacy())
        refreshBackups()
      } catch { setError(tRef.current('estimateEditor.backupError')) }
      draftRef.current = initial; setDraft(initial); setClients(clientRows); setProjects(projectRows)
      setCatalog(effectiveCatalog(settings?.data?.catalog || []))
    }).catch(() => { if (active) setError(tRef.current('estimateEditor.loadError')) })
    const changed = () => refreshBackups()
    window.addEventListener('storage', changed)
    return () => { active = false; activeRef.current = false; window.removeEventListener('storage', changed) }
    // Changing the UI language must not reload or replace a pending draft.
  }, [id, retry])

  const enqueueSave = useCallback(function saveQueued() {
    queueRef.current = queueRef.current.catch(() => {}).then(async () => {
      const snapshot = draftRef.current
      const saved = savedRef.current
      if (!activeRef.current || !snapshot || !saved || snapshot.id !== saved.id || conflictRef.current) return
      if (JSON.stringify(editable(snapshot)) === JSON.stringify(editable(saved))) {
        if (draftRef.current === snapshot) { setSaveStatus('saved'); clearBackup(revisionRef.current); clearBackup(sourceRef.current); revisionRef.current = null; sourceRef.current = null; refreshBackups() }
        return
      }
      const patch = editable(snapshot)
      const invalid = validateEstimate(patch.document, patch.markup_bps)
      if (invalid) { setSaveStatus('error'); setError(tRef.current('estimateEditor.invalid')); return }
      setSaveStatus('saving')
      const revision = revisionRef.current
      const source = sourceRef.current
      try {
        const result = await saveEstimate(saved, patch)
        if (!activeRef.current || savedRef.current?.id !== saved.id) return
        savedRef.current = result; setSavedVersion(result.version); onSavedRef.current?.(result)
        clearBackup(revision); clearBackup(source); sourceRef.current = null
        if (draftRef.current === snapshot) { draftRef.current = result; setDraft(result); setSaveStatus('saved'); setError(''); revisionRef.current = null; refreshBackups() }
        else {
          writeBackup(result.version, draftRef.current)
          saveQueued()
        }
      } catch (cause) {
        if (!activeRef.current) return
        if (cause.code === 'ESTIMATE_CONFLICT') { conflictRef.current = true; setConflict(true) }
        setSaveStatus('error'); setError(tRef.current(cause.code === 'ESTIMATE_CONFLICT' ? 'estimateEditor.conflictRecovered' : 'estimateEditor.saveError'))
      }
    })
    return queueRef.current
  }, [])

  useEffect(() => {
    if (!draft) return undefined
    const timer = window.setTimeout(enqueueSave, 750)
    return () => window.clearTimeout(timer)
  }, [draft, enqueueSave])

  function edit(change) {
    const current = draftRef.current
    const next = change(current)
    draftRef.current = next
    setDraft(next)
    setSaveStatus(conflictRef.current ? 'error' : 'saving')
    writeBackup(savedRef.current?.version, next)
  }
  function updateDocument(change) { edit((current) => ({ ...current, document: change(current.document) })) }
  function updateSection(sectionId, change) { updateDocument((doc) => ({ ...doc, sections: doc.sections.map((section) => section.id === sectionId ? change(section) : section) })) }
  function updateItem(sectionId, itemId, change) { updateSection(sectionId, (section) => ({ ...section, items: section.items.map((item) => item.id === itemId ? change(item) : item) })) }
  function selectCatalogItem(sectionId, itemId, catalogId) {
    const entry = catalog.find(row => row.id === catalogId)
    if (!entry) return
    const current=draftRef.current
    const line=current.document.sections.find(section=>section.id===sectionId)?.items.find(item=>item.id===itemId)
    const field=line?.ruleKey==='painting:material'?'paintCatalogId':line?.ruleKey==='repair:material'?'repairCatalogId':null
    if(field){
      const document=recalculatePaintDocument(current.document,sectionId,{[field]:entry.id},{},catalog)
      edit(row=>({...row,document}))
      return
    }
    updateItem(sectionId, itemId, item => ({ ...applyCatalogPrice(item, entry, draftRef.current.document.scope?.plan?.zip || '', language),
      ...(item.ruleKey ? { ruleOverrides: { ...item.ruleOverrides, price: true } } : {}) }))
  }
  function recalculatePaint(sectionId, template, inputs) {
    const markupBps = paintMarkupBps(template.marginPercent)
    const document = recalculatePaintDocument(draftRef.current.document, sectionId, template, inputs, catalog)
    edit(current => {
      return { ...current, markup_bps: markupBps, document: { ...document, scope: { ...document.scope, plan: { ...document.scope.plan, markupBps } } } }
    })
  }
  function calculatePaintItem(sectionId, itemId, item) {
    try {
      const entry = catalog.find(row => row.id === item.catalogId)
      const pack = packageGallons(entry) || (item.unit === 'gal' ? 1 : null)
      const takeoff = { areaSqFt: Number(item.takeoff?.areaSqFt), coats: Number(item.takeoff?.coats),
        coverageSqFtPerGallon: Number(item.takeoff?.coverageSqFtPerGallon), wastePercent: Number(item.takeoff?.wastePercent || 0), packageGallons: pack }
      const result = paintPackages(takeoff)
      updateItem(sectionId, itemId, row => ({ ...row, quantity: result.packages, takeoff: { ...takeoff, ...result } }))
      setError('')
    } catch { setError(language === 'es' ? 'Completa área, manos y rendimiento con valores positivos.' : 'Enter positive area, coats and coverage values.') }
  }
  function projectChanged(projectId) {
    const project = projects.find((item) => item.id === projectId)
    edit((current) => ({ ...current, project_id: projectId || null, client_id: project?.client_id ?? current.client_id }))
  }
  function clientChanged(clientId) {
    edit((current) => {
      const projectClient = projects.find((item) => item.id === current.project_id)?.client_id
      return { ...current, client_id: clientId || null, project_id: projectClient && projectClient !== (clientId || null) ? null : current.project_id }
    })
  }

  async function keepLocalDraft() {
    try {
      await queueRef.current.catch(() => {})
      const latest = await getEstimate(id)
      if (!activeRef.current) return
      if (!latest) throw new Error(t('estimateEditor.notFound'))
      savedRef.current = latest; setSavedVersion(latest.version)
      conflictRef.current = false; setConflict(false); setError('')
      writeBackup(latest.version, draftRef.current)
      enqueueSave()
    } catch { setError(t('estimateEditor.loadError')) }
  }

  async function useRemoteDraft() {
    const selected = draftRef.current
    try {
      conflictRef.current = true
      await queueRef.current.catch(() => {})
      const latest = await getEstimate(id)
      if (!activeRef.current) return
      if (!latest) throw new Error(t('estimateEditor.notFound'))
      if (draftRef.current !== selected) { setConflict(true); setError(t('estimateEditor.conflictRecovered')); return }
      savedRef.current = latest; setSavedVersion(latest.version); draftRef.current = latest; setDraft(latest)
      clearBackup(revisionRef.current); clearBackup(sourceRef.current); revisionRef.current = null; sourceRef.current = null; refreshBackups()
      conflictRef.current = false; setConflict(false); setError(''); setSaveStatus('saved')
    } catch { setError(t('estimateEditor.loadError')) }
  }

  async function recoverBackup(backup) {
    conflictRef.current = true
    setConflict(true)
    await queueRef.current.catch(() => {})
    if (!activeRef.current) return
    // Back up the current input before switching, including edits made while
    // waiting for the queue. A quota failure must not replace unbacked input.
    if (JSON.stringify(editable(draftRef.current)) !== JSON.stringify(editable(savedRef.current))
      && !writeBackup(savedRef.current.version, draftRef.current)) return
    const next = { ...savedRef.current, ...editable(backup.draft) }
    let adopted
    try { adopted = storeRef.current.write(backup.version, editable(next)) }
    catch { setError(t('estimateEditor.backupError')); return }
    sourceRef.current = backup.key || null
    revisionRef.current = adopted
    draftRef.current = next; setDraft(next)
    conflictRef.current = true; setConflict(true); setSaveStatus('error')
    setError(t('estimateEditor.conflictRecovered'))
    refreshBackups()
  }

  const refreshRecord = useCallback(async () => {
    const base = savedRef.current
    if (!base || actionLock.current) return
    const latest = await getEstimate(id)
    if (!activeRef.current || savedRef.current !== base || !latest || latest.version <= base.version) return
    if (JSON.stringify(editable(draftRef.current)) !== JSON.stringify(editable(base))) {
      conflictRef.current = true; setConflict(true); setSaveStatus('error'); setError(tRef.current('estimateEditor.conflictRecovered'))
      return
    }
    savedRef.current = latest; draftRef.current = latest; setDraft(latest); setSavedVersion(latest.version); onSavedRef.current?.(latest)
  }, [id])
  useEffect(() => {
    const timer = setInterval(() => { refreshRecord().catch(() => {}) }, 3000)
    return () => clearInterval(timer)
  }, [refreshRecord])

  async function flushSaved() {
    await enqueueSave()
    // The queue may have picked up edits made while an earlier request was in flight.
    await queueRef.current
    if (conflictRef.current || !savedRef.current || JSON.stringify(editable(draftRef.current)) !== JSON.stringify(editable(savedRef.current))) throw new Error('UNSAVED_ESTIMATE')
    const saved = savedRef.current, latest = await getEstimate(id)
    if (!latest || savedRef.current !== saved || JSON.stringify(editable(draftRef.current)) !== JSON.stringify(editable(saved))) {
      conflictRef.current = true; setConflict(true); setSaveStatus('error'); setError(tRef.current('estimateEditor.conflictRecovered')); throw new Error('ESTIMATE_CONFLICT')
    }
    if (latest.version !== saved.version) {
      savedRef.current=latest;draftRef.current=latest;setDraft(latest);setSavedVersion(latest.version);onSavedRef.current?.(latest)
    }
    return latest
  }
  async function downloadSaved(preview = false) {
    if (actionLock.current) return false
    actionLock.current = true; setActionBusy(true); setActionNotice('')
    try {
      const saved = await flushSaved()
      const { buildProposalPdf } = await import('../lib/proposalPdf.js')
      const pdf = buildProposalPdf(saved, { format: 'detailed' })
      if (preview) { const url = pdf.output('bloburl'); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60000) }
      else pdf.save(`${saved.id.slice(0,8)}-${saved.document.language || 'en'}-r${saved.version}.pdf`)
      setActionNotice(b('downloaded')); return true
    } catch { setActionNotice(b('exportError')); return false }
    finally { actionLock.current = false; setActionBusy(false) }
  }
  async function finalizeCurrent() {
    if (actionLock.current) return
    actionLock.current = true; setActionBusy(true); setActionNotice('')
    try {
      const saved = await flushSaved()
      assertDocument(saved.document, saved.markup_bps)
      if (finalRequest.current?.version !== saved.version) finalRequest.current = { version: saved.version, id: crypto.randomUUID() }
      const finalized = await finalizeEstimate(saved, finalRequest.current.id)
      const next = { ...saved, ...finalized }
      savedRef.current = next; draftRef.current = next; setDraft(next); setSavedVersion(next.version); onSavedRef.current?.(next)
      setEditing(false); setActionNotice(b('finalized')); setError(''); setSaveStatus('saved')
    } catch (e) { if (e.code === 'ESTIMATE_CONFLICT') { conflictRef.current = true; setConflict(true) } setError(b('finalizeError')) }
    finally { actionLock.current = false; setActionBusy(false) }
  }
  useImperativeHandle(editorRef, () => ({ flush: flushSaved, download: downloadSaved, refresh: refreshRecord }))

  if (error && !draft) return <div className="page"><div role="alert" className="estimate-error">{error}</div><button className="btn btn-ghost" onClick={() => { setError(''); setRetry((value) => value + 1) }}>{t('home.retry')}</button></div>
  if (!draft) return <div className="page"><p role="status">{t('estimateEditor.loading')}</p></div>
  const totals = calculateEstimate(draft.document, draft.markup_bps)
  const client = clients.find((row) => row.id === draft.client_id)
  const project = projects.find((row) => row.id === draft.project_id)
  const pdfRecord = { ...draft, finalized_at: saveStatus === 'saved' ? draft.finalized_at : null, version: savedVersion || draft.version, client, project }

  const downloadPdf = () => downloadSaved(false)
  const actions = <div className="estimate-actions"><button className="btn btn-primary" disabled={disabled || actionBusy || conflict} onClick={finalizeCurrent}>{b('finalize')}</button><button className="btn btn-ghost" disabled={disabled || actionBusy || conflict} onClick={downloadPdf}><Download size={16}/>{b('download')}</button>{embedded && <button className="btn btn-ghost" disabled={disabled || actionBusy} onClick={() => setEditing(x => !x)}>{b(editing ? 'closeEdit' : 'edit')}</button>}<small>{b('finalizationHelp')}</small></div>

  return <div className={`page estimate-workspace ${embedded ? 'estimate-embedded' : ''}`}>
    {!embedded && <Link to="/estimates" className="workspace-back"><ArrowLeft size={16} />{t('estimates.title')}</Link>}
    <header className="estimate-header">
      <div className="estimate-title-block"><label className="sr-only" htmlFor="estimate-title">{t('estimateEditor.name')}</label><input id="estimate-title" disabled={disabled || actionBusy} className="estimate-title-input" value={draft.title} onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))} onBlur={enqueueSave} />
        <span className="estimate-code">#{draft.id.slice(0, 8).toUpperCase()}</span></div>
      <span className={`estimate-save estimate-save-${saveStatus}`} role="status">{t(`estimateEditor.${saveStatus}`)}</span>
    </header>
    {error && <div className="estimate-error" role="alert">{error} {conflict ? <><button type="button" onClick={keepLocalDraft}>{t('estimateEditor.keepLocal')}</button><button type="button" onClick={useRemoteDraft}>{t('estimateEditor.useRemote')}</button></> : <button type="button" onClick={enqueueSave}>{t('estimateEditor.retrySave')}</button>}</div>}
    {(backups.length > 0 || legacy?.draft) && <div className="estimate-error" role="status">
      <p>{t('estimateEditor.otherDrafts')}</p>
      {backups.map((backup) => <button key={backup.key} onClick={() => recoverBackup(backup)}>{t('estimateEditor.recoverDraft', { title: backup.draft.title })}</button>)}
      {legacy?.draft && <button onClick={() => { recoverBackup(legacy); setLegacy(null) }}>{t('estimateEditor.recoverLegacy')}</button>}
    </div>}
    {actions}{actionNotice && <p role="status">{actionNotice}</p>}
    {embedded && <details><summary>{b('internalBreakdown')}</summary><dl className="ai-financial">{[['cost',money(totals.costCents)],['markupAmount',money(totals.markupCents)],['margin',`${totals.marginPercent.toFixed(1)}%`],['materialsCost',money(totals.costsByType.material)],['laborCost',money(totals.costsByType.labor)],['laborHours',totals.laborHours]].map(([label,value])=><div key={label}><dt>{a(label)}</dt><dd>{value}</dd></div>)}</dl></details>}
    {embedded && !editing && <EstimateDocument record={pdfRecord}/>}
    <fieldset disabled={disabled || actionBusy} hidden={embedded && !editing} className={embedded ? 'document-edit-area' : ''}>
    <div className="estimate-fields">
      <label>{t('estimateEditor.client')}<select value={draft.client_id || ''} onChange={(event) => clientChanged(event.target.value)}><option value="">{t('projects.noClient')}</option>{clients.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>{t('estimateEditor.project')}<select value={draft.project_id || ''} onChange={(event) => projectChanged(event.target.value)}><option value="">{t('estimateEditor.noProject')}</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>{t('estimateEditor.status')}<select value={draft.status} onChange={(event) => edit((current) => ({ ...current, status: event.target.value }))}>{ESTIMATE_STATUSES.map((value) => <option key={value} value={value}>{t(`estimateStatus.${value}`)}</option>)}</select></label>
    </div>
    <div className="estimate-tabs"><button className={view === 'estimate' ? 'active' : ''} onClick={() => setView('estimate')}>{t('estimateEditor.estimate')}</button><button className={view === 'proposal' ? 'active' : ''} onClick={() => setView('proposal')}>{t('estimateEditor.proposal')}</button></div>
    <div className="estimate-layout">
      {!embedded && <aside className={`estimate-assistant ${assistantOpen ? '' : 'collapsed'}`} style={{ '--assistant-width': `${assistantWidth}px` }}>
        <button className="estimate-assistant-toggle" onClick={() => setAssistantOpen((open) => !open)}>{assistantOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}{t('estimateEditor.assistant')}</button>
        {assistantOpen && <div><p><Link to={draft.document.conversationId ? `/chat/${draft.document.conversationId}` : '/chat'}>{a(draft.document.conversationId ? 'backChat' : 'noChat')}</Link></p><label>{t('estimateEditor.panelWidth')}<input type="range" min="240" max="430" value={assistantWidth} onChange={(event) => setAssistantWidth(Number(event.target.value))} /></label></div>}
      </aside>}
      <div className="estimate-main">
        {view === 'estimate' ? <>
          <div className="estimate-table-head"><h2>{t('estimateEditor.workItems')}</h2><button className="btn btn-ghost" onClick={() => updateDocument((doc) => ({ ...doc, sections: [...doc.sections, { ...newSection(), title: t('estimateEditor.newSection') }] }))}><Plus size={16} />{t('estimateEditor.addSection')}</button></div>
          {!draft.document.sections.length && <p className="estimate-empty-items">{t('estimateEditor.noItems')}</p>}
          {draft.document.sections.map((section, sectionIndex) => <section className="estimate-section" key={section.id}>
            <div className="estimate-section-head"><button aria-label={t('estimateEditor.toggleSection')} onClick={() => updateSection(section.id, (row) => ({ ...row, collapsed: !row.collapsed }))}>{section.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
              <input aria-label={t('estimateEditor.sectionName')} value={section.title} onChange={(event) => updateSection(section.id, (row) => ({ ...row, title: event.target.value }))} />
              <span>{money(totals.sections[sectionIndex]?.costCents || 0)}</span><div className="estimate-controls"><button aria-label={t('estimateEditor.moveUp')} disabled={sectionIndex === 0} onClick={() => updateDocument((doc) => ({ ...doc, sections: moveInArray(doc.sections, sectionIndex, -1) }))}><ArrowUp size={15} /></button><button aria-label={t('estimateEditor.moveDown')} disabled={sectionIndex === draft.document.sections.length - 1} onClick={() => updateDocument((doc) => ({ ...doc, sections: moveInArray(doc.sections, sectionIndex, 1) }))}><ArrowDown size={15} /></button><button aria-label={t('estimateEditor.duplicate')} onClick={() => updateDocument((doc) => ({ ...doc, sections: [...doc.sections.slice(0, sectionIndex + 1), { ...structuredClone(section), id: crypto.randomUUID(), items: section.items.map((item) => ({ ...structuredClone(item), id: crypto.randomUUID() })) }, ...doc.sections.slice(sectionIndex + 1)] }))}><Copy size={15} /></button><button aria-label={t('estimateEditor.delete')} onClick={() => updateDocument((doc) => ({ ...doc, sections: doc.sections.filter((row) => row.id !== section.id) }))}><Trash2 size={15} /></button></div>
            </div>
            {draft.document.rules?.paint?.[section.id] && <PaintRuleEditor key={section.id} rule={draft.document.rules.paint[section.id]} catalog={catalog} language={language} onRecalculate={(template,inputs) => recalculatePaint(section.id,template,inputs)}/>}
            {!section.collapsed && <><div className="estimate-grid-labels"><span>{t('estimateEditor.description')}</span><span>{t('estimateEditor.qty')}</span><span>{t('estimateEditor.unit')}</span><span>{t('estimateEditor.unitCost')}</span><span>{t('estimateEditor.costType')}</span><span>{t('estimateEditor.cost')}</span><span /></div>
              {section.items.map((item, itemIndex) => <div className="estimate-item-wrap" key={item.id}><div className="estimate-item-row">
                <input aria-label={t('estimateEditor.description')} value={item.description} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { description: event.target.value, translations: undefined }, language))} placeholder={t('estimateEditor.description')} />
                <input aria-label={t('estimateEditor.qty')} type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, quantity: Number(event.target.value), takeoff: undefined, ...(row.ruleKey ? { origin: 'manual', ruleOverrides: { ...row.ruleOverrides, quantity: true } } : {}) }))} />
                <select aria-label={t('estimateEditor.unit')} value={item.unit} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { unit: event.target.value }, language))}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
                <input aria-label={t('estimateEditor.unitCost')} type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { unitCost: Number(event.target.value) }, language))} />
                <select aria-label={t('estimateEditor.costType')} value={item.costType} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { costType: event.target.value }, language))}>{COST_TYPES.map((type) => <option key={type} value={type}>{t(`costType.${type}`)}</option>)}</select>
                <strong>{money(itemCostCents(item))}</strong><button aria-label={t('estimateEditor.details')} onClick={() => setDetailId(detailId === item.id ? null : item.id)}><ChevronDown size={17} /></button>
              </div>{detailId === item.id && <div className="estimate-item-detail"><label>{t('estimateEditor.notes')}<textarea value={item.notes || ''} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, notes: event.target.value, ...(row.ruleKey ? { origin: 'manual', ruleNotes: undefined, ruleOverrides: { ...row.ruleOverrides, notes: true } } : {}) }))} /></label><label>{language === 'es' ? 'Producto y precio del catálogo' : 'Catalog product and price'}<select aria-label={language === 'es' ? 'Producto y precio del catálogo' : 'Catalog product and price'} value={item.catalogId || ''} onChange={event => selectCatalogItem(section.id, item.id, event.target.value)}><option value="">{language === 'es' ? 'Elegir referencia pública' : 'Choose public reference'}</option>{catalog.filter(entry => entry.unitCost !== null && entry.package && (!item.ruleKey || item.ruleKey === 'painting:material' && packageGallons(entry) > 0 || item.ruleKey === 'repair:material' && entry.unit === 'ea' && (entry.category === 'patch' || !entry.category && /spackl|patch|filler/i.test(entry.product))) && (entry.status !== 'verified' || entry.verifiedZip === (draft.document.scope?.plan?.zip || '')) && (!entry.validUntil || entry.validUntil >= new Date().toISOString().slice(0, 10))).map(entry => <option key={entry.id} value={entry.id}>{entry.vendor} · {entry.brand} {entry.product} · {entry.package} · USD {entry.unitCost}/{entry.unit}</option>)}</select></label><p>{item.origin || 'manual'} · {item.price?.status || 'provisional'} · {item.priceSource || (language === 'es' ? 'Supuesto editable, sin precio respaldado' : 'Editable assumption; no backed price')} · {item.priceDate || ''}</p>{item.price?.url && <a href={item.price.url} target="_blank" rel="noreferrer">{language === 'es' ? 'Ficha de origen' : 'Source product page'}</a>}{item.price?.sourceUrl && <a href={item.price.sourceUrl} target="_blank" rel="noreferrer">{language === 'es' ? 'Investigación' : 'Research evidence'}</a>}{!item.ruleKey && item.costType === 'material' && (item.unit === 'gal' || packageGallons(catalog.find(row => row.id === item.catalogId))) && <div className="ai-grid"><strong>{language === 'es' ? 'Cálculo de envases (rendimiento supuesto)' : 'Package takeoff (assumed coverage)'}</strong>{[['areaSqFt',language === 'es' ? 'Área (sf)' : 'Area (sf)'],['coats',language === 'es' ? 'Manos' : 'Coats'],['coverageSqFtPerGallon',language === 'es' ? 'Rendimiento (sf/gal)' : 'Coverage (sf/gal)'],['wastePercent',language === 'es' ? 'Merma (%)' : 'Waste (%)']].map(([key,label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={item.takeoff?.[key] ?? ''} onChange={event => updateItem(section.id, item.id, row => ({ ...row, takeoff: { ...row.takeoff, [key]: event.target.value, packages: null, requiredGallons: null } }))} /></label>)}<button type="button" onClick={() => calculatePaintItem(section.id, item.id, item)}>{language === 'es' ? 'Calcular envases' : 'Calculate packages'}</button>{item.takeoff?.packages && <p>{takeoffSummary(item.takeoff, language)}</p>}</div>}<label className="estimate-checkbox"><input type="checkbox" checked={Boolean(item.needsReview)} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, needsReview: event.target.checked }))} />{t('estimateEditor.needsReview')}</label><label>{a('markup')}<input type="number" min="0" max="1000" step="0.01" value={item.markupBps == null ? '' : item.markupBps / 100} placeholder={String(draft.markup_bps / 100)} onChange={event => updateItem(section.id, item.id, row => ({ ...row, markupBps: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100), ...(row.ruleKey ? { origin: 'manual', ruleOverrides: { ...row.ruleOverrides, markupBps: true } } : {}) }))} /></label><div className="estimate-detail-actions"><button disabled={itemIndex === 0} onClick={() => updateSection(section.id, (row) => ({ ...row, items: moveInArray(row.items, itemIndex, -1) }))}>{t('estimateEditor.moveUp')}</button><button disabled={itemIndex === section.items.length - 1} onClick={() => updateSection(section.id, (row) => ({ ...row, items: moveInArray(row.items, itemIndex, 1) }))}>{t('estimateEditor.moveDown')}</button><button onClick={() => updateSection(section.id, (row) => ({ ...row, items: [...row.items.slice(0, itemIndex + 1), { ...structuredClone(item), id: crypto.randomUUID() }, ...row.items.slice(itemIndex + 1)] }))}>{t('estimateEditor.duplicate')}</button><button onClick={() => updateSection(section.id, (row) => ({ ...row, items: row.items.filter((entry) => entry.id !== item.id) }))}>{t('estimateEditor.delete')}</button></div></div>}</div>)}
              <button className="estimate-add-item" onClick={() => updateSection(section.id, (row) => ({ ...row, items: [...row.items, { ...newItem(language), ...(draft.document.scope ? { taskId: section.id, origin: 'manual' } : {}) }] }))}><Plus size={16} />{t('estimateEditor.addItem')}</button></>}
          </section>)}
          <div className="estimate-summary"><label>{t('estimateEditor.markupRate')}<span className="estimate-markup-input"><input type="number" min="0" max="1000" step="0.1" value={draft.markup_bps / 100} onChange={(event) => edit((current) => ({ ...current, markup_bps: Math.round(Number(event.target.value) * 100) }))} />%</span></label><dl><div><dt>{t('estimateEditor.costTotal')}</dt><dd>{money(totals.costCents)}</dd></div><div><dt>{t('estimateEditor.markup')}</dt><dd>{money(totals.markupCents)}</dd></div><div><dt>{t('estimateEditor.profit')}</dt><dd>{money(totals.profitCents)}</dd></div><div className="grand"><dt>{t('estimateEditor.salePrice')}</dt><dd>{money(totals.priceCents)}</dd></div></dl><small>{t('estimateEditor.marginInfo', { value: totals.marginPercent.toFixed(1) })}</small></div>
        </> : draft.document.scope ? <ApprovedProposal estimate={pdfRecord} flush={flushSaved} saved={saveStatus === 'saved' && !conflict} onLanguage={language => updateDocument(doc => ({ ...doc, language }))} /> : <EstimateDocument record={pdfRecord}/>}
      </div>
    </div>
    <section className="proposal-fields"><h2>{b('proposalDetails')}</h2><p>{b('termsHelp')}</p>
      <label>{b('documentLanguage')}<select value={draft.document.language || 'en'} onChange={e=>updateDocument(doc=>({...doc,language:e.target.value}))}><option value="en">English</option><option value="es">Español</option></select></label>
      {['intro','scope','notes','exclusions','terms'].map(key=><label key={key}>{b({exclusions:'excluded',terms:'conditions'}[key]||key)}<textarea aria-label={b({exclusions:'excluded',terms:'conditions'}[key]||key)} value={draft.document.proposal[key]||''} maxLength={10000} onChange={e=>updateDocument(doc=>({...doc,proposal:{...doc.proposal,[key]:e.target.value}}))}/></label>)}
      <button type="button" onClick={async()=>{try{const settings=await aiRequest('settings');updateDocument(doc=>({...doc,business:structuredClone(settings.data.business)}))}catch{setError(t('estimateEditor.loadError'))}}}>{b('syncBusiness')}</button>
      <p>{b('signatureHelp')}</p>{!draft.document.business?.signatureImage&&<p>{b('signatureMissing')}</p>}
    </section>
    </fieldset>
  </div>
}
