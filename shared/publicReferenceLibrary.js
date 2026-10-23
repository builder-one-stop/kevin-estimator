import {researchCatalog} from './researchCatalog.js'
// Read-only public view. It never merges a user's private managed catalog.
// Keep original evidence methods, dates, prices and packages; no upgrade to LA verification.
export function publicReferenceLibrary(construction){
 const paint=researchCatalog.map(row=>({...row,sourceCategory:row.category,category:['interior_paint','primer'].includes(row.category)?'paint':'accessory',
  country:'US',region:'CA',city:'Los Angeles',localVerified:false,autoEligible:true,purchaseLabel:row.package,priceSourceUrl:row.url,specSourceUrl:row.url}))
 const records=new Map([...paint,...construction.records].map(row=>[row.id,row]))
 return {schemaVersion:'public-reference-view-1',records:[...records.values()]}
}
