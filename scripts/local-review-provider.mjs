import { paintPlan } from '../tests/ai/paintProvider.js'
import { convertMeasurement } from '../shared/estimatingMarket.js'
import { localTradeInput,localTradePlan } from '../shared/localTradePlan.js'
import { constructionLibrary } from '../shared/constructionLibrary.js'

// Explicit local simulator. It parses only dimensions; it is never imported by real runtime.
export function reviewDimensions(messages) {
  const texts = messages.filter(row => row.role === 'user').map(row => row.content || '')
  const joined = texts.join('\n')
  const triple = [...joined.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|feet|pies|m|metros?)\b/gi)].at(-1)
  if (!triple) return null
  const unit = /^(m|metro)/i.test(triple[4]) ? 'm' : 'ft'
  const values = triple.slice(1, 4).map(Number)
  if (values.some(value => !Number.isFinite(value) || value <= 0 || value > 10000)) return null
  const feet = values.map(value => Number(convertMeasurement(value, unit, 'ft').toFixed(6)))
  return { feet, original: triple[0], unit }
}

export class LocalReviewProvider {
  constructor({library=constructionLibrary}={}) { this.model = 'controlled-local-review'; this.delay = 20; this.localTrades = true; this.library=library }
  async run(input) {
    input.signal?.throwIfAborted()
    // Controlled-provider latency supports cancellation QA; no artificial text streaming or percentage progress.
    const delay=this.nextDelayMs??this.delay;delete this.nextDelayMs
    await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('CANCELLED'))};const timer=setTimeout(()=>{input.signal?.removeEventListener('abort',abort);resolve()},delay);input.signal?.addEventListener('abort',abort,{once:true})})
    const es = input.context.documentLanguage === 'es'
    const trade = localTradeInput(input.messages)
    if(trade)return {result:{message:es?'Simulación local: revisa alcance, presentaciones y precios pendientes. No es una cotización local verificada.':'Local simulation: review scope, packages and missing prices. This is not a verified local quote.',plan:input.mode==='plan'?localTradePlan(trade,this.library):null,lines:[],changes:[]},metrics:{model:this.model,promptVersion:'controlled-trades-1',durationMs:0,usage:null,estimatedCostUsd:null}}
    const dimensions = reviewDimensions(input.messages)
    const plan = structuredClone(paintPlan)
    plan.pending = dimensions ? [] : [
      { en: 'What are the room length and width?', es: '¿Cuáles son el largo y ancho del cuarto?' },
      { en: 'What is the wall height? Supply all three as 12 x 10 x 8 ft, or in meters.', es: '¿Cuál es la altura de las paredes? Indica las tres medidas como 12 x 10 x 8 ft, o en metros.' },
    ]
    plan.tasks[0].measurements = dimensions ? {
      en: `${dimensions.feet.join(' x ')} ft; gross walls; original: ${dimensions.original}`,
      es: `${dimensions.feet.join(' x ')} ft; paredes brutas; original: ${dimensions.original}`,
    } : { en: 'Dimensions missing', es: 'Faltan medidas' }
    plan.tasks[0].confirmed = Boolean(dimensions)
    const message = input.mode === 'plan'
      ? dimensions ? (es ? 'Simulación local: revisa las medidas, el alcance de paredes y los supuestos provisionales.' : 'Local simulation: review dimensions, wall scope and provisional assumptions.')
        : (es ? 'Para este ejemplo local de paredes interiores faltan dos datos. Puedes responder las tres medidas juntas.' : 'This local wall example needs two details. You can supply all three dimensions together.')
      : (es ? 'El motor de reglas calcula este ejemplo local. Para otros cambios usa el editor.' : 'The rule engine calculates this local example. Use the editor for other changes.')
    return { result: { message, plan: input.mode === 'plan' ? plan : null, lines: [], changes: [] },
      metrics: { model: this.model, promptVersion: 'controlled-dimensions-1', durationMs: 0, usage: null, estimatedCostUsd: null } }
  }
}
