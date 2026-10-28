import {paintPlan} from './paintProvider.js'
import {paintDimensions} from '../../shared/paintJob.js'
const bi=text=>({en:text,es:text})
// Only for local synthetic QA. No client, API key or real-model fallback.
export class MaterialChatProvider{
 constructor(){this.model='controlled-material-chat';this.delay=20}
 async run(input){
  const plan=structuredClone(paintPlan),text=input.messages.filter(m=>m.role==='user').map(m=>m.content).join('\n'),dimensions=paintDimensions({measurements:{en:text}})
  if(dimensions)plan.tasks[0].measurements=bi(text.slice(0,1000))
  else{plan.tasks[0].measurements=bi('Measurements pending');plan.tasks[0].confirmed=false;plan.pending=[bi('What are the measured length, width and height?')];plan.tasks[0].assumptions=bi('No dimensions assumed; quantities remain pending.')}
  const noDimensions=input.mode==='generate'&&!paintDimensions(input.context.plan.tasks[0])
  return {result:{message:input.context.documentLanguage==='es'?'Revisa alcance y referencias; los datos pendientes no bloquean el preliminar.':'Review scope and references; missing data does not block a preliminary estimate.',plan:input.mode==='plan'?plan:null,lines:noDimensions?[{id:'pending-material',taskId:plan.tasks[0].id,description:plan.tasks[0].components[0],quantity:null,unit:'lot',unitCost:null,costType:'material',markupBps:null,basis:bi('Measurements and price pending'),catalogId:null}]:[],changes:[]},metrics:{model:this.model,promptVersion:'controlled-material-chat',apiCalls:0,usage:null,estimatedCostUsd:null}}
 }
}
