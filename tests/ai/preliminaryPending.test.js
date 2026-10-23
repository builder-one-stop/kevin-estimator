import {it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {documentFromLines,assertDocument,assertPlan} from '../../shared/aiDomain.js'
import {fixturePlan,fixtureLines} from './fixture.js'
import {hasMissingPrices} from '../../shared/estimatePricing.js'
import {calculateEstimate,reviseManualPrice} from '../../src/lib/estimateDocument.js'
import {localDatabase,LocalRepository,A} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {LocalReviewProvider} from '../../scripts/local-review-provider.mjs'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'
it('unknown quantity stays excluded after price entry until explicit quantity is supplied',()=>{
 const lines=structuredClone(fixtureLines);lines[0].quantity=null;lines[0].unitCost=null
 const document=documentFromLines(fixturePlan,lines,'en'),item=document.sections[0].items[0]
 expect(item.quantityPending).toBe(true);expect(hasMissingPrices(document)).toBe(true)
 const known=calculateEstimate(document,0).costCents
 document.sections[0].items[0]=reviseManualPrice(item,{unitCost:80})
 expect(hasMissingPrices(document)).toBe(true);expect(calculateEstimate(document,0).costCents).toBe(known)
 const view=estimatePresentation({id:randomUUID(),version:1,status:'Draft',created_at:'2026-10-22',title:'Pending quantity',markup_bps:2500,document})
 expect(view.sections[0].items[0].unitPriceDisplay).toBe('$100.00');expect(view.incomplete).toBe(true)
 document.sections[0].items[0]={...document.sections[0].items[0],quantity:3,quantityPending:false}
 expect(hasMissingPrices(document)).toBe(false);expect(calculateEstimate(document,0).costCents).toBe(known+24000)
 expect(()=>assertDocument(document,2500)).not.toThrow()
})
it('generates and finalizes an exportable pending scope when dimensions are unanswered',async()=>{
 const db=await localDatabase()
 try{
  const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new LocalReviewProvider(),{logger:()=>{}})
  let row=await engine.create(A,{id:randomUUID(),title:'LOCAL QA dimensions pending',language:'en'})
  const command=async(action,extra={})=>{row=await engine.command(A,row.id,{action,version:row.version,requestId:randomUUID(),...extra});for(let n=0;n<300&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)}}
  await command('message',{content:'LVP floor, dimensions not measured yet. Proceed with pending quantities.'})
  expect(row.state.plan.pending.length).toBeLessThanOrEqual(2);expect(()=>assertPlan(row.state.plan,true)).not.toThrow()
  await command('approve',{revision:row.state.planRevision});await command('generate');expect(row.state.run.status).toBe('ready')
  const saved=await repo.estimate(A,row.estimate_id);expect(saved.document.sections[0].items[0].quantityPending).toBe(true)
  expect(buildApprovedPdf(saved).output()).toContain('PRELIMINARY BUDGET')
  await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);await tx.exec('set local role authenticated');const value=(await tx.query('select to_jsonb(public.finalize_estimate($1,$2,$3)) as value',[saved.id,saved.version,randomUUID()])).rows[0].value;expect(value.finalized_version).toBe(saved.version+1)})
 }finally{await db.close()}
},30000)
