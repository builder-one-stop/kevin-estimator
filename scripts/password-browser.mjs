import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { withFixture } from './browser-fixture.mjs'

const origin = process.env.AUTH_BROWSER_ORIGIN || 'http://localhost:5173'
if (!['http://localhost:5173', 'https://onestop-beta.netlify.app'].includes(origin)) throw new Error('Unexpected browser origin')
const output = origin.startsWith('https://') ? 'evidence/browser-validation/password-access-online.json' : 'evidence/browser-validation/password-access.json'
const result = { origin, project: 'vtpciccluvpaclbeqxih', checks: [], errors: [] }
let stage = 'Open temporary link'

try {
  await withFixture(async ({ tag, actionLink }) => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('os-lang', 'en'))
    const page = await context.newPage()
    const email = `${tag.toLowerCase()}@example.invalid`
    const password = `QATest-${crypto.randomUUID()}!`
    try {
      await page.goto(actionLink)
      await page.waitForURL(url => url.origin === origin, { timeout: 20000 })
      await page.waitForFunction(() => {
        const key = Object.keys(localStorage).find(name => name.startsWith('sb-') && name.endsWith('-auth-token'))
        return Boolean(key && JSON.parse(localStorage.getItem(key) || 'null')?.access_token)
      }, undefined, { timeout: 20000 })
      stage = 'Set password'
      await page.goto(`${origin}/account/password`)
      await expect(page.getByRole('heading', { name: 'Set or change password' })).toBeVisible({ timeout: 15000 })
      await page.getByLabel('New password').fill(password)
      await page.getByLabel('Confirm password').fill(password)
      await page.getByRole('button', { name: 'Save password' }).click()
      await expect(page.getByRole('status')).toContainText('Password saved', { timeout: 15000 })
      result.checks.push('An existing temporary magic-link user set a password in real Chrome')

      stage = 'Sign out'
      await page.locator('.company').click()
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await page.waitForFunction(() => {
        const key = Object.keys(localStorage).find(name => name.startsWith('sb-') && name.endsWith('-auth-token'))
        return !key || !JSON.parse(localStorage.getItem(key) || 'null')?.access_token
      }, undefined, { timeout: 15000 })
      await page.goto(origin)
      await expect(page.getByRole('heading', { name: 'Sign in to One Stop' })).toBeVisible({ timeout: 15000 })
      result.checks.push('Signed out through the application')

      stage = 'Sign in with password in Spanish'
      await page.getByRole('button', { name: 'Español' }).click()
      await expect(page.getByRole('heading', { name: 'Inicia sesión en One Stop' })).toBeVisible()
      await page.getByLabel('Correo electrónico').fill(email)
      await page.getByLabel('Contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Estimados recientes' })).toBeVisible({ timeout: 15000 })
      result.checks.push('The same account signed in with email/password and retained the Spanish interface')
    } catch (error) {
      result.failureDetail = String(error.message || '').split('\n')[0].replaceAll(email, '[test address]').replaceAll(password, '[test password]').slice(0, 240)
      await page.screenshot({ path: origin.startsWith('https://') ? 'evidence/browser-validation/password-online-failure.png' : 'evidence/browser-validation/password-failure.png', fullPage: true }).catch(() => {})
      throw error
    } finally { await browser.close() }
  }, { origin })
  result.cleanup = 'Temporary account and records deleted by fixture'
} catch (error) { result.errors.push(`${stage}: ${error.errors?.[0]?.name || error.name}`); process.exitCode = 1 }
finally {
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  console.info(JSON.stringify({ checks: result.checks.length, errors: result.errors, detail: result.failureDetail, cleanup: result.cleanup || 'see fixture cleanup' }))
}
