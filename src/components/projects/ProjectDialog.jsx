import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createProject, deleteProject, updateProject } from '../../services/projects.js'
import { cleanProject, PROJECT_STAGES, STAGE_KEYS, validateProject } from '../../lib/projectData.js'
import Button from '../ui/Button.jsx'
import IconButton from '../ui/IconButton.jsx'

const emptyForm = { name: '', client_id: '', address: '', stage: 'Lead' }

export default function ProjectDialog({ mode, project, clients, onClose, onSaved, onDeleted, showToast }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(project ? {
    name: project.name, client_id: project.client_id || '',
    address: project.address || '', stage: project.stage,
  } : emptyForm)
  const [validation, setValidation] = useState(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const data = cleanProject(form)
    const invalid = validateProject(data)
    setValidation(invalid)
    if (invalid) return

    setBusy(true)
    setError(false)
    try {
      const saved = mode === 'edit' ? await updateProject(project.id, data) : await createProject(data)
      onSaved(saved, mode)
      showToast(t(mode === 'edit' ? 'projects.updated' : 'projects.created'))
    } catch (cause) {
      console.error('Failed to save project', cause)
      setError(true)
      showToast(t('projects.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await deleteProject(project.id)
      onDeleted(project.id)
      showToast(t('projects.deleted'))
    } catch (cause) {
      console.error('Failed to delete project', cause)
      setError(true)
      showToast(t('projects.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'create' ? t('projects.create') : mode === 'edit' ? t('projects.edit') : t('projects.delete')
  return (
    <div className="contact-overlay">
      <section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <div className="contact-dialog-head">
          <h2 id="project-dialog-title">{title}</h2>
          <IconButton label={t('a11y.close')} onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </div>
        {mode === 'delete' ? (
          <div className="contact-dialog-body">
            <p className="contact-confirm">{t('projects.deleteConfirm', { name: project.name })}</p>
            {error && <p className="contact-error" role="alert">{t('projects.deleteError')}</p>}
            <div className="contact-dialog-actions">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{t('projects.cancel')}</Button>
              <Button className="btn-danger" onClick={remove} disabled={busy}>{busy ? t('projects.deleting') : t('projects.delete')}</Button>
            </div>
          </div>
        ) : (
          <form className="contact-dialog-body" onSubmit={save} noValidate>
            <label className="contact-field">
              <span>{t('projects.name')} <span aria-hidden="true">*</span></span>
              <input autoFocus type="text" value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setValidation(null) }} aria-invalid={validation === 'nameRequired' || undefined} required />
            </label>
            <label className="contact-field">
              <span>{t('projects.client')}</span>
              <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}>
                <option value="">{t('projects.noClient')}</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <label className="contact-field">
              <span>{t('projects.address')}</span>
              <input type="text" autoComplete="street-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </label>
            <label className="contact-field">
              <span>{t('projects.stage')}</span>
              <select value={form.stage} onChange={(event) => { setForm({ ...form, stage: event.target.value }); setValidation(null) }}>
                {PROJECT_STAGES.map((stage) => <option key={stage} value={stage}>{t(`status.${STAGE_KEYS[stage]}`)}</option>)}
              </select>
            </label>
            {validation && <p className="contact-error" role="alert">{t(`projects.${validation}`)}</p>}
            {error && <p className="contact-error" role="alert">{t('projects.saveError')}</p>}
            <div className="contact-dialog-actions">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>{t('projects.cancel')}</Button>
              <Button type="submit" disabled={busy}>{busy ? t('projects.saving') : t('projects.save')}</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
