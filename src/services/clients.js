import { supabase } from '../supabaseClient.js'

const fields = 'id,name,phone,email,address,created_at,updated_at'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function getClients() {
  return unwrap(await supabase.from('clients').select(fields).order('name', { ascending: true }))
}

export async function createClient(data) {
  return unwrap(await supabase.from('clients').insert(data).select(fields).single())
}

export async function updateClient(id, data) {
  return unwrap(await supabase.from('clients').update(data).eq('id', id).select(fields).single())
}

export async function deleteClient(id) {
  unwrap(await supabase.from('clients').delete().eq('id', id).select('id').single())
}
