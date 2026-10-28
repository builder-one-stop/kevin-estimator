import {it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {MaterialCatalogService,prepareMaterialPlan} from '../../server/materialCatalog.js'
import {normalizeAuthorizedQuotes} from '../../server/authorizedQuoteImport.js'
import {defaultSettings} from '../../shared/aiSchemas.js'
import {paintPlan,PaintProvider} from './paintProvider.js'
import {paintDimensions,makePaintItems,defaultPaintTemplate} from '../../shared/paintJob.js'
import {candidateStores} from '../../shared/southBaySuppliers.js'
import {localDatabase,LocalRepository,A,B} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {reviseManualPrice} from '../../src/lib/estimateDocument.js'
import {recalculatePaintDocument} from '../../shared/paintJob.js'
import {createEstimatorServer} from '../../server/http.js'
const quote=(changes={})=>({quoteId:'synthetic-owner-quote',product:'Synthetic interior paint',brand:'Synthetic brand',sku:'SYN-5G',model:'P5',variant:'white eggshell',package:'5 US gal',unit:'ea',unitCost:100,currency:'USD',vendor:'Synthetic supplier',checkedAt:'2026-10-28',validUntil:null,url:'https://example.invalid/authorized-quote',offer:{supplierId:'synthetic',storeId:'S1',storeZip:'90505',jobZip:'',fulfillment:'pickup',accountContext:'synthetic-owner'},taxUsd:null,freightUsd:null,stockQuantity:null,...changes})
it('normalizes authorized quote rows deterministically without turning unknown fees or stock into zero or claiming verification',()=>{
 expect(()=>normalizeAuthorizedQuotes([quote()])).toThrow('QUOTE_IMPORT_AUTHORIZATION_REQUIRED')
 const [a]=normalizeAuthorizedQuotes([quote()],{authorized:true}),[again]=normalizeAuthorizedQuotes([quote()],{authorized:true})
 expect(a.id).toBe(again.id);expect(a).toMatchObject({unit:'ea',status:'provisional',verifiedZip:null,procurement:{taxUsd:null,freightUsd:null,stockQuantity:null},evidenceKind:'authorized-quote'})
 expect(()=>normalizeAuthorizedQuotes([{...quote(),api_key:'forbidden'}],{authorized:true})).toThrow()
 expect(()=>normalizeAuthorizedQuotes([quote(),quote()],{authorized:true})).toThrow('DUPLICATE_QUOTE_OFFER')
})
it('searches exact SKU/variant/package/provider/store and keeps text suggestions separate from an exact match',async()=>{
 const [a]=normalizeAuthorizedQuotes([quote()],{authorized:true}),[b]=normalizeAuthorizedQuotes([quote({offer:{...quote().offer,storeId:'S2'},unitCost:120})],{authorized:true})
 const service=new MaterialCatalogService({catalog:[a,b]})
 expect(service.search({sku:'SYN-5G'}).total).toBe(2)
 expect(service.search({sku:'SYN-5G',vendor:a.vendor,storeId:'S1',package:'5 US gal',variant:'white eggshell'}).rows.map(r=>r.id)).toEqual([a.id])
 expect(service.search({sku:'SYN-5'}).rows).toEqual([])
 expect(service.search({q:'Synthetic interior'}).matchType).toBe('suggestions')
 expect((await service.resolve(a)).status).toBe('provisional')
 const pending=await prepareMaterialPlan(paintPlan,{...defaultSettings(),catalog:[a,b]},[{role:'user',content:'Paint walls SKU SYN-5G'}])
 expect(pending.plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({id:null,unitCost:null,reason:'AMBIGUOUS_OFFER'})
})
it('keeps unknown SKU pending, preserves exact known package when price is absent and never substitutes a default',async()=>{
 const p=await prepareMaterialPlan(paintPlan,defaultSettings(),[{role:'user',content:'Paint walls SKU DOES-NOT-EXIST'}])
 expect(p.plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({id:null,unitCost:null,reason:'NO_EXACT_PRODUCT'})
 const [missing]=normalizeAuthorizedQuotes([quote({unitCost:null})],{authorized:true})
 const items=makePaintItems('paint',{lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},{...defaultPaintTemplate(),paintCatalogId:missing.id,repairCatalogId:null},[missing]).items
 expect(items.find(r=>r.ruleKey==='painting:material')).toMatchObject({quantity:1,unit:'ea',priceMissing:true,price:{unitCost:null}})
 const none=makePaintItems('paint',{lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},{...defaultPaintTemplate(),paintCatalogId:null},[]).items.find(r=>r.ruleKey==='painting:material')
 expect(none.quantityPending).toBe(true);expect(none.takeoff.packages).toBeNull()
})
it('converts exact ft/in/m and mixed dimensions to the same wall geometry without changing the original measurements',()=>{
 for(const text of ['12 x 10 x 8 ft','144 x 120 x 96 in','12 ft x 120 in x 2.4384 m'])expect(paintDimensions({measurements:{en:text}})).toEqual({lengthFt:12,widthFt:10,heightFt:8,openingsSqFt:0,useGrossWalls:true})
 expect(candidateStores.every(s=>!s.selected&&s.connection==='not-configured'&&s.price===null&&s.stock===null)).toBe(true)
})
it('keeps stale and owner-overridden public observations distinct without upgrading them to verified sources',async()=>{
 const service=new MaterialCatalogService(),base=service.rows.find(r=>r.sku==='433052')
 const prepared=await prepareMaterialPlan(paintPlan,{...defaultSettings(),catalog:[{...base,unitCost:55,validUntil:'2020-01-01'}]},[{role:'user',content:'Paint SKU 433052'}])
 expect(prepared.plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({unitCost:55,status:'provisional',freshness:'stale'})
 expect(prepared.snapshots.find(r=>r.id===base.id).source).toBe('owner-catalog')
})
it('serves authenticated exact catalog queries with current-owner isolation and optional unselected store candidates',async()=>{
 const db=await localDatabase();let server
 try{
  const repo=new LocalRepository(db),[a]=normalizeAuthorizedQuotes([quote()],{authorized:true}),[b]=normalizeAuthorizedQuotes([quote({sku:'SYN-PRIVATE-B',quoteId:'other-owner'})],{authorized:true})
  await repo.saveSettings(A,{...defaultSettings(),catalog:[a]},0);await repo.saveSettings(B,{...defaultSettings(),catalog:[b]},0)
  ;({server}=createEstimatorServer({repo,provider:new PaintProvider(),testMode:true,logger:()=>{}}));await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const url=`http://127.0.0.1:${server.address().port}/api/ai/pricing/catalog`
  expect((await fetch(url)).status).toBe(401)
  const own=await (await fetch(url+'?sku=SYN-5G&storeId=S1',{headers:{Authorization:'Bearer fixture-a'}})).json()
  expect(own).toMatchObject({total:1,matchType:'exact',externallyQueried:false,scope:'public-and-current-owner-only'})
  expect(own.candidateStores.every(s=>!s.selected&&s.price===null&&s.stock===null)).toBe(true)
  const other=await (await fetch(url+'?sku=SYN-PRIVATE-B',{headers:{Authorization:'Bearer fixture-a'}})).json();expect(other.rows).toEqual([])
 }finally{if(server)await new Promise(r=>server.close(r));await db.close()}
},30000)
it.each(['en','es'])('connects controlled chat to approved exact material snapshots, saved editable estimates and PDF in %s',async language=>{
 const db=await localDatabase()
 try{
  const repo=new LocalRepository(db),[imported]=normalizeAuthorizedQuotes([quote()],{authorized:true}),settings={...defaultSettings(),catalog:[imported]}
  await repo.saveSettings(A,settings,0)
  const engine=new EstimatorEngine(repo,new PaintProvider(),{logger:()=>{}})
  let row=await engine.create(A,{id:randomUUID(),title:'Synthetic pricing QA',language})
  const command=async(action,extra={})=>{row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action,...extra});for(let i=0;i<400&&row.state.run?.status==='working';i++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)};expect(row.state.run?.status).not.toBe('error')}
  await command('message',{content:'Paint interior walls 12 x 10 x 8 ft SKU SYN-5G'})
  expect(row.state.plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({id:imported.id,unitCost:100})
  // Catalog changes after plan review cannot reprice the approved snapshot.
  await repo.saveSettings(A,{...settings,catalog:[{...imported,unitCost:999}]},1)
  await command('approve',{revision:row.state.planRevision});await command('generate')
  const saved=await repo.estimate(A,row.estimate_id),material=saved.document.sections[0].items.find(r=>r.ruleKey==='painting:material')
  expect(material).toMatchObject({quantity:1,unit:'ea',unitCost:100,price:{evidenceKind:'authorized-quote',procurement:{taxUsd:null}}})
  expect(saved.document.materialPricing).toMatchObject({externallyQueried:false,tax:null,freight:null,stock:null})
  const edited=structuredClone(saved.document);const index=edited.sections[0].items.findIndex(r=>r.id===material.id);edited.sections[0].items[index]=reviseManualPrice(material,{unitCost:87},language)
  const recalculated=recalculatePaintDocument(edited,edited.sections[0].id,{wastePercent:20},{lengthFt:13})
  expect(recalculated.sections[0].items[index]).toMatchObject({unitCost:87,price:{status:'manual',previousSnapshot:{unitCost:100}}})
  await expect(repo.estimate(B,saved.id)).rejects.toMatchObject({status:403})
  const pdf=buildApprovedPdf({...saved,document:recalculated}).output()
  expect(pdf).toContain('SYN-5G');expect(pdf).toContain(language==='es'?'sin consulta en vivo':'no live lookup')
 }finally{await db.close()}
},30000)
