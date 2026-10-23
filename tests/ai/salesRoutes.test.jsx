// @vitest-environment jsdom
import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
const actor=vi.hoisted(()=>({role:'seller'}))
vi.mock('../../src/supabaseClient.js',()=>({supabase:{}}))
vi.mock('../../src/components/estimates/EstimateAuth.jsx',async()=>{
 const {BetaAccessContext}=await import('../../src/components/auth/BetaAccessContext.jsx')
 return {default:({children})=><BetaAccessContext.Provider value={{role:actor.role}}>{children}</BetaAccessContext.Provider>}
})
vi.mock('../../src/components/layout/AppShell.jsx',async()=>{const {Outlet,useLocation}=await import('react-router-dom');return {default:function TestAppShell(){const location=useLocation();return <><p data-testid="route">{location.pathname}</p><Outlet/></>}}})
vi.mock('../../src/pages/Projects.jsx',()=>({default:()=> <p>Assigned pipeline</p>}))
vi.mock('../../src/pages/Workers.jsx',()=>({default:()=> <p>Admin worker management</p>}))
vi.mock('../../src/pages/WorkerPortal.jsx',()=>({default:()=> <p>Worker portal</p>}))
vi.mock('../../src/pages/Estimates.jsx',()=>({default:()=> <p>Own estimates</p>}))
import App from '../../src/App.jsx'
afterEach(cleanup)
describe('Actual application role routing',()=>{
 it('redirects direct forbidden seller URLs before mounting their modules',async()=>{
  actor.role='seller'
  for(const path of ['/workers','/time','/invoices','/contacts','/settings','/chat/settings','/admin/review','/projects/30000000-0000-4000-8000-000000000001/hours']){
   const view=render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);expect((await screen.findByTestId('route')).textContent).toBe('/projects');expect(screen.getByText('Assigned pipeline')).toBeTruthy();view.unmount()
  }
 })
 it('retains worker portal isolation and administrator routes',()=>{
  actor.role='worker';let view=render(<MemoryRouter initialEntries={['/estimates']}><App/></MemoryRouter>);expect(screen.getByText('Worker portal')).toBeTruthy();view.unmount()
  actor.role='admin';view=render(<MemoryRouter initialEntries={['/workers']}><App/></MemoryRouter>);expect(screen.getByText('Admin worker management')).toBeTruthy();view.unmount()
  actor.role='seller';render(<MemoryRouter initialEntries={['/estimates']}><App/></MemoryRouter>);expect(screen.getByText('Own estimates')).toBeTruthy()
 })
})
