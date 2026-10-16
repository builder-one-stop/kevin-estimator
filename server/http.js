import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { EstimatorEngine } from './engine.js'
import { settingsSchema, defaultSettings } from '../shared/aiSchemas.js'
import { createWorkersHandler } from './workers.js'
import { normalizeSignature } from './signature.js'
import { fail } from '../shared/aiDomain.js'

const jsonHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json' }
const maxBodyBytes = 7400000

export function createEstimatorHandler({ repo, provider, origin, logger, testMode = false, requestsPerMinute = 40, runMode = 'inline', dispatch }) {
  const workers = repo.db ? createWorkersHandler({ db: repo.db, env: { ...process.env, ...(origin ? { APP_ORIGIN: origin } : {}) } }) : null
  const engine = new EstimatorEngine(repo, provider, { logger, runMode })
  const limits = new Map()
  async function handle(request) {
    try {
      if (new URL(request.url).pathname.startsWith('/api/workers') && workers) return await workers(request)
      const requestOrigin = new URL(request.url).origin
      if (request.headers.get('origin') && request.headers.get('origin') !== (origin || requestOrigin)) throw fail('ORIGIN_REJECTED', 403)
      const auth = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
      if (!auth) throw fail('UNAUTHORIZED', 401)
      const owner = await repo.authenticate(auth)
      const pathname = new URL(request.url).pathname
      const parts = pathname.replace(/^\/(?:api\/ai|\.netlify\/functions\/ai)\/?/, '').split('/').filter(Boolean)
      let body = {}
      if (request.method !== 'GET') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('JSON_REQUIRED', 415)
        if (Number(request.headers.get('content-length')) > maxBodyBytes) throw fail('BODY_TOO_LARGE', 413)
        const chunks = []; let size = 0
        for await (const chunk of request.body || []) { size += chunk.length; if (size > maxBodyBytes) throw fail('BODY_TOO_LARGE', 413); chunks.push(Buffer.from(chunk)) }
        try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { throw fail('INVALID_JSON') }
        const now = Date.now(); let rate = limits.get(owner)
        if (!rate || now - rate.start > 60000) { rate = { start: now, count: 0 }; limits.set(owner, rate) }
        if (++rate.count > requestsPerMinute) throw fail('RATE_LIMIT', 429)
        if (limits.size > 1000) for (const [key, value] of limits) if (now - value.start > 60000) limits.delete(key)
      }
      let data
      if (parts[0] === 'admin') {
        if (request.method !== 'GET') throw fail('READ_ONLY',405)
        if (parts[1] !== 'conversations' || parts.length > 3) throw fail('NOT_FOUND',404)
        if (parts[2]) z.string().uuid().parse(parts[2])
        data = await repo.review(owner,parts[2] || null)
      } else if (parts[0] === 'status' && request.method === 'GET') data = { mode: testMode ? 'controlled-test' : 'real', configured: !!provider.client || testMode }
      else if (parts[0] === 'settings') {
        if (request.method === 'GET') data = (await repo.settings(owner)) || { version: 0, data: defaultSettings() }
        else if (request.method === 'POST') { const x = z.object({ version: z.number().int().min(0), data: settingsSchema }).strict().parse(body); if(x.data.business.signatureImage)x.data.business.signatureImage=await normalizeSignature(x.data.business.signatureImage); data = await repo.saveSettings(owner, x.data, x.version) }
      } else if (parts[0] === 'conversations') {
        const id = parts[1]; if (id) z.string().uuid().parse(id)
        if (!id && request.method === 'GET') { await repo.expire(owner); data = await repo.list(owner) }
        else if (!id && request.method === 'POST') data = await engine.create(owner, body)
        else if (parts[2] === 'commands' && request.method === 'POST') data = await engine.command(owner, id, body, { dispatch: dispatch ? context => dispatch({ ...context, request }) : undefined })
        else if (parts[2] === 'assets') {
          const conversation = await repo.get(owner, id)
          if (request.method === 'GET') data = await repo.assets(owner, id)
          else if (request.method === 'POST') {
            if (conversation.state.run?.status === 'working') throw fail('RUN_BUSY', 409)
            const x = z.object({ data: z.string().max(7000000) }).strict().parse(body); const input = Buffer.from(x.data, 'base64')
            if (input.length > 4194304 || !input.length) throw fail('IMAGE_SIZE', 413)
            const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255; const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP'
            if (!png && !jpeg && !webp) throw fail('IMAGE_TYPE', 415)
            if ((await repo.assets(owner, id)).length >= 6) throw fail('IMAGE_LIMIT')
            let bytes; try { bytes = await sharp(input, { limitInputPixels: 16000000, animated: false }).rotate().jpeg({ quality: 88 }).toBuffer() } catch { throw fail('INVALID_IMAGE') }
            if (bytes.length > 4194304) throw fail('IMAGE_SIZE', 413)
            data = await repo.upload(owner, id, randomUUID(), bytes, 'image/jpeg')
          }
        } else if (parts[2] === 'revisions' && request.method === 'GET') { const row = await repo.get(owner, id); data = row.estimate_id ? await repo.revisions(owner, row.estimate_id) : [] }
        else if (parts[2] === 'estimate' && request.method === 'GET') { const row = await repo.get(owner, id); data = row.estimate_id ? await repo.estimate(owner, row.estimate_id) : null }
        else if (parts.length === 2 && request.method === 'GET') { await repo.expire(owner); data = await repo.get(owner, id) }
      } else if (parts[0] === 'assets' && parts[1]) {
        z.string().uuid().parse(parts[1])
        if (request.method === 'GET') { const image = await repo.image(owner, parts[1]); return new Response(image.bytes, { headers: { ...jsonHeaders, 'Content-Type': image.mime } }) }
        if (request.method === 'DELETE') { const asset = await repo.asset(owner, parts[1]); const row = await repo.get(owner, asset.conversation_id); if (row.state.run?.status === 'working') throw fail('RUN_BUSY', 409); await repo.deleteAsset(owner, parts[1]); data = { deleted: true } }
      }
      if (data === undefined) throw fail('NOT_FOUND', 404)
      return new Response(JSON.stringify(data), { headers: jsonHeaders })
    } catch (error) {
      const status = error.status || (error.name === 'ZodError' ? 400 : 500)
      return new Response(JSON.stringify({ error: error.code || (error.name === 'ZodError' ? 'INVALID_INPUT' : 'SERVER_ERROR') }), { status, headers: jsonHeaders })
    }
  }
  return { handle, engine }
}

export function createEstimatorServer(options) {
  const { handle, engine } = createEstimatorHandler(options)
  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host || 'localhost'}${req.url}`
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Readable.toWeb(req), duplex: 'half' }) })
      const response = await handle(request)
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'SERVER_ERROR' }))
    }
  })
  server.requestTimeout = 150000
  server.headersTimeout = 15000
  return { server, engine }
}
