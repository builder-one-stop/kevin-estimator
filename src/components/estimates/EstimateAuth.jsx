import { useEffect, useState } from 'react'
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
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.href } })
    setMessage(error ? error.message : t('estimateEditor.checkEmail'))
    setBusy(false)
  }

  if (session === undefined) return <div className="page"><p role="status">{t('estimateEditor.loading')}</p></div>
  if (session) return children
  return <div className="page estimate-auth"><h1>{t('estimateEditor.signInTitle')}</h1><p>{t('estimateEditor.signInDetail')}</p>
    <form onSubmit={signIn}><label>{t('estimateEditor.email')}<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? t('estimateEditor.sending') : t('estimateEditor.sendLink')}</button></form>
    {message && <p role="status">{message}</p>}
  </div>
}
