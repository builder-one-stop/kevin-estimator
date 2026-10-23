import {it,expect} from 'vitest'
import {apiRateCard,apiEvent,usageCost,summarizeConversationUsage} from '../../shared/apiUsage.js'
it('uses a versioned configured tariff, cached input once, and never asserts verified billing',()=>{
 const card=apiRateCard({OPENAI_INPUT_USD_PER_MILLION:'2',OPENAI_CACHED_USD_PER_MILLION:'1',OPENAI_OUTPUT_USD_PER_MILLION:'8',OPENAI_PRICING_VERSION:'synthetic-test-1',OPENAI_PRICING_EFFECTIVE_DATE:'2026-10-22'},'test-model')
 const usage={input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:20}}
 expect(usageCost(usage,card)).toBeCloseTo(.00058);expect(card.billingVerified).toBe(false)
 const event=apiEvent({id:'response-1',model:'test-model',usage},card)
 const run={id:'run-1',metrics:{apiCalls:1,apiEvents:[event],usage}},generated={id:'run-2',metrics:{apiCalls:0,apiEvents:[],usage:null}}
 const sum=summarizeConversationUsage({runs:[run,run,generated],run:generated})
 expect(sum.apiCalls).toBe(1);expect(sum.inputTokens).toBe(100);expect(sum.cachedTokens).toBe(20);expect(sum.estimatedCostUsd).toBeCloseTo(.00058);expect(sum.rateVersions).toEqual(['synthetic-test-1'])
})
it('leaves cost unknown without rates or after unmetered failure and distinguishes legacy usage',()=>{
 const card=apiRateCard({});expect(usageCost({input_tokens:1,output_tokens:1},card)).toBeNull()
 const event=apiEvent({id:'response-unpriced',usage:{input_tokens:3,output_tokens:2}},card)
 const summary=summarizeConversationUsage({runs:[{id:'r1',metrics:{apiCalls:1,apiEvents:[event]}}]})
 expect(summary.estimatedCostUsd).toBeNull();expect(summary.unpricedEvents).toBe(1)
 expect(summarizeConversationUsage({run:{id:'error',metrics:{apiCalls:1,apiEvents:[]}}}).unmeteredCalls).toBe(1)
 const legacy=summarizeConversationUsage({run:{id:'old',metrics:{usage:{input_tokens:5,output_tokens:2}}}})
 expect(legacy.apiCalls).toBe(0);expect(legacy.legacyRunsWithUnknownCallCount).toBe(1);expect(legacy.inputTokens).toBe(5);expect(legacy.estimatedCostUsd).toBeNull()
})
