import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {localDatabase,LocalRepository,A,B} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {LocalReviewProvider} from '../../scripts/local-review-provider.mjs'
import {hasMissingPrices} from '../../shared/estimatePricing.js'
import {recalculateTradeDocument} from '../../shared/tradeRules.js'
import {reconcileEstimateExpenses} from '../../shared/estimateReconciliation.js'
import {calculateEstimate,reviseManualPrice} from '../../src/lib/estimateDocument.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'

describe('three isolated persistent trade flows',()=>{
 it('approves scopes, generates package calculations, preserves manual costs and ownership, and exports honest preliminary PDFs while prices are missing',async()=>{
  const db=await localDatabase()
  try{
   const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new LocalReviewProvider(),{logger:()=>{}})
   for(const [trade,message,packages,subtotal]of[['lvp','LVP 20 x 20 ft',22,145178],['baseboard','Baseboard 120 lf',17,35989],['drywall','Drywall panel 40 x 8 ft',11,null]]){
    let row=await engine.create(A,{id:randomUUID(),title:'LOCAL QA '+trade,language:'en'})
    const command=async(action,extra={})=>{row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action,...extra});for(let n=0;n<300&&row.state.run?.status==='working';n++){await new Promise(resolve=>setTimeout(resolve,10));row=await repo.get(A,row.id)}return row}
    await command('message',{content:message});expect(row.state.plan.pending).toHaveLength(0)
    await command('approve',{revision:row.state.planRevision});await command('generate')
    expect(row.state.run.status).toBe('ready')
    const saved=await repo.estimate(A,row.estimate_id),section=saved.document.sections[0],rule=saved.document.rules.trades[section.id]
    expect(section.items[0].quantity).toBe(packages)
    expect(rule.trade).toBe(trade)
    expect(hasMissingPrices(saved.document)).toBe(true)
    expect(section.items[0].priceMissing).toBe(subtotal===null)
    if(subtotal!==null)expect(calculateEstimate({sections:[{items:[section.items[0]]}]},0).costCents).toBe(subtotal)
    for(const language of ['en','es']){const pdf=buildApprovedPdf({...saved,document:{...saved.document,language}}).output();expect(pdf).toContain(language==='es'?'PRESUPUESTO PRELIMINAR':'PRELIMINARY BUDGET');expect(pdf).toContain(language==='es'?'Precio pendiente':'Price pending')}
    expect(estimatePresentation(saved).incomplete).toBe(true)
    await db.transaction(async tx=>{
     await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);await tx.exec('set local role authenticated')
     const finalized=(await tx.query('select to_jsonb(public.finalize_estimate($1,$2,$3)) as value',[saved.id,saved.version,randomUUID()])).rows[0].value
     expect(finalized.finalized_version).toBe(saved.version+1)
    })
    await expect(repo.estimate(B,saved.id)).rejects.toMatchObject({status:403,code:'FORBIDDEN_RELATION'})
    // Synthetic provisional contractor75/hour is explicitly supplied for test arithmetic, not researched market evidence.
    let document=recalculateTradeDocument(saved.document,section.id,{}, {hourlyRate:75})
    if(trade==='drywall')document.sections[0].items[0]=reviseManualPrice(document.sections[0].items[0],{unitCost:21})
    document=reconcileEstimateExpenses(document)
    expect(hasMissingPrices(document)).toBe(false)
    expect(reconcileEstimateExpenses(document)).toEqual(document)
    const next={...saved,document}
    for(const language of ['en','es']){
     const localized={...next,document:{...document,language}}
     const view=estimatePresentation(localized),pdf=buildApprovedPdf(localized).output().replaceAll(',','')
     expect(view.incomplete).toBe(false)
     expect(view.assumptions).toContain(language==='es'?'Supuestos del plan original':'Original plan assumptions')
     expect(pdf).toContain((view.sums.priceCents/100).toFixed(2))
    }
    expect((await repo.estimate(A,saved.id)).document).toEqual(saved.document)
   }
  }finally{await db.close()}
 },60000)
})
