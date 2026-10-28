import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {A,B} from '../tests/ai/localRepository.js'
const out='evidence/catalog-import-2026-10-28';await mkdir(out,{recursive:true})
const h=await startHarness({port:5306,apiPort:8896}),browser=await chromium.launch({channel:'chrome',headless:true})
const report={environment:'Isolated PGlite, existing synthetic admin-B/operator-A roles, no external service.',checks:[],errors:[]}
const seed={id:'a1000000-0000-4000-8000-000000000001',product:'SYNTHETIC QA interior paint',brand:'SYNTHETIC',sku:'QA-IMPORT',package:'5 US gal',unit:'ea',unitCost:100,currency:'USD',vendor:'Synthetic supplier',location:'',url:'https://example.invalid/qa-source',checkedAt:'2026-10-25',status:'manual',evidence:'Synthetic import fixture only; not a supplier price.'}
const context=await browser.newContext({viewport:{width:390,height:844}})
await context.addInitScript(user=>{localStorage.setItem('os-lang','en');localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'fixture-b',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:user,email:'synthetic-admin@example.invalid',aud:'authenticated',role:'authenticated'}}))},B)
await context.route('**/*',r=>r.request().url().startsWith(h.url)||r.request().url().startsWith('http://127.0.0.1:8896')?r.continue():r.abort())
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message))
const upload=rows=>page.locator('input[type=file][accept*="json"]').setInputFiles({name:'own-price-list.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rows))})
const apply=async()=>{await page.getByRole('button',{name:'Use reviewed import',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible({timeout:15000})}
try{
 await page.goto(h.url+'/settings');await expect(page.locator('input[type=file][accept*="json"]')).toBeVisible({timeout:15000})
 await upload([{...seed,unit:'gal'}, {...seed,id:'a1000000-0000-4000-8000-000000000002'}]);await expect(page.getByRole('button',{name:'Use reviewed import'})).toBeDisabled();expect(await h.repo.settings(B)).toBeNull();await page.screenshot({path:out+'/invalid-preview-390.png',fullPage:true})
 await page.getByRole('button',{name:'Cancel import'}).click()
 await upload([seed,{...seed,id:'a1000000-0000-4000-8000-000000000002'}]);await expect(page.getByRole('button',{name:'Use reviewed import'})).toBeDisabled();await expect(page.getByRole('alert').filter({hasText:'Duplicate product'}).first()).toBeVisible();await page.getByRole('button',{name:'Cancel import'}).click()
 const pending={...seed,id:'a1000000-0000-4000-8000-000000000003',sku:'QA-PENDING',unitCost:null,status:'quote_required'}
 await upload([seed,pending]);await expect(page.getByRole('button',{name:'Use reviewed import'})).toBeEnabled();expect(await h.repo.settings(B)).toBeNull();await page.screenshot({path:out+'/valid-preview-390.png',fullPage:true});await apply()
 let settings=await h.repo.settings(B);expect(settings.data.catalog).toHaveLength(2);expect(settings.data.catalog.find(r=>r.sku==='QA-PENDING').unitCost).toBeNull()
 await page.reload();await expect(page.locator('input[type=file][accept*="json"]')).toBeVisible({timeout:15000});await upload([{...seed,unitCost:110}]);await apply()
 settings=await h.repo.settings(B);expect(settings.data.catalog).toHaveLength(2);expect(settings.data.catalog.find(r=>r.sku==='QA-IMPORT')).toMatchObject({priceVersion:2,unitCost:110,checkedAt:'2026-10-25',priceHistory:[{unitCost:100}]})
 await upload([seed]);await page.getByLabel('Import mode',{exact:true}).selectOption('replace');await expect(page.getByRole('status').filter({hasText:'New / updated'})).toContainText('/ 1');await page.getByRole('button',{name:'Cancel import'}).click();expect((await h.repo.settings(B)).data.catalog).toHaveLength(2)
 expect(await h.repo.settings(A)).toBeNull();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
 report.checks.push('Invalid units/duplicates block apply; preview never persists','Merge preserves pending entries; Save/reload versions only this owner catalog','Second import updates existingID with history; replace removals explicit; cancel preserves list','Operator-A data remains empty; admin permissions unchanged;390px fit')
 await writeFile(out+'/saved-settings.json',JSON.stringify(settings,null,2));expect(report.errors).toEqual([])
}catch(e){report.failure=e.message;process.exitCode=1;console.error(e.message);await page.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure-dom.txt',await page.locator('body').innerText())}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}
