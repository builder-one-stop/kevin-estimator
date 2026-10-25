// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import PriceLocationEditor from '../../src/components/estimates/PriceLocationEditor.jsx'
import CostEvidencePanel from '../../src/components/estimates/CostEvidencePanel.jsx'
import {applyCatalogPrice} from '../../shared/catalogPricing.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
it.each(['en','es'])('keeps optional blank location and unconfigured suppliers without network refresh in %s',language=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const onChange=vi.fn(),document={sections:[]}
 render(<PriceLocationEditor document={document} language={language} onChange={onChange}/>);
 expect(screen.getByLabelText(language==='es'?'ZIP del trabajo':'Job ZIP').value).toBe('')
 fireEvent.click(screen.getByRole('button',{name:language==='es'?'Guardar ubicación de precios':'Save price location'}))
 expect(onChange.mock.calls[0][0].pricingContext).toMatchObject({jobZip:'',storeId:'',storeZip:''})
 expect(screen.getAllByText(language==='es'?/conexión no configurada/:/connection not configured/)).toHaveLength(2)
 expect(fetch).not.toHaveBeenCalled()
})
it.each(['en','es'])('explains stale prices with original date and separate pending material amounts in %s',language=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T06:00:00Z'))
 const stale=applyCatalogPrice({id:'stale',costType:'material',quantity:3},{...researchCatalog[0],validUntil:'2020-01-01'},'',language)
 const pending={id:'pending',description:'Panel',quantity:11,unit:'ea',unitCost:0,costType:'material',priceMissing:true,price:{unitCost:null}}
 render(<CostEvidencePanel record={{markup_bps:2500,document:{sections:[{id:'x',items:[stale,pending]}]}}} language={language}/>);
 expect(screen.getByRole('status').textContent).toContain(language==='es'?'Precio anterior vencido':'Stale previous price')
 expect(screen.getByRole('status').textContent).toContain('2026-10-17')
 expect(screen.getByText(language==='es'?'Pendiente':'Pending')).toBeTruthy()
 expect(screen.queryByText(/\$0\.00/)).toBeNull()
})
