// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {previewCatalogImport} from '../../shared/catalogImport.js'
import CatalogImportPreview from '../../src/components/ai/CatalogImportPreview.jsx'
import {researchCatalog,versionManagedCatalog} from '../../shared/researchCatalog.js'
import {catalogSchema} from '../../shared/aiSchemas.js'
const seed=()=>catalogSchema.parse(Object.fromEntries(Object.keys(catalogSchema.shape).filter(k=>Object.hasOwn(researchCatalog[0],k)).map(k=>[k,researchCatalog[0][k]])))
afterEach(cleanup)
it('previews merge/replace without mutating previous records and reuses an exact offer ID for repeated files',()=>{
 const old={...seed(),id:crypto.randomUUID(),sourceId:undefined},before=structuredClone(old),input={...old,id:undefined,product:'Renamed same SKU',unitCost:55}
 const preview=previewCatalogImport([input],{previous:[old],today:'2026-10-28'})
 expect(preview.valid).toBe(true);expect(preview.catalog[0]).toMatchObject({id:old.id,unitCost:55});expect(preview.counts.updated).toBe(1);expect(old).toEqual(before)
 expect(previewCatalogImport([input],{previous:preview.catalog,today:'2026-10-28'}).counts.unchanged).toBe(1)
 expect(previewCatalogImport([],{previous:[old],mode:'replace'}).counts.removed).toBe(1)
 const [versioned]=versionManagedCatalog([old],preview.catalog);expect(versioned.priceHistory[0].unitCost).toBe(46.98)
})
it('rejects duplicate IDs, same-SKU renamed offers, source collisions and unknown private fields atomically',()=>{
 const a=seed(),b={...a,id:crypto.randomUUID(),product:'Alias of same SKU'}
 for(const input of [[a,a],[a,b],[{...a,api_key:'not accepted'}]]){
  const p=previewCatalogImport(input,{today:'2026-10-28'});expect(p.valid).toBe(false);expect(p.catalog).toBeNull()
 }
 expect(previewCatalogImport([{...b,offer:{storeId:'other'}}],{previous:[a],today:'2026-10-28'}).errors.some(i=>i.code==='DUPLICATE_SOURCE')).toBe(true)
})
it('checks purchased-package units and observed dates while preserving null and historical reference prices',()=>{
 const a=seed()
 for(const changed of [{package:'5 US gal',unit:'gal'},{unit:'hr'},{package:''},{checkedAt:'2099-01-01'}])expect(previewCatalogImport([{...a,...changed}],{today:'2026-10-28'}).valid).toBe(false)
 const pending=previewCatalogImport([{...a,id:crypto.randomUUID(),sourceId:undefined,package:'5 US gal',unit:'ea',unitCost:null,status:'quote_required'}],{today:'2026-10-28'})
 expect(pending.valid).toBe(true);expect(pending.catalog[0].unitCost).toBeNull()
 const stale=previewCatalogImport([{...a,checkedAt:'2026-01-01',validUntil:'2026-02-01'}],{today:'2026-10-28'})
 expect(stale.valid).toBe(true);expect(stale.warnings.some(i=>i.code==='STALE_REFERENCE')).toBe(true);expect(stale.catalog[0].checkedAt).toBe('2026-01-01')
})
it.each(['en','es'])('shows preview, explicit removals and blocks invalid apply without persistence in %s',language=>{
 const onApply=vi.fn(),onCancel=vi.fn(),a=seed(),label=language==='es'?'Usar importación revisada':'Use reviewed import'
 const view=render(<CatalogImportPreview incoming={[{...a,unit:'hr'}]} previous={[a]} language={language} onApply={onApply} onCancel={onCancel}/>);
 expect(screen.getByRole('button',{name:label}).disabled).toBe(true);expect(onApply).not.toHaveBeenCalled()
 view.rerender(<CatalogImportPreview incoming={[]} previous={[a]} language={language} onApply={onApply} onCancel={onCancel}/>);
 fireEvent.change(screen.getByLabelText(language==='es'?'Modo de importación':'Import mode'),{target:{value:'replace'}})
 expect(screen.getByRole('status').textContent).toContain('0 / 0 / 0 / 1')
 fireEvent.click(screen.getByRole('button',{name:label}));expect(onApply).toHaveBeenCalledWith([])
})
