import { useWorkers } from '../components/workers/useWorkers.js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n/index.js'
import { supabase } from '../supabaseClient.js'
import { Evidence, Hours, WorkerError } from '../components/workers/WorkerViews.jsx'
import { shiftTotals } from '../../shared/workerTime.js'
import { LogoMark } from '../components/layout/Sidebar.jsx'
import '../styles/workers.css'
export default function WorkerPortal() {
  const { t, i18n } = useTranslation(),
    navigate = useNavigate(),
    { data, error, busy, execute, reload } = useWorkers()
  const [project, setProject] = useState(''),
    [confirm, setConfirm] = useState(false),
    [localError, setLocalError] = useState('')
  const pending = useRef(null)
  useEffect(() => {
    navigate('/work', { replace: true })
  }, [navigate])
  const open = data?.shifts.find((s) => !s.ended_at),
    selected = open?.project_id || project || data?.projects[0]?.id || ''
  const state = open
    ? shiftTotals(open.events).state
    : data?.shifts.some((s) => s.project_id === selected)
      ? 'closed'
      : 'none'
  async function clock(kind, closeBreak = false) {
    if (busy) return
    if (kind === 'out' && state === 'break' && !closeBreak) {
      setConfirm(true)
      return
    }
    if (!pending.current || pending.current.kind !== kind || pending.current.projectId !== selected)
      pending.current = { id: crypto.randomUUID(), kind, projectId: selected }
    try {
      await execute('clock', { ...pending.current, closeBreak })
      pending.current = null
      setConfirm(false)
    } catch {
      /* retain id for lost-response retry */
    }
  }
  return (
    <main className="worker-portal">
      <header className="worker-heading">
        <div className="brand">
          <LogoMark />
          <b>One Stop</b>
        </div>
        <div className="worker-actions">
          <button className="btn" onClick={() => setLanguage(i18n.language === 'es' ? 'en' : 'es')}>
            {i18n.language === 'es' ? 'English' : 'Español'}
          </button>
          <button
            className="btn"
            onClick={async () => {
              const r = await supabase.auth.signOut({ scope: 'local' })
              if (r.error) setLocalError('SERVICE_UNAVAILABLE')
            }}
          >
            {t('menu.signout')}
          </button>
        </div>
      </header>
      <h1>{t('workers.myWork')}</h1>
      <WorkerError code={error || localError} />
      {!data ? (
        <p>{t('workers.loading')}</p>
      ) : (
        <>
          <p>{data.workers[0]?.name}</p>
          {!data.projects.length ? (
            <section className="worker-card">
              <h2>{t('workers.noProjects')}</h2>
              <p>{t('workers.noProjectsDetail')}</p>
            </section>
          ) : (
            <>
              <label>
                {t('workers.project')}
                <select
                  value={selected}
                  disabled={!!open || busy}
                  onChange={(e) => {
                    setProject(e.target.value)
                    pending.current = null
                  }}
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>{data.projects.find((p) => p.id === selected)?.address}</p>
              <section className="worker-clock worker-card">
                <h2>{t(`workers.state.${state}`)}</h2>
                <p>{t('workers.clockInfo')}</p>
                <div className="worker-clock-buttons">
                  {!open ? (
                    <button className="btn btn-primary" disabled={busy} onClick={() => clock('in')}>
                      {t('workers.event.in')}
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => clock(state === 'break' ? 'break_end' : 'break_start')}
                      >
                        {t(`workers.event.${state === 'break' ? 'break_end' : 'break_start'}`)}
                      </button>
                      <button className="btn" disabled={busy} onClick={() => clock('out')}>
                        {t('workers.event.out')}
                      </button>
                    </>
                  )}
                </div>
                {confirm && (
                  <div role="group" aria-label={t('workers.confirmClose')}>
                    <p>{t('workers.confirmClose')}</p>
                    <button className="btn btn-primary" disabled={busy} onClick={() => clock('out', true)}>
                      {t('workers.confirm')}
                    </button>
                    <button className="btn" onClick={() => setConfirm(false)}>
                      {t('workers.cancel')}
                    </button>
                  </div>
                )}
              </section>
              <Evidence data={data} projectId={selected} reload={reload} />
            </>
          )}
          <Hours data={data} manager={false} execute={execute} busy={busy} />
        </>
      )}
    </main>
  )
}
