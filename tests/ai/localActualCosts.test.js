import {it,expect} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {LocalActualCosts,actualCostComparison} from '../../server/localActualCosts.js'
it('persists scoped actuals separately, deduplicates retries and labels partial comparison without learning',async()=>{
 const path=join(mkdtempSync(join(tmpdir(),'one-stop-actuals-')),'actuals.json'),store=new LocalActualCosts(path)
 const estimate={id:randomUUID(),owner_id:'a',version:4,markup_bps:2500,document:{sections:[{id:'s',items:[{id:'i',quantity:2,unitCost:50,costType:'material'},{id:'pending',quantity:1,unitCost:0,costType:'equipment',priceMissing:true}]}]}}
 const input={requestId:randomUUID(),category:'material',amountUsd:120,date:'2026-10-22',note:'SYNTHETIC receipt, not real data',currency:'USD'}
 const original=JSON.stringify(estimate)
 const [first,retry]=await Promise.all([store.add('a',estimate,input),store.add('a',estimate,input)])
 expect(retry).toEqual(first);expect(await new LocalActualCosts(path).list('a',estimate.id)).toHaveLength(1);expect(await store.list('b',estimate.id)).toEqual([])
 await expect(store.add('b',estimate,input)).rejects.toMatchObject({status:403})
 await expect(store.add('a',estimate,{...input,amountUsd:121})).rejects.toMatchObject({status:409})
 const compare=actualCostComparison(estimate,[first]);expect(compare).toMatchObject({knownBudgetCostCents:10000,recordedActualCostCents:12000,varianceAgainstKnownBudgetCents:2000,budgetIncomplete:true,automaticLearning:false,priceVerification:false,actualsComplete:false})
 expect(JSON.stringify(estimate)).toBe(original)
})
