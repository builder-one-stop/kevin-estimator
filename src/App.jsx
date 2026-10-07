import { Navigate, Route, Routes, useParams, Outlet, useOutletContext } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import Home from './pages/Home.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import ProjectOverview from './components/projects/ProjectOverview.jsx'
import ProjectEstimates from './components/projects/ProjectEstimates.jsx'
import ProjectInvoices from './components/projects/ProjectInvoices.jsx'
import Estimates from './pages/Estimates.jsx'
import EstimateWorkspace from './pages/EstimateWorkspace.jsx'
import EstimateAuth from './components/estimates/EstimateAuth.jsx'
import Invoices from './pages/Invoices.jsx'
import Contacts from './pages/Contacts.jsx'
import Schedule from './pages/Schedule.jsx'
import TimeTracking from './pages/TimeTracking.jsx'
import Settings from './pages/Settings.jsx'
import Chats from './pages/Chats.jsx'
import AiChat from './pages/AiChat.jsx'
import AiSettings from './pages/AiSettings.jsx'

function EstimateWorkspaceRoute() {
  const { id } = useParams()
  return <EstimateWorkspace key={id} />
}

function AiChatRoute() { const { id } = useParams(); return <AiChat key={id} /> }

function AuthenticatedRoutes() {
  const context = useOutletContext()
  return <EstimateAuth><Outlet context={context} /></EstimateAuth>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<AuthenticatedRoutes />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chats />} />
          <Route path="/chat/settings" element={<AiSettings />} />
          <Route path="/chat/:id" element={<AiChatRoute />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectWorkspace />}>
            <Route index element={<ProjectOverview />} />
            <Route path="estimates" element={<ProjectEstimates />} />
            <Route path="invoices" element={<ProjectInvoices />} />
          </Route>
          <Route path="/estimates" element={<Estimates />} />
          <Route path="/estimates/:id" element={<EstimateWorkspaceRoute />} />
          <Route path="/contacts" element={<Contacts />} />
        </Route>
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/time" element={<TimeTracking />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
