import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import WorkerNotifications from '../workers/WorkerNotifications.jsx'
import MobileBar from './MobileBar.jsx'
import Sidebar from './Sidebar.jsx'
import Toast from '../ui/Toast.jsx'
import { useBetaAccess } from '../auth/BetaAccessContext.jsx'

export default function AppShell() {
  const { t } = useTranslation()
  const access = useBetaAccess()
  const pathname = useLocation().pathname
  const reviewing = pathname.startsWith('/admin/review')
  const chatting = /^\/chat\/[0-9a-f-]{36}$/i.test(pathname)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }, [])
  const showSoon = useCallback(() => showToast(t('toastSoon')), [showToast, t])

  return (
    <div className={`app ${drawerOpen ? 'open' : ''}`}>
      {drawerOpen && <button type="button" className="drawer-scrim" aria-label={t('a11y.close')} onClick={() => setDrawerOpen(false)} />}
      <Sidebar onNavigate={() => setDrawerOpen(false)} onSoon={showSoon} />
      <div className="main-wrap">
        <MobileBar label={t('a11y.menu')} onOpen={() => setDrawerOpen(true)} />
        {!reviewing && <div className="workspace-label"><span>{t(access?.role === 'admin' ? 'beta.ownDevelopment' : 'beta.ownWorkspace')}</span><WorkerNotifications/></div>}
        <main className={`main ${chatting ? 'chat-main' : ''}`}><Outlet context={{ showSoon, showToast }} /></main>
      </div>
      <Toast message={toast} />
    </div>
  )
}
