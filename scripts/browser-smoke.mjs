import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
 await mkdir('evidence/beta-access', { recursive: true })
 for (const path of ['/', '/chat', '/contacts', '/projects', '/estimates', '/admin/review', '/account/password']) {
   await page.goto(`http://localhost:5173${path}`)
   await expect(page.getByRole('heading', { name: 'Sign in to One Stop' })).toBeVisible()
   await expect(page.locator('.sidebar')).toHaveCount(0)
 }
 await expect(page.getByRole('link')).toHaveCount(0)
 await page.screenshot({ path: 'evidence/beta-access/login-local.png', fullPage: true })
 await page.getByRole('button', { name: 'Español' }).click()
 await expect(page.getByText('Contacta al administrador')).toBeVisible()
 await page.getByRole('button', { name: 'English' }).click()
 await page.route('**/auth/v1/token*', route => route.abort('failed'))
 await page.getByRole('textbox', { name: 'Email' }).fill('synthetic@example.invalid')
 await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
 await page.getByRole('button', { name: 'Sign in', exact: true }).click()
 await expect(page.getByRole('alert')).toBeVisible()
 await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
 console.info('PASS: standalone EN/ES password gate on all tested routes and visible request failure; no email or real authentication submitted')
} finally { await browser.close() }
