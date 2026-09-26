import { useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Chip from '../components/ui/Chip.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function Estimates() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return <div className="page estimates-page">
    <div className="page-head"><div><h1>{t('estimates.title')}</h1><p className="estimates-intro">{t('estimates.intro')}</p></div></div>
    <div className="filters">
      <Chip type="button">{t('estimates.all')}<span className="count">0</span></Chip>
      <label className="project-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('estimates.search')} aria-label={t('estimates.search')} /></label>
      <select className="project-filter-select" aria-label={t('estimates.filterStatus')} disabled><option>{t('estimates.allStatuses')}</option></select>
    </div>
    <EmptyState icon={FileText} title={t('estimates.empty')} description={t('estimates.emptyDetail')} cta={t('estimates.create')} onAction={() => navigate('/', { state: { focusComposer: true } })} />
  </div>
}
