import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { paintPlan, PaintProvider } from './paintProvider.js'
import { localDatabase, LocalRepository, A } from './localRepository.js'
import { EstimatorEngine } from '../../server/engine.js'
import { researchCatalog } from '../../shared/researchCatalog.js'
import { defaultPaintTemplate, makePaintItems, paintDimensions, paintMarkupBps, recalculatePaintDocument } from '../../shared/paintJob.js'
import { calculateEstimate, reviseManualPrice } from '../../src/lib/estimateDocument.js'
import { estimatePresentation } from '../../shared/estimatePresentation.js'
import { buildApprovedPdf } from '../../src/lib/approvedProposalPdf.js'
import Decimal from 'decimal.js'
import { packageGallons } from '../../shared/materialTakeoff.js'

const byKey = (document, key) => document.sections[0].items.find(x => x.ruleKey === key)
describe('interior wall paint rule engine', () => {
  it('keeps the explicitly approved markup when it differs from the template margin', async () => {
    const db=await localDatabase()
    try {
      class ApprovedMarkupProvider extends PaintProvider {
        async run(input) { const output=await super.run(input); if(output.result.plan)output.result.plan.markupBps=2500; return output }
      }
      const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new ApprovedMarkupProvider(),{logger:()=>{}})
      let row=await engine.create(A,{id:randomUUID(),title:'Approved markup QA',language:'en'})
      const command=async(action,extra={})=>{row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action,...extra});for(let n=0;n<200&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)}return row}
      await command('message',{content:'Paint bedroom walls 12 x 10 x 8 ft.'})
      expect(row.state.plan.markupBps).toBe(2500)
      await command('approve',{revision:row.state.planRevision})
      await command('generate')
      expect(row.state.run.status).toBe('ready')
      const saved=await repo.estimate(A,row.estimate_id)
      expect(saved.markup_bps).toBe(2500)
      expect(saved.document.scope.plan.markupBps).toBe(2500)
      expect(saved.document.rules.paint['bedroom-walls'].template.marginPercent).toBe(20)
      expect(calculateEstimate(saved.document,saved.markup_bps).marginPercent).toBeCloseTo(20,1)
    } finally { await db.close() }
  },30000)
  it('calculates gross wall area, two coats, whole packages, labor, expenses and true margin without duplicate phases', () => {
    const input = paintDimensions(paintPlan.tasks[0])
    expect(input).toMatchObject({lengthFt:12,widthFt:10,heightFt:8,useGrossWalls:true})
    const result = makePaintItems('bedroom-walls',input,defaultPaintTemplate(),researchCatalog)
    expect(result.areaSqFt).toBe(352)
    expect(result.takeoff).toMatchObject({coats:2,requiredGallons:2.2126,packages:3})
    expect(result.items.filter(x => x.ruleKey === 'painting:material')).toHaveLength(1)
    expect(result.items.filter(x => x.ruleKey === 'repair:material')).toHaveLength(1)
    expect(result.items.filter(x => x.ruleKey.endsWith(':labor'))).toHaveLength(5)
    expect(result.items.find(x => x.ruleKey === 'painting:material')).toMatchObject({unit:'gal',unitCost:46.98,price:{status:'public_observed',verifiedZip:null}})
    expect(result.items.find(x => x.ruleKey === 'expenses:expenses').unitCost).toBe(35.51)
    expect(packageGallons({package:'1 US qt · eggshell'})).toBe(0.25)
    expect(paintMarkupBps(25)).toBe(3333)
    const totals=calculateEstimate({sections:[{items:result.items}]},3333)
    expect(totals.costCents).toBe(74577)
    expect(totals.priceCents).toBeGreaterThan(totals.costCents)
    expect(totals.marginPercent).toBeCloseTo(25,1)
  })

  it('saves a complete rule snapshot and retains manual price and quantity through recalculation', async () => {
    const db=await localDatabase()
    try {
      const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new PaintProvider(),{logger:()=>{}})
      let row=await engine.create(A,{id:randomUUID(),title:'Bedroom',language:'en'})
      const command=async(action,extra={})=>{row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action,...extra});for(let n=0;n<100&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)}return row}
      await command('message',{content:'Paint only the walls of a 12 × 10 × 8 ft bedroom; no openings deducted. Patch minor nail holes.'})
      expect(row.state.plan.pending).toHaveLength(0)
      await command('approve',{revision:row.state.planRevision})
      await command('generate')
      expect(row.state.run.status).toBe('ready')
      const saved=await repo.estimate(A,row.estimate_id)
      const doc=saved.document
      expect(doc.rules.paint['bedroom-walls']).toMatchObject({version:'interior-walls-1',areaSqFt:352,template:{coats:2,marginPercent:25}})
      expect(byKey(doc,'painting:material')).toMatchObject({quantity:3,unitCost:46.98,price:{sourceId:'HD01',status:'public_observed'}})
      const overridden=structuredClone(doc)
      overridden.sections[0].items=overridden.sections[0].items.map(item=>item.ruleKey==='painting:material'
        ? { ...reviseManualPrice(item,{unitCost:49},'en'),quantity:4,ruleOverrides:{price:true,quantity:true},takeoff:undefined } : item)
      const rebuilt=recalculatePaintDocument(overridden,'bedroom-walls',{wastePercent:20},{lengthFt:13},researchCatalog)
      expect(rebuilt.rules.paint['bedroom-walls'].areaSqFt).toBe(368)
      expect(byKey(rebuilt,'painting:material')).toMatchObject({quantity:4,unitCost:49,price:{status:'manual'}})
      expect(byKey(rebuilt,'protection:material').quantity).toBe(368)
      expect(byKey(rebuilt,'expenses:expenses').unitCost).toBeGreaterThan(byKey(doc,'expenses:expenses').unitCost)
      expect(byKey(doc,'painting:material').unitCost).toBe(46.98)
      const alternative={...researchCatalog.find(x=>x.sourceId==='HD01'),id:randomUUID(),sourceId:undefined,package:'1 US qt',packageData:null,conversion:null,unit:'ea',unitCost:20,status:'manual'}
      const changedProduct=recalculatePaintDocument(doc,'bedroom-walls',{paintCatalogId:alternative.id},{},[alternative])
      expect(byKey(changedProduct,'painting:material')).toMatchObject({quantity:9,unit:'ea',unitCost:20,origin:'manual',ruleOverrides:{price:true}})
      const editedNotes=structuredClone(doc)
      const prep=byKey(editedNotes,'preparation:labor');prep.notes='Custom preparation';prep.ruleNotes=undefined;prep.ruleOverrides={notes:true};prep.origin='manual'
      expect(byKey(recalculatePaintDocument(editedNotes,'bedroom-walls',{wastePercent:20}),'preparation:labor').notes).toBe('Custom preparation')
      const view=estimatePresentation(saved)
      const total=calculateEstimate(doc,saved.markup_bps)
      expect(view.sums.priceCents).toBe(total.priceCents)
      expect(view.sections[0].items.find(x=>x.ruleKey==='painting:material').quantity).toBe(3)
      for (const displayed of view.sections[0].items) expect(new Decimal(displayed.unitPriceDisplay.replace(/[$,]/g,'')).times(displayed.quantity).times(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber()).toBe(displayed.amount)
      expect(buildApprovedPdf(saved).output()).toContain((total.priceCents/100).toFixed(2))
    } finally { await db.close() }
  },30000)
})
