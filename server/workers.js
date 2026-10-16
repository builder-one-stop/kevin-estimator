import { createClient } from '@supabase/supabase-js'
import { hash } from 'bcryptjs'
import sharp from 'sharp'
import { z } from 'zod'

const uuid = z.string().uuid()
const kinds = z.enum(['in', 'break_start', 'break_end', 'out'])
const password = z
  .string()
  .min(6)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72)
const name = z.string().trim().min(1).max(120)
const reason = z.string().trim().min(3).max(1000)
export const entryLocationSchema = z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracy:z.number().finite().nonnegative(),capturedAt:z.string().datetime({offset:true}).transform(value=>new Date(value).toISOString())}).strict()
const correction = {
  shiftId: uuid,
  eventId: uuid.nullable(),
  kind: kinds.nullable(),
  at: z.string().datetime({ offset: true }),
  reason,
}
const effectiveEvents = z
  .array(z.object({ id: uuid, kind: kinds, at: z.string().datetime({ offset: true }) }).strict())
  .min(1)
  .max(100)
export const workerSchemas = {
  'admin-shift': z
    .object({ id: uuid, workerId: uuid, projectId: uuid, events: effectiveEvents, reason })
    .strict(),
  'admin-batch': z
    .object({ shiftId: uuid, version: z.number().int().positive(), events: effectiveEvents, reason })
    .strict(),
  create: z.object({ id: uuid, name, email: z.string().email().max(254), password }).strict(),
  update: z.object({ workerId: uuid, name, active: z.boolean(), projects: z.array(uuid).max(100) }).strict(),
  password: z.object({ workerId: uuid, password }).strict(),
  clock: z.object({ id: uuid, projectId: uuid, kind: kinds, closeBreak: z.boolean().optional(), location:entryLocationSchema.optional() }).strict().superRefine((x,ctx)=>{if(x.kind==='in'&&!x.location)ctx.addIssue({code:'custom',message:'LOCATION_REQUIRED'});if(x.kind!=='in'&&x.location)ctx.addIssue({code:'custom',message:'INVALID_LOCATION'})}),
  'notification-read':z.object({notificationId:uuid}).strict(),
  correction: z.object(correction).strict(),
  'admin-correction': z.object(correction).strict(),
  review: z.object({ correctionId: uuid, decision: z.enum(['approve', 'reject']), reason }).strict(),
  reserve: z
    .object({
      id: uuid,
      projectId: uuid,
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
      bytes: z.number().int().positive().max(26214400),
    })
    .strict(),
  finish: z.object({ evidenceId: uuid }).strict(),
  view: z.object({ evidenceId: uuid }).strict(),
}
const known =
  /^(ACCESS_DENIED|CONFLICT|ACCOUNT_EXISTS|PROVISION_PENDING|OPEN_SHIFT_RESOLUTION_REQUIRED|INVALID_INPUT|INVALID_SEQUENCE|INVALID_CHRONOLOGY|SHIFT_OVERLAP|SHIFT_ALREADY_OPEN|NO_OPEN_SHIFT|CONFIRM_BREAK_CLOSE|REASON_REQUIRED|INVALID_EVENT|UPLOAD_LIMIT|UPLOAD_EXPIRED|LOCATION_REQUIRED|INVALID_LOCATION|LOCATION_STALE)$/
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
export const progressBucket = 'worker-progress'

export async function validateEvidence(bytes, mime, expected) {
  if (bytes.length !== expected || bytes.length > (mime.startsWith('image/') ? 8388608 : 26214400))
    throw fail('FILE_SIZE')
  const signatures = {
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    'video/mp4':
      bytes.length > 24 &&
      bytes.toString('ascii', 4, 8) === 'ftyp' &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(bytes.toString('ascii', 8, 12)),
    'video/webm':
      bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
      bytes.subarray(0, 4096).includes(Buffer.from('webm')),
  }
  if (!signatures[mime]) throw fail('FILE_TYPE')
  if (mime === 'video/mp4') {
    let offset = 0
    const boxes = new Set()
    while (offset + 8 <= bytes.length) {
      let size = bytes.readUInt32BE(offset)
      const type = bytes.toString('ascii', offset + 4, offset + 8)
      let header = 8
      if (size === 1) {
        if (offset + 16 > bytes.length) throw fail('FILE_TYPE')
        const large = bytes.readBigUInt64BE(offset + 8)
        if (large > BigInt(bytes.length)) throw fail('FILE_TYPE')
        size = Number(large)
        header = 16
      }
      if (size === 0) size = bytes.length - offset
      if (size < header || offset + size > bytes.length) throw fail('FILE_TYPE')
      if (size > header) boxes.add(type)
      offset += size
    }
    if (offset !== bytes.length || !boxes.has('moov') || !boxes.has('mdat')) throw fail('FILE_TYPE')
  }
  if (
    mime === 'video/webm' &&
    (!bytes.includes(Buffer.from([0x16, 0x54, 0xae, 0x6b])) ||
      !bytes.includes(Buffer.from([0x1f, 0x43, 0xb6, 0x75])))
  )
    throw fail('FILE_TYPE')

  if (mime.startsWith('image/')) {
    try {
      await sharp(bytes, { limitInputPixels: 40000000, animated: false }).stats()
    } catch {
      throw fail('FILE_TYPE')
    }
  }
}

