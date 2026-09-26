import { CalendarDays } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function Schedule() {
  const { t } = useTranslation()
  const { showSoon } = useOutletContext()
  return <div className="page"><div className="page-head"><h1>{t('schedule.title')}</h1></div><EmptyState icon={CalendarDays} title={t('schedule.emptyT')} description={t('schedule.emptyP')} cta={t('schedule.cta')} onAction={showSoon} /></div>
}
