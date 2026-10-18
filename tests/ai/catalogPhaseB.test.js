import { describe, expect, it } from 'vitest'
import { researchCatalog, researchEvidence, effectiveCatalog, versionManagedCatalog } from '../../shared/researchCatalog.js'
import { applyCatalogPrice, catalogPriceSnapshot, exactPrice } from '../../shared/catalogPricing.js'
import { packageGallons, paintPackages, takeoffSummary } from '../../shared/materialTakeoff.js'
import { reviseManualPrice, calculateEstimate } from '../../src/lib/estimateDocument.js'
import { estimatePresentation } from '../../shared/estimatePresentation.js'
import { buildApprovedPdf } from '../../src/lib/approvedProposalPdf.js'
import { catalogSchema } from '../../shared/aiSchemas.js'
import { measureRooms } from '../../shared/estimatingMarket.js'
import { InternalCatalogProvider, resolvePrice } from '../../server/pricing.js'

describe('LA phase A catalog', () => {
  it('retains every research observation without inventing local prices', () => {
    expect(researchEvidence.suppliers).toHaveLength(6)
    expect(researchCatalog).toHaveLength(25)
    expect(researchCatalog.filter(row => row.status === 'public_observed')).toHaveLength(20)
    expect(researchCatalog.filter(row => row.unitCost === null)).toHaveLength(5)
    expect(researchCatalog.every(row => row.verifiedZip === null && row.sourceUrl && row.checkedAt === '2026-10-17')).toBe(true)
  })
  it('requires exact identity, package, unit and price zone; rejects missing and expired values', () => {
    const paint = researchCatalog.find(row => row.sourceId === 'HD01')
    const query = { product: paint.product, brand: paint.brand, package: paint.package, unit: paint.unit, verifiedZip: null }
    expect(exactPrice(researchCatalog, query)?.sourceId).toBe('HD01')
    for (const change of [{brand:'Other'}, {package:'1 US_gallon · flat'}, {unit:'qt'}, {verifiedZip:'90028'}])
      expect(exactPrice(researchCatalog, {...query,...change})).toBeNull()
    expect(exactPrice(researchCatalog, { ...query, product:'Missing' })).toBeNull()
    expect(exactPrice([{...paint,validUntil:'2020-01-01'}],query)).toBeNull()
    expect(researchCatalog.find(row => row.sourceId === 'SH01').unitCost).toBeNull()
  })
  it('separates observed, local verified and manual prices with immutable estimate snapshots', () => {
    const paint = researchCatalog.find(row => row.sourceId === 'HD01')
    const base = { id:'line-1',description:'Paint',quantity:2,unit:'gal',unitCost:80,costType:'material',markupBps:null,notes:'' }
    const selected = applyCatalogPrice(base, paint, '90028')
    expect(selected).toMatchObject({unitCost:46.98,priceDate:'2026-10-17',needsReview:true,price:{status:'public_observed',verifiedZip:null,sourceId:'HD01'}})
    const edited = reviseManualPrice(selected,{unitCost:49},'en')
    expect(edited).toMatchObject({catalogId:null,origin:'manual',needsReview:true,price:{status:'manual',previousSource:'phase-a-research'}})
    const withTakeoff={...selected,takeoff:{areaSqFt:352,coats:2,coverageSqFtPerGallon:350,wastePercent:0,packageGallons:1,requiredGallons:2.0115,packages:3}}
    expect(applyCatalogPrice(reviseManualPrice(withTakeoff,{unitCost:49}),paint).takeoff.packages).toBe(3)
    expect(applyCatalogPrice(reviseManualPrice(withTakeoff,{description:'Other product'}),paint).takeoff).toBeUndefined()
    const managed = { ...paint,unitCost:55 }
    expect(effectiveCatalog([managed]).find(row => row.sourceId === 'HD01').unitCost).toBe(55)
    expect(selected.unitCost).toBe(46.98)
    const [firstVersion] = versionManagedCatalog([], [catalogSchema.parse({
      id:paint.id,product:paint.product,brand:paint.brand,package:paint.package,unit:paint.unit,unitCost:paint.unitCost,currency:'USD',
      vendor:paint.vendor,location:paint.location,url:paint.url,sku:paint.sku,checkedAt:paint.checkedAt,status:paint.status,evidence:paint.evidence,
    })])
    const [secondVersion] = versionManagedCatalog([firstVersion], [{...firstVersion,unitCost:55,checkedAt:'2026-10-18',priceHistory:[]}])
    expect(secondVersion).toMatchObject({priceVersion:2,unitCost:55,priceHistory:[{version:1,unitCost:46.98,checkedAt:'2026-10-17'}]})
    expect(versionManagedCatalog([secondVersion],[secondVersion])[0].priceVersion).toBe(2)
    const verified = {...paint,status:'verified',verifiedZip:'90028',localPriceEvidence:'Receipt tied to product and branch'}
    expect(catalogPriceSnapshot(verified,'90028').status).toBe('verified')
    expect(catalogPriceSnapshot(verified,'90019').status).toBe('provisional')
    expect(() => catalogSchema.parse({...verified,localPriceEvidence:''})).toThrow()
  })
  it('calculates 12 × 10 × 8 ft wall paint packages from explicit coverage assumptions', () => {
    const [room] = measureRooms({ rooms: [{ id:'bedroom', length:{value:12,unit:'ft'}, width:{value:10,unit:'ft'},
      height:{value:8,unit:'ft'}, openings:{value:0,unit:'sf'}, useGrossWalls:true }] })
    const walls = room.wallSqFt
    expect(walls).toBe(352)
    expect(paintPackages({areaSqFt:walls,coats:2,coverageSqFtPerGallon:350,wastePercent:0,packageGallons:1}))
      .toEqual({requiredGallons:2.0115,packages:3})
    expect(takeoffSummary({areaSqFt:352,coats:2,coverageSqFtPerGallon:350,wastePercent:0,packageGallons:1,requiredGallons:2.0115,packages:3},'es')).toContain('2 manos')
    const valspar = researchCatalog.find(row => row.sourceId === 'LO01')
    expect(valspar.unit).toBe('ea')
    expect(packageGallons(valspar)).toBe(0.96875)
    expect(() => paintPackages({areaSqFt:352,coats:2,coverageSqFtPerGallon:0,packageGallons:1})).toThrow()
  })
  it('uses the same saved line quantity and USD totals for estimate, proposal and PDF', () => {
    const paint = researchCatalog.find(row => row.sourceId === 'HD01')
    const item = applyCatalogPrice({id:'paint',description:'Paint',quantity:3,unit:'gal',unitCost:0,costType:'material',markupBps:null,notes:''},paint)
    const record = {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Bedroom',version:1,status:'Draft',created_at:'2026-10-17',markup_bps:0,
      document:{language:'en',sections:[{id:'room',title:'Bedroom',items:[item]}],proposal:{intro:'',scope:'',notes:'',exclusions:'',terms:''},business:{name:'One Stop'}}}
    expect(calculateEstimate(record.document,0).priceCents).toBe(14094)
    const view = estimatePresentation(record)
    expect(view.sections[0].items[0]).toMatchObject({quantity:3,amount:14094,priceSource:item.priceSource})
    expect(buildApprovedPdf(record).output()).toContain('140.94')
  })
  it('provider resolves only exact product, package, unit and ZIP, with missing or expired prices rejected', async () => {
    const seed = researchCatalog.find(row => row.sourceId === 'HD01')
    const entry = catalogSchema.parse({id:seed.id,product:seed.product,brand:seed.brand,package:seed.package,unit:seed.unit,
      unitCost:46.98,currency:'USD',vendor:seed.vendor,location:seed.location,url:seed.url,sku:seed.sku,
      checkedAt:'2026-10-17',status:'public_observed',evidence:seed.evidence,verifiedZip:null})
    const query = {product:entry.product,brand:entry.brand,package:entry.package,unit:entry.unit,location:''}
    const prior = {unitCost:99}
    expect(await resolvePrice(new InternalCatalogProvider([entry]),query,prior)).toMatchObject({unitCost:46.98,status:'public_observed'})
    expect(await resolvePrice(new InternalCatalogProvider([entry]),{...query,package:'1 US qt'},prior)).toMatchObject({unitCost:99,reason:'NO_EQUIVALENT_PRODUCT'})
    expect(await resolvePrice(new InternalCatalogProvider([{...entry,unitCost:null,status:'quote_required'}]),query,prior)).toMatchObject({unitCost:99,reason:'PRICE_MISSING'})
    expect(await resolvePrice(new InternalCatalogProvider([{...entry,validUntil:'2020-01-01'}]),query,prior)).toMatchObject({unitCost:99,reason:'PRICE_EXPIRED'})
    expect(await resolvePrice(new InternalCatalogProvider([entry]),{...query,location:'90028'},prior)).toMatchObject({unitCost:99,reason:'NO_EQUIVALENT_PRODUCT'})
  })
})
