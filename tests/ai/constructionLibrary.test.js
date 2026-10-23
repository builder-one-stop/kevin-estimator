import {describe,it,expect} from 'vitest'
import {constructionLibrary,constructionObservations,tradeDefaultProducts} from '../../shared/constructionLibrary.js'
import {importLibrary,libraryCounts,queryLibrary,libraryAssessment} from '../../shared/localPriceLibrary.js'
import {calculateTrade,tradeDefaults,recalculateTradeDocument,reconcileTradeExpenses} from '../../shared/tradeRules.js'

describe('versioned local public construction library',()=>{
 it('imports33 distinct observations with29 public prices,4 missing and no local verification',()=>{
  expect(libraryCounts(constructionLibrary)).toEqual({records:33,withPrice:29,withoutPrice:4,localVerified:0})
  expect(new Set(constructionLibrary.records.map(row=>row.id)).size).toBe(33)
  expect(constructionLibrary.records.every(row=>row.currency==='USD'&&row.country==='US'&&row.region==='CA'&&row.city==='Los Angeles')).toBe(true)
  expect(constructionLibrary.records.every(row=>libraryAssessment(row).status!=='verified')).toBe(true)
  expect(constructionLibrary.records.find(row=>row.id==='hd-325477212')).toMatchObject({autoEligible:false,unitCost:66.12})
 })
 it('deduplicates idempotently, versions updated evidence and rejects stale updates or invalid batches atomically',()=>{
  const again=importLibrary(constructionLibrary,constructionObservations,{batchId:'repeat'})
  expect(again.report).toMatchObject({inserted:0,updated:0,unchanged:29})
  const original=constructionObservations.find(row=>row.id==='hd-311573425')
  const legacy={...original,sku:original.retailerProductId,retailerProductId:undefined,version:1}
  expect(importLibrary({records:[legacy]},[original],{batchId:'identifier-correction'}).records).toHaveLength(1)
  const updated=importLibrary(constructionLibrary,[{...original,unitCost:67,checkedAt:'2026-10-22'}],{batchId:'synthetic-test-update'})
  const current=updated.records.find(row=>row.id===original.id)
  expect(current).toMatchObject({version:2,unitCost:67,history:[{version:1,unitCost:65.99}]})
  expect(importLibrary(updated,[original],{batchId:'old'}).report.stale).toBe(1)
  expect(()=>importLibrary(constructionLibrary,[{...original,localVerified:true}],{batchId:'invalid'})).toThrow()
  expect(()=>importLibrary(constructionLibrary,[{...original,country:'CL'}],{batchId:'invalid'})).toThrow()
  expect(()=>importLibrary(constructionLibrary,[{...original,evidenceMethod:'manufacturer_specification'}],{batchId:'invalid'})).toThrow()
  expect(queryLibrary(constructionLibrary,{category:'lvp',query:'Oak',limit:2})).toMatchObject({limit:2,rows:expect.any(Array)})
  expect(queryLibrary(constructionLibrary,{limit:100000}).limit).toBe(100)
 })
})

describe('bounded deterministic trade quantities',()=>{
 const product=trade=>constructionLibrary.records.find(row=>row.id===tradeDefaultProducts[trade])
 it.each([['lvp',20,20,22,145178],['baseboard',120,0,17,35989],['drywall',40,8,11,null]])('%s buys whole exact packages with explicitly assumed10percent waste', (trade,lengthFt,widthFt,packages,materialSubtotalCents)=>{
  const result=calculateTrade(trade,{lengthFt,widthFt},{...tradeDefaults[trade],hourlyRate:75},product(trade))
  expect(result.packages).toBe(packages)
  expect(result.materialSubtotalCents).toBe(materialSubtotalCents)
  expect(result.items[0].unit).toBe('ea')
  expect(result.incompletePrice).toBe(trade==='drywall')
  if(trade==='drywall'){expect(result.totalCents).toBeNull();expect(result.items[0].priceMissing).toBe(true);expect(result.items[0].price.unitCost).toBeNull()}
 })
 it('keeps missing contractor rates incomplete, rejects ambiguous products, units, invalid inputs and unsupported tile floor scope',()=>{
  expect(calculateTrade('lvp',{lengthFt:20,widthFt:20},tradeDefaults.lvp,product('lvp')).totalCents).toBeNull()
  expect(()=>calculateTrade('lvp',{lengthFt:20,widthFt:20},tradeDefaults.lvp,constructionLibrary.records.find(row=>row.id==='hd-316580534'))).toThrow('PRODUCT_REQUIRES_SPEC_REVIEW')
  expect(()=>calculateTrade('lvp',{lengthFt:20,widthFt:20},tradeDefaults.lvp,{...product('lvp'),coverage:{...product('lvp').coverage,unit:'lf'}})).toThrow('PRODUCT_COVERAGE_MISMATCH')
  expect(()=>calculateTrade('tile',{lengthFt:20,widthFt:20},tradeDefaults.lvp,product('lvp'))).toThrow('UNSUPPORTED_TRADE')
  expect(()=>calculateTrade('lvp',{lengthFt:-1,widthFt:20},tradeDefaults.lvp,product('lvp'))).toThrow('INVALID_LENGTH')
 })
 it.each(['lvp','baseboard','drywall'])('preserves %s manual quantities/costs during recalculation and recomputes noncompounding expenses',trade=>{
  const inputs={lengthFt:20,widthFt:20},parameters={...tradeDefaults[trade],hourlyRate:75},selected=product(trade)
  const fresh=calculateTrade(trade,inputs,parameters,selected)
  const doc={language:'en',sections:[{id:'task',items:fresh.items.map(item=>({...item,taskId:'task'}))}],rules:{trades:{task:{trade,inputs,parameters,product:selected}}}}
  Object.assign(doc.sections[0].items[0],{quantity:30,unitCost:41,priceMissing:false,ruleOverrides:{quantity:true,price:true}})
  const next=recalculateTradeDocument(doc,'task',{lengthFt:21},{})
  expect(next.sections[0].items[0]).toMatchObject({quantity:30,unitCost:41})
  expect(next.sections[0].items[0].priceMissing).toBe(false)
  expect(next.rules.trades.task.incompletePrice).toBe(false)
  expect(reconcileTradeExpenses(next)).toEqual(next)
  const expense=next.sections[0].items[2];expense.unitCost=100;expense.ruleOverrides={price:true}
  expect(recalculateTradeDocument(next,'task',{},{}).sections[0].items[2].unitCost).toBe(100)
 })
})
