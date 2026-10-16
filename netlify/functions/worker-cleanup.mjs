import { workersRuntime, progressBucket } from '../../server/workers.js'
// Every abandoned object has a reservation. Delete via Storage API, never SQL.
export default async function cleanup() {
  const db = workersRuntime()
  const { data, error } = await db
    .from('worker_evidence')
    .select('id,path')
    .neq('status', 'ready')
    .is('cleaned_at', null)
    .lt('created_at', new Date(Date.now() - 86400000).toISOString())
    .limit(100)
  if (error) return new Response('Cleanup unavailable', { status: 503 })
  for (const row of data) {
    const removed = await db.storage.from(progressBucket).remove([row.path])
    if (!removed.error)
      await db
        .from('worker_evidence')
        .update({ status: 'failed', cleaned_at: new Date().toISOString() })
        .eq('id', row.id)
        .neq('status', 'ready')
  }
  return new Response('Cleanup complete')
}
export const config = { schedule: '17 * * * *' }
