import { describe, it, expect } from 'vitest'
import { publicMessagePrefix, readPublicStream } from '../../server/publicText.js'
import { ResponsesProvider } from '../../server/openai.js'
import { defaultSettings } from '../../shared/aiSchemas.js'
const events = async function* (values) { for (const value of values) yield value }
describe('real provider streaming boundary, controlled transport', () => {
 it('decodes only the public top-level message, including split escapes, never nested fields', () => {
  expect(publicMessagePrefix('{"message":"Hola\\nMundo\\u00')).toBe('Hola\nMundo')
  expect(publicMessagePrefix('{"message":"Hola\\u00f1o", "plan":{"secret":"hidden"}')).toBe('Holaño')
  expect(publicMessagePrefix('{"plan":{"message":"hidden"}')).toBe('')
  expect(publicMessagePrefix('reasoning {"message":"hidden"}')).toBe('')
  expect(publicMessagePrefix('{"message":"bad\\q')).toBe('')
 })
 it('ignores reasoning and wrong-phase tools; exposes deltas before validated completion', async () => {
  const seen=[]
  const final={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"message":"Hello","plan":null,"lines":[],"changes":[]}'}]}]}
  const stream=events([
   {type:'response.reasoning_text.delta',delta:'Never public'},
   {type:'response.output_item.added',item:{id:'wrong',type:'function_call',name:'generate_lines'}},
   {type:'response.function_call_arguments.delta',item_id:'wrong',delta:'{"message":"Never public"}'},
   {type:'response.output_item.added',item:{id:'message',type:'message',role:'assistant'}},
   {type:'response.output_text.delta',item_id:'message',delta:'{"message":"Hel'},
   {type:'response.output_text.delta',item_id:'message',delta:'lo","plan":'},
   {type:'response.completed',response:final},
  ])
  const result=await readPublicStream(stream,'plan',text=>{seen.push(text)})
  expect(seen).toEqual(['Hel','Hello']);expect(JSON.parse(result.output_text).message).toBe('Hello')
 })
 it('rejects a truncated stream and still rejects malformed final structured output', async () => {
  await expect(readPublicStream(events([]),'plan',()=>{})).rejects.toMatchObject({code:'MODEL_INCOMPLETE'})
  const p=new ResponsesProvider({});const seen=[]
  p.client={responses:{create:async args=>{expect(args.stream).toBe(true);return events([
   {type:'response.output_item.added',item:{id:'msg',type:'message',role:'assistant'}},
   {type:'response.output_text.delta',item_id:'msg',delta:'{"message":"Public preview'},
   {type:'response.completed',response:{status:'completed',model:'gpt-6.1-sol',usage:{input_tokens:1,output_tokens:2},output:[{type:'message',content:[{type:'output_text',text:'{"message":"Public preview","plan":"invalid"}'}]}]}},
  ])}}}
  await expect(p.run({mode:'plan',messages:[],context:{},settings:defaultSettings(),images:[],signal:new AbortController().signal,onStage:async()=>{},onText:text=>seen.push(text)})).rejects.toMatchObject({code:'MODEL_INVALID_OUTPUT'})
  expect(seen).toEqual(['Public preview'])
 })
})
