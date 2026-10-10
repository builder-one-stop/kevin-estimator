import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n/index.js'
import { supabase } from '../supabaseClient.js'

export default function PasswordSetup() {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState(undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let eventReceived = false
    supabase.auth.getSession().then(({ data }) => { if (active && !eventReceived) setSession(data.session) }).catch(() => { if (active && !eventReceived) setSession(null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { eventReceived = true; if (active) setSession(next) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) setError(t('auth.updateFailed'))
      else { setPassword(''); setConfirm(''); setMessage(t('auth.passwordSaved')) }
    } catch { setError(t('auth.updateFailed')) }
    finally { setBusy(false) }
  }

  return <div className="page estimate-auth">
    <div className="auth-language" role="group" aria-label={t('settings.lang')}>
      <button type="button" aria-pressed={i18n.language === 'en'} onClick={() => setLanguage('en')}>English</button>
      <button type="button" aria-pressed={i18n.language === 'es'} onClick={() => setLanguage('es')}>Español</button>
    </div>
    <h1>{t('auth.changePassword')}</h1>
    {session === undefined ? <p role="status">{t('estimateEditor.loading')}</p>
      : !session ? <p>{t('auth.openRecoveryLink')} <Link to="/">{t('auth.returnToSignIn')}</Link></p>
        : <><p>{t('auth.passwordDetail')}</p><form onSubmit={save}>
          <label>{t('auth.newPassword')}<input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label>{t('auth.confirmPassword')}<input type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? t('auth.working') : t('auth.savePassword')}</button>
        </form>{message && <p role="status">{message} <Link to="/">{t('auth.returnHome')}</Link></p>}{error && <p role="alert">{error}</p>}</>}
  </div>
}
