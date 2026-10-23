import { useEffect, useState } from 'react'
import { Mail, MapPin, Pencil, Phone, Plus, Search, SortDesc, Trash2, Upload, UsersRound, X } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createClient, deleteClient, getClients, updateClient } from '../services/clients.js'
import { cleanContact, filterContacts, validateContact } from '../lib/contactForm.js'
import Button from '../components/ui/Button.jsx'
import Chip from '../components/ui/Chip.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import IconButton from '../components/ui/IconButton.jsx'

const emptyForm = { name: '', phone: '', email: '', address: '' }

function ContactDialog({ mode, contact, onClose, onSaved, onDeleted, showToast }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(contact ? {
    name: contact.name || '', phone: contact.phone || '',
    email: contact.email || '', address: contact.address || '',
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
    const data = cleanContact(form)
    const invalid = validateContact(data)
    setValidation(invalid)
    if (invalid) return

    setBusy(true)
    setError(false)
    try {
      const saved = mode === 'edit' ? await updateClient(contact.id, data) : await createClient(data)
      onSaved(saved, mode)
      showToast(t(mode === 'edit' ? 'contacts.updated' : 'contacts.created'))
    } catch (cause) {
      console.error('Failed to save client', cause)
      setError(true)
      showToast(t('contacts.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await deleteClient(contact.id)
      onDeleted(contact.id)
      showToast(t('contacts.deleted'))
    } catch (cause) {
      console.error('Failed to delete client', cause)
      setError(true)
      showToast(t('contacts.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'create' ? t('contacts.add') : mode === 'edit' ? t('contacts.edit') : t('contacts.delete')
  return (
    <div className="contact-overlay">
      <section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title">
        <div className="contact-dialog-head">
          <h2 id="contact-dialog-title">{title}</h2>
          <IconButton label={t('a11y.close')} onClick={onClose} disabled={busy}><X size={18} /></IconButton>
        </div>
        {mode === 'delete' ? (
          <div className="contact-dialog-body">
            <p className="contact-confirm">{t('contacts.deleteConfirm', { name: contact.name })}</p>
            {error && <p className="contact-error" role="alert">{t('contacts.deleteError')}</p>}
            <div className="contact-dialog-actions">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{t('contacts.cancel')}</Button>
              <Button className="btn-danger" onClick={remove} disabled={busy}>{busy ? t('contacts.deleting') : t('contacts.delete')}</Button>
            </div>
          </div>
        ) : (
          <form className="contact-dialog-body" onSubmit={save} noValidate>
            {['name', 'phone', 'email', 'address'].map((field) => (
              <label className="contact-field" key={field}>
                <span>{t(`contacts.${field}`)}{field === 'name' && <span aria-hidden="true"> *</span>}</span>
                <input
                  autoFocus={field === 'name'}
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  autoComplete={field === 'name' ? 'name' : field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'street-address'}
                  value={form[field]}
                  onChange={(event) => { setForm({ ...form, [field]: event.target.value }); setValidation(null) }}
                  aria-invalid={((field === 'name' && validation === 'nameRequired') || (field === 'email' && validation === 'emailInvalid')) || undefined}
                  required={field === 'name'}
                />
              </label>
            ))}
            {validation && <p className="contact-error" role="alert">{t(`contacts.${validation}`)}</p>}
            {error && <p className="contact-error" role="alert">{t('contacts.saveError')}</p>}
            <div className="contact-dialog-actions">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>{t('contacts.cancel')}</Button>
              <Button type="submit" disabled={busy}>{busy ? t('contacts.saving') : t('contacts.save')}</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export default function Contacts() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedClientId = searchParams.get('client')
  const { showToast } = useOutletContext()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [descending, setDescending] = useState(false)
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    let active = true
    getClients().then((data) => {
      if (active) { setContacts(data); setLoading(false); setLoadError(false) }
    }).catch((cause) => {
      console.error('Failed to load clients', cause)
      if (active) { setLoadError(true); setLoading(false) }
    })
    return () => { active = false }
  }, [retry])

  const visible = filterContacts(contacts, query).filter((contact) => !selectedClientId || contact.id === selectedClientId).sort((a, b) =>
    (descending ? -1 : 1) * a.name.localeCompare(b.name, i18n.language),
  )

  function clearSearch() { setQuery(''); setSearchParams({}) }

  function onSaved(saved, mode) {
    setContacts((current) => mode === 'edit'
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved])
    setDialog(null)
  }

  function onDeleted(id) {
    setContacts((current) => current.filter((item) => item.id !== id))
    setDialog(null)
  }

  return (
    <div className="page">
      <div className="page-head"><h1>{t('contacts.title')}</h1><div className="head-actions"><IconButton label={t('contacts.import')} disabled title={t('commercial.importPending')}><Upload size={18} /></IconButton><Button onClick={() => setDialog({ mode: 'create' })}><Plus size={18} />{t('contacts.add')}</Button></div></div>
      <div className="filters contact-filters">
        <Chip type="button" onClick={clearSearch}>{t('contacts.all')}<span className="count">{contacts.length}</span></Chip>
        <label className="contact-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('contacts.search')} aria-label={t('contacts.search')} /></label>
        <span className="spacer" />
        <Chip type="button" aria-label={t('contacts.sortName')} aria-pressed={descending} onClick={() => setDescending((value) => !value)}><SortDesc size={16} />{t('a11y.sortName')}</Chip>
      </div>
      {loading ? <p className="contact-message" role="status">{t('contacts.loading')}</p>
        : loadError ? <EmptyState icon={UsersRound} title={t('contacts.loadError')} description={t('contacts.loadErrorDetail')} cta={t('contacts.retry')} onAction={() => { setLoading(true); setRetry((value) => value + 1) }} />
          : visible.length === 0 ? <EmptyState icon={UsersRound} title={t(query || selectedClientId ? 'contacts.noResults' : 'contacts.empty')} description={t(query || selectedClientId ? 'contacts.noResultsDetail' : 'contacts.emptyDetail')} cta={t(query || selectedClientId ? 'contacts.clearSearch' : 'contacts.add')} onAction={() => query || selectedClientId ? clearSearch() : setDialog({ mode: 'create' })} />
            : <div className="rows">{visible.map((contact) => (
              <div className="row row-contacts" key={contact.id}>
                <div className="who"><span className="avatar">{contact.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase()}</span><b className="truncate">{contact.name}</b><span className="tag">{t('contacts.client')}</span></div>
                <span className="cell-ic"><Phone size={18} /><span>{contact.phone || '—'}</span></span>
                <span className="cell-ic"><Mail size={18} /><span>{contact.email || '—'}</span></span>
                <span className="cell-ic"><MapPin size={18} /><span>{contact.address || t('contacts.noAddress')}</span></span>
                <span className="contact-row-actions"><IconButton label={t('contacts.editContact', { name: contact.name })} onClick={() => setDialog({ mode: 'edit', contact })}><Pencil size={17} /></IconButton><IconButton label={t('contacts.deleteContact', { name: contact.name })} onClick={() => setDialog({ mode: 'delete', contact })}><Trash2 size={17} /></IconButton></span>
              </div>
            ))}</div>}
      {dialog && <ContactDialog key={`${dialog.mode}-${dialog.contact?.id || ''}`} {...dialog} onClose={() => setDialog(null)} onSaved={onSaved} onDeleted={onDeleted} showToast={showToast} />}
    </div>
  )
}
