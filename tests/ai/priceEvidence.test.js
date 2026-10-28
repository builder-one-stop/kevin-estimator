import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assessPrice, collectPriceReferences, applyPriceReference } from '../../shared/priceEvidence.js'
import { researchCatalog } from '../../shared/researchCatalog.js'
import { paintParameterEvidence } from '../../shared/paintEvidence.js'
import { defaultPaintTemplate } from '../../shared/paintJob.js'
import { LocalReviewProvider, reviewDimensions } from '../../scripts/local-review-provider.mjs'
import { parseModelResult } from '../../shared/aiSchemas.js'
import { localDatabase, LocalRepository, A, B } from './localRepository.js'
import { createEstimatorServer } from '../../server/http.js'

const today = '2026-10-21'
const paint = { ...researchCatalog[0], checkedAt: '2026-10-17', validUntil: '2026-11-01' }
describe('price evidence and owner reference reuse', () => {
  it('requires exact US product/branch/ZIP evidence and explicit validity for verified status, never commercial acceptance', () => {
    const local = { ...paint, status: 'verified', verifiedZip: '90017', country:'US', region:'CA', city:'Los Angeles', location: 'Wilshire Union, Los Angeles, CA, US', localPriceEvidence: 'Exact SKU and dated branch quote' }
    expect(assessPrice(local, '90017', today).status).toBe('verified')
    for (const patch of [{ validUntil: null }, { localPriceEvidence: '' }, { checkedAt: '2026-11-01' }, { validUntil: '2026-10-18' }]) expect(assessPrice({ ...local, ...patch }, '90017', today).status).toBe('provisional')
    expect(assessPrice(local, '90019', today).status).toBe('provisional')
    expect(assessPrice({...local,country:'CL'},'90017',today)).toMatchObject({status:'provisional',reason:'MARKET_MISMATCH'})
    expect(assessPrice({...local,country:undefined},'90017',today)).toMatchObject({status:'provisional',reason:'MARKET_UNCONFIRMED'})
    expect(assessPrice({ ...paint, status: 'public_observed', location: 'Los Angeles, CA, US' }, '90017', today).status).toBe('public_observed')
    expect(assessPrice({ ...paint, checkedAt: '2026-01-01', validUntil: null }, '', today)).toMatchObject({status:'provisional',reason:'SOURCE_REVIEW_DUE'})
  })
  it('returns only own reference snapshots and keeps price reuse separate from automatic verification or learning', () => {
    const item = { id: 'paint', description: paint.product, unit: paint.unit, costType: 'material', quantity: 3, unitCost: paint.unitCost, price: paint }
    const records = [A, B].map(owner => ({ id: randomUUID(), owner_id: owner, version: 4, updated_at: '2026-10-21', status: 'Accepted', document: { market:{country:'US',region:'California',city:'Los Angeles'},sections: [{ items: [item] }] } }))
    records.push({...records[0],id:randomUUID(),document:{...records[0].document,market:{country:'CL',region:'BI',city:'Los Angeles'}}})
    const refs = collectPriceReferences(records, A, today)
    expect(refs).toHaveLength(1)
    expect(refs[0].price.status).toBe('public_observed')
    const reused = applyPriceReference({ ...item, quantity: 8, unitCost: 99 }, refs[0], '90017', today)
    expect(reused).toMatchObject({ quantity: 8, unitCost: paint.unitCost, price: { status: 'public_observed', reusedFrom: { estimateVersion: 4 } } })
    expect(item.quantity).toBe(3)
    expect(() => applyPriceReference({ ...item, unit: 'qt' }, refs[0], '', today)).toThrow('REFERENCE_PRODUCT_MISMATCH')
    expect(applyPriceReference(item, { ...refs[0], price: { ...paint, validUntil:'2020-01-01' } }, '', today).price).toMatchObject({freshness:'stale',unitCost:paint.unitCost})
  })
  it('does not attach a different BEHR product technical sheet or present wage/coverage assumptions as measurements', () => {
    const template = defaultPaintTemplate()
    expect(paintParameterEvidence(template, researchCatalog).coverage.status).toBe('provisional')
    const same = [{ ...paint, id: template.paintCatalogId, product: 'BEHR PREMIUM PLUS Interior Eggshell', model: '205001' }]
    expect(paintParameterEvidence(template, same).coverage).toMatchObject({ status: 'provisional' }) // A family/model regex is not an exact accepted technical snapshot.
    expect(paintParameterEvidence(template, same).labor.status).toBe('provisional')
  })
  it('enforces authenticated owner isolation in the actual reference HTTP endpoint', async () => {
    const db = await localDatabase(), repo = new LocalRepository(db)
    let server
    try {
      const item = { id:'line', description:'Paint', unit:'gal', quantity:1, costType:'material', unitCost:55, price:paint }
      for (const owner of [A,B]) await repo.query('insert into estimates(owner_id,title,document) values($1,$2,$3)', [owner, owner === A ? 'Own' : 'Other', JSON.stringify({sections:[{id:'room',items:[item]}]})])
      ;({server} = createEstimatorServer({repo, provider:new LocalReviewProvider(), testMode:true, logger:()=>{}}))
      await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
      const url = `http://127.0.0.1:${server.address().port}/api/ai/pricing/references`
      expect((await fetch(url)).status).toBe(401)
      const response = await fetch(url,{headers:{Authorization:'Bearer fixture-a'}})
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.references).toHaveLength(1)
      expect(body).toMatchObject({scope:'current-owner-only',learning:false,externallyQueried:false})
      const row = await repo.estimate(A,body.references[0].source.estimateId)
      expect(row.owner_id).toBe(A)
    } finally { if(server)await new Promise(resolve=>server.close(resolve));await db.close() }
  },30000)
})

describe('explicit local review simulator', () => {
  it('uses supplied dimensions, preserves metric originals and asks no more than two questions for missing dimensions', async () => {
    expect(reviewDimensions([{role:'user',content:'Walls 15 x 11 x 9 ft'}]).feet).toEqual([15,11,9])
    const metric = reviewDimensions([{role:'user',content:'3.6576 x 3.048 x 2.4384 m'}])
    expect(metric.feet).toEqual([12,10,8])
    const provider = new LocalReviewProvider()
    const input={mode:'plan',messages:[{role:'user',content:'Pintar paredes'}],context:{documentLanguage:'es'}}
    const missing = parseModelResult((await provider.run(input)).result)
    expect(missing.plan.pending).toHaveLength(2)
    const complete = parseModelResult((await provider.run({...input,messages:[{role:'user',content:'15 x 11 x 9 ft'}]})).result)
    expect(complete.plan.pending).toHaveLength(0)
    expect(complete.plan.tasks[0].measurements.en).toContain('15 x 11 x 9 ft')
  })
})
