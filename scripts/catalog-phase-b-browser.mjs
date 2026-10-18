import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { startHarness } from './ai-local-harness.mjs'
import { B } from '../tests/ai/localRepository.js'
import { calculateEstimate, proposalPrices } from '../src/lib/estimateDocument.js'

const h = await startHarness()
const out = 'evidence/catalog-phase-b'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
const report = { environment: 'Local Chrome, migrated PGlite, controlled AI fixture; no real AI or supplier access', checks: [], errors: [] }
page.on('pageerror', error => report.errors.push(error.message))
const check = value => { report.checks.push(value); console.info(value) }
const send = async value => {
  await page.getByRole('textbox', { name: 'Describe the work or request a change' }).fill(value)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}
try {
  await page.goto(h.url + '/__fixture/session')
  await page.getByRole('button', { name: 'Enter test workspace' }).click()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const chatUrl = page.url()
  await send('Paint walls of a 12 × 10 × 8 ft bedroom and repair minor nail holes.')
  await expect(page.getByRole('button', { name: 'Approve this revision' })).toBeDisabled()
  await send('Confirm the height assumption and wall-only scope.')
  await expect(page.getByRole('button', { name: 'Approve this revision' })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Approve this revision' }).click()
  await page.getByRole('button', { name: 'Generate estimate', exact: true }).click()
  const document = page.getByTestId('complete-estimate')
  await expect(document).toBeVisible({ timeout: 20000 })
  const conversationId = chatUrl.split('/').at(-1)
  const conversation = await h.repo.get(h.user, conversationId)
  const record = () => h.repo.estimate(h.user, conversation.estimate_id)
  await page.getByRole('button', { name: 'Edit document', exact: true }).click()
  await page.getByLabel('Item details', { exact: true }).first().click()
  const catalog = page.getByRole('combobox', { name: 'Catalog product and price' })
  await expect(catalog.locator('option')).toHaveCount(21)
  await catalog.selectOption('00000000-0000-4000-8000-000000000001')
  await expect(page.getByLabel('Unit cost', { exact: true }).first()).toHaveValue('46.98')
  await expect(page.locator('.estimate-item-detail').first()).toContainText('public_observed')
  check('Public catalog price selected in chat with public, nonlocal provenance')

  await page.getByLabel('Area (sf)').fill('352')
  await page.getByLabel('Coats').fill('2')
  await page.getByLabel('Coverage (sf/gal)').fill('350')
  await page.getByLabel('Waste (%)').fill('0')
  await page.getByRole('button', { name: 'Calculate packages' }).click()
  await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue('3')
  const firstSection = page.locator('.estimate-section').first()
  await firstSection.getByRole('button', { name: 'Add item', exact: true }).click()
  await firstSection.getByLabel('Item details', { exact: true }).last().click()
  await page.getByRole('combobox', { name: 'Catalog product and price' }).selectOption('00000000-0000-4000-8000-000000000003')
  await expect(firstSection.getByLabel('Unit cost', { exact: true }).last()).toHaveValue('11.48')
  await expect(page.locator('.estimate-save')).toHaveText('Saved', { timeout: 10000 })
  const saved = await record()
  const line = saved.document.sections[0].items[0]
  const repair = saved.document.sections[0].items.at(-1)
  expect(line).toMatchObject({ quantity: 3, unitCost: 46.98, catalogId: '00000000-0000-4000-8000-000000000001', price: { status: 'public_observed', sourceId: 'HD01' } })
  expect(repair).toMatchObject({ quantity: 1, unit: 'ea', unitCost: 11.48, price: { status: 'public_observed', sourceId: 'HD03' } })
  check('352 sf, two coats and stated 350 sf/gal assumption calculate three purchased gallons; minor patch uses one priced container')

  await page.reload()
  await page.getByRole('button', { name: 'Edit document', exact: true }).click()
  await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue('3')
  await page.getByLabel('Item details', { exact: true }).first().click()
  await expect(page.getByRole('combobox', { name: 'Catalog product and price' })).toHaveValue(line.catalogId)
  await page.getByLabel('Unit cost', { exact: true }).first().fill('49')
  await expect(page.locator('.estimate-item-detail').first()).toContainText('Manual entry')
  await expect(page.locator('.estimate-save')).toHaveText('Saved', { timeout: 10000 })
  expect((await record()).document.sections[0].items[0]).toMatchObject({ catalogId: null, price: { status: 'manual' } })
  await page.getByRole('combobox', { name: 'Catalog product and price' }).selectOption(line.catalogId)
  await expect(page.getByLabel('Unit cost', { exact: true }).first()).toHaveValue('46.98')
  await expect(page.locator('.estimate-save')).toHaveText('Saved', { timeout: 10000 })
  check('Reload, manual override and repeated catalog reselection persist with correct provenance')

  await page.getByRole('button', { name: 'Review document', exact: true }).click()
  await expect(document).toContainText('public online price; branch/ZIP unverified')
  await page.getByRole('link', { name: 'Open estimate', exact: true }).click()
  await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue('3')
  await page.goBack()
  await expect(document).toBeVisible()
  await page.goForward()
  await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue('3')
  check('Chat, saved estimate, proposal preview, and browser back/forward retain one price snapshot')

  await page.locator('.estimate-tabs button').nth(1).click()
  await expect(page.locator('.ai-proposal')).toContainText('public online price; branch/ZIP unverified')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).last().click()
  await (await download).saveAs(out + '/proposal.pdf')
  const pdfRecord = await record()
  await writeFile(out + '/saved-estimate.json', JSON.stringify(pdfRecord, null, 2))
  report.savedTotals = calculateEstimate(pdfRecord.document, pdfRecord.markup_bps)
  report.paintSaleCents = proposalPrices(pdfRecord.document, pdfRecord.markup_bps).get(line.id)
  report.repairSaleCents = proposalPrices(pdfRecord.document, pdfRecord.markup_bps).get(repair.id)
  check('Actual saved proposal PDF downloaded after proposal preview')
  await page.getByRole('combobox', { name: 'Document language', exact: true }).first().selectOption('es')
  await expect(page.locator('.estimate-save')).toHaveText('Saved', { timeout: 10000 })
  await expect(page.locator('.ai-proposal')).toContainText('precio público online; sucursal/ZIP no verificados')
  const spanishDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).last().click()
  await (await spanishDownload).saveAs(out + '/propuesta-es.pdf')
  check('Spanish proposal and PDF translate price provenance while preserving the saved numeric line')

  await page.goto(chatUrl)
  await send('Change the bedroom paint quantity')
  const cancel = page.getByRole('button', { name: 'Cancel run', exact: true })
  if (await cancel.isVisible()) await cancel.click()
  await expect(page.getByTestId('complete-estimate')).toBeVisible()
  check('Cancellation keeps the saved estimate')
  await page.getByRole('combobox', { name: 'Interface language', exact: true }).selectOption('es')
  await expect(page.getByTestId('complete-estimate')).toContainText('precio público online; sucursal/ZIP no verificados')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await page.getByTestId('complete-estimate').locator('header').first().scrollIntoViewIfNeeded()
  report.phoneGeometry = await page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector)
      const box = element?.getBoundingClientRect()
      return box ? { left: box.left, right: box.right, width: box.width, scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } : null
    }
    return { scrollX, body: rect('body'), sidebar: rect('.sidebar'), main: rect('.main'), thread: rect('.ai-thread'), document: rect('.estimate-document') }
  })
  console.info('Phone geometry', JSON.stringify(report.phoneGeometry))
  await page.screenshot({ path: out + '/phone-top.png' })
  await page.getByTestId('complete-estimate').locator('.document-totals').scrollIntoViewIfNeeded()
  await page.screenshot({ path: out + '/phone.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: out + '/desktop.png', fullPage: true })
  check('390px phone and desktop render without page-level horizontal overflow')

  await page.getByRole('combobox', { name: 'Idioma de la interfaz', exact: true }).selectOption('en')
  await page.goto(h.url + '/chat/settings')
  await expect(page.getByText('25 research references')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import research for review' })).toHaveCount(0)
  const operatorCatalogWrite = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('sb-127-auth-token')).access_token
    const settings = await (await fetch('/api/ai/settings', { headers: { Authorization: `Bearer ${token}` } })).json()
    const data = { ...settings.data, catalog: [{ id: crypto.randomUUID(), product:'Forbidden edit', brand:'Test', package:'1 ea',
      unit:'ea', unitCost:1, currency:'USD', vendor:'Fixture', location:'', url:'', sku:'', checkedAt:'2026-10-17', status:'manual', evidence:'' }] }
    return (await fetch('/api/ai/settings', { method:'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ version:settings.version, data }) })).status
  })
  expect(operatorCatalogWrite).toBe(403)
  check('Operator reads research but cannot import or update managed catalog')
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await admin.addInitScript(({ id }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'fixture-b', refresh_token: 'fixture-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
      user: { id, email: 'admin-fixture@example.invalid', aud: 'authenticated', role: 'authenticated' } }))
    localStorage.setItem('os-lang', 'en')
  }, { id: B })
  const adminPage = await admin.newPage()
  await adminPage.goto(h.url + '/chat/settings')
  await adminPage.getByRole('button', { name: 'Import research for review' }).click()
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(adminPage.getByRole('status')).toContainText('Saved')
  await adminPage.reload()
  await expect(adminPage.locator('fieldset summary')).toHaveCount(25)
  await adminPage.locator('fieldset summary').first().click()
  await adminPage.locator('fieldset details').first().locator('input[type=number]').fill('47.98')
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(adminPage.getByRole('status')).toContainText('Saved')
  await adminPage.reload()
  await expect(adminPage.locator('fieldset summary').first()).toContainText('v2')
  const adminCatalog = (await h.repo.settings(B)).data.catalog
  expect(adminCatalog[0]).toMatchObject({ priceVersion:2, unitCost:47.98, priceHistory:[{version:1,unitCost:46.98}] })
  await admin.close()
  check('Admin imports 25 records, updates a price, and reloads version 2 with the original price retained in history')
  expect(report.errors).toEqual([])
} catch (error) {
  report.failure = error.message
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2))
  await browser.close()
  await h.close()
}
