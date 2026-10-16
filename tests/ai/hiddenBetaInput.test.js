import { chromium } from '@playwright/test'
import { request } from 'node:http'
import { createConnection } from 'node:net'
import { describe, expect, it } from 'vitest'
import { hiddenInput } from '../../scripts/hidden-beta-input.mjs'

const fields = [
  { name: 'password', label: 'Synthetic password', minimum: 8, maximumBytes: 72 },
  { name: 'confirmation', label: 'Synthetic confirmation', minimum: 8, maximumBytes: 72, confirmOf: 'password' },
]

async function fixture() {
  let server
  let ready
  const started = new Promise(resolve => { ready = resolve })
  const received = hiddenInput(fields, { port: 0, onReady(origin, listener) { server = listener; ready(origin) } })
  const origin = await started
  return { origin, received, close: () => { server.closeAllConnections(); server.close() } }
}

describe('loopback password input', () => {
  it('finishes after submission even when the browser retains an unused preconnection', async () => {
    const f = await fixture()
    const idle = createConnection({ host: '127.0.0.1', port: Number(new URL(f.origin).port) })
    try {
      await new Promise((resolve, reject) => { idle.once('connect', resolve); idle.once('error', reject) })
      const html = await (await fetch(f.origin)).text()
      const nonce = html.match(/name="nonce" value="([^"]+)"/)[1]
      const response = await fetch(`${f.origin}/submit`, {
        method: 'POST', headers: { Origin: f.origin },
        body: new URLSearchParams({ nonce, password: 'Synthetic-only', confirmation: 'Synthetic-only' }),
      })
      expect(await response.text()).toContain('Entrada recibida.')
      expect(await f.received).toEqual({ password: 'Synthetic-only', confirmation: 'Synthetic-only' })
    } finally { idle.destroy(); f.close() }
  })
  it('keeps strict origin, host, nonce, confirmation and body-size checks', async () => {
    const f = await fixture()
    try {
      const form = await fetch(f.origin)
      expect(form.headers.get('referrer-policy')).toBe('same-origin')
      expect(form.headers.get('cache-control')).toBe('no-store')
      expect(form.headers.get('content-security-policy')).toContain("form-action 'self'")
      const nonce = (await form.text()).match(/name="nonce" value="([^"]+)"/)[1]
      const values = { nonce, password: 'Synthetic-only', confirmation: 'Synthetic-only' }
      const submit = (headers = {}, changes = {}) => fetch(`${f.origin}/submit`, {
        method: 'POST', headers: { Origin: f.origin, ...headers }, body: new URLSearchParams({ ...values, ...changes }),
      })
      for (const Origin of ['null', 'https://outside.example', `${f.origin}.outside.example`]) {
        expect((await submit({ Origin })).status).toBe(403)
      }
      const wrongHostStatus = await new Promise((resolve, reject) => {
        const req = request(`${f.origin}/submit`, { method: 'POST', headers: { Host: 'outside.example', Origin: f.origin } }, response => {
          response.resume(); resolve(response.statusCode)
        })
        req.on('error', reject)
        req.end(new URLSearchParams(values).toString())
      })
      expect(wrongHostStatus).toBe(403)
      expect((await fetch(`${f.origin}/submit`, { method: 'POST', body: new URLSearchParams(values) })).status).toBe(403)
      expect((await submit({}, { nonce: 'wrong' })).status).toBe(400)
      expect((await submit({}, { confirmation: 'Mismatch-only' })).status).toBe(400)
      expect((await submit({}, { password: 'x'.repeat(4097) })).status).toBe(413)
      expect((await submit()).status).toBe(200)
      expect(await f.received).toEqual({ password: 'Synthetic-only', confirmation: 'Synthetic-only' })
      await expect(fetch(f.origin)).rejects.toThrow()
    } finally { f.close() }
  })

  it('accepts an actual Chrome form POST without relaxing origin checks', async () => {
    const f = await fixture()
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(f.origin)
      await page.getByLabel('Synthetic password', { exact: true }).fill('Synthetic-only')
      await page.getByLabel('Synthetic confirmation', { exact: true }).fill('Synthetic-only')
      const submitted = page.waitForResponse(response => response.url() === `${f.origin}/submit`)
      await page.getByRole('button', { name: 'Continuar' }).click()
      const response = await submitted
      expect(response.status()).toBe(200)
      expect(response.request().headers().origin).toBe(f.origin)
      await page.getByText('Entrada recibida.', { exact: false }).waitFor()
      expect(await f.received).toEqual({ password: 'Synthetic-only', confirmation: 'Synthetic-only' })
    } finally { await browser.close(); f.close() }
  }, 15000)
})
