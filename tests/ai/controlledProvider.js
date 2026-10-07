// Test entrypoints only. Never imported by server/index.js or the browser bundle.
import { fixturePlan,fixtureLines,bi } from './fixture.js'
export class ControlledProvider{
 constructor(){this.model='controlled-fixture';this.calls=[];this.delay=20}
 async run(input){
  this.calls.push(input);await new Promise((resolve,reject)=>{const t=setTimeout(resolve,this.delay);input.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new Error('aborted'))},{once:true})})
  const result={message:'',plan:null,lines:[],changes:[]}
  if(input.messages.at(-1)?.content==='TEST_PROVIDER_ERROR'&&!this.failed){this.failed=true;throw new Error('Controlled provider failure')}
  if(input.mode==='plan'){
   result.plan=structuredClone(fixturePlan)
   if(input.messages.filter(m=>m.role==='user').length===1){result.plan.pending=[bi('Confirm the missing heights, or approve the explicit 8 ft assumption.','Confirma las alturas faltantes o el supuesto explícito de 8 ft.')];result.message='Confirma las alturas faltantes. El plan es revisable; aún no existe un estimado.'}
   else result.message='Plan actualizado. Revisa el alcance, los supuestos y las exclusiones antes de aprobar.'
  }else if(input.mode==='generate'){result.lines=structuredClone(fixtureLines);result.message='Partidas propuestas desde la revisión aprobada. Precios provisionales de prueba.'}
  else{
   const item=input.context.estimate.document.sections[1].items[0]
   const line={...structuredClone(fixtureLines.find(x=>x.id===item.id)),quantity:Number(item.quantity)+1,unitCost:Number(item.unitCost)}
   result.changes=[{action:'replace',id:item.id,line}];result.message='Propongo añadir una unidad a la pintura de Bedroom 2. El resto se conserva.'
  }
  return {result,metrics:{model:this.model,promptVersion:'controlled-test',durationMs:this.delay,usage:null,estimatedCostUsd:null}}
 }
}
