import { z } from 'zod'
export const text = z.string().max(2000)
export const bilingual = z.object({ en: text, es: text }).strict()
export const unit = z.enum(['ea','sf','lf','hr','day','cy','lot','gal','qt'])
export const taskSchema = z.object({
  id: z.string().min(1).max(80), room: bilingual, work: bilingual, components: z.array(bilingual).min(1).max(30),
  included: bilingual, excluded: bilingual, measurements: bilingual,
  preparation: bilingual, product: bilingual, finish: bilingual,
  assumptions: bilingual, provenance: bilingual, confirmed: z.boolean(),
}).strict()
export const planSchema = z.object({ title: bilingual, address: text, zip: z.string().max(20),
  tasks: z.array(taskSchema).min(1).max(40), pending: z.array(bilingual).max(20),
  assumptions: bilingual, markupBps: z.number().int().min(0).max(100000),
}).strict()
export const lineSchema = z.object({ id: z.string().min(1).max(80), taskId: z.string().min(1).max(80),
  description: bilingual, quantity: z.number().min(0).max(1000000), unit,
  unitCost: z.number().min(0).max(1000000), costType: z.enum(['material','labor','equipment','other']),
  markupBps: z.number().int().min(0).max(100000).nullable(),
  basis: bilingual, catalogId: z.string().max(80).nullable(),
}).strict()
export const outputSchema = z.object({ message: text, plan: planSchema.nullable(),
  lines: z.array(lineSchema).max(200), changes: z.array(z.object({
    action: z.enum(['add','replace','remove']), id: z.string().min(1).max(80), line: lineSchema.nullable(),
  }).strict()).max(200),
}).strict()
export const preferenceSchema = z.object({ id: z.string().uuid(), label: z.string().min(1).max(100), value: text, source: z.literal('explicit-user'), updatedAt: z.string().datetime() }).strict()
export const catalogSchema = z.object({ id: z.string().uuid(), product: z.string().min(1).max(200), brand: z.string().max(100),
  package: z.string().max(100), unit, unitCost: z.number().min(0).max(1000000), currency: z.literal('USD'),
  vendor: z.string().max(200), location: z.string().max(200), url: z.union([z.literal(''),z.string().url().max(1000)]),
  sku: z.string().max(100), checkedAt: z.string().date(), status: z.enum(['manual','provisional','verified']), evidence: text,
}).strict().refine(x => x.status !== 'verified' || (x.evidence && x.vendor && x.location && (x.url || x.sku)), 'Verification requires source evidence, vendor, location and URL/SKU')
export const settingsSchema = z.object({ preferences: z.array(preferenceSchema).max(40), catalog: z.array(catalogSchema).max(500),
  business: z.object({ name: z.string().max(120), address: text, phone: z.string().max(80), license: z.string().max(80) }).strict(),
  labor: z.object({ hourlyRate: z.number().min(0).max(10000), productivity: text }).strict(),
}).strict().refine(x => new Set(x.catalog.map(c=>c.id)).size === x.catalog.length && new Set(x.preferences.map(p=>p.id)).size === x.preferences.length, 'Duplicate catalog or preference ID')
export const defaultSettings = () => ({ preferences: [], catalog: [], business: { name: 'One Stop Building & Remodeling', address: '', phone: '', license: '' }, labor: { hourlyRate: 0, productivity: '' } })
const toolSchemas = {
  read_context: z.object({}).strict(), read_preferences: z.object({}).strict(), lookup_catalog: z.object({}).strict(),
  propose_plan: z.object({ message: text, plan: planSchema }).strict(),
  generate_lines: z.object({ message: text, lines: z.array(lineSchema).min(1).max(200) }).strict(),
  prepare_changes: z.object({ message: text, plan: planSchema.nullable(), changes: outputSchema.shape.changes }).strict(),
}
const toolDescriptions = {
  read_context: 'Read only the authorized conversation, approved plan and latest estimate.',
  read_preferences: 'Read explicit preferences with provenance. Current instructions override defaults.',
  lookup_catalog: 'Read the internal catalog. This does not query any external supplier.',
  propose_plan: 'Submit a reviewable plan. Allowed only in plan mode; creates no estimate. Ends this turn.',
  generate_lines: 'Submit proposed lines for the already approved plan, only in generate mode. Ends this turn; backend validates and commits.',
  prepare_changes: 'Submit a diff for explicit user review, only in change mode. Does not modify the estimate. Ends this turn.',
}
export const toolDefinitions = Object.entries(toolSchemas).map(([name, schema]) => {
  const parameters = z.toJSONSchema(schema, { target: 'draft-7' }); delete parameters.$schema
  return { type: 'function', name, description: toolDescriptions[name], strict: true, parameters }
})
export function validateTool(name, args, mode) {
  if (!Object.hasOwn(toolSchemas, name)) throw new Error('UNAUTHORIZED_TOOL')
  const requiredMode = { propose_plan: 'plan', generate_lines: 'generate', prepare_changes: 'change' }[name]
  if (requiredMode && requiredMode !== mode) throw new Error('UNAUTHORIZED_TOOL_STATE')
  return toolSchemas[name].parse(args)
}
export const toolOutputSchema = z.toJSONSchema(outputSchema, { target: 'draft-7' })
delete toolOutputSchema.$schema