export function createWorkersHandler({ db, env = process.env }) {
  async function handle(request) {
    try {
      const url = new URL(request.url)
      if (request.headers.get('origin') && request.headers.get('origin') !== (env.APP_ORIGIN || url.origin))
        throw fail('ACCESS_DENIED', 403)
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
      if (!token) throw fail('UNAUTHORIZED', 401)
      const { data, error } = await db.auth.getUser(token)
      if (error || !data.user) throw fail('UNAUTHORIZED', 401)
      let claims
      try {
        claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      } catch {
        throw fail('UNAUTHORIZED', 401)
      }
      if (
        claims.sub !== data.user.id ||
        !claims.amr?.some((a) => a.method === 'password') ||
        !z.string().uuid().safeParse(claims.session_id).success
      )
        throw fail('ACCESS_DENIED', 403)
      const command = async (action, input = {}) => {
        const result = await db.rpc('workers_command', {
          p_actor: data.user.id,
          p_session: claims.session_id,
          p_action: action,
          p_input: input,
        })
        if (result.error) {
          if (result.error.message === 'INVALID_ACTION') throw fail('ACCESS_DENIED', 403)
          if (known.test(result.error.message))
            throw fail(result.error.message, result.error.message === 'ACCESS_DENIED' ? 403 : 409)
          if (['23505', '23514', '22P02', '23502'].includes(result.error.code))
            throw fail('INVALID_INPUT', 400)
          throw fail('SERVICE_UNAVAILABLE', 503)
        }
        return result.data
      }
      const action = url.pathname.replace(/^\/(?:api\/workers|\.netlify\/functions\/workers)\/?/, '')
      if(request.method==='GET'&&action==='notifications')return Response.json(await command('notifications'),{headers})
      if (request.method === 'GET' && !action) return Response.json(await command('dashboard'), { headers })
      if (request.method !== 'POST' || !workerSchemas[action]) throw fail('NOT_FOUND', 404)
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('INVALID_INPUT')
      let size = 0
      const chunks = []
      for await (const part of request.body || []) {
        size += part.length
        if (size > 16384) throw fail('INVALID_INPUT', 413)
        chunks.push(Buffer.from(part))
      }
      let body,raw
      try {
        raw=JSON.parse(Buffer.concat(chunks).toString());body = workerSchemas[action].parse(raw)
      } catch {
        throw fail(action==='clock'&&raw?.kind==='in'?(raw.location?'INVALID_LOCATION':'LOCATION_REQUIRED'):'INVALID_INPUT')
      }
      let result
      if (action === 'create') {
        const { password: initial, ...input } = body
        const worker = await command('reserve_worker', input)
        const lookup = await command('provision_lookup', { workerId: worker.id })
        if (!lookup.userId) {
          const created = await db.auth.admin.createUser({
            email: worker.email,
            password: initial,
            email_confirm: true,
            app_metadata: { workers_provision_id: worker.id },
          })
          if (created.error) {
            const recovered = await command('provision_lookup', { workerId: worker.id })
            if (!recovered.userId)
              throw fail(
                created.error.code === 'weak_password' ? 'PASSWORD_POLICY' : 'PROVISION_PENDING',
                409,
              )
          }
        }
        result = await command('activate_account', { workerId: worker.id })
      } else if (action === 'password') {
        // The existing Auth trigger intentionally rejects direct password updates.
        // Enforce the verified provider policy before hashing; never persist plaintext.
        if (body.password.length < Number(env.WORKER_PASSWORD_MIN_LENGTH || 6)) throw fail('PASSWORD_POLICY')
        result = await command('reset_password', {
          workerId: body.workerId,
          hash: await hash(body.password, 10),
        })
      } else if (action === 'reserve') {
        const max = body.mime.startsWith('image/')
          ? Number(env.WORKER_PHOTO_MAX_BYTES || 8388608)
          : Number(env.WORKER_VIDEO_MAX_BYTES || 26214400)
        if (body.bytes > max) throw fail('FILE_SIZE')
        result = await command('reserve_evidence', body)
      } else if (action === 'finish' || action === 'view') {
        const record = await command('get_evidence', body)
        if (action === 'finish' && record.status !== 'ready') {
          const download = await db.storage.from(progressBucket).download(record.path)
          if (download.error) throw fail('FILE_MISSING', 409)
          try {
            await validateEvidence(Buffer.from(await download.data.arrayBuffer()), record.mime, record.bytes)
          } catch (e) {
            const removed = await db.storage.from(progressBucket).remove([record.path])
            if (removed.error) throw fail('CLEANUP_PENDING', 503)
            await command('fail_evidence', body)
            throw e
          }
          result = await command('finish_evidence', body)
        } else if (action === 'finish') result = record
        else {
          if (record.status !== 'ready') throw fail('FILE_PENDING', 409)
          const signed = await db.storage.from(progressBucket).createSignedUrl(record.path, 60)
          if (signed.error) throw fail('FILE_MISSING', 409)
          result = { url: signed.data.signedUrl, expiresIn: 60, mime: record.mime }
        }
      } else
        result = await command(
          {
            'admin-shift': 'admin_shift',
            'admin-batch': 'admin_batch',
            'notification-read':'notification_read',
            update: 'update_worker',
            clock: 'clock',
            correction: 'request_correction',
            'admin-correction': 'admin_correction',
            review: 'review_correction',
          }[action],
          body,
        )
      return Response.json(result, { headers })
    } catch (error) {
      return Response.json(
        { error: error.code || 'SERVICE_UNAVAILABLE' },
        { status: error.status || 503, headers },
      )
    }
  }
  return handle
}
export function workersRuntime(env = process.env) {
  if (env.SUPABASE_URL !== 'https://vtpciccluvpaclbeqxih.supabase.co' || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw fail('SERVICE_UNAVAILABLE', 503)
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
