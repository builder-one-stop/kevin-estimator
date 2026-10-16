import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, CalendarDays, ChevronUp, Clock3, ContactRound, FileText, Home, Search, Sparkles, WalletCards, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PROFILE } from '../../mocks/data.js'
import UserMenu from './UserMenu.jsx'
import { useBetaAccess } from '../auth/BetaAccessContext.jsx'

export function LogoMark({ size = 30 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 3 13.5V28a1 1 0 0 0 1 1h24a1 1 0 0 0 1-1V13.5z" fill="#F07A22" />
      <path d="M11 29v-8h10v8" fill="#1A1A1A" />
      <path d="M6 13.8 16 6l10 7.8" fill="none" stroke="#8DC63F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const navItems = [
  ['home', '/', Home], ['estimates', '/estimates', FileText],
  ['projects', '/projects', BriefcaseBusiness], ['workers', '/workers', Users],
  ['invoices', '/invoices', WalletCards], ['contacts', '/contacts', ContactRound],
  ['schedule', '/schedule', CalendarDays], ['time', '/time', Clock3],
]

export default function Sidebar({ onNavigate, onSoon }) {
  const { t } = useTranslation()
  const access = useBetaAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const searchRef = useRef(null)
  const companyRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const isHome = location.pathname === '/' || location.pathname.startsWith('/chat/')
  const go = (path) => { navigate(path); onNavigate() }

  return (
    <aside className="sidebar" aria-label={t('a11y.main')}>
      <div className="brand">
        <LogoMark />
        <div><div className="brand-name">One Stop</div><div className="brand-sub">{t('brandSub')}</div></div>
      </div>
      <button className="ask-btn" type="button" onClick={() => { navigate('/estimates'); onNavigate() }}><Sparkles size={20} />{t('ask')}</button>
      <label className="search"><Search size={18} /><input ref={searchRef} placeholder={t('search')} aria-label={t('search')} /><span className="kbd">⌘K</span></label>
      <nav className="nav">
        {navItems.map(([key, path, Icon]) => {
          const current = key === 'home' ? isHome : location.pathname === path || location.pathname.startsWith(`${path}/`)
          return (
            <Link key={key} to={path} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={current ? 'active' : ''}>
              <Icon />{t(`nav.${key}`)}
            </Link>
          )
        })}
      </nav>
      {access?.role === 'admin' && <Link className="admin-review-link" to="/admin/review" onClick={onNavigate}>{t('beta.review')}</Link>}
      <div className="side-bottom">
        <div className="onboard"><b>{t('onboardTitle')}</b><div className="bar"><i /></div><span className="muted onboard-copy">{t('onboardSteps')}</span></div>
        {menuOpen && <UserMenu triggerRef={companyRef} onClose={() => setMenuOpen(false)} onNavigate={() => go('/settings')} onSignIn={() => go('/estimates')} onSoon={onSoon} />}
        <button ref={companyRef} className="company" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          <span className="avatar">{PROFILE.companyInitials}</span><span className="name">{t('company')}</span><ChevronUp size={18} />
        </button>
      </div>
    </aside>
  )
}
