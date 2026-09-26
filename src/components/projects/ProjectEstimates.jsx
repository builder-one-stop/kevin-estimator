import { Link } from 'react-router-dom'
import { FileText, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function ProjectEstimates({ compact = false }) {
  const { t } = useTranslation()
  return <section className={`workspace-section ${compact ? 'workspace-section-compact' : ''}`}>
    <div className="workspace-section-head"><h2>{t('workspace.estimates')}</h2><Link to="/estimates">{t('workspace.viewEstimates')}<ArrowUpRight size={16} /></Link></div>
    <div className="workspace-empty"><FileText size={22} /><div><b>{t('workspace.noEstimates')}</b><p>{t('workspace.noEstimatesDetail')}</p></div></div>
  </section>
}
