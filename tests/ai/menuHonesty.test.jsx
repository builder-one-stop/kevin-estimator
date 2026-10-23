// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
vi.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key,i18n:{language:'en'}})}))
vi.mock('../../src/services/sales.js',()=>({localSalesEnabled:false,salesRequest:vi.fn()}))
vi.mock('../../src/i18n/index.js',()=>({setLanguage:vi.fn()}))
vi.mock('../../src/pages/AiSettings.jsx',()=>({default:({embedded})=><section data-testid="shared-settings">{embedded?'single-commercial-source':'standalone'}</section>}))
vi.mock('../../src/services/estimates.js',()=>({listEstimates:async()=>[{id:'qa',title:'Pending estimate',status:'Draft',markup_bps:3600,updated_at:'2026-10-22T10:00:00Z',document:{sections:[{id:'s',items:[{id:'i',description:'Pending',quantity:1,unitCost:0,priceMissing:true}]}],proposal:{}}}],createEstimate:vi.fn(),deleteEstimate:vi.fn(),duplicateEstimate:vi.fn()}))
import Invoices from '../../src/pages/Invoices.jsx'
import Settings from '../../src/pages/Settings.jsx'
import Estimates from '../../src/pages/Estimates.jsx'
afterEach(cleanup)
it('removes mock invoices from the real-mode page and explains isolated availability',()=>{
 render(<MemoryRouter><Invoices/></MemoryRouter>);expect(screen.getByText(/No mock invoices/)).toBeTruthy();expect(document.body.textContent).not.toContain('4,678.09');expect(document.body.textContent).not.toContain('INV-10001')
})
it('uses one shared commercial configuration rather than placeholder save actions',()=>{
 render(<Settings/>);expect(screen.getAllByTestId('shared-settings')).toHaveLength(1);expect(screen.getByText('single-commercial-source')).toBeTruthy();expect(screen.getByText(/No calendar synchronization/)).toBeTruthy()
})
it('marks incomplete list amounts as known subtotal and does not label them total',async()=>{
 render(<MemoryRouter><Estimates/></MemoryRouter>);await screen.findByText('Pending estimate');expect(screen.getByText(/commercial.knownSubtotal/)).toBeTruthy();expect(screen.queryByText('estimateEditor.total')).toBeNull();expect(screen.getByText('commercial.amount')).toBeTruthy()
})
