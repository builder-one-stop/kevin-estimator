import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import Home from './pages/Home.jsx'
import Chat from './pages/Chat.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import ProjectOverview from './components/projects/ProjectOverview.jsx'
import ProjectEstimates from './components/projects/ProjectEstimates.jsx'
import ProjectInvoices from './components/projects/ProjectInvoices.jsx'
import Estimates from './pages/Estimates.jsx'
import Invoices from './pages/Invoices.jsx'
import Contacts from './pages/Contacts.jsx'
import Schedule from './pages/Schedule.jsx'
import TimeTracking from './pages/TimeTracking.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectWorkspace />}>
          <Route index element={<ProjectOverview />} />
          <Route path="estimates" element={<ProjectEstimates />} />
          <Route path="invoices" element={<ProjectInvoices />} />
        </Route>
        <Route path="/estimates" element={<Estimates />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/time" element={<TimeTracking />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
