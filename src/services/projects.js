import { supabase } from '../supabaseClient.js'

const fields = 'id,client_id,name,address,stage,created_at,updated_at,client:clients!projects_client_id_fkey(id,name,email,phone)'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function getProjects() {
  return unwrap(await supabase.from('projects').select(fields).order('created_at', { ascending: false }))
}

export async function createProject(data) {
  return unwrap(await supabase.from('projects').insert(data).select(fields).single())
}

export async function updateProject(id, data) {
  return unwrap(await supabase.from('projects').update(data).eq('id', id).select(fields).single())
}

export async function deleteProject(id) {
  unwrap(await supabase.from('projects').delete().eq('id', id).select('id').single())
}
