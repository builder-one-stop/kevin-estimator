import { z } from 'zod'
import {offerContextSchema} from './priceOffers.js'
import { conversionsSchema, roomsSchema } from './estimatingMarket.js'
import { defaultPaintTemplate } from './paintJob.js'
export const text = z.string().max(2000)
export const bilingual = z.object({ en: text, es: text }).strict()
export const unit = z.enum(['ea','sf','lf','hr','day','cy','lot','gal','qt'])
export const taskSchema = z.object({
  id: z.string().min(1).max(80), room: bilingual, work: bilingual, components: z.array(bilingual).min(1).max(30),
  included: bilingual, excluded: bilingual, measurements: bilingual,
  preparation: bilingual, product: bilingual, finish: bilingual,
  assumptions: bilingual, provenance: bilingual, confirmed: z.boolean(),
}).strict()
export const materialRequestSchema=z.object({taskId:z.string().max(80),role:z.enum(['paint','repair']),id:z.string().max(80).optional(),sku:z.string().max(100).optional(),model:z.string().max(100).optional(),variant:z.string().max(200).optional(),package:z.string().max(200).optional(),vendor:z.string().max(200).optional(),storeId:z.string().max(100).optional(),storeZip:z.string().regex(/^\d{5}$/).optional()}).strict()
export const materialEvidenceSchema=z.object({taskId:z.string().max(80),role:z.enum(['paint','repair']),id:z.string().nullable(),label:z.string().max(1000),unitCost:z.number().nonnegative().nullable(),unit:z.string(),checkedAt:z.string(),url:z.string(),status:z.string(),freshness:z.string(),reason:z.string().nullable()}).strict()
export const planSchema = z.object({ title: bilingual, address: text, zip: z.string().max(20),
  pricingContext:offerContextSchema.optional(),materialRequests:z.array(materialRequestSchema).max(80).optional(),materialEvidence:z.array(materialEvidenceSchema).max(80).optional(),
  tasks: z.array(taskSchema).min(1).max(40), pending: z.array(bilingual).max(20),
  assumptions: bilingual, markupBps: z.number().int().min(0).max(100000),
}).strict()
export const lineSchema = z.object({ id: z.string().min(1).max(80), taskId: z.string().min(1).max(80),
  description: bilingual, quantity: z.number().min(0).max(1000000).nullable(), unit,
  unitCost: z.number().min(0).max(1000000).nullable(), costType: z.enum(['material','labor','equipment','other']),
  markupBps: z.number().int().min(0).max(100000).nullable(),
  basis: bilingual, catalogId: z.string().max(80).nullable(),
}).strict()
export const outputSchema = z.object({ message: text, plan: planSchema.nullable(),
  lines: z.array(lineSchema).max(200), changes: z.array(z.object({
    action: z.enum(['add','replace','remove']), id: z.string().min(1).max(80), line: lineSchema.nullable(),
  }).strict()).max(200),
}).strict()
// Limit model questions without invalidating older or manually edited plans.
export const modelPlanSchema = planSchema.omit({pricingContext:true,materialRequests:true,materialEvidence:true}).extend({ pending: z.array(bilingual).max(2) })
export const modelOutputSchema = outputSchema.extend({ plan: modelPlanSchema.nullable() })
export function parseModelResult(value) {
  // Model output may echo a context plan; derived catalog evidence is server-owned.
  const input=structuredClone(value)
  if(input.plan)for(const key of ['pricingContext','materialRequests','materialEvidence'])delete input.plan[key]
  const result = modelOutputSchema.parse(input)
  const count = s => (s.match(/\?/g) || []).length
  if (count(result.message) > 2 || ['en','es'].some(lang => (result.plan?.pending || []).reduce((n,q) => n + count(q[lang]), 0) > 2)) {
    throw Object.assign(new Error('MODEL_TOO_MANY_QUESTIONS'), { code: 'MODEL_TOO_MANY_QUESTIONS' })
  }
  return result
}
export const preferenceSchema = z.object({ id: z.string().uuid(), label: z.string().min(1).max(100), value: text, source: z.literal('explicit-user'), updatedAt: z.string().datetime() }).strict()
export const procurementSchema=z.object({taxUsd:z.number().finite().nonnegative().nullable(),freightUsd:z.number().finite().nonnegative().nullable(),stockQuantity:z.number().finite().nonnegative().nullable()}).strict()
export const catalogSchema = z.object({ id: z.string().uuid(), product: z.string().min(1).max(200), brand: z.string().max(100),
  package: z.string().max(100), unit, unitCost: z.number().min(0).max(1000000).nullable(), currency: z.literal('USD'),
  vendor: z.string().max(200), location: z.string().max(200), url: z.union([z.literal(''),z.string().url().max(1000)]),
  sku: z.string().max(100), checkedAt: z.string().date(), status: z.enum(['manual','provisional','public_observed','quote_required','verified']), evidence: text,
  sourceId: z.string().max(80).optional(), sourceVersion: z.string().max(80).optional(), sourceUrl: z.string().url().max(1000).optional(),
  verifiedZip: z.string().regex(/^\d{5}$/).nullable().optional(), validUntil: z.string().date().nullable().optional(),
  localPriceEvidence: text.optional(), model: z.string().max(100).optional(),
  variant:z.string().max(200).optional(),offer:offerContextSchema.optional(),evidenceKind:z.enum(['authorized-quote','public-web','manual']).optional(),procurement:procurementSchema.optional(),
  country: z.string().max(2).optional(), region: z.string().max(2).optional(), city: z.string().max(100).optional(),
  priceVersion: z.number().int().min(1).optional(),
  priceHistory: z.array(z.object({ version: z.number().int().min(1), product: z.string(), brand: z.string(), package: z.string(),
    unit, vendor: z.string(), location: z.string(), url: z.string(), sku: z.string(),
    unitCost: z.number().min(0).max(1000000).nullable(),
    status: z.string().max(40), checkedAt: z.string().date(), validUntil: z.string().date().nullable(),
    verifiedZip: z.string().nullable(), evidence: text, localPriceEvidence: text,
    country:z.string().optional(),region:z.string().optional(),city:z.string().optional(),model:z.string().optional(),
    variant:z.string().max(200).optional(),offer:offerContextSchema.optional(),evidenceKind:z.string().optional(),procurement:procurementSchema.optional() }).strict()).max(100).optional(),
}).strict().refine(x => x.status !== 'verified' || (x.unitCost !== null && x.verifiedZip && x.localPriceEvidence && x.vendor && x.location && x.url), 'Local verification requires product, exact ZIP and product/branch evidence')
  .refine(x => x.status !== 'public_observed' || x.unitCost !== null, 'An observed price requires a value')
  .refine(x => x.status !== 'quote_required' || x.unitCost === null, 'A quote-required record has no observed price')
