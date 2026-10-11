// Opt-in real OpenAI evaluation. Synthetic inputs only; no Supabase or customer records.
import { mkdir, writeFile } from 'node:fs/promises'
import { ResponsesProvider, PROMPT_VERSION } from '../server/openai.js'
import { defaultSettings } from '../shared/aiSchemas.js'
import { documentFromLines } from '../shared/aiDomain.js'
import { calculateEstimate } from '../src/lib/estimateDocument.js'
const provider=new ResponsesProvider()
const user=content=>({role:'user',content})
const facts='Walls only; exclude ceiling, trim and doors. Good walls with minor nail holes. Protect furniture/floor, patch holes, spot prime patches, light sand, two coats generic eggshell. Use the full wall area without opening deductions. Provisional pricing: 2 US gallons at $40 each, supplies $35 total, labor 8 hours at $45/hour; markup 20% on cost, no tax. Color and brand pending; show these as editable assumptions. No verified local prices. Present the plan now.'
const cases=[
 {id:'walls-en',language:'en',messages:[user('Paint only the walls of a bedroom 12 feet long, 10 feet wide and 8 feet high. Use all the surface without deductions.')],area:true},
 {id:'paint-floor-es',language:'es',messages:[user('Quiero pintar las paredes y cambiar el piso de un dormitorio. Aún no lo he medido y el cliente no ha elegido el nuevo piso.')]},
 {id:'complete-en',language:'en',messages:[user('Bedroom 12 × 10 × 8 feet. '+facts)],area:true,complete:true},
 {id:'metric-es',language:'es',messages:[user('Responde en español. Dormitorio de 3.6576 m de largo, 3.048 m de ancho y 2.4384 m de alto. Solo paredes, sin techo, molduras ni puertas. Paredes en buen estado con agujeros pequeños; proteger piso y muebles, tapar agujeros, imprimar solo parches, lijado ligero y dos manos de pintura eggshell genérica. Usa toda la superficie, sin descontar aberturas. Precios provisionales: 2 galones estadounidenses a USD 40 cada uno, insumos USD 35, 8 horas de trabajo a USD 45/hora. Recargo sobre costo 20%, sin impuestos. Marca y color pendientes como supuestos editables. No hay precios locales verificados. Presenta el plan.')],area:true,complete:true},
 {id:'answered-en',language:'en',messages:[user('Paint bedroom walls, 12 x 10 x 8 ft.'),{role:'assistant',content:'Are there large damaged areas or just small nail holes?'},user(facts)],area:true,complete:true},
]
const selected=process.argv.slice(2)
const report={promptVersion:PROMPT_VERSION,environment:'Local provider adapter with real OpenAI; synthetic content; no database/browser/deployment',cases:[],errors:[]}
cases.push({id:'paint-floor-complete-es',language:'es',complete:true,area:true,messages:[user('Pintar paredes y cambiar piso del dormitorio.'),{role:'assistant',content:'¿Cuánto mide de largo, ancho y alto? ¿Qué tipo de piso quiere el cliente: vinilo en tablones, laminado o loseta?'},user('Mide 12 por 10 pies y 8 pies de alto. Piso nuevo de vinilo en tablones con sistema de clic, retirar alfombra existente. Base seca y pareja, sin daños visibles. Paredes en buen estado; solo agujeros pequeños. Solo paredes, usar toda la superficie sin descuentos. Excluir techos, puertas y molduras. Prepara el plan con supuestos editables para marca, color, desperdicio, consumibles y precios provisionales; todavía no hay cotización local verificada.')]})
for(const test of cases.filter(c=>!selected.length||selected.includes(c.id))){
 try {
  const {result,metrics}=await provider.run({mode:'plan',messages:test.messages,context:{documentLanguage:test.language,plan:null,estimate:null},settings:defaultSettings(),images:[],signal:AbortSignal.timeout(120000),onStage:async()=>{}})
  const questions=(result.message.match(/\?/g)||[]).length
  const visible=JSON.stringify([result.message,result.plan?.tasks.map(t=>t.measurements)])
  const checks={maxTwoQuestions:questions<=2&&(result.plan?.pending.length||0)<=2,noUnnecessaryQuestions:!test.complete||(!!result.plan&&!result.plan.pending.length&&questions===0),wallArea:!test.area||/352/.test(visible)}
  report.cases.push({id:test.id,checks,result,metrics})
  if(Object.values(checks).some(x=>!x))report.errors.push(test.id)
  console.info(JSON.stringify({case:test.id,checks,model:metrics.responseModels,durationMs:metrics.durationMs}))
  if(test.id==='complete-en'&&Object.values(checks).every(Boolean)){
   const generated=await provider.run({mode:'generate',messages:[...test.messages,{role:'assistant',content:result.message}],context:{documentLanguage:'en',plan:result.plan,approvedRevision:1,estimate:null},settings:defaultSettings(),images:[],signal:AbortSignal.timeout(120000),onStage:async()=>{}})
   const doc=documentFromLines(result.plan,generated.result.lines,'en');const sums=calculateEstimate(doc,result.plan.markupBps)
   const checks={total:sums.priceCents===57000,materials:sums.costsByType.material===11500,labor:sums.costsByType.labor===36000,provisional:doc.sections.every(s=>s.items.every(i=>i.price.status==='provisional'))}
   report.cases.push({id:'approved-generation-en',checks,metrics:generated.metrics,document:doc,sums})
   if(Object.values(checks).some(x=>!x))report.errors.push('approved-generation-en')
   console.info(JSON.stringify({case:'approved-generation-en',checks}))
  }
 }catch(error){report.errors.push({case:test.id,code:/^[A-Z_]+$/.test(error.code||'')?error.code:'EVALUATION_FAILED'});console.info(JSON.stringify({case:test.id,failed:true}))}
}
await mkdir('evidence/regional-estimator',{recursive:true})
await writeFile(`evidence/regional-estimator/${selected.length?'real-model-followup':'real-model'}.json`,JSON.stringify(report,null,2)+'\n')
if(report.errors.length)process.exitCode=1
