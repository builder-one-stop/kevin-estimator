import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../supabaseClient.js'

export default function EstimateAuth({ children }) {
  const { t } = useTranslation()
  const [session, setSession] = useState(undefined)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    let authEventReceived = false
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return
      setSession(data.session)
      if (error) setMessage(t('estimateEditor.authError'))
    }).catch(() => { if (active && !authEventReceived) { setSession(null); setMessage(t('estimateEditor.authError')) } })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { authEventReceived = true; if (active) setSession(next) })
    return () => { active = false; subscription.unsubscribe() }
  }, [t])

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.href } })
      setMessage(error ? t('estimateEditor.authError') : t('estimateEditor.checkEmail'))
    } catch { setMessage(t('estimateEditor.authError')) }
    finally { setBusy(false) }
  }

  if (session === undefined) return <div className="page"><p role="status">{t('estimateEditor.loading')}</p></div>
  if (session) return <Fragment key={session.user.id}>{children}</Fragment>
  return <div className="page estimate-auth"><h1>{t('estimateEditor.signInTitle')}</h1><p>{t('estimateEditor.signInDetail')}</p>
    <form onSubmit={signIn}><label>{t('estimateEditor.email')}<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? t('estimateEditor.sending') : t('estimateEditor.sendLink')}</button></form>
    {message && <p role="status">{message}</p>}
  </div>
}
