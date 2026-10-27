import { Navigate, Route, Routes, useParams, useLocation, Outlet } from 'react-router-dom'
import {sellerPathAllowed} from '../shared/salesPolicy.js'
import AppShell from './components/layout/AppShell.jsx'
import Workers from './pages/Workers.jsx'
import Team from './pages/Team.jsx'
import WorkerPortal from './pages/WorkerPortal.jsx'
import ProjectWorkers from './components/projects/ProjectWorkers.jsx'
import { useBetaAccess } from './components/auth/BetaAccessContext.jsx'
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
import AdminReview from './pages/AdminReview.jsx'

function EstimateWorkspaceRoute() {
  const { id } = useParams()
  return <EstimateWorkspace key={id} />
}

function AiChatRoute() { const { id } = useParams(); return <AiChat key={id} /> }
function AdminReviewRoute() { const { id } = useParams(); return <AdminReview key={id || 'history'} /> }

function AuthenticatedRoutes() {
  return <EstimateAuth><RoleRoutes /></EstimateAuth>
}

function RoleRoutes() {
  const access = useBetaAccess()
  const location=useLocation()
  if(access?.role==='seller'&&!sellerPathAllowed(location.pathname))return <Navigate to="/projects" replace />
  return access?.role === 'worker' ? <WorkerPortal /> : <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthenticatedRoutes />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chats />} />
          <Route path="/chat/settings" element={<Navigate to="/settings" replace />} />
          <Route path="/chat/:id" element={<AiChatRoute />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/team" element={<Team />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectWorkspace />}>
            <Route index element={<ProjectOverview />} />
            <Route path="estimates" element={<ProjectEstimates />} />
            <Route path="invoices" element={<ProjectInvoices />} />
            <Route path="progress" element={<ProjectWorkers section="progress" />} />
            <Route path="hours" element={<ProjectWorkers section="hours" />} />
          </Route>
          <Route path="/estimates" element={<Estimates />} />
          <Route path="/estimates/:id" element={<EstimateWorkspaceRoute />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/admin/review" element={<AdminReviewRoute />} />
          <Route path="/admin/review/:id" element={<AdminReviewRoute />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/time" element={<TimeTracking />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
