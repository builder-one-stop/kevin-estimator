// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import PlanMaterials from '../../src/components/ai/PlanMaterials.jsx'
vi.mock('../../src/services/ai.js',()=>({aiRequest:vi.fn()}))
import {aiRequest} from '../../src/services/ai.js'
import {prepareMaterialPlan} from '../../server/materialCatalog.js'
import {paintPlan} from './paintProvider.js'
import {defaultSettings,parseModelResult} from '../../shared/aiSchemas.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it.each(['en','es'])('shows exact recorded references and saves candidate store independently of job ZIP in %s',async language=>{
 const {plan}=await prepareMaterialPlan(paintPlan,defaultSettings()),onChange=vi.fn()
 aiRequest.mockResolvedValue({rows:researchCatalog})
 render(<PlanMaterials plan={plan} language={language} onChange={onChange}/>);
 const label=language==='es'?'Elegir referencia exacta (paint)':'Choose exact reference (paint)'
 await waitFor(()=>expect(screen.getByLabelText(label).options.length).toBeGreaterThan(1))
 expect(screen.getByLabelText(label).value).toBe(researchCatalog[0].id)
 const store=screen.getByLabelText(language==='es'?'Candidata opcional de compra':'Optional buying store candidate')
 expect(store.value).toBe('');fireEvent.change(store,{target:{value:'sw-704362'}})
 expect(onChange.mock.calls.at(-1)[0].pricingContext).toMatchObject({storeId:'704362',storeZip:'90260',jobZip:''})
 expect(aiRequest).toHaveBeenCalledWith('pricing/catalog?role=paint&limit=40&offset=0',undefined,'GET',false,{signal:expect.any(AbortSignal)})
})
it('does not accept model-authored price evidence or offer selections echoed from context',()=>{
 const result=parseModelResult({message:'Review',plan:{...paintPlan,materialRequests:[{taskId:'x',role:'paint',id:'fake'}],materialEvidence:[{unitCost:1,status:'verified'}],pricingContext:{jobZip:'99999'}},lines:[],changes:[]})
 expect(result.plan.materialEvidence).toBeUndefined();expect(result.plan.materialRequests).toBeUndefined();expect(result.plan.pricingContext).toBeUndefined()
})
