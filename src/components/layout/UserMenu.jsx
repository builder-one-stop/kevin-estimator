import { useEffect, useRef } from 'react'
import { BookOpen, HelpCircle, LogOut, Megaphone, Settings, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PROFILE } from '../../mocks/data.js'

export default function UserMenu({ onClose, onNavigate, onSoon, triggerRef }) {
  const { t } = useTranslation()
  const ref = useRef(null)

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
    <button type="button" role="menuitem" onClick={action}><Icon />{t(`menu.${key}`)}</button>
  )

  return (
    <div className="menu" role="menu" ref={ref}>
      <div className="menu-head">
        <span className="avatar">{PROFILE.userInitials}</span>
        <div><b>{PROFILE.name}</b><small>{PROFILE.email}</small></div>
      </div>
      {item(Settings, 'settings', onNavigate)}
      {item(SlidersHorizontal, 'presets')}
      {item(BookOpen, 'catalogs')}
      <hr />
      {item(Megaphone, 'whatsnew')}
      {item(HelpCircle, 'help')}
      <hr />
      {item(LogOut, 'signout')}
    </div>
  )
}
