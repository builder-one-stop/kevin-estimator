import { useWorkers } from '../components/workers/useWorkers.js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Evidence, Hours, WorkerError } from '../components/workers/WorkerViews.jsx'
import { shiftTotals } from '../../shared/workerTime.js'
import '../styles/workers.css'
export default function Workers() {
  const { t } = useTranslation(),
    model = useWorkers()
  const { data, error, busy, execute, reload } = model
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [form, setForm] = useState(null),
    [selected, setSelected] = useState(null),
    [password, setPassword] = useState(''),
    [reset, setReset] = useState(null),
    [notice, setNotice] = useState('')
  const update = (changes) => setForm((f) => ({ ...f, ...changes }))
  async function save(e) {
    e.preventDefault()
    try {
      setNotice('')
      if (form.create) {
        const w = await execute('create', { id: form.id, name: form.name, email: form.email, password })
        setPassword('')
        update({ create: false, id: w.id })
        await execute('update', { workerId: w.id, name: form.name, active: true, projects: form.projects })
      } else
        await execute('update', {
          workerId: form.id,
          name: form.name,
          active: form.active,
          projects: form.projects,
        })
      setForm(null)
      setNotice(t('workers.saved'))
    } catch {
      /* retry preserves reservation and assignments */
    }
  }
  return (
    <div className="page workers-page">
      <header className="worker-heading">
        <div>
          <h1>{t('workers.title')}</h1>
          <p>{t('workers.adminIntro')}</p>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            setReset(null)
            setForm({
              create: true,
              id: crypto.randomUUID(),
              name: '',
              email: '',
              active: true,
              projects: [],
            })
            setPassword('')
            setNotice('')
          }}
        >
          {t('workers.create')}
        </button>
      </header>
      <WorkerError code={error} />
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>{t('workers.loading')}</p>
      ) : (
        <>
          <div className="worker-filters">
            <label>
              {t('workers.search')}
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              {t('workers.status')}
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">{t('workers.all')}</option>
                <option value="active">{t('workers.active')}</option>
                <option value="inactive">{t('workers.inactive')}</option>
              </select>
            </label>
          </div>
          {!data.workers.length && <p>{t('workers.noWorkers')}</p>}
          <div className="worker-list">
            {data.workers
              .filter(
                (w) =>
                  (status === 'all' || w.active === (status === 'active')) &&
                  `${w.name} ${w.email}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((w) => {
                const shift = data.shifts.find((s) => s.worker_id === w.id && !s.ended_at)
                return (
                  <article className="worker-card" key={w.id}>
                    <h2>{w.name}</h2>
                    <p>{w.email}</p>
                    <p>
                      {t(w.active ? 'workers.active' : 'workers.inactive')} ·{' '}
                      {t(`workers.state.${shift ? shiftTotals(shift.events).state : 'none'}`)}
                    </p>
                    {!w.user_id && <p role="status">{t('workers.provisionPending')}</p>}
                    <ul>
                      {data.assignments
                        .filter((a) => a.worker_id === w.id)
                        .map((a) => (
                          <li key={a.project_id}>
                            {data.projects.find((p) => p.id === a.project_id)?.name ||
                              a.project_id.slice(0, 8)}
                          </li>
                        ))}
                    </ul>
                    <div className="worker-actions">
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                          setReset(null)
                          setForm({
                            ...w,
                            projects: data.assignments
                              .filter((a) => a.worker_id === w.id)
                              .map((a) => a.project_id),
                            create: !w.user_id,
                          })
                          setPassword('')
                        }}
                      >
                        {t('workers.edit')}
                      </button>
                      <button
                        className="btn"
                        disabled={busy || !w.user_id}
                        onClick={() => {
                          setForm(null)
                          setReset(w)
                          setPassword('')
                        }}
                      >
                        {t('workers.resetPassword')}
                      </button>
                      <button className="btn" onClick={() => setSelected(w.id)}>
                        {t('workers.records')}
                      </button>
                    </div>
                  </article>
                )
              })}
          </div>
          {form && (
            <form className="worker-card worker-form" onSubmit={save}>
              <h2>{t(form.create ? 'workers.create' : 'workers.edit')}</h2>
              <label>
                {t('workers.name')}
                <input
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              {form.create && (
                <>
                  <label>
                    {t('workers.email')}
                    <input
                      required
                      type="email"
                      autoComplete="off"
                      value={form.email}
                      onChange={(e) => update({ email: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('workers.initialPassword')}
                    <input
                      required
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <p>{t('workers.passwordPolicy')}</p>
                </>
              )}
              {!form.create && (
                <label className="worker-check">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => update({ active: e.target.checked })}
                  />
                  {t('workers.active')}
                </label>
              )}
              <fieldset>
                <legend>{t('workers.assignProjects')}</legend>
                {!data.projects.length && <p>{t('workers.createProjectFirst')}</p>}
                {data.projects.map((p) => (
                  <label className="worker-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={form.projects.includes(p.id)}
                      onChange={(e) =>
                        update({
                          projects: e.target.checked
                            ? [...form.projects, p.id]
                            : form.projects.filter((x) => x !== p.id),
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </fieldset>
              <div className="worker-actions">
                <button className="btn btn-primary" disabled={busy}>
                  {t(busy ? 'workers.saving' : 'workers.save')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setForm(null)
                    setPassword('')
                  }}
                >
                  {t('workers.cancel')}
                </button>
              </div>
            </form>
          )}
          {reset && (
            <form
              className="worker-card worker-form"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await execute('password', { workerId: reset.id, password })
                  setReset(null)
                  setPassword('')
                  setNotice(t('workers.passwordReset'))
                } catch {
                  /* parent error */
                }
              }}
            >
              <h2>
                {t('workers.resetPassword')} — {reset.name}
              </h2>
              <label>
                {t('workers.newPassword')}
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p>{t('workers.passwordPolicy')}</p>
              <div className="worker-actions">
                <button className="btn btn-primary" disabled={busy}>
                  {t('workers.save')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setReset(null)
                    setPassword('')
                  }}
                >
                  {t('workers.cancel')}
                </button>
              </div>
            </form>
          )}
          {selected && (
            <>
              <button className="btn" onClick={() => setSelected(null)}>
                {t('workers.close')}
              </button>
              <Hours data={data} workerId={selected} manager execute={execute} busy={busy} />
              <Evidence data={data} workerId={selected} manager reload={reload} />
            </>
          )}
        </>
      )}
    </div>
  )
}
