import { createWorkersHandler, workersRuntime } from '../../server/workers.js'
let handler
export default async function workers(request) {
  try {
    handler ||= createWorkersHandler({ db: workersRuntime(), env: { ...process.env, APP_ORIGIN: '' } })
    return await handler(request)
  } catch {
    return Response.json(
      { error: 'SERVICE_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
