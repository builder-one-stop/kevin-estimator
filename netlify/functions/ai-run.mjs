import { z } from 'zod'
import { EstimatorEngine } from '../../server/engine.js'
import { createRuntime } from '../../server/runtime.js'

const payload = z.object({ conversationId: z.string().uuid(), runId: z.string().uuid() }).strict()

export default async function aiRun(request) {
  if (request.method !== 'POST') return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'ORIGIN_REJECTED' }, { status: 403 })
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  try {
    const { repo, provider } = createRuntime()
    const owner = await repo.authenticate(token)
    const { conversationId, runId } = payload.parse(await request.json())
    const engine = new EstimatorEngine(repo, provider, { runMode: 'deferred' })
    await engine.performQueued(owner, conversationId, runId)
    return new Response(null, { status: 204 })
  } catch { return Response.json({ error: 'RUN_UNAVAILABLE' }, { status: 503 }) }
}

export const config = { background: true }
