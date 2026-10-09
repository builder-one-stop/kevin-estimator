import { describe,it,expect } from 'vitest'
import { ResponsesProvider } from '../../server/openai.js'
import { fixturePlan,fixtureLines } from './fixture.js'
import { defaultSettings } from '../../shared/aiSchemas.js'
const input=(mode='plan')=>({mode,messages:[{role:'user',content:'Current instruction overrides saved preference'}],context:{plan:fixturePlan},settings:defaultSettings(),images:[],signal:new AbortController().signal,onStage:async()=>{}})
const response=output=>({status:'completed',output,usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:20}}})
describe('Responses adapter, mocked transport only',()=>{
 it('uses the named model, medium effort, strict output/tools and actual image inputs',async()=>{
  const p=new ResponsesProvider({OPENAI_INPUT_USD_PER_MILLION:'2',OPENAI_CACHED_USD_PER_MILLION:'1',OPENAI_OUTPUT_USD_PER_MILLION:'8'});let request
  p.client={responses:{create:async args=>{request=args;return {...response([]),model:'gpt-6.1-sol',output_text:JSON.stringify({message:'Review',plan:fixturePlan,lines:[],changes:[]})}}}}
  const args=input();args.images=[{bytes:Buffer.from('fixture'),mime:'image/jpeg'}];const {metrics}=await p.run(args)
  expect(request).toMatchObject({model:'gpt-6.1-sol',reasoning:{effort:'medium'},store:false,max_output_tokens:12000,text:{format:{type:'json_schema',strict:true}}})
  expect(request.tools.every(t=>t.strict)).toBe(true);expect(request.input.at(-1).content[1]).toMatchObject({type:'input_image',image_url:'data:image/jpeg;base64,Zml4dHVyZQ=='})
  expect(metrics.responseModels).toEqual(['gpt-6.1-sol']);expect(metrics.usage).toEqual({input_tokens:100,output_tokens:50,cached_tokens:20});expect(metrics.estimatedCostUsd).toBeCloseTo(.00058)
 })
 it('stages proposal tools only in their authorized phase and rejects model-supplied owner IDs',async()=>{
  const p=new ResponsesProvider({OPENAI_REASONING_EFFORT:'high'});p.client={responses:{create:async()=>response([{type:'function_call',name:'generate_lines',arguments:JSON.stringify({message:'Done',lines:fixtureLines}),call_id:'test'}])}}
  await expect(p.run(input('plan'))).rejects.toThrow('UNAUTHORIZED_TOOL_STATE')
  expect((await p.run(input('generate'))).result.lines).toHaveLength(29)
  p.client.responses.create=async()=>response([{type:'function_call',name:'read_context',arguments:'{"ownerId":"foreign"}',call_id:'test'}])
  await expect(p.run(input())).rejects.toThrow()
 })
 it('returns only preauthorized context and explicit preferences to tools and keeps costs unset without rates',async()=>{
  const p=new ResponsesProvider({});const calls=[];let n=0
  p.client={responses:{create:async args=>{calls.push(structuredClone(args));return n++===0?response([{type:'function_call',name:'read_preferences',arguments:'{}',call_id:'p'}]):response([{type:'function_call',name:'propose_plan',arguments:JSON.stringify({message:'Review',plan:fixturePlan}),call_id:'plan'}])}}}
  const args=input();args.settings.preferences=[{id:'fixture',label:'Brand',value:'Previous default',source:'explicit-user'}]
  const result=await p.run(args);expect(JSON.parse(calls[1].input.at(-1).output)).toEqual({preferences:args.settings.preferences,labor:args.settings.labor})
  expect(calls[0].instructions).toContain('Current user instructions override saved preferences');expect(result.metrics.estimatedCostUsd).toBeNull();expect(result.metrics.usage.input_tokens).toBe(200)
 })
 it('refuses incomplete/refusal outputs and preserves measured usage on bounded failure',async()=>{
  const p=new ResponsesProvider({});p.client={responses:{create:async()=>({...response([]),status:'incomplete',output_text:''})}}
  await expect(p.run(input())).rejects.toMatchObject({code:'MODEL_INCOMPLETE',metrics:{usage:{input_tokens:100,output_tokens:50,cached_tokens:20}}})
 })
 it('reports exhausted API credit distinctly without inventing model usage or cost',async()=>{
  const p=new ResponsesProvider({OPENAI_INPUT_USD_PER_MILLION:'2',OPENAI_CACHED_USD_PER_MILLION:'0.1',OPENAI_OUTPUT_USD_PER_MILLION:'10'})
  p.client={responses:{create:async()=>{throw Object.assign(new Error('withheld'),{status:429,code:'credit_balance_exhausted'})}}}
  await expect(p.run(input())).rejects.toMatchObject({code:'OPENAI_CREDIT_EXHAUSTED',metrics:{responseModels:[],usage:{input_tokens:0,output_tokens:0,cached_tokens:0},estimatedCostUsd:null}})
 })
})
