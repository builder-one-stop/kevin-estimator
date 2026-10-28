// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import PaintRuleEditor from '../../src/components/ai/PaintRuleEditor.jsx'
import {defaultPaintTemplate} from '../../shared/paintJob.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
afterEach(cleanup)
const rule=()=>({version:'interior-walls-1',areaSqFt:352,inputs:{lengthFt:12,widthFt:10,heightFt:8,openingsSqFt:0,useGrossWalls:true},template:defaultPaintTemplate(),catalogSnapshots:researchCatalog})
it.each(['en','es'])('prepares exact technical coverage without repricing or invoking recalculation until explicit action in %s',language=>{
 const onRecalculate=vi.fn(),es=language==='es'
 render(<PaintRuleEditor rule={rule()} catalog={researchCatalog} language={language} onRecalculate={onRecalculate}/>)
 fireEvent.click(screen.getByRole('button',{name:es?'Usar extremo inferior de ficha (paint)':'Use sheet lower bound (paint)',exact:true}))
 expect(onRecalculate).not.toHaveBeenCalled()
 expect(screen.getByLabelText(es?'Rendimiento (sf/gal)':'Coverage (sf/gal)').value).toBe('250')
 fireEvent.click(screen.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}))
 expect(onRecalculate).toHaveBeenCalledTimes(1)
 expect(onRecalculate.mock.calls[0][0]).toMatchObject({coverageSqFtPerGallon:250,coats:2,wastePercent:10,technicalProfile:{identity:{model:'275001'},range:[250,400],consultedAt:'2026-10-28',manufacturerGuarantee:false}})
})
it.each(['en','es'])('requires explicit primer area and coats and exposes a separate explicit quantity reset in %s',language=>{
 const onRecalculate=vi.fn(),es=language==='es',saved=rule(),primer=researchCatalog.find(x=>x.sourceId==='HD02')
 saved.template.materialSelections=[{selectionId:'primer-one',role:'primer',catalogId:primer.id,purchaseQuantity:1}]
 render(<PaintRuleEditor rule={saved} catalog={researchCatalog} language={language} onRecalculate={onRecalculate}/>)
 fireEvent.click(screen.getByRole('button',{name:es?'Usar extremo inferior de ficha (primer)':'Use sheet lower bound (primer)',exact:true}))
 expect(screen.getByLabelText(es?'Manos de imprimante':'Primer coats').value).toBe('')
 expect(screen.getByLabelText(es?'Superficie de imprimación':'Primer area scope').value).toBe('')
 expect(onRecalculate).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText(es?'Manos de imprimante':'Primer coats'),{target:{value:'1'}})
 fireEvent.change(screen.getByLabelText(es?'Superficie de imprimación':'Primer area scope'),{target:{value:'room-walls'}})
 fireEvent.click(screen.getByRole('checkbox',{name:(es?'Restablecer cantidad calculada ':'Reset calculated quantity ')+'supplement:primer-one:material',exact:true}))
 fireEvent.click(screen.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}))
 expect(onRecalculate.mock.calls[0][0].materialSelections[0]).toMatchObject({coverageSqFtPerGallon:300,coats:1,wastePercent:10,coverageAreaMode:'room-walls',quantityMode:'documented-coverage',technicalProfile:{manufacturerNumber:'2000'},purchaseQuantity:null})
 expect(onRecalculate.mock.calls[0][2]).toEqual({resetQuantityKeys:['supplement:primer-one:material']})
})
