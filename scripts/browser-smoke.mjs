import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
 await page.goto('http://127.0.0.1:5173/')
 await expect(page.getByRole('heading', { name: 'Sign in to One Stop' })).toBeVisible()
 console.log('PASS: real Chrome renders sign-in gate')
 await page.screenshot({path:'evidence/browser-validation/01-sign-in.png',fullPage:true})
 await page.getByRole('link', {name:'Contacts',exact:true}).click()
 await expect(page.getByRole('heading', { name: 'Sign in to One Stop' })).toBeVisible()
 console.log('PASS: contacts remain gated without session')
 await page.route('**/auth/v1/otp*', route => route.abort('failed'))
 await page.getByRole('textbox',{name:'Email'}).fill('browser-validation@example.invalid')
 await page.getByRole('button',{name:'Send sign-in link'}).click()
 await expect(page.getByText('Unable to sign in. Try again.',{exact:true})).toBeVisible()
 console.log('PASS: failed request produces visible auth error; no email request sent')
 await page.screenshot({path:'evidence/browser-validation/02-auth-error.png',fullPage:true})
} finally { await browser.close() }
