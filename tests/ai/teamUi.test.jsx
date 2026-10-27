// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {BetaAccessContext} from '../../src/components/auth/BetaAccessContext.jsx'
import Team from '../../src/pages/Team.jsx'
import SalesPanel from '../../src/components/projects/SalesPanel.jsx'
const state=vi.hoisted(()=>({lang:'en',members:[],calls:[],error:null}))
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.lang}})}))
vi.mock('../../src/services/team.js',()=>({teamRequest:vi.fn(async(action='',body)=>{state.calls.push({action,body});if(state.error)throw Error(state.error);if(!action)return {members:state.members};return {ok:true}})}))
vi.mock('../../src/services/sales.js',()=>({salesRequest:vi.fn(async action=>action==='context'?{role:'manager',members:[]}:[])}))
beforeEach(()=>{state.lang='en';state.members=[{id:'1',userId:'1',name:'Synthetic Seller',email:'synthetic@example.invalid',status:'ready',version:1,active:true}];state.calls=[];state.error=null})
afterEach(cleanup)
const open=(role='admin')=>render(<MemoryRouter><BetaAccessContext.Provider value={{role}}><Team/></BetaAccessContext.Provider></MemoryRouter>)
it('makes seller management discoverable and sends only the explicit seller creation fields',async()=>{
 open();await screen.findByText('Synthetic Seller');fireEvent.click(screen.getByRole('button',{name:'Add seller'}));fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'QA New Seller'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'qa-new@example.invalid'}});fireEvent.change(screen.getByLabelText('Initial password'),{target:{value:'Synthetic-password-12'}});fireEvent.click(screen.getByRole('button',{name:'Save seller'}));await waitFor(()=>expect(state.calls.some(c=>c.action==='create')).toBe(true));const input=state.calls.find(c=>c.action==='create').body;expect(Object.keys(input).sort()).toEqual(['email','id','name','password']);await waitFor(()=>expect(screen.queryByLabelText('Initial password')).toBeNull())
})
it('searches, filters and deactivates with a version, preserving documents and separate roles',async()=>{
 open();await screen.findByText('Synthetic Seller');fireEvent.change(screen.getByLabelText('Search sellers'),{target:{value:'no-result'}});expect(screen.getByText('No sellers match')).toBeTruthy();fireEvent.change(screen.getByLabelText('Search sellers'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Manage access'}));fireEvent.change(screen.getByLabelText('Access status'),{target:{value:'false'}});fireEvent.click(screen.getByRole('button',{name:'Save seller'}));await waitFor(()=>expect(state.calls.find(c=>c.action==='update')?.body).toEqual({userId:'1',name:'Synthetic Seller',active:false,version:1}))
})
it('provides Spanish text and a clear safe setup error without claiming remote activation',async()=>{
 state.lang='es';state.error='TEAM_SETUP_REQUIRED';open();expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('actualización revisada'));expect(screen.getByRole('heading',{name:'Equipo y vendedores'})).toBeTruthy()
})
it('does not call management API for seller, operator or worker views',()=>{
 for(const role of ['seller','worker','operator']){const v=open(role);expect(screen.getByText('Restricted access')).toBeTruthy();v.unmount()}expect(state.calls).toHaveLength(0)
})
it('keeps an inactive seller assignment visible without offering them for new assignments',async()=>{
 render(<SalesPanel project={{id:'lead-qa',assigned_to:'inactive-seller',assigned_name:'Inactive QA Seller',assignment_version:1}}/>)
 const option=await screen.findByRole('option',{name:/Current assignment, unavailable/});expect(option.disabled).toBe(true);expect(screen.getByRole('combobox').value).toBe('inactive-seller');expect(screen.getByText('Inactive QA Seller',{exact:true})).toBeTruthy()
})
it('preserves the same reservation and form after a partial setup failure, then clears credentials on retry success',async()=>{
 open();await screen.findByText('Synthetic Seller');fireEvent.click(screen.getByRole('button',{name:'Add seller'}));fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'Recovery QA'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'recovery-ui@example.invalid'}});fireEvent.change(screen.getByLabelText('Initial password'),{target:{value:'Synthetic-recovery-12'}})
 state.error='TEAM_PROVISION_PENDING';fireEvent.click(screen.getByRole('button',{name:'Save seller'}));await screen.findByRole('alert');const first=state.calls.find(c=>c.action==='create').body
 expect(screen.getByLabelText('Full name').value).toBe('Recovery QA');expect(screen.getByLabelText('Initial password').value).toBe('Synthetic-recovery-12')
 state.error=null;fireEvent.click(screen.getByRole('button',{name:'Save seller'}));await waitFor(()=>expect(screen.queryByLabelText('Initial password')).toBeNull())
 const attempts=state.calls.filter(c=>c.action==='create');expect(attempts).toHaveLength(2);expect(attempts[1].body).toEqual(first)
})
it('resumes a pending list row with its original reservation rather than creating a new key',async()=>{
 const id='40000000-0000-4000-8000-000000000001';state.members=[{id,userId:null,name:'Pending QA',email:'pending-ui@example.invalid',status:'pending',version:1,active:false}]
 open();await screen.findByText('Pending QA');fireEvent.click(screen.getByRole('button',{name:'Resume setup'}));fireEvent.change(screen.getByLabelText('Initial password'),{target:{value:'Synthetic-recovery-12'}});fireEvent.click(screen.getByRole('button',{name:'Save seller'}))
 await waitFor(()=>expect(state.calls.find(c=>c.action==='create')?.body.id).toBe(id))
})
