import { chromium, expect } from '@playwright/test'
import { withFixture } from './browser-fixture.mjs'
await withFixture(async ({actionLink}) => {
 const browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 try {
  try { await page.goto(actionLink) } catch { throw new Error('Login navigation failed') }
  await expect(page.getByRole('heading',{name:'Recent estimates'})).toBeVisible({timeout:20000})
  await page.route('**/rest/v1/estimates*', route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Controlled QA failure"}'}))
  await page.goto('http://127.0.0.1:5173/estimates/10000000-0000-4000-8000-000000000001')
  await expect(page.getByRole('status')).toContainText('Loading')
  console.log('PASS: visible loading state in Chrome')
  await expect(page.getByRole('alert')).toContainText('Unable to load',{timeout:30000})
  console.log('PASS: visible load failure after SDK retries')
  await page.screenshot({path:'evidence/browser-validation/11-english-load-error.png',fullPage:true})
  await page.unroute('**/rest/v1/estimates*')
  await page.getByRole('button',{name:'Try again',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Estimate not found',{timeout:15000})
  await page.route('**/auth/v1/logout*', route=>route.fulfill({status:500,contentType:'application/json',body:'{"message":"Controlled QA failure"}'}))
  await page.locator('button.company').click()
  await page.getByRole('menuitem',{name:'Sign out',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Could not confirm sign-out',{timeout:30000})
  await expect(page.getByRole('heading',{name:'Sign in to One Stop'})).toBeVisible()
  console.log('PASS: failed server logout remains visible after local session closes')
  const menu = await page.getByRole('menu').boundingBox(), sidebar = await page.locator('.sidebar').boundingBox()
  expect(menu.x + menu.width).toBeLessThanOrEqual(sidebar.x + sidebar.width)
  await expect(page.getByText('Signed out',{exact:true})).toBeVisible()
  console.log('PASS: logout error fits sidebar; signed-out identity is accurate')
  await page.screenshot({path:'evidence/browser-validation/10-logout-failure-fixed.png',fullPage:true})
 } finally {await browser.close()}
})
