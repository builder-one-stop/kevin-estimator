import { reconcileEstimateExpenses } from '../../shared/estimateReconciliation.js'
import { supabase } from '../supabaseClient.js'
import {localSalesEnabled,salesRequest} from './sales.js'
import { duplicateDocument, emptyDocument, validateEstimate } from '../lib/estimateDocument.js'

const fields = 'id,owner_id,client_id,project_id,title,status,markup_bps,document,version,finalized_at,finalized_version,finalization_request_id,created_at,updated_at,client:clients!estimates_client_id_fkey(id,name,address,email,phone),project:projects!estimates_project_id_fkey(id,name,address,client_id)'
const unwrap = ({ data, error }) => { if (error) throw error; return data }

export async function listEstimates({ limit, projectId } = {}) {
  if(localSalesEnabled&&projectId)return salesRequest('documents',{projectId})
  let query = supabase.from('estimates').select(fields).order('updated_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  if (limit) query = query.limit(limit)
  return unwrap(await query)
}

export async function getEstimate(id) {
  if(localSalesEnabled){const row=await salesRequest('document',{id});if(row.sales_snapshot)row.project={name:row.sales_snapshot.name,address:row.sales_snapshot.address};return row}
  return unwrap(await supabase.from('estimates').select(fields).eq('id', id).maybeSingle())
}

export async function createEstimate({ project = null, title = 'Untitled estimate', clientId = null } = {}) {
  if(localSalesEnabled&&project)return salesRequest('create-document',{projectId:project.id,id:crypto.randomUUID(),title})
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('Sign in to create an estimate.')
  const data = { owner_id: user.id, title, project_id: project?.id ?? null, client_id: project?.client_id ?? clientId, document: emptyDocument() }
  return unwrap(await supabase.from('estimates').insert(data).select(fields).single())
}

export async function saveEstimate(record, patch) {
  patch = { ...patch,document:reconcileEstimateExpenses(patch.document ?? record.document) }
  const markupBps = patch.markup_bps ?? record.markup_bps
  const document = patch.document ?? record.document
  const validation = validateEstimate(document, markupBps)
  if (validation) throw new Error(validation)
  const saved = unwrap(await supabase.from('estimates').update(patch).eq('id', record.id).eq('version', record.version).select(fields).maybeSingle())
  if (!saved) {
    const conflict = new Error('This estimate changed elsewhere. Your local draft is preserved.')
    conflict.code = 'ESTIMATE_CONFLICT'
    throw conflict
  }
  return saved
}

export async function deleteEstimate(id) {
  unwrap(await supabase.from('estimates').delete().eq('id', id).select('id').single())
}

export async function duplicateEstimate(record) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('Sign in to duplicate an estimate.')
  return unwrap(await supabase.from('estimates').insert({
    owner_id: user.id, title: `${record.title} (copy)`, status: 'Draft', client_id: record.client_id,
    project_id: record.project_id, markup_bps: record.markup_bps, document: duplicateDocument(record.document),
  }).select(fields).single())
}

export async function listMessages(estimateId) {
  return unwrap(await supabase.from('estimate_messages').select('id,role,content,operations,created_at').eq('estimate_id', estimateId).order('created_at'))
}

export async function finalizeEstimate(record, requestId) {
  const { data, error } = await supabase.rpc('finalize_estimate', { p_id: record.id, p_expected: record.version, p_request_id: requestId }).single()
  if (error) { if (error.message?.includes('ESTIMATE_CONFLICT')) error.code = 'ESTIMATE_CONFLICT'; throw error }
  return data
}
