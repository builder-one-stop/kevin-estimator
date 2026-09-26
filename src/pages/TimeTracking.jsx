import { Clock3 } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function TimeTracking() {
  const { t } = useTranslation()
  const { showSoon } = useOutletContext()
  return <div className="page"><div className="page-head"><h1>{t('time.title')}</h1></div><EmptyState icon={Clock3} title={t('time.emptyT')} description={t('time.emptyP')} cta={t('time.cta')} onAction={showSoon} /></div>
}
