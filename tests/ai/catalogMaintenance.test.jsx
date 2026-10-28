// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {catalogMaintenance} from '../../shared/catalogMaintenance.js'
import CatalogMaintenance from '../../src/components/ai/CatalogMaintenance.jsx'
import {researchCatalog} from '../../shared/researchCatalog.js'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('keeps existing reference amounts unchanged while maintaining a focused paint/prep queue without network or mutations',()=>{
 const before=JSON.stringify(researchCatalog),now=catalogMaintenance([],'2026-10-28'),later=catalogMaintenance([],'2027-01-01')
 expect(now).toMatchObject({records:25,withAmount:20,withoutAmount:5,stale:0,externallyQueried:false})
 expect(later).toMatchObject({records:25,withAmount:20,withoutAmount:5,stale:20})
 expect(later.queue.every(r=>r.checkedAt==='2026-10-17')).toBe(true);expect(JSON.stringify(researchCatalog)).toBe(before)
})
it.each(['en','es'])('renders a nonblocking review queue without calling any supplier in %s',language=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 render(<CatalogMaintenance catalog={[]} language={language}/>);
 expect(screen.getByRole('status').textContent).toContain('25 / 20 / 5')
 expect(screen.getByText(language==='es'?/no bloquean presupuestar/:/do not block budgeting/)).toBeTruthy()
 expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole('button')).toBeNull()
})
