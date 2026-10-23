import {it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {workRegistry,workPromptContext,retrieveWorkReferences} from '../../shared/workRegistry.js'
import {HybridWorkProvider} from '../../server/hybridWorkProvider.js'
import {localDatabase,LocalRepository,A,B} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {hasMissingPrices} from '../../shared/estimatePricing.js'
import {calculateEstimate,reviseManualPrice} from '../../src/lib/estimateDocument.js'
import {reconcileEstimateExpenses} from '../../shared/estimateReconciliation.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'
import {estimatePresentation} from '../../shared/estimatePresentation.js'

it('bounds model context and matches references by identity, unit, owner, market and date without live lookup',()=>{
 const context=workPromptContext();expect(context.works).toHaveLength(4);expect(context.works.flatMap(w=>w.defaultProducts)).toHaveLength(5)
 expect(JSON.stringify(context).length).toBeLessThan(6500)
 expect(retrieveWorkReferences({trade:'lvp',unit:'gal'})).toEqual([])
 const refs=retrieveWorkReferences({trade:'lvp',productId:workRegistry.lvp.productId,unit:'ea',today:'2099-01-01'})
 expect(refs).toHaveLength(1);expect(refs[0].assessment.reason).toBe('SOURCE_REVIEW_DUE');expect(refs[0].localVerified).toBe(false)
 expect(retrieveWorkReferences({trade:'lvp',owner:A,privateReferences:[{...refs[0],id:'private-b',ownerId:B}]}).some(r=>r.id==='private-b')).toBe(false)
})
it('runs four approved templates with one interpretation call each, deterministic generation and manual recalculation without AI',async()=>{
 const db=await localDatabase()
 try{
  const repo=new LocalRepository(db)
  for(const [trade,scope,measure,expected]of[['paint','Paint interior walls','12 x 10 x 8 ft',3],['lvp','Install LVP floor','20 x 20 ft',22],['baseboard','Install baseboard','120 lf',17],['drywall','Drywall board only','40 x 8 ft',11]]){
   let calls=0;const provider=new HybridWorkProvider({})
   provider.client={responses:{create:async input=>{calls++;expect(JSON.stringify(input.input)).not.toContain('private-b');return{id:'response-'+trade,status:'completed',model:'structured-test',usage:{input_tokens:100,output_tokens:20},output_text:JSON.stringify({status:'supported',trade,scopeQuote:scope,measurementQuote:measure,productId:workRegistry[trade].productId,reason:''})}}}}
   const engine=new EstimatorEngine(repo,provider,{logger:()=>{}})
   let row=await engine.create(A,{id:randomUUID(),title:'HYBRID QA '+trade,language:'en'})
   const command=async(action,extra={},requestId=randomUUID())=>{row=await engine.command(A,row.id,{action,requestId,version:row.version,...extra});for(let n=0;n<400&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)}}
   const requestId=randomUUID();await command('message',{content:scope+' '+measure},requestId)
   expect(row.state.run.status).toBe('ready');expect(row.state.plan.pending).toHaveLength(0)
   await command('message',{content:scope+' '+measure},requestId);expect(calls).toBe(1)
   await command('approve',{revision:row.state.planRevision});await command('generate');expect(row.state.run.status).toBe('ready');expect(calls).toBe(1)
   const saved=await repo.estimate(A,row.estimate_id),items=saved.document.sections[0].items
   expect(saved.document.hybrid.trade).toBe(trade);expect(saved.document.hybrid.liveLookup).toBe(false)
   expect(items.find(item=>item.ruleKey===(trade==='paint'?'painting:material':'trade:material')).quantity).toBe(expected)
   expect(items.some(i=>i.costType==='equipment'&&i.priceMissing)).toBe(true);expect(hasMissingPrices(saved.document)).toBe(true)
   const document=structuredClone(saved.document),material=document.sections[0].items.find(i=>i.ruleKey===(trade==='paint'?'painting:material':'trade:material'))
   Object.assign(material,reviseManualPrice(material,{unitCost:80}),{quantity:4,quantityPending:false,ruleOverrides:{...material.ruleOverrides,quantity:true,price:true}})
   const recalculated=reconcileEstimateExpenses(document),sum=calculateEstimate(recalculated,2500)
   expect(sum.costCents).toBeGreaterThanOrEqual(32000);expect(reconcileEstimateExpenses(recalculated)).toEqual(recalculated);expect(calls).toBe(1)
   expect(buildApprovedPdf({...saved,document:recalculated,markup_bps:2500}).output()).toContain('PRELIMINARY BUDGET')
   const changed={...saved,document:recalculated,markup_bps:3000},view=estimatePresentation(changed)
   expect(view.markupBps).toBe(3000);expect(view.assumptions).toContain('Original plan assumptions')
   expect(buildApprovedPdf(changed).output()).toContain('Current default markup on cost')
   expect(buildApprovedPdf(changed).output()).toContain('30%');expect(calls).toBe(1)
   await expect(repo.estimate(B,saved.id)).rejects.toMatchObject({status:403})
  }
 }finally{await db.close()}
},60000)
