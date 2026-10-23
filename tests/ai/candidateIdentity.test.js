import {it,expect} from 'vitest'
import {salesEnvironment} from '../../shared/salesEnvironment.js'
import {isFinalizedRevision} from '../../shared/estimatePresentation.js'
import {publicReferenceLibrary} from '../../shared/publicReferenceLibrary.js'
import {constructionLibrary} from '../../shared/constructionLibrary.js'
import {libraryCounts,queryLibrary} from '../../shared/localPriceLibrary.js'
it('does not identify an actual development/production capability as a synthetic sales fixture',()=>{
 expect(salesEnvironment({DEV:true,VITE_SALES_ENABLED:'true'})).toEqual({enabled:true,synthetic:false})
 expect(salesEnvironment({DEV:true,VITE_LOCAL_SALES:'true'})).toEqual({enabled:true,synthetic:true})
 expect(salesEnvironment({DEV:false,VITE_SALES_ENABLED:'true',VITE_LOCAL_SALES:'true'})).toEqual({enabled:true,synthetic:false})
 expect(salesEnvironment({DEV:false,VITE_LOCAL_SALES:'true'})).toEqual({enabled:false,synthetic:false})
})
it('uses the same finalized revision rule for list and editor without equating commercial acceptance',()=>{
 const record={version:8,finalized_version:8,finalized_at:'2026-10-23T10:00:00Z',status:'Draft'}
 expect(isFinalizedRevision(record)).toBe(true)
 expect(isFinalizedRevision({...record,version:9})).toBe(false)
 expect(isFinalizedRevision({...record,finalized_at:null,status:'Accepted'})).toBe(false)
 expect(isFinalizedRevision(null)).toBe(false)
})
it('shows 58 public references without duplicating engine imports, owner data or LA verification',()=>{
 const library=publicReferenceLibrary(constructionLibrary)
 expect(libraryCounts(library)).toEqual({records:58,withPrice:49,withoutPrice:9,localVerified:0})
 expect(constructionLibrary.records).toHaveLength(33)
 expect(new Set(library.records.map(x=>x.id)).size).toBe(58)
 const paint=queryLibrary(library,{category:'paint',query:'BEHR',limit:100})
 expect(paint.rows.length).toBeGreaterThan(0);expect(paint.rows.every(x=>x.localVerified===false)).toBe(true)
 expect(library.records.every(x=>!x.ownerId&&!x.owner_id)).toBe(true)
})
