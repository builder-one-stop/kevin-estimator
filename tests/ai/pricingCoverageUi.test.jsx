// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {localTradePlan,buildLocalTradeDocument} from '../../shared/localTradePlan.js'
import DrywallFinishEditor from '../../src/components/ai/DrywallFinishEditor.jsx'
import CostEvidencePanel from '../../src/components/estimates/CostEvidencePanel.jsx'
import TradeRuleEditor from '../../src/components/ai/TradeRuleEditor.jsx'
const doc=()=>buildLocalTradeDocument(localTradePlan({trade:'drywall',inputs:{lengthFt:40,widthFt:8}}),'en')
afterEach(cleanup)
it('requires explicit scope confirmation before adding joint finishing and prevents a duplicate section',()=>{
 const document=doc(),onChange=vi.fn(),id=document.sections[0].id
 const view=render(<DrywallFinishEditor document={document} sectionId={id} language="en" onChange={onChange}/>)
 expect(screen.getByRole('button',{name:'Add confirmed preliminary scope'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/I confirm this additional scope/}));fireEvent.click(screen.getByRole('button',{name:'Add confirmed preliminary scope'}))
 expect(onChange).toHaveBeenCalledOnce();const next=onChange.mock.calls[0][0];expect(next.sections).toHaveLength(2);expect(next.scope.localAmendments).toHaveLength(1)
 view.rerender(<DrywallFinishEditor document={next} sectionId={id} language="en" onChange={onChange}/>);expect(screen.queryByRole('button',{name:'Add confirmed preliminary scope'})).toBeNull()
})
it('explains invalid labor burden and keeps the valid editable document unchanged',()=>{
 const document=doc(),onChange=vi.fn(),before=structuredClone(document)
 render(<TradeRuleEditor document={document} sectionId={document.sections[0].id} language="en" onChange={onChange}/>)
 fireEvent.change(screen.getByLabelText('Rate basis'),{target:{value:'direct_cost'}})
 fireEvent.change(screen.getByLabelText('Burden (%) — blank pending'),{target:{value:'101'}})
 fireEvent.click(screen.getByRole('button',{name:'Recalculate trade'}));expect(screen.getByRole('alert').textContent).toContain('Burden must be between0 and100%');expect(onChange).not.toHaveBeenCalled();expect(document).toEqual(before)
})
it('renders pending costs and tax/shipping scope in Spanish without false local confidence',()=>{
 render(<CostEvidencePanel record={{markup_bps:2500,document:doc()}} language="es"/>);expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);expect(screen.getByText(/Impuestos, envíos y retirada no informados/)).toBeTruthy();expect(screen.queryByText('Fuente local documentada')).toBeNull()
})
