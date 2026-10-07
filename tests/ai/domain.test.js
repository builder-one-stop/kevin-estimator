import { describe,it,expect } from 'vitest'
import { fixtureLines,fixturePlan } from './fixture.js'
import { documentFromLines,proposedChange,proposalView,assertPlan,assertDocument } from '../../shared/aiDomain.js'
import { itemCostCents,calculateEstimate,proposalPrices } from '../../src/lib/estimateDocument.js'
import { validateTool,settingsSchema,defaultSettings } from '../../shared/aiSchemas.js'
const doc=()=>documentFromLines(fixturePlan,fixtureLines,'en')
const estimate=()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:3,title:'Fixture',created_at:'2026-10-07',markup_bps:3600,document:doc()})
describe('money and approved scope',()=>{
 it('matches all 29 fixed lines exactly, with independent labor/materials and unit sale prices',()=>{
  const d=doc(),items=d.sections.flatMap(s=>s.items),total=calculateEstimate(d,3600)
  expect(items).toHaveLength(29);expect(items.filter(i=>i.costType==='labor').reduce((n,i)=>n+i.quantity,0)).toBe(19.5)
  expect(items.filter(i=>i.costType==='labor').reduce((n,i)=>n+itemCostCents(i),0)).toBe(146250)
  expect(items.filter(i=>i.costType==='material').reduce((n,i)=>n+itemCostCents(i),0)).toBe(148500)
  expect(total).toMatchObject({costCents:294750,markupCents:106110,priceCents:400860,laborHours:19.5,costsByType:{material:148500,labor:146250,equipment:0,other:0}});expect(total.marginPercent.toFixed(1)).toBe('26.5')
  const prices=proposalPrices(d,3600);expect(prices.get('line-1-1')/2).toBe(8840);expect(prices.get('line-1-4')/2.5).toBe(10200)
  expect([...prices.values()].reduce((a,b)=>a+b,0)).toBe(400860)
 })
 it('rounds decimal money deterministically and supports explicit per-line markup',()=>{expect(itemCostCents({quantity:1.5,unitCost:1.005})).toBe(152);const d=doc();d.sections[0].items[0].markupBps=1000;expect(calculateEstimate(d,3600).priceCents).toBe(397480)})
 it('keeps kitchen walls-only, living ceiling, spot prime and finish alternatives in both documents',()=>{
  for(const language of ['en','es']){const e=estimate();e.document.language=language;const view=proposalView(e)
   expect(view.tasks).toHaveLength(7);expect(view.tasks[6].included).toBe(fixturePlan.tasks[6].included[language]);expect(view.tasks[3].preparation).toBe(fixturePlan.tasks[3].preparation[language]);expect(view.tasks.map(t=>t.excluded)).toEqual(fixturePlan.tasks.map(t=>t.excluded[language]));expect(view.tasks[5].product).toContain('Interior Latex Flat Ceiling Paint');expect(view.tasks[0].finish).toBe(fixturePlan.tasks[0].finish[language])
   e.document.proposal.scope='Prime all surfaces; bedroom ceilings';expect(proposalView(e).tasks).toEqual(view.tasks)
  }
 })
 it('blocks missing material answers, duplicate IDs and unpriced or extra tasks',()=>{
  expect(()=>assertPlan({...fixturePlan,pending:[{en:'Height?',es:'¿Altura?'}]},true)).toThrow('PLAN_HAS_QUESTIONS')
  expect(()=>documentFromLines(fixturePlan,[...fixtureLines,fixtureLines[0]],'en')).toThrow('INVALID_LINES')
  expect(()=>documentFromLines(fixturePlan,fixtureLines.slice(4),'en')).toThrow('UNPRICED_SCOPE')
  const d=doc();d.sections[0].items[0].taskId='unapproved';expect(()=>assertDocument(d,3600)).toThrow('OUTSIDE_APPROVED_SCOPE')
 })
 it('limited changes preserve manual edits and all unaffected IDs/values and reject implicit task deletion',()=>{
  const e=estimate();e.document.sections[0].items[0].unitCost=91
  const output={message:'test',plan:null,lines:[],changes:[{action:'replace',id:fixtureLines[4].id,line:{...fixtureLines[4],quantity:3}}]}
  const change=proposedChange(e,output,[],2);expect(change.saleDelta).toBe(8840);expect(change.document.sections[0]).toEqual(e.document.sections[0]);expect(change.document.sections[1].items[0].id).toBe(fixtureLines[4].id)
  expect(()=>proposedChange(e,{...output,changes:[],plan:{...fixturePlan,tasks:fixturePlan.tasks.slice(1)}},[],2)).toThrow('IMPLICIT_DELETION')
 })
 it('preserves manual notes and price evidence for a quantity-only change',()=>{
  const e=estimate(),item=e.document.sections[1].items[0];Object.assign(item,{origin:'manual',notes:'User prep note',priceSource:'User receipt',priceDate:'2026-10-07',needsReview:false,price:{status:'manual'}})
  const changed=proposedChange(e,{message:'Add quantity',plan:null,lines:[],changes:[{action:'replace',id:item.id,line:{...fixtureLines[4],quantity:3}}]},[],2)
  expect(changed.document.sections[1].items[0]).toMatchObject({quantity:3,notes:'User prep note',priceSource:'User receipt',priceDate:'2026-10-07',needsReview:false})
 })
 it('rejects descriptions that expand approved work even with a legitimate task ID',()=>{
  const lines=structuredClone(fixtureLines);lines[0].description={en:'Paint bedroom ceilings',es:'Pintar techos de dormitorios'}
  expect(()=>documentFromLines(fixturePlan,lines,'en')).toThrow('UNAPPROVED_DESCRIPTION')
 })
 it('rejects catalog substitutions and keeps a nonlocal price provisional',()=>{
  const plan=structuredClone(fixturePlan);plan.zip='90001';plan.tasks[0].product={en:'Brand Walls 1 GAL',es:'Brand Walls 1 GAL'}
  const lines=structuredClone(fixtureLines);lines[0].catalogId='catalog-item'
  const entry={id:'catalog-item',product:'Walls',brand:'Brand',package:'1 GAL',unit:'gal',unitCost:65,status:'verified',location:'90505'}
  const document=documentFromLines(plan,lines,'en',[entry]);expect(document.sections[0].items[0].price.status).toBe('provisional')
  expect(()=>documentFromLines(plan,lines,'en',[{...entry,brand:'Unapproved brand'}])).toThrow('UNAPPROVED_PRODUCT')
 })
 it('validates readonly tool names/arguments and rejects fake catalog verification',()=>{
  expect(()=>validateTool('delete_user',{})).toThrow();expect(()=>validateTool('read_context',{ownerId:'other'})).toThrow();expect(()=>validateTool('lookup_catalog',{})).not.toThrow()
  expect(()=>settingsSchema.parse({...defaultSettings(),catalog:[{status:'verified'}]})).toThrow()
 })
})

describe('provider boundary',()=>{
 it('retains provisional values on provider failure or a different package/location',async()=>{
  const {resolvePrice}=await import('../../server/pricing.js')
  const prior={unitCost:65,product:'Walls',unit:'gal'}
  expect(await resolvePrice({lookup:async()=>{throw Error('offline')}},{},prior)).toMatchObject({unitCost:65,status:'provisional',reason:'PROVIDER_UNAVAILABLE'})
  expect(await resolvePrice({lookup:async()=>({prices:[{product:'Walls',unit:'qt'}]})},{product:'Walls',unit:'gal'},prior)).toMatchObject({unitCost:65,status:'provisional',reason:'NO_EQUIVALENT_PRODUCT',substitution:false})
 })
})
