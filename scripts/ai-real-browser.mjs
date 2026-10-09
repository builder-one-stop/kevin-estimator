import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { withFixture } from './browser-fixture.mjs'
import { calculateEstimate } from '../src/lib/estimateDocument.js'

const origin = 'http://localhost:5173'
const output = 'evidence/ai-estimator-live'
const report = { origin, provider: 'real OpenAI Responses API', checks: [], errors: [] }
await mkdir(output, { recursive: true })

async function readConversation(page, id) {
  return page.evaluate(async (conversationId) => {
    const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
    const token = storageKey && JSON.parse(localStorage.getItem(storageKey) || 'null')?.access_token
    if (!token) throw new Error('No authenticated browser session')
    const response = await fetch(`/api/ai/conversations/${conversationId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Conversation request failed: ${response.status}`)
    return response.json()
  }, id)
}

async function readEstimate(page, id) {
  return page.evaluate(async (conversationId) => {
    const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
    const token = storageKey && JSON.parse(localStorage.getItem(storageKey) || 'null')?.access_token
    if (!token) throw new Error('No authenticated browser session')
    const response = await fetch(`/api/ai/conversations/${conversationId}/estimate`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Estimate request failed: ${response.status}`)
    return response.json()
  }, id)
}

async function waitForRun(page, id, previousRunId = null) {
  const deadline = Date.now() + 145000
  while (Date.now() < deadline) {
    const row = await readConversation(page, id)
    if (!row.state.run || row.state.run.id === previousRunId) {
      await page.waitForTimeout(2000)
      continue
    }
    if (row.state.run?.status === 'ready') return row
    if (row.state.run?.status === 'error') throw new Error(`Model run failed: ${row.state.run.error}`)
    await page.waitForTimeout(2000)
  }
  throw new Error('Model run did not finish within the app deadline')
}

try {
  await withFixture(async ({ actionLink }) => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => localStorage.setItem('os-lang', 'en'))
    const page = await context.newPage()
    page.on('pageerror', error => report.errors.push(error.name))
    let conversationId = null
    let stage = 'Open sign-in link'
    try {
      await page.goto(actionLink)
      await page.waitForURL(url => url.origin === origin, { timeout: 20000 })
      await page.waitForFunction(() => {
        const key = Object.keys(localStorage).find(name => name.startsWith('sb-') && name.endsWith('-auth-token'))
        return Boolean(key && JSON.parse(localStorage.getItem(key) || 'null')?.access_token)
      }, undefined, { timeout: 20000 })
      stage = 'Load authenticated conversation history'
      await page.goto(`${origin}/chat`)
      await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible({ timeout: 20000 })
      report.checks.push('Temporary account authenticated in real Chrome at localhost:5173; no email delivered')

      await page.getByRole('button', { name: 'New conversation' }).click()
      await expect(page.getByRole('heading', { name: 'New conversation' })).toBeVisible()
      const id = page.url().split('/').at(-1)
      conversationId = id
      stage = 'Verify real provider configuration'
      const status = await page.evaluate(async () => {
        const key = Object.keys(localStorage).find(name => name.startsWith('sb-') && name.endsWith('-auth-token'))
        const token = key && JSON.parse(localStorage.getItem(key) || 'null')?.access_token
        const response = await fetch('/api/ai/status', { headers: { Authorization: `Bearer ${token}` } })
        return response.json()
      })
      if (status.mode !== 'real' || !status.configured) throw new Error('Real provider is not configured')
      const input = page.getByRole('textbox', { name: 'Describe the work or request a change' })
      stage = 'Run real hello'
      await input.fill('hola')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      const hello = await waitForRun(page, id)
      const answer = hello.state.messages.at(-1)
      if (answer?.role !== 'assistant' || !answer.content?.trim()) throw new Error('Real AI did not answer hola')
      await expect(page.locator('.ai-message.assistant').last()).not.toBeEmpty()
      await expect(page.getByText('LOCAL VALIDATION — controlled provider')).toHaveCount(0)
      report.checks.push('Real model answered “hola” through the browser and persisted its response')
      report.hello = hello.state.run.metrics
      await page.screenshot({ path: `${output}/hello.png`, fullPage: true })

      stage = 'Build and approve real plan'
      await input.fill('Test estimate: paint walls only in one 10 ft by 12 ft bedroom with 8 ft wall height. Exclude ceiling, trim, and doors. Apply two coats. Patch small nail holes and spot-prime only the patches; no full-surface primer. Use these user-provided provisional quantities and costs: wall paint 2 GAL at $65/GAL, preparation 1 LS at $25, labor 3 HR at $75/HR. Markup 36% on cost. No tax, shipping, or discount. Job ZIP 90001. Brand is unspecified: mark the paint provisional and do not claim supplier verification. Client is pending. Include the quantities, preparation, exclusions, assumptions, and approved line descriptions in an editable plan. All material facts needed to quote this test are provided.')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      let planRow = await waitForRun(page, id, hello.state.run.id)
      report.planAttempts = []
      const recordPlan = row => report.planAttempts.push({taskCount:row.state.plan?.tasks.length || 0,pending:row.state.plan?.pending.map(question => question.en) || [],metrics:row.state.run.metrics})
      recordPlan(planRow)
      if (!planRow.state.plan || planRow.state.plan.pending.some(question => !/non.?block/i.test(question.en))) {
        const previousRunId = planRow.state.run.id
        await input.fill('For this synthetic validation, the dimensions, quantities, unit costs, labor hours, exclusions, provisional brand status and ZIP supplied above are confirmed. Use generic interior eggshell wall paint provisionally; the exact brand and color will be selected later. Three labor hours include patching, spot primer and two coats. No client or street address is required for this test. Please resolve the pending questions these facts answer and present a reviewable plan.')
        await page.getByRole('button', { name: 'Send', exact: true }).click()
        planRow = await waitForRun(page, id, previousRunId)
        recordPlan(planRow)
      }
      if (planRow.state.plan?.pending.length) {
        const pending = planRow.state.plan.pending
        if (!pending.every(question => /non.?block/i.test(question.en))) throw new Error('Real model still has material pending questions')
        if (!/provisional/i.test(JSON.stringify(planRow.state.plan))) throw new Error('Provisional product assumption missing from plan')
        await page.getByRole('button', { name: 'Edit plan' }).click()
        const questionRows = page.locator('.ai-plan h3').filter({ hasText: 'Questions to resolve before approval' }).locator('xpath=following-sibling::div')
        for (let index = 0; index < pending.length; index++) await questionRows.first().getByRole('button', { name: 'Remove' }).click()
        await page.getByRole('button', { name: 'Save plan revision' }).click()
        await expect(page.getByRole('button', { name: 'Approve this revision' })).toBeEnabled({ timeout: 10000 })
        planRow = await readConversation(page, id)
        report.checks.push('Test user accepted explicitly nonblocking provisional details in the editable plan')
      }
      if (!planRow.state.plan || planRow.state.plan.pending.length) throw new Error('Real model did not produce an approvable plan')
      await expect(page.getByRole('button', { name: 'Approve this revision' })).toBeEnabled({ timeout: 10000 })
      report.checks.push('Real model produced an editable plan with scope and exclusions; material questions resolved')
      await page.getByRole('button', { name: 'Approve this revision' }).click()
      stage = 'Generate and reopen real estimate'
      await page.getByRole('button', { name: 'Generate estimate' }).click()
      const generated = await waitForRun(page, id, planRow.state.run.id)
      if (!generated.estimate_id) throw new Error('No persisted estimate linked to approved plan')
      await expect(page.getByTestId('estimate-result')).toBeVisible({ timeout: 10000 })
      report.checks.push('Approved plan generated and persisted an estimate with the real model')
      report.generation = generated.state.run.metrics
      report.estimateId = generated.estimate_id
      const originalEstimate = await readEstimate(page, id)
      const items = originalEstimate.document.sections.flatMap(section => section.items)
      if (!items.length) throw new Error('Generated estimate has no lines')
      for (const item of items) {
        const quantity = String(item.quantity).replace('.', '\\.')
        const units = item.unit === 'gal' ? 'gal|gallons?' : item.unit === 'hr' ? 'hr|hours?' : item.unit === 'lot' ? 'lot|lots?' : item.unit
        if (new RegExp(`\\b${quantity}\\s*(?:${units})\\b`, 'i').test(item.description)) throw new Error('Generated line description repeats a mutable job quantity')
      }
      await page.reload()
      await expect(page.getByTestId('estimate-result')).toBeVisible({ timeout: 15000 })
      await page.getByRole('link', { name: 'Open estimate' }).click()
      const quantity = page.getByLabel('Qty', { exact: true }).first()
      await expect(quantity).toBeVisible({ timeout: 15000 })
      const editedQuantity = String(Number(await quantity.inputValue()) + 1)
      await quantity.fill(editedQuantity)
      await expect(page.locator('.estimate-save')).toContainText('Saved', { timeout: 15000 })
      await page.reload()
      await expect(page.getByLabel('Qty', { exact: true }).first()).toHaveValue(editedQuantity, { timeout: 15000 })
      const editedEstimate = await readEstimate(page, id)
      if (Number(editedEstimate.document.sections[0].items[0].quantity) !== Number(editedQuantity)) throw new Error('Edited quantity was not persisted')
      report.estimate = { lineCount: items.length, originalSaleCents: calculateEstimate(originalEstimate.document, originalEstimate.markup_bps).priceCents,
        editedSaleCents: calculateEstimate(editedEstimate.document, editedEstimate.markup_bps).priceCents,
        originalQuantity: items[0].quantity, editedQuantity: Number(editedQuantity) }
      report.checks.push('Estimate reopened, edited, saved and reopened again with the new quantity')
      await page.screenshot({ path: `${output}/estimate.png`, fullPage: true })
    } catch (error) {
      report.errors.push(`${stage}: ${error.name}`)
      const detail=String(error.message || '').split('\n')[0]
      if(detail && !/https?:\/\/|sk-[A-Za-z0-9_-]/.test(detail))report.errorDetail=detail.slice(0,300)
      if (conversationId) {
        const row = await readConversation(page, conversationId).catch(() => null)
        if (row?.state.run?.status === 'error') {
          report.failedRun = { code: row.state.run.error, metrics: row.state.run.metrics || null }
          if (row.state.run.error === 'OPENAI_CREDIT_EXHAUSTED') {
            await expect(page.getByRole('alert').filter({ hasText: 'OpenAI API credit is exhausted' })).toBeVisible({ timeout: 10000 })
            report.checks.push('Browser displays the specific exhausted-credit error and preserves the conversation')
          }
        }
      }
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
      throw error
    } finally {
      await browser.close()
    }
  }, { origin })
  report.cleanup = 'Temporary auth account and its records deleted after validation'
} catch (error) {
  if (!report.errors.length) report.errors.push(error.name)
  process.exitCode = 1
} finally {
  await writeFile(`${output}/results.json`, `${JSON.stringify(report, null, 2)}\n`)
  console.info(JSON.stringify({ checks: report.checks.length, errors: report.errors, cleanup: report.cleanup || 'see fixture cleanup result' }))
}
