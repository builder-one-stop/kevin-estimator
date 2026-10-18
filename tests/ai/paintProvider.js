import { bi } from './fixture.js'
import { researchCatalog } from '../../shared/researchCatalog.js'

const paint = researchCatalog.find(x => x.sourceId === 'HD01')
const patch = researchCatalog.find(x => x.sourceId === 'HD03')
export const paintPlan = { title: bi('Bedroom wall painting','Pintura de paredes de dormitorio'), address: '', zip: '', markupBps: 3600, pending: [],
  assumptions: bi('Gross walls, no openings deducted. Template coverage, productivity, expenses and margin are editable assumptions; catalog prices are public online observations, not local quotes.',
    'Paredes brutas, sin descontar aberturas. Rendimiento, productividad, gastos y margen son supuestos editables; los precios del catálogo son observaciones públicas, no cotizaciones locales.'),
  tasks: [{ id: 'bedroom-walls', room: bi('Bedroom','Dormitorio'), work: bi('Interior wall painting','Pintura interior de paredes'),
    included: bi('Walls, protection, preparation, minor nail-hole patching and cleanup','Paredes, protección, preparación, reparación menor y limpieza'),
    excluded: bi('Ceiling, trim, doors and large repairs','Techo, molduras, puertas y reparaciones mayores'),
    measurements: bi('12 × 10 × 8 ft; gross walls; no openings deducted','12 × 10 × 8 ft; paredes brutas; sin descontar aberturas'),
    preparation: bi('Protect, prepare and patch minor nail holes once','Proteger, preparar y reparar agujeros menores una vez'),
    product: bi(`${paint.brand} ${paint.product} ${paint.package}; ${patch.brand} ${patch.product} ${patch.package}`),
    finish: bi('Eggshell, Ultra Pure White','Eggshell, Ultra Pure White'),
    assumptions: bi('Two coats; 350 sf/gal; 10% waste; provisional productivity and consumables','Dos manos; 350 sf/gal; 10% desperdicio; productividad y consumibles provisionales'),
    provenance: bi('Seller-supplied dimensions; public catalog references and editable rule assumptions','Medidas del vendedor; referencias públicas y reglas editables'),
    confirmed: true, components: [bi('Interior wall painting materials','Materiales de pintura interior de paredes')],
  }] }

export class PaintProvider {
  constructor() { this.model = 'controlled-paint-fixture'; this.delay = 20 }
  async run(input) {
    await new Promise((resolve,reject) => { const timer = setTimeout(resolve,this.delay);input.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'))},{once:true}) })
    return { result: { message: input.mode === 'plan' ? 'Review the bedroom wall scope and editable assumptions.' : 'The rule engine calculates the painting job.',
      plan: input.mode === 'plan' ? structuredClone(paintPlan) : null, lines: [], changes: [] },
      metrics: { model: this.model, promptVersion: 'controlled-paint', durationMs: this.delay, usage: null, estimatedCostUsd: null } }
  }
}
