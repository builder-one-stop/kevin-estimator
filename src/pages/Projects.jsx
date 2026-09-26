import { useState } from 'react'
import { BriefcaseBusiness, LayoutList, MapPin, Plus, SortDesc, Tags, UserRound, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PROJECTS, STATUS_COLORS } from '../mocks/data.js'
import { formatMoney } from '../lib/money.js'
import Button from '../components/ui/Button.jsx'
import Chip from '../components/ui/Chip.jsx'
import IconButton from '../components/ui/IconButton.jsx'
import StatusDot from '../components/ui/StatusDot.jsx'

const columns = ['lead', 'draft', 'bidding', 'approved', 'progress', 'done']

function ProjectCard({ project }) {
  return (
    <article className="pcard" tabIndex="0">
      <span className="id">{project.id}</span><span className="title">{project.title}</span><span className="amt">{formatMoney(project.amount)}</span>
      {project.address && <span className="pill"><MapPin size={14} />{project.address}</span>}
      {(project.client || project.assignee) && <span className="pill"><UserRound size={14} />{project.client || project.assignee}</span>}
    </article>
  )
}

export default function Projects() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [view, setView] = useState('board')

  return (
    <div className="page">
      <div className="page-head"><h1>{t('projects.title')}</h1><Button onClick={() => navigate('/')}><Plus size={18} />{t('projects.create')}</Button></div>
      <div className="filters">
        <Chip><UserRound size={16} />{t('projects.clients')}</Chip><Chip><UsersRound size={16} />{t('projects.assignees')}</Chip><Chip><Tags size={16} />{t('projects.labels')}</Chip>
        <span className="spacer" /><Chip><SortDesc size={16} />{t('projects.sort')}</Chip>
        <div className="seg" role="group">
          <IconButton label={t('a11y.board')} aria-pressed={view === 'board'} onClick={() => setView('board')}><BriefcaseBusiness size={18} /></IconButton>
          <IconButton label={t('a11y.list')} aria-pressed={view === 'list'} onClick={() => setView('list')}><LayoutList size={18} /></IconButton>
        </div>
      </div>
      {view === 'board' ? (
        <div className="board">
          {columns.map((status) => {
            const projects = PROJECTS.filter((project) => project.status === status)
            const sum = projects.reduce((value, project) => value + project.amount, 0)
            return (
              <section className="col" aria-label={t(`status.${status}`)} key={status}>
                <div className="col-head"><StatusDot color={STATUS_COLORS[status]} />{t(`status.${status}`)}<span className="tag count-tag">{projects.length}</span><span className="sum">{formatMoney(sum)}</span></div>
                {projects.length ? projects.map((project) => <ProjectCard key={project.id} project={project} />) : <div className="col-empty">{t('projects.empty')}</div>}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rows">{PROJECTS.map((project) => (
          <div className="row row-projects" key={project.id}>
            <span className="muted">{project.id}</span><b>{project.title}</b>
            <span className="status"><StatusDot color={STATUS_COLORS[project.status]} />{t(`status.${project.status}`)}</span>
            <span className="muted">{project.assignee || project.client || '—'}</span><span className="money end">{formatMoney(project.amount)}</span>
          </div>
        ))}</div>
      )}
    </div>
  )
}
