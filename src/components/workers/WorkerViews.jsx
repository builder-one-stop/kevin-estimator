import BatchCorrection from './BatchCorrection.jsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { workersApi, uploadProgress } from '../../services/workers.js'
import {
  duration,
  formatWorkerTime,
  localDate,
  proposedInstant,
  shiftTotals,
} from '../../../shared/workerTime.js'

export function WorkerError({ code }) {
  const { t } = useTranslation()
  return code ? (
    <p role="alert" className="worker-error">
      {t(`workers.errors.${code}`, { defaultValue: t('workers.errors.default') })}
    </p>
  ) : null
}
export function Filters({ data, value, onChange }) {
  const { t } = useTranslation()
  return (
    <div className="worker-filters">
      <label>
        {t('workers.worker')}
        <select value={value.worker} onChange={(e) => onChange({ ...value, worker: e.target.value })}>
          <option value="">{t('workers.all')}</option>
          {data.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('workers.from')}
        <input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </label>
      <label>
        {t('workers.to')}
        <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
    </div>
  )
}
const matches = (row, f, at) =>
  !f ||
  ((!f.worker || row.worker_id === f.worker) &&
    (!f.from || localDate(at) >= f.from) &&
    (!f.to || localDate(at) <= f.to))
export function Hours({ data, projectId, workerId, manager, execute, busy }) {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState({ worker: '', from: '', to: '' }),
    [editing, setEditing] = useState(null),
    [reason, setReason] = useState(''),
    [at, setAt] = useState(''),
    [offset, setOffset] = useState('-07:00'),
    [kind, setKind] = useState('out'),
    [eventId, setEventId] = useState(''),
    [error, setError] = useState(''),
    [review, setReview] = useState(null),
    [batch, setBatch] = useState(null)
  const rows = data.shifts.filter(
    (s) =>
      (!projectId || s.project_id === projectId) &&
      (!workerId || s.worker_id === workerId) &&
      matches(s, filter, s.started_at),
  )
  const sum = rows
    .filter((s) => s.ended_at)
    .map((s) => shiftTotals(s.events))
    .reduce(
      (a, b) => ({
        elapsed: a.elapsed + b.elapsed,
        breaks: a.breaks + b.breaks,
        working: a.working + b.working,
        breakCount: a.breakCount + b.breakCount,
      }),
      { elapsed: 0, breaks: 0, working: 0, breakCount: 0 },
    )
  async function save(e) {
    e.preventDefault()
    setError('')
    try {
      await execute(manager ? 'admin-correction' : 'correction', {
        shiftId: editing.id,
        eventId: eventId || null,
        kind: eventId ? null : kind,
        at: proposedInstant(at, offset),
        reason,
      })
      setEditing(null)
      setReason('')
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <section className="worker-section">
      <h2>{t('workers.hours')}</h2>
      <p className="muted">{t('workers.timezone')}</p>
      {manager && (
        <button className="btn" onClick={() => setBatch({})}>
          {t('workers.addMissingShift')}
        </button>
      )}
      {manager && <Filters data={data} value={filter} onChange={setFilter} />}
      <p>
        {t('workers.closedTotals')}: {t('workers.elapsed')} {duration(sum.elapsed)} · {t('workers.breaks')}{' '}
        {duration(sum.breaks)} ({sum.breakCount}) · {t('workers.recorded')} {duration(sum.working)}
      </p>
      {!rows.length && <p>{t('workers.noHours')}</p>}
      {rows.map((s) => {
        const totals = shiftTotals(s.events, Date.parse(data.serverTime))
        return (
          <article className="worker-card" key={s.id}>
            <header>
              <b>{data.workers.find((w) => w.id === s.worker_id)?.name}</b>
              <span>
                {data.projects.find((p) => p.id === s.project_id)?.name || s.project_id.slice(0, 8)}
              </span>
              <strong>{t(`workers.state.${totals.state}`)}</strong>
            </header>
            <ol>
              {s.events.map((e) => (
                <li key={e.id}>
                  {t(`workers.event.${e.kind}`)} — {formatWorkerTime(e.at, i18n.language)}
                </li>
              ))}
            </ol>
            <p>
              {totals.provisional && <b>{t('workers.provisional')} · </b>}
              {t('workers.elapsed')}: {duration(totals.elapsed)} · {t('workers.breaks')}:{' '}
              {duration(totals.breaks)} ({totals.breakCount}) · {t('workers.recorded')}:{' '}
              {duration(totals.working)}
            </p>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setEditing(s)
                setEventId(s.events[0]?.id || '')
                setAt('')
                setReason('')
                setError('')
              }}
            >
              {t(manager ? 'workers.correct' : 'workers.requestCorrection')}
            </button>
            {manager && (
              <button className="btn" onClick={() => setBatch({ shift: s })}>
                {t('workers.completeOmission')}
              </button>
            )}
            {data.corrections
              .filter((c) => c.shift_id === s.id)
              .map((c) => (
                <div className="worker-audit" key={c.id}>
                  <p>
                    {t(`workers.correctionStatus.${c.status}`)} · {c.reason} ·{' '}
                    {formatWorkerTime(c.proposed_at, i18n.language)}
                  </p>
                  {c.review_reason && <p>{c.review_reason}</p>}
                  {c.status === 'pending' && manager && (
                    <button
                      className="btn"
                      onClick={() => {
                        setReview(c)
                        setReason('')
                      }}
                    >
                      {t('workers.review')}
                    </button>
                  )}
                  {c.before_events && (
                    <details>
                      <summary>{t('workers.audit')}</summary>
                      <p>{t('workers.before')}</p>
                      <ul>
                        {c.before_events.map((e) => (
                          <li key={e.id}>
                            {t(`workers.event.${e.kind}`)} {formatWorkerTime(e.at, i18n.language)}
                          </li>
                        ))}
                      </ul>
                      <p>{t('workers.after')}</p>
                      <ul>
                        {c.after_events.map((e) => (
                          <li key={e.id}>
                            {t(`workers.event.${e.kind}`)} {formatWorkerTime(e.at, i18n.language)}
                          </li>
                        ))}
                      </ul>
                      <small>
                        {c.reviewed_by} · {formatWorkerTime(c.reviewed_at, i18n.language)}
                      </small>
                    </details>
                  )}
                </div>
              ))}
          </article>
        )
      })}
      {batch && (
        <BatchCorrection
          data={data}
          shift={batch.shift}
          workerId={workerId}
          projectId={projectId}
          execute={execute}
          busy={busy}
          onClose={() => setBatch(null)}
        />
      )}
      {editing && (
        <form className="worker-card worker-form" onSubmit={save}>
          <h3>{t('workers.correction')}</h3>
          <label>
            {t('workers.eventLabel')}
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {editing.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {t(`workers.event.${e.kind}`)} — {formatWorkerTime(e.at, i18n.language)}
                </option>
              ))}
              {manager && <option value="">{t('workers.omission')}</option>}
            </select>
          </label>
          {!eventId && (
            <label>
              {t('workers.eventLabel')}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {['in', 'break_start', 'break_end', 'out'].map((k) => (
                  <option key={k} value={k}>
                    {t(`workers.event.${k}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t('workers.proposedTime')}
            <input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
          <label>
            {t('workers.offset')}
            <select value={offset} onChange={(e) => setOffset(e.target.value)}>
              <option value="-07:00">PDT (UTC−07:00)</option>
              <option value="-08:00">PST (UTC−08:00)</option>
            </select>
          </label>
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
            <button className="btn btn-primary" disabled={busy}>
              {t('workers.save')}
            </button>
            <button className="btn" type="button" onClick={() => setEditing(null)}>
              {t('workers.cancel')}
            </button>
          </div>
        </form>
      )}
      {review && (
        <form
          className="worker-card worker-form"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await execute('review', {
                correctionId: review.id,
                decision: e.nativeEvent.submitter.value,
                reason,
              })
              setReview(null)
            } catch {
              /* parent error */
            }
          }}
        >
          <h3>{t('workers.review')}</h3>
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
          <div className="worker-actions">
            <button className="btn btn-primary" value="approve" disabled={busy}>
              {t('workers.approve')}
            </button>
            <button className="btn" value="reject" disabled={busy}>
              {t('workers.reject')}
            </button>
            <button className="btn" type="button" onClick={() => setReview(null)}>
              {t('workers.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
export function Evidence({ data, projectId, workerId, manager, reload }) {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState({ worker: '', from: '', to: '' }),
    [media, setMedia] = useState(null),
    [error, setError] = useState(''),
    [queue, setQueue] = useState([]),
    [uploading, setUploading] = useState(false)
  const rows = data.evidence.filter(
    (e) =>
      (!projectId || e.project_id === projectId) &&
      (!workerId || e.worker_id === workerId) &&
      matches(e, filter, e.created_at),
  )
  const update = (id, changes) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...changes } : x)))
  async function upload(item) {
    setUploading(true)
    setError('')
    update(item.id, { status: 'uploading', error: '' })
    try {
      const record = await workersApi('reserve', {
        id: item.id,
        projectId: item.projectId,
        mime: item.file.type,
        bytes: item.file.size,
      })
      if (record.status !== 'ready') {
        let done = false
        try {
          await workersApi('finish', { evidenceId: record.id })
          done = true
        } catch (e) {
          if (!['FILE_MISSING', 'FILE_TYPE', 'FILE_SIZE'].includes(e.message)) throw e
        }
        if (!done) {
          await uploadProgress(record, item.file, (progress) => update(item.id, { progress }))
          await workersApi('finish', { evidenceId: record.id })
        }
      }
      update(item.id, { status: 'ready', progress: 100 })
      await reload(true)
    } catch (e) {
      update(item.id, { status: 'failed', error: e.message })
    } finally {
      setUploading(false)
    }
  }
  return (
    <section className="worker-section">
      <h2>{t('workers.progress')}</h2>
      {manager ? (
        <Filters data={data} value={filter} onChange={setFilter} />
      ) : (
        <>
          <p>{t('workers.fileLimits')}</p>
          <label className="worker-upload">
            {t('workers.chooseFiles')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              disabled={!projectId || uploading}
              onChange={(e) => {
                const files = [...e.target.files]
                if (files.length > 5) {
                  setError('UPLOAD_LIMIT')
                  return
                }
                setError('')
                setQueue(
                  files.map((file) => ({
                    id: crypto.randomUUID(),
                    projectId,
                    file,
                    status: 'pending',
                    progress: 0,
                  })),
                )
              }}
            />
          </label>
          {queue.map((item) => (
            <div className="worker-card" key={item.id}>
              <b>{item.file.name}</b>
              <p>
                {t(`workers.uploadStatus.${item.status}`)} {item.progress}%
              </p>
              <progress max={100} value={item.progress} />
              <WorkerError code={item.error} />
              {item.status !== 'ready' && (
                <button className="btn" disabled={uploading} onClick={() => upload(item)}>
                  {t(item.status === 'failed' ? 'workers.retry' : 'workers.upload')}
                </button>
              )}
            </div>
          ))}
        </>
      )}
      <WorkerError code={error} />
      {!rows.length && <p>{t('workers.noEvidence')}</p>}
      <div className="worker-gallery">
        {rows.map((row) => (
          <article className="worker-card" key={row.id}>
            <b>{data.workers.find((w) => w.id === row.worker_id)?.name}</b>
            <p>{formatWorkerTime(row.completed_at || row.created_at, i18n.language)}</p>
            <span>{row.mime.startsWith('video/') ? t('workers.video') : t('workers.photo')}</span>
            <p>{t(`workers.uploadStatus.${row.status}`)}</p>
            {row.status === 'ready' && (
              <button
                className="btn"
                onClick={async () => {
                  try {
                    setError('')
                    setMedia(await workersApi('view', { evidenceId: row.id }))
                  } catch (e) {
                    setError(e.message)
                  }
                }}
              >
                {t('workers.view')}
              </button>
            )}
            {!manager && row.status !== 'ready' && (
              <label className="worker-upload">
                {t('workers.retrySameFile')}
                <input
                  type="file"
                  accept={row.mime}
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file)
                      setQueue((q) => [
                        ...q.filter((x) => x.id !== row.id),
                        { id: row.id, projectId: row.project_id, file, status: 'pending', progress: 0 },
                      ])
                  }}
                />
              </label>
            )}
            {!manager && row.status !== 'ready' && (
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await workersApi('finish', { evidenceId: row.id })
                    await reload(true)
                  } catch (e) {
                    setError(e.message)
                  }
                }}
              >
                {t('workers.verifyUpload')}
              </button>
            )}
          </article>
        ))}
      </div>
      {media && (
        <div
          className="worker-media"
          role="dialog"
          aria-modal="true"
          aria-label={t('workers.progress')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMedia(null)
          }}
        >
          <button autoFocus className="btn" onClick={() => setMedia(null)}>
            {t('workers.close')}
          </button>
          {media.mime.startsWith('video/') ? (
            <video controls autoPlay src={media.url} onError={() => setError('PLAYBACK_UNSUPPORTED')} />
          ) : (
            <img src={media.url} alt={t('workers.progress')} onError={() => setError('FILE_MISSING')} />
          )}
          <WorkerError code={error} />
          <p>{t('workers.linkLifetime')}</p>
        </div>
      )}
    </section>
  )
}
