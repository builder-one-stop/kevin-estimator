import { supabase } from '../supabaseClient.js'
export async function workersApi(action = '', body) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('UNAUTHORIZED')
  const response = await fetch(`/api/workers/${action}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'SERVICE_UNAVAILABLE')
  return result
}
export async function uploadProgress(record, file, onProgress) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('UNAUTHORIZED')
  const url = import.meta.env.VITE_SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${url}/storage/v1/object/worker-progress/${record.path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Content-Type', record.mime)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('UPLOAD_FAILED'))
    xhr.onerror = () => reject(new Error('UPLOAD_FAILED'))
    xhr.ontimeout = xhr.onerror
    xhr.timeout = 180000
    xhr.send(file)
  })
}
