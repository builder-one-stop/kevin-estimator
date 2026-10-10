import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n/index.js'
import { supabase } from '../../supabaseClient.js'
import { BetaAccessContext } from '../auth/BetaAccessContext.jsx'
import { LogoMark } from '../layout/Sidebar.jsx'

export default function EstimateAuth({ children }) {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState(undefined)
  const [access, setAccess] = useState(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true, eventReceived = false
    supabase.auth.getSession().then(({ data, error: failure }) => {
      if (active && !eventReceived) { setSession(data.session); if (failure) setError('auth.accessFailed') }
    }).catch(() => { if (active && !eventReceived) { setSession(null); setError('auth.accessFailed') } })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      eventReceived = true
      if (active) { if (event !== 'TOKEN_REFRESHED') setAccess(undefined); setSession(next) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    if (!session) return () => { active = false }
    supabase.rpc('beta_session_access').then(async ({ data, error: failure }) => {
      if (!active) return
      if (failure) { setError('auth.accessFailed'); setAccess(null); return }
      if (!data?.role || data.userId !== session.user.id) {
        setError('auth.accessDenied'); setAccess(null)
        await supabase.auth.signOut({ scope: 'local' })
        return
      }
      setPassword(''); setError(''); setAccess(data)
    }).catch(() => { if (active) { setAccess(null); setError('auth.accessFailed') } })
    return () => { active = false }
  }, [session])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (failure) setError('auth.invalidCredentials')
    } catch { setError('auth.accessFailed') }
    finally { setPassword(''); setBusy(false) }
  }

  const loading = session === undefined || (session && access === undefined)
  if (session && access) return <BetaAccessContext.Provider value={access}><Fragment key={session.user.id}>{children}</Fragment></BetaAccessContext.Provider>
  return <main className="login-screen">
    <section className="login-card">
      <div className="brand"><LogoMark /><div><div className="brand-name">One Stop</div><div className="brand-sub">{t('brandSub')}</div></div></div>
      <div className="auth-language" role="group" aria-label={t('settings.lang')}>
        <button type="button" aria-pressed={i18n.language === 'en'} onClick={() => setLanguage('en')}>English</button>
        <button type="button" aria-pressed={i18n.language === 'es'} onClick={() => setLanguage('es')}>Español</button>
      </div>
      {loading ? <p role="status">{t('estimateEditor.loading')}</p> : <>
        <h1>{t('estimateEditor.signInTitle')}</h1>
        <form onSubmit={submit}>
          <label>{t('estimateEditor.email')}<input type="email" required placeholder={t('estimateEditor.email')} value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label>
          <label>{t('auth.password')}<input type="password" required placeholder={t('auth.password')} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? t('auth.working') : t('auth.signIn')}</button>
        </form>
        {error && <p role="alert">{t(error)}</p>}
        <p className="muted">{t('auth.contactAdmin')}</p>
      </>}
    </section>
  </main>
}
