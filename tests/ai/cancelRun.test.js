import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {EstimatorEngine} from '../../server/engine.js'
import {localDatabase,LocalRepository,A} from './localRepository.js'
import {LocalReviewProvider} from '../../scripts/local-review-provider.mjs'
describe('run-bound cancellation',()=>{
 it('cancels the same run despite stale stage version, and cannot cancel a different or already-completed run',async()=>{
  const db=await localDatabase()
  try{
   const provider=new LocalReviewProvider();provider.delay=1500
   const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,provider,{logger:()=>{}})
   let row=await engine.create(A,{id:randomUUID(),title:'Cancel QA',language:'en'})
   row=await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action:'message',content:'LVP20 x20 ft'})
   const staleVersion=row.version,runId=row.state.run.id
   await new Promise(resolve=>setTimeout(resolve,60))
   const cancelled=await engine.command(A,row.id,{requestId:randomUUID(),version:staleVersion,action:'cancel',runId})
   expect(cancelled.state.run.status).toBe('cancelled')
   await new Promise(resolve=>setTimeout(resolve,30))
   expect((await repo.get(A,row.id)).state.run.status).toBe('cancelled')
   await expect(engine.command(A,row.id,{requestId:randomUUID(),version:staleVersion,action:'cancel',runId:randomUUID()})).rejects.toMatchObject({code:'RUN_CHANGED'})
   const unchanged=await engine.command(A,row.id,{requestId:randomUUID(),version:1,action:'cancel',runId})
   expect(unchanged.version).toBe(cancelled.version)
  }finally{await db.close()}
 },30000)
})
