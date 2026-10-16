import { useTranslation } from 'react-i18next'
import { useWorkers } from '../components/workers/useWorkers.js'
import { Hours, WorkerError } from '../components/workers/WorkerViews.jsx'
import '../styles/workers.css'
export default function TimeTracking() {
  const { t } = useTranslation()
  const { data, error, busy, execute } = useWorkers()
  return (
    <div className="page">
      <h1>{t('time.title')}</h1>
      <WorkerError code={error} />
      {data ? <Hours data={data} manager execute={execute} busy={busy} /> : <p>{t('workers.loading')}</p>}
    </div>
  )
}
