import { it, expect } from 'vitest'
import sharp from 'sharp'
import { validateEvidence, workerSchemas } from './workers.js'
it('rejects disguised photos and mismatched byte counts', async () => {
  await expect(validateEvidence(Buffer.from('pretend jpeg'), 'image/jpeg', 12)).rejects.toThrow('FILE_TYPE')
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } })
    .jpeg()
    .toBuffer()
  await expect(validateEvidence(jpeg, 'image/jpeg', jpeg.length)).resolves.toBeUndefined()
  await expect(validateEvidence(jpeg, 'image/png', jpeg.length)).rejects.toThrow('FILE_TYPE')
  await expect(validateEvidence(jpeg, 'image/jpeg', 1)).rejects.toThrow('FILE_SIZE')
})
it('rejects unknown fields, forged timestamps and unsupported media formats', () => {
  expect(
    workerSchemas.clock.safeParse({
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      kind: 'in',
      at: new Date().toISOString(),
    }).success,
  ).toBe(false)
  expect(
    workerSchemas.reserve.safeParse({
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      mime: 'image/heic',
      bytes: 100,
    }).success,
  ).toBe(false)
})
