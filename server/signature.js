import sharp from 'sharp'
import { fail } from '../shared/aiDomain.js'

// Authorized business assets remain in owner-protected settings/document snapshots.
// Decode and re-encode raster images; never serve uploaded SVG or arbitrary URLs.
export async function normalizeSignature(value) {
  try {
    const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!match) throw Error()
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > 100000) throw Error()
    const input = sharp(bytes, { limitInputPixels: 2000000 })
    const metadata = await input.metadata()
    if (!['png', 'jpeg'].includes(metadata.format)) throw Error()
    const clean = await input.resize({ width: 1000, height: 400, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    if (clean.length > 100000) throw Error()
    return `data:image/png;base64,${clean.toString('base64')}`
  } catch { throw fail('INVALID_SIGNATURE') }
}
