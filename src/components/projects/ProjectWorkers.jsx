import { useWorkers } from '../workers/useWorkers.js'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Evidence, Hours, WorkerError } from '../workers/WorkerViews.jsx'
import '../../styles/workers.css'
export default function ProjectWorkers({ section }) {
  const { project } = useOutletContext(),
    { t } = useTranslation(),
    { data, error, busy, execute, reload } = useWorkers()
  return (
    <>
      <WorkerError code={error} />
      {!data ? (
        <p>{t('workers.loading')}</p>
      ) : section === 'progress' ? (
        <Evidence data={data} projectId={project.id} manager reload={reload} />
      ) : (
        <Hours data={data} projectId={project.id} manager execute={execute} busy={busy} />
      )}
    </>
  )
}
