import {it,expect} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {startHarness} from '../../scripts/ai-local-harness.mjs'
import {LocalReviewProvider} from '../../scripts/local-review-provider.mjs'
import {localTradePlan,pendingTradeDocument} from '../../shared/localTradePlan.js'
import {A} from './localRepository.js'
it('retains legitimate fixture auth context when finalizing preliminary documents after database restart',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'one-stop-finalization-test-')),options={dataDir,port:5188,apiPort:8798,provider:new LocalReviewProvider()}
 let h=await startHarness(options)
 const id=randomUUID(),plan=localTradePlan({trade:'lvp',inputs:null});plan.pending=[]
 try{
  const document=pendingTradeDocument(plan,'en')
  await h.repo.query('insert into estimates(id,owner_id,title,markup_bps,document) values($1,$2,$3,$4,$5)',[id,A,'LOCAL TEST pending quantity',2500,JSON.stringify(document)])
  await h.close();h=await startHarness({...options,provider:new LocalReviewProvider()})
  const record=await h.repo.estimate(A,id)
  const response=await fetch('http://127.0.0.1:8798/test-supabase/rest/v1/rpc/finalize_estimate',{method:'POST',headers:{Authorization:'Bearer fixture-a','Content-Type':'application/json'},body:JSON.stringify({p_id:id,p_expected:record.version,p_request_id:randomUUID()})})
  expect(response.status).toBe(200);const result=await response.json();expect(result.finalized_version).toBe(record.version+1);expect(result.document.sections[0].items[0].quantityPending).toBe(true)
 }finally{await h.close()}
},30000)
