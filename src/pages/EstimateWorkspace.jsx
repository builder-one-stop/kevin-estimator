import { reviseManualPrice } from '../lib/estimateDocument.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Download, Eye, Plus, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getEstimate, saveEstimate } from '../services/estimates.js'
import { getClients } from '../services/clients.js'
import { getProjects } from '../services/projects.js'
import { calculateEstimate, COST_TYPES, ESTIMATE_STATUSES, itemCostCents, moveInArray, newItem, newSection, proposalPrices, UNITS, validateEstimate } from '../lib/estimateDocument.js'
import ApprovedProposal from '../components/ai/ApprovedProposal.jsx'
import { useAiText } from '../components/ai/strings.js'
import { draftStore } from '../lib/estimateDrafts.js'
import { formatMoney } from '../lib/money.js'

const editable = (record) => ({ title: record.title, client_id: record.client_id, project_id: record.project_id, status: record.status, markup_bps: record.markup_bps, document: record.document })
const money = (cents) => formatMoney(cents / 100)

export default function EstimateWorkspace() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { a, language } = useAiText()
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
    Promise.all([getEstimate(id), getClients(), getProjects()]).then(([record, clientRows, projectRows]) => {
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
        savedRef.current = result; setSavedVersion(result.version)
        clearBackup(revision); clearBackup(source); sourceRef.current = null
        if (draftRef.current === snapshot) { setSaveStatus('saved'); setError(''); revisionRef.current = null; refreshBackups() }
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

  if (error && !draft) return <div className="page"><div role="alert" className="estimate-error">{error}</div><button className="btn btn-ghost" onClick={() => { setError(''); setRetry((value) => value + 1) }}>{t('home.retry')}</button></div>
  if (!draft) return <div className="page"><p role="status">{t('estimateEditor.loading')}</p></div>
  const totals = calculateEstimate(draft.document, draft.markup_bps)
  const client = clients.find((row) => row.id === draft.client_id)
  const project = projects.find((row) => row.id === draft.project_id)
  const pdfRecord = { ...draft, version: savedVersion || draft.version, client, project }
  const proposal = draft.document.proposal
  const clientPrices = proposalPrices(draft.document, draft.markup_bps)

  async function previewPdf() {
    const { buildProposalPdf } = await import('../lib/proposalPdf.js')
    const url = buildProposalPdf(pdfRecord).output('bloburl')
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  async function downloadPdf() {
    const { downloadProposalPdf } = await import('../lib/proposalPdf.js')
    downloadProposalPdf(pdfRecord)
  }

  return <div className="page estimate-workspace">
    <Link to="/estimates" className="workspace-back"><ArrowLeft size={16} />{t('estimates.title')}</Link>
    <header className="estimate-header">
      <div className="estimate-title-block"><label className="sr-only" htmlFor="estimate-title">{t('estimateEditor.name')}</label><input id="estimate-title" className="estimate-title-input" value={draft.title} onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))} onBlur={enqueueSave} />
        <span className="estimate-code">#{draft.id.slice(0, 8).toUpperCase()}</span></div>
      <span className={`estimate-save estimate-save-${saveStatus}`} role="status">{t(`estimateEditor.${saveStatus}`)}</span>
    </header>
    {error && <div className="estimate-error" role="alert">{error} {conflict ? <><button type="button" onClick={keepLocalDraft}>{t('estimateEditor.keepLocal')}</button><button type="button" onClick={useRemoteDraft}>{t('estimateEditor.useRemote')}</button></> : <button type="button" onClick={enqueueSave}>{t('estimateEditor.retrySave')}</button>}</div>}
    {(backups.length > 0 || legacy?.draft) && <div className="estimate-error" role="status">
      <p>{t('estimateEditor.otherDrafts')}</p>
      {backups.map((backup) => <button key={backup.key} onClick={() => recoverBackup(backup)}>{t('estimateEditor.recoverDraft', { title: backup.draft.title })}</button>)}
      {legacy?.draft && <button onClick={() => { recoverBackup(legacy); setLegacy(null) }}>{t('estimateEditor.recoverLegacy')}</button>}
    </div>}
    <div className="estimate-fields">
      <label>{t('estimateEditor.client')}<select value={draft.client_id || ''} onChange={(event) => clientChanged(event.target.value)}><option value="">{t('projects.noClient')}</option>{clients.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>{t('estimateEditor.project')}<select value={draft.project_id || ''} onChange={(event) => projectChanged(event.target.value)}><option value="">{t('estimateEditor.noProject')}</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>{t('estimateEditor.status')}<select value={draft.status} onChange={(event) => edit((current) => ({ ...current, status: event.target.value }))}>{ESTIMATE_STATUSES.map((value) => <option key={value} value={value}>{t(`estimateStatus.${value}`)}</option>)}</select></label>
    </div>
    <div className="estimate-tabs"><button className={view === 'estimate' ? 'active' : ''} onClick={() => setView('estimate')}>{t('estimateEditor.estimate')}</button><button className={view === 'proposal' ? 'active' : ''} onClick={() => setView('proposal')}>{t('estimateEditor.proposal')}</button></div>
    <div className="estimate-layout">
      <aside className={`estimate-assistant ${assistantOpen ? '' : 'collapsed'}`} style={{ '--assistant-width': `${assistantWidth}px` }}>
        <button className="estimate-assistant-toggle" onClick={() => setAssistantOpen((open) => !open)}>{assistantOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}{t('estimateEditor.assistant')}</button>
        {assistantOpen && <div><p><Link to={draft.document.conversationId ? `/chat/${draft.document.conversationId}` : '/chat'}>{a(draft.document.conversationId ? 'backChat' : 'noChat')}</Link></p><label>{t('estimateEditor.panelWidth')}<input type="range" min="240" max="430" value={assistantWidth} onChange={(event) => setAssistantWidth(Number(event.target.value))} /></label></div>}
      </aside>
      <main className="estimate-main">
        {view === 'estimate' ? <>
          <div className="estimate-table-head"><h2>{t('estimateEditor.workItems')}</h2><button className="btn btn-ghost" onClick={() => updateDocument((doc) => ({ ...doc, sections: [...doc.sections, { ...newSection(), title: t('estimateEditor.newSection') }] }))}><Plus size={16} />{t('estimateEditor.addSection')}</button></div>
          {!draft.document.sections.length && <p className="estimate-empty-items">{t('estimateEditor.noItems')}</p>}
          {draft.document.sections.map((section, sectionIndex) => <section className="estimate-section" key={section.id}>
            <div className="estimate-section-head"><button aria-label={t('estimateEditor.toggleSection')} onClick={() => updateSection(section.id, (row) => ({ ...row, collapsed: !row.collapsed }))}>{section.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
              <input aria-label={t('estimateEditor.sectionName')} value={section.title} onChange={(event) => updateSection(section.id, (row) => ({ ...row, title: event.target.value }))} />
              <span>{money(totals.sections[sectionIndex]?.costCents || 0)}</span><div className="estimate-controls"><button aria-label={t('estimateEditor.moveUp')} disabled={sectionIndex === 0} onClick={() => updateDocument((doc) => ({ ...doc, sections: moveInArray(doc.sections, sectionIndex, -1) }))}><ArrowUp size={15} /></button><button aria-label={t('estimateEditor.moveDown')} disabled={sectionIndex === draft.document.sections.length - 1} onClick={() => updateDocument((doc) => ({ ...doc, sections: moveInArray(doc.sections, sectionIndex, 1) }))}><ArrowDown size={15} /></button><button aria-label={t('estimateEditor.duplicate')} onClick={() => updateDocument((doc) => ({ ...doc, sections: [...doc.sections.slice(0, sectionIndex + 1), { ...structuredClone(section), id: crypto.randomUUID(), items: section.items.map((item) => ({ ...structuredClone(item), id: crypto.randomUUID() })) }, ...doc.sections.slice(sectionIndex + 1)] }))}><Copy size={15} /></button><button aria-label={t('estimateEditor.delete')} onClick={() => updateDocument((doc) => ({ ...doc, sections: doc.sections.filter((row) => row.id !== section.id) }))}><Trash2 size={15} /></button></div>
            </div>
            {!section.collapsed && <><div className="estimate-grid-labels"><span>{t('estimateEditor.description')}</span><span>{t('estimateEditor.qty')}</span><span>{t('estimateEditor.unit')}</span><span>{t('estimateEditor.unitCost')}</span><span>{t('estimateEditor.costType')}</span><span>{t('estimateEditor.cost')}</span><span /></div>
              {section.items.map((item, itemIndex) => <div className="estimate-item-wrap" key={item.id}><div className="estimate-item-row">
                <input aria-label={t('estimateEditor.description')} value={item.description} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, description: event.target.value, translations: undefined, origin: 'manual' }))} placeholder={t('estimateEditor.description')} />
                <input aria-label={t('estimateEditor.qty')} type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, quantity: event.target.value }))} />
                <select aria-label={t('estimateEditor.unit')} value={item.unit} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { unit: event.target.value }, language))}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
                <input aria-label={t('estimateEditor.unitCost')} type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { unitCost: event.target.value }, language))} />
                <select aria-label={t('estimateEditor.costType')} value={item.costType} onChange={(event) => updateItem(section.id, item.id, (row) => reviseManualPrice(row, { costType: event.target.value }, language))}>{COST_TYPES.map((type) => <option key={type} value={type}>{t(`costType.${type}`)}</option>)}</select>
                <strong>{money(itemCostCents(item))}</strong><button aria-label={t('estimateEditor.details')} onClick={() => setDetailId(detailId === item.id ? null : item.id)}><ChevronDown size={17} /></button>
              </div>{detailId === item.id && <div className="estimate-item-detail"><label>{t('estimateEditor.notes')}<textarea value={item.notes || ''} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, notes: event.target.value }))} /></label><label>{t('estimateEditor.priceSource')}<input value={item.priceSource || ''} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, priceSource: event.target.value }))} /></label><label>{t('estimateEditor.priceDate')}<input type="date" value={item.priceDate || ''} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, priceDate: event.target.value }))} /></label><label className="estimate-checkbox"><input type="checkbox" checked={Boolean(item.needsReview)} onChange={(event) => updateItem(section.id, item.id, (row) => ({ ...row, needsReview: event.target.checked }))} />{t('estimateEditor.needsReview')}</label><label>{a('markup')}<input type="number" min="0" max="1000" step="0.01" value={item.markupBps == null ? '' : item.markupBps / 100} placeholder={String(draft.markup_bps / 100)} onChange={event => updateItem(section.id, item.id, row => ({ ...row, markupBps: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} /></label><div className="estimate-detail-actions"><button disabled={itemIndex === 0} onClick={() => updateSection(section.id, (row) => ({ ...row, items: moveInArray(row.items, itemIndex, -1) }))}>{t('estimateEditor.moveUp')}</button><button disabled={itemIndex === section.items.length - 1} onClick={() => updateSection(section.id, (row) => ({ ...row, items: moveInArray(row.items, itemIndex, 1) }))}>{t('estimateEditor.moveDown')}</button><button onClick={() => updateSection(section.id, (row) => ({ ...row, items: [...row.items.slice(0, itemIndex + 1), { ...structuredClone(item), id: crypto.randomUUID() }, ...row.items.slice(itemIndex + 1)] }))}>{t('estimateEditor.duplicate')}</button><button onClick={() => updateSection(section.id, (row) => ({ ...row, items: row.items.filter((entry) => entry.id !== item.id) }))}>{t('estimateEditor.delete')}</button></div></div>}</div>)}
              <button className="estimate-add-item" onClick={() => updateSection(section.id, (row) => ({ ...row, items: [...row.items, { ...newItem(language), ...(draft.document.scope ? { taskId: section.id, origin: 'manual' } : {}) }] }))}><Plus size={16} />{t('estimateEditor.addItem')}</button></>}
          </section>)}
          <div className="estimate-summary"><label>{t('estimateEditor.markupRate')}<span className="estimate-markup-input"><input type="number" min="0" max="1000" step="0.1" value={draft.markup_bps / 100} onChange={(event) => edit((current) => ({ ...current, markup_bps: Math.round(Number(event.target.value) * 100) }))} />%</span></label><dl><div><dt>{t('estimateEditor.costTotal')}</dt><dd>{money(totals.costCents)}</dd></div><div><dt>{t('estimateEditor.markup')}</dt><dd>{money(totals.markupCents)}</dd></div><div><dt>{t('estimateEditor.profit')}</dt><dd>{money(totals.profitCents)}</dd></div><div className="grand"><dt>{t('estimateEditor.salePrice')}</dt><dd>{money(totals.priceCents)}</dd></div></dl><small>{t('estimateEditor.marginInfo', { value: totals.marginPercent.toFixed(1) })}</small></div>
        </> : draft.document.scope ? <ApprovedProposal estimate={pdfRecord} saved={saveStatus === 'saved' && !conflict} onLanguage={language => updateDocument(doc => ({ ...doc, language }))} /> : <div className="estimate-proposal"><div className="estimate-proposal-actions"><h2>{t('estimateEditor.proposal')}</h2><button className="btn btn-ghost" onClick={previewPdf}><Eye size={16} />{t('estimateEditor.previewPdf')}</button><button className="btn btn-primary" onClick={downloadPdf}><Download size={16} />{t('estimateEditor.downloadPdf')}</button></div>
          <p className="muted">{t('estimateEditor.englishDocument')}</p><div className="proposal-fields">{['intro', 'scope', 'notes', 'exclusions', 'terms'].map((key) => <label key={key}>{t(`estimateEditor.proposalFields.${key}`)}<textarea value={proposal[key] || ''} onChange={(event) => updateDocument((doc) => ({ ...doc, proposal: { ...doc.proposal, [key]: event.target.value } }))} rows={key === 'scope' ? 4 : 2} /></label>)}</div>
          <article className="proposal-preview"><div className="proposal-brand">ONE STOP <small>Building & Remodeling · Los Angeles, CA</small></div><p className="proposal-kicker">ESTIMATE & CLIENT PROPOSAL</p><h2>{draft.title}</h2><p><b>Prepared for:</b> {client?.name || 'Client to be confirmed'}</p><p><b>Job address:</b> {project?.address || client?.address || 'To be confirmed'}</p>
            {proposal.intro && <section><h3>Introduction</h3><p>{proposal.intro}</p></section>}{proposal.scope && <section><h3>Scope of work</h3><p>{proposal.scope}</p></section>}
            <section><h3>Work and pricing</h3>{draft.document.sections.map((section) => <div key={section.id}><h4>{section.title}</h4>{section.items.map((item) => <div className="proposal-line" key={item.id}><span>{item.description || 'Item'} · {item.quantity} {item.unit}</span><b>{money(clientPrices.get(item.id) ?? 0)}</b></div>)}</div>)}<div className="proposal-total"><span>Total proposal</span><b>{money(totals.priceCents)}</b></div></section>
            {Object.entries({ Notes: proposal.notes, Exclusions: proposal.exclusions, 'Terms & conditions': proposal.terms }).map(([label, value]) => value && <section key={label}><h3>{label}</h3><p>{value}</p></section>)}
          </article></div>}
      </main>
    </div>
  </div>
}
