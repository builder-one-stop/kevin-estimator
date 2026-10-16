import { useEffect, useState } from 'react'
import { ArrowLeft, BriefcaseBusiness, MapPin, Pencil, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getClients } from '../services/clients.js'
import { getProjectById, updateProject } from '../services/projects.js'
import { STATUS_COLORS } from '../lib/projectData.js'
import ProjectDialog from '../components/projects/ProjectDialog.jsx'
import StageSelect from '../components/projects/StageSelect.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import StatusDot from '../components/ui/StatusDot.jsx'

export default function ProjectWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { showToast } = useOutletContext()
  const [project, setProject] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [stageBusy, setStageBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getProjectById(id), getClients()]).then(([record, clientRows]) => {
      if (active) { setProject(record); setClients(clientRows); setLoading(false); setLoadError(false) }
    }).catch((cause) => {
      console.error('Failed to load project workspace', cause)
      if (active) { setLoading(false); setLoadError(true) }
    })
    return () => { active = false }
  }, [id, retry])

  async function changeStage(record, stage) {
    if (stage === record.stage || stageBusy) return
    setStageBusy(true)
    try {
      setProject(await updateProject(record.id, { stage }))
      showToast(t('projects.stageUpdated'))
    } catch (cause) {
      console.error('Failed to change project stage', cause)
      showToast(t('projects.stageError'))
    } finally {
      setStageBusy(false)
    }
  }

  if (loading) return <div className="page"><p className="contact-message" role="status">{t('workspace.loading')}</p></div>
  if (loadError) return <div className="page"><EmptyState icon={BriefcaseBusiness} title={t('workspace.loadError')} description={t('workspace.loadErrorDetail')} cta={t('workspace.retry')} onAction={() => { setLoading(true); setRetry((value) => value + 1) }} /></div>
  if (!project) return <div className="page"><EmptyState icon={BriefcaseBusiness} title={t('workspace.notFound')} description={t('workspace.notFoundDetail')} cta={t('workspace.backProjects')} onAction={() => navigate('/projects')} /></div>

  return (
    <div className="page workspace-page">
      <Link className="workspace-back" to="/projects"><ArrowLeft size={16} />{t('workspace.backProjects')}</Link>
      <header className="workspace-header">
        <div className="workspace-heading">
          <span className="workspace-code" title={project.id}>{t('workspace.projectCode', { code: project.id.slice(0, 8).toUpperCase() })}</span>
          <h1>{project.name}</h1>
          <div className="workspace-meta">
            {project.client && <Link to={`/contacts?client=${project.client.id}`}><UserRound size={16} />{project.client.name}</Link>}
            {project.address && <span><MapPin size={16} />{project.address}</span>}
          </div>
        </div>
        <div className="workspace-head-actions">
          <span className="workspace-stage"><StatusDot color={STATUS_COLORS[project.stage]} /><StageSelect project={project} onChange={changeStage} busy={stageBusy} /></span>
          <Button variant="ghost" onClick={() => setEditing(true)}><Pencil size={16} />{t('workspace.editProject')}</Button>
        </div>
      </header>
      <nav className="workspace-tabs" aria-label={t('workspace.sections')}>
        <NavLink end to={`/projects/${id}`}>{t('workspace.overview')}</NavLink>
        <NavLink to={`/projects/${id}/estimates`}>{t('workspace.estimates')}</NavLink>
        <NavLink to={`/projects/${id}/invoices`}>{t('workspace.invoices')}</NavLink>
      <NavLink to={`/projects/${id}/progress`}>{t('workers.progress')}</NavLink>
        <NavLink to={`/projects/${id}/hours`}>{t('workers.hours')}</NavLink>
      </nav>
      <Outlet context={{ project }} />
      {editing && <ProjectDialog mode="edit" project={project} clients={clients} onClose={() => setEditing(false)} onSaved={(saved) => { setProject(saved); setEditing(false) }} showToast={showToast} />}
    </div>
  )
}
