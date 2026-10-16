import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localTimeInput, proposedInstant } from '../../../shared/workerTime.js'
import { WorkerError } from './WorkerViews.jsx'
export default function BatchCorrection({ data, shift, workerId, projectId, execute, busy, onClose }) {
  const { t } = useTranslation()
  const [worker, setWorker] = useState(workerId || data.workers[0]?.id || ''),
    [project, setProject] = useState(projectId || ''),
    [reason, setReason] = useState(''),
    [error, setError] = useState('')
  const [id] = useState(() => crypto.randomUUID())
  const [events, setEvents] = useState(() =>
    shift
      ? shift.events.map((e) => ({ ...e, ...localTimeInput(e.at), original: true }))
      : [
          { id: crypto.randomUUID(), kind: 'in', local: '', offset: '-07:00' },
          { id: crypto.randomUUID(), kind: 'out', local: '', offset: '-07:00' },
        ],
  )
  const change = (id, values) =>
    setEvents((items) => items.map((e) => (e.id === id ? { ...e, ...values } : e)))
  async function save(e) {
    e.preventDefault()
    setError('')
    try {
      const next = events
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          at:
            e.original && e.local === localTimeInput(e.at).local && e.offset === localTimeInput(e.at).offset
              ? e.at
              : proposedInstant(e.local, e.offset),
        }))
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      await execute(shift ? 'admin-batch' : 'admin-shift', {
        ...(shift
          ? { shiftId: shift.id, version: shift.version }
          : { id, workerId: worker, projectId: project }),
        events: next,
        reason,
      })
      onClose()
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <form className="worker-card worker-form" onSubmit={save}>
      <h3>{t('workers.completeOmission')}</h3>
      {!shift && (
        <>
          <label>
            {t('workers.worker')}
            <select value={worker} onChange={(e) => setWorker(e.target.value)}>
              {data.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('workers.project')}
            <select required value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">—</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <p>{t('workers.batchHelp')}</p>
      {events.map((e) => (
        <fieldset key={e.id}>
          <legend>{t('workers.eventLabel')}</legend>
          <label>
            {t('workers.eventLabel')}
            <select
              disabled={e.original}
              value={e.kind}
              onChange={(ev) => change(e.id, { kind: ev.target.value })}
            >
              {['in', 'break_start', 'break_end', 'out'].map((k) => (
                <option key={k} value={k}>
                  {t(`workers.event.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('workers.proposedTime')}
            <input
              required
              type="datetime-local"
              step="1"
              value={e.local}
              onChange={(ev) => change(e.id, { local: ev.target.value })}
            />
          </label>
          <label>
            {t('workers.offset')}
            <select value={e.offset} onChange={(ev) => change(e.id, { offset: ev.target.value })}>
              <option value="-07:00">PDT (UTC−07:00)</option>
              <option value="-08:00">PST (UTC−08:00)</option>
            </select>
          </label>
          {!e.original && (
            <button
              className="btn"
              type="button"
              onClick={() => setEvents((items) => items.filter((x) => x.id !== e.id))}
            >
              {t('workers.removeDraftEvent')}
            </button>
          )}
        </fieldset>
      ))}
      <button
        className="btn"
        type="button"
        onClick={() =>
          setEvents((items) => [
            ...items,
            { id: crypto.randomUUID(), kind: 'break_end', local: '', offset: '-07:00' },
          ])
        }
      >
        {t('workers.addEvent')}
      </button>
      <label>
        {t('workers.reason')}
        <textarea
          required
          minLength={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <WorkerError code={error} />
      <div className="worker-actions">
        <button disabled={busy} className="btn btn-primary">
          {t('workers.save')}
        </button>
        <button className="btn" type="button" onClick={onClose}>
          {t('workers.cancel')}
        </button>
      </div>
    </form>
  )
}
