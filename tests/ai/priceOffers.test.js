import {it,expect,vi,afterEach} from 'vitest'
import {offerContextSchema,sameOffer} from '../../shared/priceOffers.js'
import {catalogSchema} from '../../shared/aiSchemas.js'
import {constructionLibrary,initialConstructionLibrary,tradeDefaultProducts} from '../../shared/constructionLibrary.js'
import {researchCatalog,exactCatalogMatch} from '../../shared/researchCatalog.js'
import {priceRefresh20261025} from '../../shared/research/priceRefresh20261025.js'
import {importLibrary,libraryCounts} from '../../shared/localPriceLibrary.js'
import {calculateTrade,tradeDefaults,recalculateTradeDocument} from '../../shared/tradeRules.js'
import {makePaintItems,defaultPaintTemplate,recalculatePaintDocument} from '../../shared/paintJob.js'
import {reviseManualPrice} from '../../src/lib/estimateDocument.js'
import {resolvePrice,InternalCatalogProvider} from '../../server/pricing.js'
import {collectPriceReferences} from '../../shared/priceEvidence.js'
const today=()=>vi.setSystemTime(new Date('2026-10-25T06:00:00Z'))
const entry=()=>catalogSchema.parse({...Object.fromEntries(['id','product','brand','package','unit','unitCost','currency','vendor','location','url','sku','checkedAt','status','evidence','model'].map(k=>[k,researchCatalog[0][k]])),offer:{supplierId:'hd',storeId:'synthetic-A',storeZip:'90028',jobZip:'',fulfillment:'pickup'}})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})
it('keeps physical packages calculable with expired paint and trade prices; missing amount stays pending',()=>{
 vi.useFakeTimers();today()
 const product={...constructionLibrary.records.find(r=>r.id===tradeDefaultProducts.lvp),validUntil:'2020-01-01'}
 const result=calculateTrade('lvp',{lengthFt:20,widthFt:20},tradeDefaults.lvp,product)
 expect(result.packages).toBe(22);expect(result.items[0].price).toMatchObject({freshness:'stale',checkedAt:'2026-10-21',unitCost:65.99});expect(result.totalCents).toBeNull()
 const paint={...researchCatalog[0],validUntil:'2020-01-01'},inputs={lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true}
 const items=makePaintItems('room',inputs,defaultPaintTemplate(),[paint,...researchCatalog.slice(1)]).items
 expect(items.find(r=>r.ruleKey==='painting:material')).toMatchObject({quantity:3,unitCost:paint.unitCost,price:{freshness:'stale'}})
 const missing=calculateTrade('lvp',{lengthFt:20,widthFt:20},tradeDefaults.lvp,{...product,unitCost:null})
 expect(missing.items[0]).toMatchObject({quantity:22,priceMissing:true,price:{unitCost:null}});expect(missing.materialSubtotalCents).toBeNull()
})
it('matches exact SKU/model/variant/pack and offer supplier/store/ZIP/fulfillment/account separately',()=>{
 const a=entry();expect(exactCatalogMatch(a,structuredClone(a))).toBe(true)
 for(const patch of [{sku:'other'},{model:'other'},{variant:'other'},{package:'5 gal'},{vendor:'Ace Hardware'},...['supplierId','storeId','storeZip','jobZip','fulfillment','accountContext'].map(k=>({offer:{...a.offer,[k]:k.includes('Zip')?'90019':k==='fulfillment'?'delivery':'other'}}))])expect(sameOffer(a,{...a,...patch})).toBe(false)
 expect(offerContextSchema.parse({}).jobZip).toBe('');expect(offerContextSchema.safeParse({jobZip:'invalid'}).success).toBe(false)
 expect(exactCatalogMatch({},{})).toBe(false)
})
it('does not cross providers or shops in the resolver or reuse a different offer as a fallback',async()=>{
 vi.useFakeTimers();today();const a=entry(),b={...a,offer:{...a.offer,storeId:'synthetic-B'},unitCost:99}
 const provider=new InternalCatalogProvider([a,b]);expect((await resolvePrice(provider,a)).unitCost).toBe(a.unitCost)
 expect((await resolvePrice(provider,b)).unitCost).toBe(99)
 const unmatched={...a,offer:{...a.offer,storeId:'synthetic-C'}}
 expect(await resolvePrice(provider,unmatched,a)).toMatchObject({unitCost:null,freshness:'unavailable',reason:'NO_EQUIVALENT_PRODUCT'})
})
it('times out even an uncooperative provider, preserving price/date and manual overrides without a call',async()=>{
 vi.useFakeTimers();today();const prior={...entry(),checkedAt:'2026-10-17'},lookup=vi.fn(()=>new Promise(()=>{})),provider={lookup}
 const pending=resolvePrice(provider,prior,prior,{timeoutMs:20});await vi.advanceTimersByTimeAsync(21)
 expect(await pending).toMatchObject({unitCost:prior.unitCost,checkedAt:prior.checkedAt,freshness:'stale',reason:'PROVIDER_TIMEOUT'})
 const manual={...prior,status:'manual',source:'manual-entry',unitCost:84}
 expect(await resolvePrice(provider,prior,manual)).toMatchObject({unitCost:84,status:'manual'});expect(lookup).toHaveBeenCalledOnce()
})
it('isolates bounded cache by offer and location, expires and falls back to dated evidence on failure',async()=>{
 vi.useFakeTimers();today();const a=entry(),lookup=vi.fn(async()=>({prices:[a]})),provider={lookup},cache=new Map();let clock=0
 const options={cache,now:()=>clock,cacheTtlMs:10}
 expect(await resolvePrice(provider,a,{},options)).toMatchObject({freshness:'fresh',cacheHit:false})
 const hit=await resolvePrice(provider,a,{},options);hit.unitCost=999
 expect((await resolvePrice(provider,a,{},options)).unitCost).toBe(a.unitCost);expect(lookup).toHaveBeenCalledOnce()
 clock=11;lookup.mockRejectedValue(Error('offline'))
 expect(await resolvePrice(provider,a,{},options)).toMatchObject({unitCost:a.unitCost,checkedAt:a.checkedAt,freshness:'stale',reason:'PROVIDER_UNAVAILABLE'})
 expect(await resolvePrice(provider,{...a,offer:{...a.offer,jobZip:'90019'}},{},options)).toMatchObject({unitCost:null,freshness:'unavailable'})
})
it('keeps absent API/ZIP preliminary, supports explicit cancellation and rejects duplicate offer IDs atomically',async()=>{
 vi.useFakeTimers();today();const a=entry(),unknown={...a,offer:{}}
 expect(await resolvePrice({lookup:async()=>({prices:[]})},unknown)).toMatchObject({unitCost:null,freshness:'unavailable',reason:'NO_EQUIVALENT_PRODUCT'})
 const controller=new AbortController();controller.abort(new Error('cancelled'))
 await expect(resolvePrice({lookup:async()=>new Promise(()=>{})},a,a,{signal:controller.signal})).rejects.toThrow('cancelled')
 const row=structuredClone(initialConstructionLibrary.records[0]);for(const key of ['version','batchId','importedAt','history'])delete row[key]
 expect(()=>importLibrary(initialConstructionLibrary,[{...row,offer:{storeId:'other'}}],{batchId:'synthetic-conflict'})).toThrow('LIBRARY_OFFER_ID_CONFLICT')
 expect(initialConstructionLibrary.records).toHaveLength(33)
})
it('assesses reused snapshots against optional current job ZIP rather than an older plan ZIP',()=>{
 const price={...researchCatalog[0],status:'verified',country:'US',region:'CA',city:'Los Angeles',verifiedZip:'90028',validUntil:'2026-11-01',localPriceEvidence:'Synthetic exact branch quote'}
 const record={id:'source',owner_id:'owner',version:1,document:{pricingContext:{jobZip:''},scope:{plan:{zip:'90028'}},sections:[{items:[{id:'p',unit:price.unit,unitCost:price.unitCost,costType:'material',price}]}]}}
 expect(collectPriceReferences([record],'owner','2026-10-25')[0].price.verification).toMatchObject({status:'provisional',reason:'JOB_LOCATION_UNCONFIRMED'})
})
it('keeps recalc overrides and their historical evidence in paint and trades',()=>{
 vi.useFakeTimers();today()
 const p=constructionLibrary.records.find(r=>r.id===tradeDefaultProducts.lvp),parameters=tradeDefaults.lvp,inputs={lengthFt:20,widthFt:20}
 const items=calculateTrade('lvp',inputs,parameters,p).items;items[0]=reviseManualPrice(items[0],{unitCost:71})
 const doc={language:'en',sections:[{id:'x',items}],rules:{trades:{x:{trade:'lvp',inputs,parameters,product:p}}}}
 expect(recalculateTradeDocument(doc,'x',{lengthFt:21},{}).sections[0].items[0]).toMatchObject({unitCost:71,priceMissing:false,price:{previousSnapshot:{unitCost:65.99}}})
 const paintInputs={lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true},template=defaultPaintTemplate(),paint=makePaintItems('x',paintInputs,template,researchCatalog).items
 const i=paint.findIndex(x=>x.ruleKey==='painting:material');paint[i]=reviseManualPrice(paint[i],{unitCost:80})
 const painted={language:'en',sections:[{id:'x',items:paint}],rules:{paint:{x:{inputs:paintInputs,template,catalogSnapshots:researchCatalog}}}}
 expect(recalculatePaintDocument(painted,'x',{},{}).sections[0].items.find(x=>x.ruleKey==='painting:material')).toMatchObject({unitCost:80,priceMissing:false,price:{previousSnapshot:{unitCost:researchCatalog[0].unitCost}}})
})
it('refreshes one existing Ace offer, adds one distinct offer and preserves null Home Depot prices/history idempotently',()=>{
 expect(libraryCounts(constructionLibrary)).toEqual({records:34,withPrice:30,withoutPrice:4,localVerified:0})
 expect(researchCatalog.length+constructionLibrary.records.length).toBe(59)
 const refreshed=constructionLibrary.records.find(r=>r.id==='ace-12922');expect(refreshed.version).toBe(2);expect(refreshed.history[0]).toMatchObject({unitCost:26.99,checkedAt:'2026-10-22'})
 expect(constructionLibrary.records.find(r=>r.id==='ace-1010800')).toMatchObject({unitCost:16.99,coverage:null,autoEligible:false})
 for(const id of ['hd-100321605','hd-100321610','hd-202530243','hd-311654611'])expect(constructionLibrary.records.find(r=>r.id===id).unitCost).toBeNull()
 const repeat=importLibrary(constructionLibrary,priceRefresh20261025(initialConstructionLibrary.records),{batchId:'repeat'})
 expect(repeat.report).toMatchObject({inserted:0,updated:0,unchanged:7});expect(constructionLibrary.records.find(r=>r.id==='ace-50190').purchaseBasis).toBe('pack_pending')
})