export const paintTemplateSchema = z.object({
  coats: z.number().positive().max(10), coverageSqFtPerGallon: z.number().positive().max(10000), wastePercent: z.number().min(0).max(100), patchCount: z.number().int().min(0).max(1000),
  paintCatalogId: z.string().uuid().nullable(), repairCatalogId: z.string().uuid().nullable(),
  hourlyRate: z.number().min(0).max(10000), expensesPercent: z.number().min(0).max(100), marginPercent: z.number().min(0).max(90),
  productivity: z.object({ protection: z.number().positive(), preparation: z.number().positive(), repair: z.number().positive(), painting: z.number().positive(), cleanup: z.number().positive() }).strict(),
  consumablesUsdPerSqFt: z.object({ protection: z.number().min(0), preparation: z.number().min(0), cleanup: z.number().min(0) }).strict(),
}).strict()
export const settingsSchema = z.object({ preferences: z.array(preferenceSchema).max(40), catalog: z.array(catalogSchema).max(500), paintTemplate: paintTemplateSchema.optional(),
  business: z.object({ name: z.string().max(120), address: text, phone: z.string().max(80), license: z.string().max(80), signerName: z.string().max(120).optional(), signerTitle: z.string().max(120).optional(), signatureImage: z.string().max(140000).regex(/^(?:data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2})?$/).optional() }).strict(),
  labor: z.object({ hourlyRate: z.number().min(0).max(10000), productivity: text }).strict(),
}).strict().refine(x => new Set(x.catalog.map(c=>c.id)).size === x.catalog.length && new Set(x.preferences.map(p=>p.id)).size === x.preferences.length, 'Duplicate catalog or preference ID')
export const defaultSettings = () => ({ preferences: [], catalog: [], paintTemplate: defaultPaintTemplate(), business: { name: 'One Stop Building & Remodeling', address: '', phone: '', license: '' }, labor: { hourlyRate: 0, productivity: '' } })
const toolSchemas = {
  calculate_rooms: roomsSchema, convert_measurements: conversionsSchema,
  read_context: z.object({}).strict(), read_preferences: z.object({}).strict(), lookup_catalog: z.object({}).strict(),
  propose_plan: z.object({ message: text, plan: modelPlanSchema }).strict(),
  generate_lines: z.object({ message: text, lines: z.array(lineSchema).min(1).max(200) }).strict(),
  prepare_changes: z.object({ message: text, plan: modelPlanSchema.nullable(), changes: outputSchema.shape.changes }).strict(),
}
const toolDescriptions = {
  calculate_rooms: 'Calculate rectangular room floor and wall areas from supplied dimensions. Batch rooms in one call. Height null if unknown; never invent it. Openings must be supplied measurements, otherwise zero with a visible gross-area assumption. useGrossWalls true preserves the full wall surface even if openings exist. No coats or waste applied. Results do not verify input dimensions.',
  convert_measurements: 'Convert supplied measures: length ft/in/m/cm/mm, area sf/m2, volume cy/m3, US gallons gal/litres l. Only conversions within the same dimension are valid; batch measures in one call.',
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
export const toolOutputSchema = z.toJSONSchema(modelOutputSchema, { target: 'draft-7' })
delete toolOutputSchema.$schema
