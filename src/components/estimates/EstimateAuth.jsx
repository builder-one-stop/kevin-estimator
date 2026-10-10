import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n/index.js'
import { supabase } from '../../supabaseClient.js'

export default function EstimateAuth({ children }) {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState(undefined)
  const [mode, setMode] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    let authEventReceived = false
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      setSession(data.session)
      if (sessionError) setError(t('estimateEditor.authError'))
    }).catch(() => { if (active && !authEventReceived) { setSession(null); setError(t('estimateEditor.authError')) } })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { authEventReceived = true; if (active) setSession(next) })
    return () => { active = false; subscription.unsubscribe() }
  }, [t])

  function choose(next) { setMode(next); setPassword(''); setConfirm(''); setMessage(''); setError('') }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage(''); setError('')
    try {
      let result
      const address = email.trim()
      if (mode === 'password') result = await supabase.auth.signInWithPassword({ email: address, password })
      else if (mode === 'signup') {
        if (password !== confirm) { setError(t('auth.passwordMismatch')); return }
        result = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: window.location.origin } })
        if (!result.error && !result.data?.session) setMessage(t('auth.checkSignup'))
      } else if (mode === 'reset') {
        result = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/account/password` })
        if (!result.error) setMessage(t('auth.checkReset'))
      } else {
        result = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: window.location.href, shouldCreateUser: false } })
        if (!result.error) setMessage(t('estimateEditor.checkEmail'))
      }
      if (result.error) setError(t(mode === 'password' ? 'auth.invalidCredentials' : 'estimateEditor.authError'))
    } catch { setError(t('estimateEditor.authError')) }
    finally { setBusy(false) }
  }

  if (session === undefined) return <div className="page"><p role="status">{t('estimateEditor.loading')}</p></div>
  if (session) return <Fragment key={session.user.id}>{children}</Fragment>
  return <div className="page estimate-auth">
    <div className="auth-language" role="group" aria-label={t('settings.lang')}>
      <button type="button" aria-pressed={i18n.language === 'en'} onClick={() => setLanguage('en')}>English</button>
      <button type="button" aria-pressed={i18n.language === 'es'} onClick={() => setLanguage('es')}>Español</button>
    </div>
    <h1>{t(mode === 'signup' ? 'auth.createAccount' : mode === 'reset' ? 'auth.resetTitle' : 'estimateEditor.signInTitle')}</h1>
    <p>{t(mode === 'reset' ? 'auth.resetDetail' : 'estimateEditor.signInDetail')}</p>
    <form onSubmit={submit}>
      <label>{t('estimateEditor.email')}<input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
      {(mode === 'password' || mode === 'signup') && <label>{t('auth.password')}<input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>}
      {mode === 'signup' && <label>{t('auth.confirmPassword')}<input type="password" required minLength={8} value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" /></label>}
      <button className="btn btn-primary" disabled={busy}>{busy ? t('auth.working') : t(mode === 'signup' ? 'auth.createAccount' : mode === 'reset' ? 'auth.sendReset' : mode === 'link' ? 'estimateEditor.sendLink' : 'auth.signIn')}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="auth-options">
      {mode !== 'password' && <button type="button" onClick={() => choose('password')}>{t('auth.usePassword')}</button>}
      {mode !== 'reset' && <button type="button" onClick={() => choose('reset')}>{t('auth.setOrReset')}</button>}
      {mode !== 'link' && <button type="button" onClick={() => choose('link')}>{t('auth.useLink')}</button>}
      {mode !== 'signup' && <button type="button" onClick={() => choose('signup')}>{t('auth.createAccount')}</button>}
    </div>
  </div>
}
