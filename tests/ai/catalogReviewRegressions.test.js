import {it,expect} from 'vitest'
import {previewCatalogImport} from '../../shared/catalogImport.js'
import {researchCatalog,effectiveCatalog} from '../../shared/researchCatalog.js'
import {catalogSchema} from '../../shared/aiSchemas.js'
import {matchesMaterialRole} from '../../shared/materialSelection.js'
import {makePaintItems,defaultPaintTemplate} from '../../shared/paintJob.js'
import {technicalCoverageFor} from '../../shared/technicalCoverage.js'
import {MaterialCatalogService} from '../../server/materialCatalog.js'
const seed=()=>catalogSchema.parse(Object.fromEntries(Object.keys(catalogSchema.shape).filter(k=>Object.hasOwn(researchCatalog[0],k)).map(k=>[k,researchCatalog[0][k]])))
const own=i=>({...seed(),id:`10000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,sourceId:undefined,sku:'OWN-'+i,product:'Own finish paint '+i})
it('rejects product identity replacement through a research source binding',()=>{
 const p=previewCatalogImport([{...seed(),product:'Dedicated Primer',sku:'PRIMER-1',unitCost:20}],{today:'2026-10-28'})
 expect(p.valid).toBe(false);expect(p.errors).toContainEqual({row:1,code:'RESEARCH_IDENTITY_CHANGED',field:'sourceId'})
})
it('quarantines previously stored changed identities without deleting price/history or inferring function',()=>{
 const old={...seed(),product:'Dedicated Primer',sku:'PRIMER-1',unitCost:20,priceHistory:[{version:1,unitCost:46.98}]},row=effectiveCatalog([old]).find(x=>x.id===old.id)
 expect(row.classificationPending).toBe(true);expect(row.category).toBeNull();expect(row.unitCost).toBe(20);expect(row.priceHistory).toEqual(old.priceHistory)
 for(const role of ['paint','primer'])expect(matchesMaterialRole(row,role)).toBe(false)
 expect(technicalCoverageFor(row)).toBeNull();expect(row.packageData).toBeNull()
 const item=makePaintItems('r',{lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},defaultPaintTemplate(),effectiveCatalog([old])).items.find(x=>x.ruleKey==='painting:material')
 expect(item.priceMissing).toBe(true)
})
it('rejects unknown sourceId rather than accepting a row that disappears',()=>{
 const p=previewCatalogImport([{...own(1),sourceId:'my-vendor-row-1'}],{today:'2026-10-28'})
 expect(p.valid).toBe(false);expect(p.errors).toContainEqual({row:1,code:'UNKNOWN_RESEARCH_SOURCE',field:'sourceId'})
})
it('preserves previously stored unknown source rows as pending unlinked account records',()=>{
 const row={...own(1),sourceId:'my-vendor-row-1'};expect(effectiveCatalog([row]).find(x=>x.id===row.id)).toMatchObject({unitCost:row.unitCost,classificationPending:true,sourceBindingIssue:'UNKNOWN_RESEARCH_SOURCE'})
})
it('pages a role-filtered account catalog beyond40 and searches later rows',()=>{
 const catalog=Array.from({length:65},(_,i)=>own(i+1)),s=new MaterialCatalogService({catalog}),all=[];let offset=0
 do{const p=s.search({role:'paint',limit:40,offset});expect(p.rows.length).toBeLessThanOrEqual(40);all.push(...p.rows);offset=p.nextOffset}while(offset!=null)
 expect(all.filter(r=>r.sku.startsWith('OWN-'))).toHaveLength(65);expect(new Set(all.map(x=>x.id)).size).toBe(all.length)
 expect(s.search({role:'paint',q:'OWN-65'}).rows.map(x=>x.sku)).toEqual(['OWN-65']);expect(new MaterialCatalogService().search({q:'OWN-65'}).total).toBe(0)
})
import {createEstimatorHandler} from '../../server/http.js'
import {defaultSettings} from '../../shared/aiSchemas.js'
it('rejects invalid research bindings through direct settings writes without persisting',async()=>{
 let writes=0;const repo={authenticate:async()=> 'B',access:async()=> 'admin',settings:async()=>({data:defaultSettings(),version:0}),saveSettings:async()=>{writes++;return {}}},api=createEstimatorHandler({repo,provider:{},logger:()=>{}})
 for(const entry of [{...seed(),product:'Dedicated Primer',sku:'PRIMER-1',unitCost:20},{...own(1),sourceId:'my-vendor-row-1'}]){
  const response=await api.handle(new Request('http://127.0.0.1/api/ai/settings',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({version:0,data:{...defaultSettings(),catalog:[entry]}})}))
  expect(response.status).toBe(400);expect((await response.json()).error).toMatch(/RESEARCH_IDENTITY_CHANGED|UNKNOWN_RESEARCH_SOURCE/)
 }
 expect(writes).toBe(0)
})
it('keeps later pages and filtered catalog results scoped to authenticated owner',async()=>{
 const repo={authenticate:async token=>token,access:async()=> 'admin',settings:async owner=>({data:{...defaultSettings(),catalog:Array.from({length:65},(_,i)=>({...own(i+1),sku:owner+'-OWN-'+(i+1)}))}})},api=createEstimatorHandler({repo,provider:{},logger:()=>{}})
 const get=async(owner,query)=>await(await api.handle(new Request('http://127.0.0.1/api/ai/pricing/catalog?'+query,{headers:{Authorization:'Bearer '+owner}}))).json()
 const page=await get('B','role=paint&offset=40&limit=40');expect(page.rows.some(x=>x.sku==='B-OWN-65')).toBe(true);expect(page.rows.some(x=>x.sku.startsWith('A-OWN-'))).toBe(false)
 expect((await get('A','role=paint&q=B-OWN-65')).total).toBe(0);expect((await get('B','role=paint&q=B-OWN-65')).total).toBe(1)
})

it('blocks old raw snapshots with inherited category during explicit recalculation',()=>{
 const old={...researchCatalog[0],product:'Dedicated Primer',sku:'PRIMER-1',unitCost:20}
 expect(matchesMaterialRole(old,'paint')).toBe(false);expect(matchesMaterialRole(old,'primer')).toBe(false)
 expect(technicalCoverageFor(old)).toBeNull()
 expect(makePaintItems('legacy',{lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},defaultPaintTemplate(),[old]).items.find(x=>x.ruleKey==='painting:material')).toMatchObject({quantityPending:true,priceMissing:true})
})
