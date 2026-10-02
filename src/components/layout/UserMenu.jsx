import { useEffect, useRef, useState } from 'react'
import { BookOpen, HelpCircle, LogOut, Megaphone, Settings, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../supabaseClient.js'

export default function UserMenu({ onClose, onNavigate, onSignIn, onSoon, triggerRef }) {
  const { t } = useTranslation()
  const ref = useRef(null)
  const [user, setUser] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setUser(data.user) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(false)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) { setSignOutError(true); return }
      onClose()
    } catch { setSignOutError(true) }
    finally { setSigningOut(false) }
  }

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [onClose, triggerRef])

  const item = (Icon, key, action = onSoon) => (
    <button type="button" role="menuitem" onClick={action} disabled={key === 'signout' && signingOut}><Icon />{t(key === 'signout' && signingOut ? 'menu.signingOut' : `menu.${key}`)}</button>
  )

  return (
    <div className="menu" role="menu" ref={ref}>
      <div className="menu-head">
        <span className="avatar">{user?.email?.slice(0, 2).toUpperCase() || 'OS'}</span>
        <div><b>{user?.email || t('menu.signedOut')}</b>{user && <small>{t('menu.signedIn')}</small>}</div>
      </div>
      {item(Settings, 'settings', onNavigate)}
      {item(SlidersHorizontal, 'presets')}
      {item(BookOpen, 'catalogs')}
      <hr />
      {item(Megaphone, 'whatsnew')}
      {item(HelpCircle, 'help')}
      <hr />
      {signOutError && <p className="menu-error" role="alert">{t('menu.signOutError')}</p>}
      {user ? item(LogOut, 'signout', signOut) : item(LogOut, 'signin', onSignIn)}
    </div>
  )
}
