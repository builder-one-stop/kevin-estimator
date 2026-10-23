import {it,expect} from 'vitest'
import {IsolatedTradeProvider,validateTradeSelection} from '../../server/isolatedTradeProvider.js'
import {tradeDefaultProducts} from '../../shared/constructionLibrary.js'
it('requires isolated opt-in and validates source quotes, measurements and exact product identity',()=>{
 expect(()=>new IsolatedTradeProvider({})).toThrow('ISOLATED_TRADES_DISABLED')
 const messages=[{role:'user',content:'Synthetic LVP floor 20 x 20 ft, no other work.'}]
 const selection={status:'supported',trade:'lvp',measurementQuote:'20 x 20 ft',scopeQuote:'LVP floor',productId:tradeDefaultProducts.lvp,reason:''}
 expect(validateTradeSelection(selection,messages).inputs).toEqual({lengthFt:20,widthFt:20})
 expect(()=>validateTradeSelection({...selection,measurementQuote:'40 x 20 ft'},messages)).toThrow('TRADE_EVIDENCE_MISSING')
 expect(()=>validateTradeSelection({...selection,productId:tradeDefaultProducts.baseboard},messages)).toThrow('TRADE_SELECTION_INVALID')
 expect(()=>validateTradeSelection({...selection,measurementQuote:'LVP floor'},messages)).toThrow('TRADE_MEASUREMENTS_INVALID')
})
it('unsupported requests invalidate any older approvable plan',async()=>{
 const p=new IsolatedTradeProvider({ONE_STOP_ISOLATED_REAL_TRADES:'1'})
 p.client={responses:{create:async()=>({status:'completed',output_text:JSON.stringify({status:'unsupported',trade:null,measurementQuote:'',scopeQuote:'',productId:null,reason:'mixed work'}),model:'test',usage:{input_tokens:1,output_tokens:1}})}}
 const {result}=await p.run({mode:'plan',messages:[{role:'user',content:'LVP plus paint'}],context:{documentLanguage:'en'},images:[]})
 expect(result.plan.pending).toHaveLength(0)
 expect(result.plan.tasks[0].id).toBe('local-trade-pending')
 expect(result.lines).toHaveLength(0)
})
it('preserves measured usage of an incomplete response and marks failed requests as unmetered',async()=>{
 const p=new IsolatedTradeProvider({ONE_STOP_ISOLATED_REAL_TRADES:'1'})
 const input={mode:'plan',messages:[{role:'user',content:'Synthetic LVP 20 x 20 ft'}],context:{documentLanguage:'en'},images:[]}
 p.client={responses:{create:async()=>({id:'incomplete-response',status:'incomplete',usage:{input_tokens:20,output_tokens:10}})}}
 await expect(p.run(input)).rejects.toMatchObject({code:'MODEL_INCOMPLETE',metrics:{apiCalls:1,usage:{input_tokens:20,output_tokens:10},apiEvents:[{id:'incomplete-response'}]}})
 p.client={responses:{create:async()=>{throw Object.assign(Error('Synthetic credit error'),{code:'credit_balance_exhausted',status:429})}}}
 await expect(p.run(input)).rejects.toMatchObject({code:'OPENAI_CREDIT_EXHAUSTED',metrics:{apiCalls:1,apiEvents:[],usage:null,estimatedCostUsd:null}})
})
