import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { STAGE_KEYS } from '../../lib/projectData.js'
import ProjectEstimates from './ProjectEstimates.jsx'
import ProjectInvoices from './ProjectInvoices.jsx'
import {useBetaAccess} from '../auth/BetaAccessContext.jsx'

function Detail({ label, children }) {
  return <div className="workspace-detail"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

export default function ProjectOverview() {
  const { project } = useOutletContext()
  const seller=useBetaAccess()?.role==='seller'
  const { t, i18n } = useTranslation()
  const client = project.client
  const created = project.created_at && new Intl.DateTimeFormat(i18n.language === 'es' ? 'es-CL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(project.created_at))

  return <div className="workspace-overview">
    <div className="workspace-details-grid">
      <section className="workspace-panel">
        <h2>{t('workspace.projectDetails')}</h2>
        <dl>
          <Detail label={t('workspace.stage')}>{t(`status.${STAGE_KEYS[project.stage]}`)}</Detail>
          <Detail label={t('workspace.client')}>{client?.name}</Detail>
          <Detail label={t('workspace.address')}>{project.address}</Detail>
          <Detail label={t('workspace.created')}>{created}</Detail>
        </dl>
      </section>
      <section className="workspace-panel">
        <div className="workspace-panel-head"><h2>{t('workspace.clientDetails')}</h2>{client && !seller&&<Link to={`/contacts?client=${client.id}`}>{t('workspace.openContact')}</Link>}</div>
        {client ? <dl>
          <Detail label={t('workspace.name')}>{client.name}</Detail>
          <Detail label={t('workspace.phone')}>{client.phone}</Detail>
          <Detail label={t('workspace.email')}>{client.email}</Detail>
          <Detail label={t('workspace.address')}>{client.address}</Detail>
        </dl> : <p className="muted">{t('workspace.noClient')}</p>}
      </section>
    </div>
    <div className="workspace-related"><ProjectEstimates compact />{!seller&&<ProjectInvoices compact />}</div>
    {!seller&&<section className="workspace-financial">
      <div className="workspace-section-head"><h2>{t('workspace.financial')}</h2></div>
      <div className="workspace-metrics">
        <div><span>{t('workspace.estimatedValue')}</span><b>—</b></div>
        <div><span>{t('workspace.invoicedTotal')}</span><b>—</b></div>
        <div><span>{t('workspace.profit')}</span><b>—</b></div>
      </div>
      <p>{t('workspace.financialPending')}</p>
    </section>}
  </div>
}
