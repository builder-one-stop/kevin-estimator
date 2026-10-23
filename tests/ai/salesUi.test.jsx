// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest'
import React from 'react'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {BetaAccessContext} from '../../src/components/auth/BetaAccessContext.jsx'
const state=vi.hoisted(()=>({language:'en',manager:true,notes:[],calls:[]}))
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.language},t:(key,options)=>options?.defaultValue||key})}))
vi.mock('../../src/services/sales.js',()=>({localSalesEnabled:true,salesRequest:async(action,data)=>{
 state.calls.push({action,data});if(action==='context')return {role:state.manager?'manager':'seller',members:[{id:'b',name:'Seller B QA'}]}
 if(action==='notes')return state.notes
 if(action==='note'){state.notes=[{id:data.id,author_name:'Seller A QA',created_at:'2026-10-22T08:00:00Z',body:data.body,kind:'note'}];return state.notes[0]}
 return {ok:true}
}}))
import SalesPanel from '../../src/components/projects/SalesPanel.jsx'
import Sidebar from '../../src/components/layout/Sidebar.jsx'
beforeEach(()=>{state.language='en';state.manager=true;state.notes=[];state.calls=[]})
afterEach(cleanup)
describe('Seller UI and bilingual follow-up',()=>{
 it('manager can select assignment; seller cannot see assignment controls',async()=>{
  const view=render(<SalesPanel project={{id:'lead',assigned_name:'Seller A QA',assigned_to:'a',assignment_version:1}}/>)
  fireEvent.change(await screen.findByRole('combobox'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Save assignment'}))
  await waitFor(()=>expect(state.calls.some(c=>c.action==='assign'&&c.data.sellerId==='b'&&c.data.version===1)).toBe(true))
  view.unmount();state.manager=false;render(<SalesPanel project={{id:'another',assigned_name:'Seller A QA',assigned_to:'a'}}/>)
  await screen.findByText('Lead follow-up');await waitFor(()=>expect(state.calls.filter(c=>c.action==='context')).toHaveLength(2))
  expect(screen.queryByRole('combobox')).toBeNull()
 })
 it('Spanish note saves author/date and remains visible after component reload',async()=>{
  state.language='es';state.manager=false
  const project={id:'lead',assigned_name:'Seller A QA'},view=render(<SalesPanel project={project}/>)
  fireEvent.change(screen.getByLabelText('Nota de seguimiento'),{target:{value:'Llamar para confirmar medidas.'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar nota'}))
  await screen.findByText('Llamar para confirmar medidas.');expect(screen.getByText('Seller A QA',{selector:'b'})).toBeTruthy();expect(document.querySelector('time').dateTime).toBe('2026-10-22T08:00:00Z')
  view.unmount();render(<SalesPanel project={project}/>);await screen.findByText('Llamar para confirmar medidas.')
  expect(state.calls.filter(c=>c.action==='note')).toHaveLength(1)
 })
 it('seller sidebar exposes pipeline and own estimates, no worker/financial/settings modules',()=>{
  render(<MemoryRouter><BetaAccessContext.Provider value={{role:'seller'}}><Sidebar onNavigate={()=>{}} onSoon={()=>{}}/></BetaAccessContext.Provider></MemoryRouter>)
  const paths=[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'));expect(paths).toContain('/projects');expect(paths).toContain('/estimates')
  for(const path of ['/workers','/contacts','/time','/invoices','/schedule','/settings','/admin/review'])expect(paths).not.toContain(path)
 })
})
