// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import AiSettings from '../../src/pages/AiSettings.jsx'
import {defaultSettings} from '../../shared/aiSchemas.js'
import {researchCatalog,effectiveCatalog,researchBindingIssue,versionManagedCatalog} from '../../shared/researchCatalog.js'
const language=vi.hoisted(()=>({value:'en'}))
vi.mock('../../src/services/ai.js',()=>({aiRequest:vi.fn()}))
vi.mock('../../src/components/ai/strings.js',async original=>{const real=await original();return {...real,useAiText:()=>({language:language.value,a:key=>real.strings[language.value][key]||key})}})
import {aiRequest} from '../../src/services/ai.js'
afterEach(()=>{cleanup();vi.resetAllMocks()})
it.each(['en','es'])('imports the actual research button mapping from an empty catalog and saves/reloads all identities in %s',async lang=>{
 language.value=lang;const es=lang==='es';let stored={version:0,data:defaultSettings(),role:'admin'}
 aiRequest.mockImplementation(async(p,body)=>{if(p!=='settings')throw Error('Unexpected request');if(body)stored={version:stored.version+1,data:{...structuredClone(body.data),catalog:versionManagedCatalog(stored.data.catalog,body.data.catalog)},role:'admin'};return structuredClone(stored)})
 const mount=()=>render(<MemoryRouter><AiSettings/></MemoryRouter>);const view=mount()
 fireEvent.click(await screen.findByRole('button',{name:es?'Importar investigación para revisión':'Import research for review',exact:true}));const apply=screen.getByRole('button',{name:es?'Usar importación revisada':'Use reviewed import',exact:true})
 expect(apply.disabled).toBe(false);expect(screen.queryAllByRole('alert')).toHaveLength(0);expect(stored.data.catalog).toEqual([])
 fireEvent.click(apply);fireEvent.click(screen.getByRole('button',{name:es?'Guardar':'Save',exact:true}));await waitFor(()=>expect(stored.data.catalog).toHaveLength(25))
 expect(stored.data.catalog.every(x=>researchBindingIssue(x)===null)).toBe(true)
 for(const source of researchCatalog){const row=stored.data.catalog.find(x=>x.sourceId===source.sourceId);expect(row).toMatchObject({model:source.model});expect(row.variant).toBe(source.variant);expect(row.unitCost).toBe(source.unitCost);expect(row.checkedAt).toBe(source.checkedAt)}
 expect(stored.data.catalog.find(x=>x.sourceId==='HD01').model).toBe('275001');expect(effectiveCatalog(stored.data.catalog).some(x=>x.classificationPending)).toBe(false)
 view.unmount();mount();await screen.findByRole('button',{name:es?'Importar investigación para revisión':'Import research for review',exact:true});expect(stored.data.catalog).toHaveLength(25)
 fireEvent.click(screen.getByRole('button',{name:es?'Importar investigación para revisión':'Import research for review',exact:true}));fireEvent.click(screen.getByRole('button',{name:es?'Usar importación revisada':'Use reviewed import',exact:true}));fireEvent.click(screen.getByRole('button',{name:es?'Guardar':'Save',exact:true}));await waitFor(()=>expect(stored.version).toBe(2));expect(stored.data.catalog).toHaveLength(25);expect(stored.data.catalog.every(x=>x.priceVersion===1)).toBe(true)
})
