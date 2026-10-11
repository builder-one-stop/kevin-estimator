import { describe, it, expect } from 'vitest'
import { ESTIMATING_MARKET, pricingAvailability, measureRooms, convertMeasurement } from '../../shared/estimatingMarket.js'
import { modelOutputSchema, parseModelResult, planSchema, validateTool } from '../../shared/aiSchemas.js'
import { fixturePlan, fixtureLines } from './fixture.js'
import { documentFromLines } from '../../shared/aiDomain.js'
import { newItem, reviseManualPrice } from '../../src/lib/estimateDocument.js'
import { strings } from '../../src/components/ai/strings.js'
const room = (unit = 'ft', dimensions = [12,10,8]) => ({ id:'bedroom',length:{value:dimensions[0],unit},width:{value:dimensions[1],unit},height:{value:dimensions[2],unit},openings:{value:0,unit:'sf'},useGrossWalls:true })
describe('Los Angeles estimating quantities and provenance', () => {
 it('calculates 352 sf walls and 120 sf floor, respecting the full surface instruction', () => {
  const input=room(); input.openings.value=30
  expect(measureRooms({rooms:[input]})[0]).toMatchObject({grossWallSqFt:352,wallSqFt:352,deductedSqFt:0,floorSqFt:120,dimensionsVerified:false})
  input.useGrossWalls=false
  expect(measureRooms({rooms:[input]})[0].wallSqFt).toBe(322)
  input.openings.value=353; expect(()=>measureRooms({rooms:[input]})).toThrow('INVALID_OPENINGS')
 })
 it('converts original metric dimensions without rounding before area calculations', () => {
  const result=measureRooms({rooms:[room('m',[3.6576,3.048,2.4384])]})[0]
  expect(result).toMatchObject({wallSqFt:352,floorSqFt:120,input:{length:{value:3.6576,unit:'m'}}})
  expect(convertMeasurement(304.8,'cm','ft')).toBe(10)
  expect(convertMeasurement(96,'in','ft')).toBe(8)
  expect(convertMeasurement(1000,'mm','m')).toBe(1)
  expect(convertMeasurement(1,'m2','sf')).toBeCloseTo(10.7639104,6)
  expect(convertMeasurement(1,'gal','l')).toBe(3.785411784)
  expect(()=>convertMeasurement(2,'m','sf')).toThrow('INVALID_MEASUREMENT')
  expect(()=>convertMeasurement(-2,'m','ft')).toThrow('INVALID_MEASUREMENT')
  expect(()=>validateTool('calculate_rooms',{rooms:[{...room(),ownerId:'foreign'}]})).toThrow()
 })
 it('does not invent a missing height or turn coats/waste into area', () => {
  const input={...room(),height:null}
  expect(measureRooms({rooms:[input]})[0]).toMatchObject({wallSqFt:null,grossWallSqFt:null,floorSqFt:120})
  expect(()=>validateTool('calculate_rooms',{rooms:[{...room(),coats:2}]})).toThrow()
 })
 it('keeps USD and the market independent of language and marks plan approval only', () => {
  for(const lang of ['en','es']) {
   const doc=documentFromLines(fixturePlan,fixtureLines,lang)
   expect(doc.market).toEqual(ESTIMATING_MARKET);expect(doc.scope.approvalType).toBe('plan')
   expect(doc.sections[0].items[0].price).toMatchObject({status:'provisional',category:'provisional-assumption',internalPriceApproval:'not-recorded'})
   expect(strings[lang].market).toContain('USD');expect(strings[lang].approvalMeaning).toBeTruthy()
  }
  expect(pricingAvailability().approvedHistory.status).toBe('unavailable')
 })
 it('limits model pending questions to two without rejecting legacy/manual plans', () => {
  const plan={...fixturePlan,pending:Array.from({length:3},()=>({en:'An essential question?',es:'¿Una pregunta esencial?'}))}
  expect(()=>planSchema.parse(plan)).not.toThrow()
  expect(()=>modelOutputSchema.parse({message:'Review',plan,lines:[],changes:[]})).toThrow()
  expect(()=>parseModelResult({message:'Height? Floor? Color?',plan:null,lines:[],changes:[]})).toThrow('MODEL_TOO_MANY_QUESTIONS')
 })
 it('manual cost/unit edits retain values and notes but cannot inherit catalog verification', () => {
  const item={unitCost:10,unit:'sf',quantity:352,notes:'Keep manual note',catalogId:'catalog-id',priceSource:'Receipt',priceDate:'2026-10-01',price:{status:'verified',source:'owner-catalog',category:'local-source'},needsReview:false}
  const next=reviseManualPrice(item,{unitCost:'12.5'})
  expect(next).toMatchObject({unitCost:'12.5',quantity:352,notes:'Keep manual note',catalogId:null,needsReview:true,price:{status:'manual',source:'manual-entry',category:'provisional-assumption',internalPriceApproval:'not-recorded'}})
  expect(item.price.status).toBe('verified')
  expect(next.price.previousEvidence).toEqual({source:'Receipt',date:'2026-10-01'})
  expect(next.priceDate).toBe('');expect(next.priceSource).toBe('Manual entry — provisional')
  expect(newItem('es')).toMatchObject({needsReview:true,priceSource:'Entrada manual — provisional',price:{source:'manual-entry'}})
 })
})
