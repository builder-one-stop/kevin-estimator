// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach,beforeEach} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
const model=vi.hoisted(()=>({language:'en',followups:[],calls:[],failFirst:false,receipts:new Map()}))
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:model.language},t:(key,opt)=>opt?.defaultValue||key})}))
vi.mock('../../src/services/projects.js',()=>({getProjects:async()=>[{id:'lead',name:'QA lead'}]}))
const inv={id:'invoice',version:1,title:'QA internal invoice',source_version:2,source_snapshot:{title:'QA estimate'},lines:[{id:'a',description:'Known',unit:'ea',quantity:2,unitPrice:13.6},{id:'b',description:'Pending',unit:'ea',quantity:1,unitPrice:null}],tax_amount:null,tax_note:'',notes:'',status:'internal_draft',known_subtotal_cents:2720,total_cents:null,preliminary:true}
vi.mock('../../src/services/sales.js',()=>({localSalesEnabled:true,salesRequest:async(action,input)=>{
 model.calls.push({action,input})
 if(action==='ops:context')return {id:'manager',role:'manager',members:[{id:'manager',name:'Kevin QA'}]}
 if(action==='ops:followups')return model.followups
 if(action==='ops:followup-save'){
  if(!model.receipts.has(input.requestId)){model.receipts.set(input.requestId,input);model.followups=[{id:input.id,title:input.title,notes:input.notes,due_at:input.dueAt,version:1,status:input.status,responsible_id:'manager',responsible_name:'Kevin QA',project_id:'lead',project_name:'QA lead',author_name:'Kevin QA',created_at:'2026-10-22T10:00:00Z'}]}
  if(model.failFirst){model.failFirst=false;throw Error('uncertain network response')};return model.followups[0]
 }
 if(action==='ops:invoices')return []
 if(action==='ops:invoice-sources')return [{id:'estimate',title:'QA estimate',project_id:'lead',version:2}]
 if(action==='ops:invoice-create')return inv
 if(action==='ops:invoice-save')return {...inv,...input,tax_amount:input.taxAmount,version:2}
 return null
}}))
import Followups from '../../src/components/projects/Followups.jsx'
import InternalInvoices from '../../src/components/projects/InternalInvoices.jsx'
beforeEach(()=>{model.language='en';model.followups=[];model.calls=[];model.failFirst=false;model.receipts.clear()})
afterEach(cleanup)
it('retains exact request identity after uncertain save and displays the persisted follow-up',async()=>{
 model.failFirst=true;render(<Followups projectId="lead"/>);await screen.findByLabelText('Follow-up title')
 fireEvent.change(screen.getByLabelText('Follow-up title'),{target:{value:'QA call'}});fireEvent.change(screen.getByLabelText('Due in Los Angeles'),{target:{value:'2026-10-23T09:00'}})
 fireEvent.click(screen.getByRole('button',{name:'Save follow-up'}));await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button',{name:'Save follow-up'}));await screen.findByText('QA call',{selector:'b'})
 const calls=model.calls.filter(c=>c.action==='ops:followup-save');expect(calls).toHaveLength(2);expect(calls[0].input.requestId).toBe(calls[1].input.requestId);expect(calls[0].input.dueAt).toBe('2026-10-23T16:00:00.000Z');expect(model.followups).toHaveLength(1)
})
it('shows Spanish honest empty state and internal-only scope',async()=>{
 model.language='es';render(<Followups projectId="lead"/>);await screen.findByText('No hay seguimientos registrados.');expect(screen.getByText(/No se envían recordatorios externos/)).toBeTruthy();expect(screen.getByRole('button',{name:'Guardar seguimiento'})).toBeTruthy()
})
it('keeps missing invoice inputs pending, then saves explicit amounts without inferred taxes',async()=>{
 render(<MemoryRouter><InternalInvoices/></MemoryRouter>);await screen.findByRole('option',{name:'QA estimate · v2'})
 fireEvent.change(screen.getByLabelText('Source estimate'),{target:{value:'estimate'}});fireEvent.click(screen.getByRole('button',{name:'Create internal draft'}))
 await screen.findByLabelText('Document title');expect(screen.getByText(/PRELIMINARY · final total unknown/)).toBeTruthy()
 fireEvent.change(screen.getAllByLabelText('Unit price USD · blank = pending')[1],{target:{value:'5'}})
 fireEvent.change(screen.getByLabelText('Reviewed tax amount USD · blank = pending'),{target:{value:'0'}})
 expect(screen.getByText(/Internal total: \$32.20/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Save internal draft'}));await waitFor(()=>expect(model.calls.some(c=>c.action==='ops:invoice-save')).toBe(true))
 const input=model.calls.find(c=>c.action==='ops:invoice-save').input;expect(input.taxAmount).toBe(0);expect(input.lines[1].unitPrice).toBe(5)
 expect(screen.getByText(/Not legally issued/)).toBeTruthy()
})
