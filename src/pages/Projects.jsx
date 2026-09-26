import { useEffect, useState } from 'react'
import { BriefcaseBusiness, LayoutList, MapPin, Pencil, Plus, Search, SortDesc, Trash2, UserRound } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getClients } from '../services/clients.js'
import { getProjects, updateProject } from '../services/projects.js'
import { filterProjects, PROJECT_STAGES, STAGE_KEYS, STATUS_COLORS } from '../lib/projectData.js'
import ProjectDialog from '../components/projects/ProjectDialog.jsx'
import StageSelect from '../components/projects/StageSelect.jsx'
import Button from '../components/ui/Button.jsx'
import Chip from '../components/ui/Chip.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import IconButton from '../components/ui/IconButton.jsx'
import StatusDot from '../components/ui/StatusDot.jsx'

function ProjectActions({ project, onEdit, onDelete, t }) {
  return <span className="project-actions">
    <IconButton label={t('projects.editProject', { name: project.name })} onClick={() => onEdit(project)}><Pencil size={17} /></IconButton>
    <IconButton label={t('projects.deleteProject', { name: project.name })} onClick={() => onDelete(project)}><Trash2 size={17} /></IconButton>
  </span>
}

export default function Projects() {
  const { t } = useTranslation()
  const { showToast } = useOutletContext()
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState('board')
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [oldestFirst, setOldestFirst] = useState(false)
  const [stageBusyId, setStageBusyId] = useState(null)
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([getProjects(), getClients()]).then(([projectRows, clientRows]) => {
      if (active) { setProjects(projectRows); setClients(clientRows); setLoading(false); setLoadError(false) }
    }).catch((cause) => {
      console.error('Failed to load projects', cause)
      if (active) { setLoading(false); setLoadError(true) }
    })
    return () => { active = false }
  }, [retry])

  const visible = filterProjects(projects, { query, stage: stageFilter, clientId: clientFilter })
    .slice().sort((a, b) => (oldestFirst ? 1 : -1) * (a.created_at || '').localeCompare(b.created_at || ''))

  function onSaved(saved, mode) {
    setProjects((current) => mode === 'edit'
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...current])
    setDialog(null)
  }

  function onDeleted(id) {
    setProjects((current) => current.filter((item) => item.id !== id))
    setDialog(null)
  }

  async function onStageChange(project, stage) {
    if (stage === project.stage || stageBusyId) return
    setStageBusyId(project.id)
    try {
      const saved = await updateProject(project.id, { stage })
      setProjects((current) => current.map((item) => item.id === saved.id ? saved : item))
      showToast(t('projects.stageUpdated'))
    } catch (cause) {
      console.error('Failed to change project stage', cause)
      showToast(t('projects.stageError'))
    } finally {
      setStageBusyId(null)
    }
  }

  const hasFilters = Boolean(query || stageFilter || clientFilter)
  function clearFilters() { setQuery(''); setStageFilter(''); setClientFilter('') }
  const actionProps = { onEdit: (project) => setDialog({ mode: 'edit', project }), onDelete: (project) => setDialog({ mode: 'delete', project }), t }

  return (
    <div className="page">
      <div className="page-head"><h1>{t('projects.title')}</h1><Button onClick={() => setDialog({ mode: 'create' })}><Plus size={18} />{t('projects.create')}</Button></div>
      <div className="filters project-filters">
        <select className="project-filter-select" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label={t('projects.filterStage')}>
          <option value="">{t('projects.allStages')}</option>
          {PROJECT_STAGES.map((stage) => <option key={stage} value={stage}>{t(`status.${STAGE_KEYS[stage]}`)}</option>)}
        </select>
        <select className="project-filter-select" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} aria-label={t('projects.filterClient')}>
          <option value="">{t('projects.clients')}</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <label className="project-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('projects.search')} aria-label={t('projects.search')} /></label>
        <span className="spacer" />
        <Chip type="button" aria-label={t('projects.sortCreated')} aria-pressed={oldestFirst} onClick={() => setOldestFirst((value) => !value)}><SortDesc size={16} />{t('projects.sort')}</Chip>
        <div className="seg" role="group" aria-label={t('projects.view')}>
          <IconButton label={t('a11y.board')} aria-pressed={view === 'board'} onClick={() => setView('board')}><BriefcaseBusiness size={18} /></IconButton>
          <IconButton label={t('a11y.list')} aria-pressed={view === 'list'} onClick={() => setView('list')}><LayoutList size={18} /></IconButton>
        </div>
      </div>
      {loading ? <p className="contact-message" role="status">{t('projects.loading')}</p>
        : loadError ? <EmptyState icon={BriefcaseBusiness} title={t('projects.loadError')} description={t('projects.loadErrorDetail')} cta={t('projects.retry')} onAction={() => { setLoading(true); setRetry((value) => value + 1) }} />
          : projects.length === 0 || (hasFilters && visible.length === 0)
            ? <EmptyState icon={BriefcaseBusiness} title={t(hasFilters ? 'projects.noResults' : 'projects.emptyTitle')} description={t(hasFilters ? 'projects.noResultsDetail' : 'projects.emptyDetail')} cta={t(hasFilters ? 'projects.clearFilters' : 'projects.create')} onAction={hasFilters ? clearFilters : () => setDialog({ mode: 'create' })} />
            : view === 'board' ? (
              <div className="board">
                {PROJECT_STAGES.filter((stage) => !stageFilter || stageFilter === stage).map((stage) => {
                  const stageProjects = visible.filter((project) => project.stage === stage)
                  return <section className="col" aria-label={t(`status.${STAGE_KEYS[stage]}`)} key={stage}>
                    <div className="col-head"><StatusDot color={STATUS_COLORS[stage]} />{t(`status.${STAGE_KEYS[stage]}`)}<span className="tag count-tag">{stageProjects.length}</span></div>
                    {/* TODO(estimates): Show project amounts when persisted estimates provide a real source. */}
                    {stageProjects.length ? stageProjects.map((project) => <article className="pcard project-openable" key={project.id}>
                      <Link className="project-hitbox" to={`/projects/${project.id}`} aria-label={t('projects.openProject', { name: project.name })} />
                      <span className="id">{project.id.slice(0, 8).toUpperCase()}</span>
                      <span className="title">{project.name}</span>
                      {project.address && <span className="pill"><MapPin size={14} />{project.address}</span>}
                      {project.client && <span className="pill"><UserRound size={14} />{project.client.name}</span>}
                      <div className="project-card-foot"><StageSelect project={project} onChange={onStageChange} busy={Boolean(stageBusyId)} /><ProjectActions project={project} {...actionProps} /></div>
                    </article>) : <div className="col-empty">{t('projects.empty')}</div>}
                  </section>
                })}
              </div>
            ) : (
              <div className="rows">{visible.map((project) => <div className="row row-projects project-openable" key={project.id}>
                <Link className="project-hitbox" to={`/projects/${project.id}`} aria-label={t('projects.openProject', { name: project.name })} />
                <div className="project-list-name"><b>{project.name}</b>{project.address && <span className="muted row-note">{project.address}</span>}</div>
                <span className="cell-ic"><UserRound size={16} /><span>{project.client?.name || t('projects.noClient')}</span></span>
                <span className="project-list-stage"><StatusDot color={STATUS_COLORS[project.stage]} /><StageSelect project={project} onChange={onStageChange} busy={Boolean(stageBusyId)} /></span>
                <ProjectActions project={project} {...actionProps} />
              </div>)}</div>
            )}
      {dialog && <ProjectDialog key={`${dialog.mode}-${dialog.project?.id || ''}`} {...dialog} clients={clients} onClose={() => setDialog(null)} onSaved={onSaved} onDeleted={onDeleted} showToast={showToast} />}
    </div>
  )
}
