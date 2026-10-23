import { supabase } from '../supabaseClient.js'
import { isProjectId } from '../lib/projectData.js'
import {localSalesEnabled,salesRequest} from './sales.js'

const fields = 'id,client_id,name,address,stage,created_at,updated_at,client:clients!projects_client_id_fkey(id,name,email,phone,address)'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function getProjects() {
  if(localSalesEnabled)return salesRequest('projects')
  return unwrap(await supabase.from('projects').select(fields).order('created_at', { ascending: false }))
}

export async function getRecentProjects(limit = 5) {
  if(localSalesEnabled)return (await getProjects()).slice(0,limit)
  return unwrap(await supabase.from('projects').select(fields).order('created_at', { ascending: false }).limit(limit))
}

export async function getProjectById(id) {
  if (!isProjectId(id)) return null
  if(localSalesEnabled)return (await getProjects()).find(p=>p.id===id)||null
  return unwrap(await supabase.from('projects').select(fields).eq('id', id).maybeSingle())
}

export async function createProject(data) {
  return unwrap(await supabase.from('projects').insert(data).select(fields).single())
}

export async function updateProject(id, data) {
  if(localSalesEnabled){if(Object.keys(data).some(k=>k!=='stage'))throw Error('Assignment and lead details require a manager.');await salesRequest('stage',{projectId:id,stage:data.stage});return getProjectById(id)}
  return unwrap(await supabase.from('projects').update(data).eq('id', id).select(fields).single())
}

export async function deleteProject(id) {
  unwrap(await supabase.from('projects').delete().eq('id', id).select('id').single())
}
