import { createEstimatorHandler } from '../../server/http.js'
import { createRuntime } from '../../server/runtime.js'

let handler
function getHandler() {
  if (!handler) {
    const { repo, provider } = createRuntime()
    handler = createEstimatorHandler({ repo, provider, runMode: 'deferred', dispatch: async ({ id, runId, request }) => {
      const destination = new URL('/.netlify/functions/ai-run', request.url)
      const response = await fetch(destination, {
        method: 'POST',
        headers: { Authorization: request.headers.get('authorization'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, runId }),
      })
      if (response.status !== 202) throw new Error('Background invocation failed')
    } }).handle
  }
  return handler
}

export default async function ai(request) {
  try { return await getHandler()(request) }
  catch { return Response.json({ error: 'API_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
