import { useTranslation } from 'react-i18next'
import { PROJECT_STAGES, STAGE_KEYS } from '../../lib/projectData.js'

export default function StageSelect({ project, onChange, busy }) {
  const { t } = useTranslation()
  return <select className="project-stage-select" value={project.stage} onChange={(event) => onChange(project, event.target.value)} disabled={busy} aria-label={t('projects.changeStage', { name: project.name })}>
    {PROJECT_STAGES.map((stage) => <option key={stage} value={stage}>{t(`status.${STAGE_KEYS[stage]}`)}</option>)}
  </select>
}
