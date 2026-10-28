import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {MaterialChatProvider} from '../tests/ai/materialChatProvider.js'
import {researchCatalog} from '../shared/researchCatalog.js'
import {strings} from '../src/components/ai/strings.js'
const out='evidence/pricing-web-defaults-2026-10-28';await mkdir(out,{recursive:true})
const h=await startHarness({provider:new MaterialChatProvider(),port:5304,apiPort:8894})
const browser=await chromium.launch({channel:'chrome',headless:true}),report={environment:'Controlled local app; no supplier account/contact, no chosen store/job ZIP, no remote APIs.',checks:[],errors:[]};let active
try{
 for(const [language,alternative]of [['en',false],['es',false],['es',true]]){
  const name=alternative?'alternative-es':'web-'+language,a=key=>strings[language][key]
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
  await context.addInitScript(lang=>localStorage.setItem('os-lang',lang),language)
  await context.route('**/*',r=>r.request().url().startsWith(h.url)||r.request().url().startsWith('http://127.0.0.1:8894')?r.continue():r.abort())
  const page=await context.newPage();active=page;page.on('pageerror',e=>report.errors.push(e.message))
  await page.goto(h.url+'/__fixture/session');await page.getByRole('button',{name:'Enter test workspace'}).click();await page.getByRole('button',{name:a('new'),exact:true}).click();await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const id=page.url().split('/').at(-1)
  await page.locator('#chat-message').fill('Paint interior walls12 x10 x8 ft'+(alternative?' SKU UNKNOWN-REQUESTED':''));await page.getByRole('button',{name:a('send'),exact:true}).click()
  await expect(page.getByRole('button',{name:a('approve'),exact:true})).toBeEnabled({timeout:20000})
  await expect(page.locator('.plan-materials')).toContainText(language==='es'?'Los precios web sirven como referencia':'Web prices are budgeting references')
  if(alternative){
   await page.getByRole('button',{name:a('edit'),exact:true}).click()
   await expect(page.locator('.plan-materials')).toContainText('no como coincidencia exacta')
   await page.getByLabel('Elegir referencia exacta (paint)',{exact:true}).selectOption(researchCatalog[0].id)
   await page.getByRole('button',{name:a('savePlan'),exact:true}).click()
   await expect(page.locator('.plan-materials')).toContainText('Alternativa referencial aceptada')
  }
  const planned=await h.repo.get(h.user,id);expect(planned.state.plan.pending).toEqual([])
  expect(planned.state.plan.pricingContext?.storeId||'').toBe('');expect(planned.state.plan.zip).toBe('');expect(await h.repo.settings(h.user)).toBeNull()
  await page.getByRole('button',{name:a('approve'),exact:true}).click();await page.getByRole('button',{name:a('generate'),exact:true}).click();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  const conversation=await h.repo.get(h.user,id),record=()=>h.repo.estimate(h.user,conversation.estimate_id),saved=await record()
  expect(saved.client_id).toBeNull();expect(saved.project_id).toBeNull()
  const material=saved.document.sections[0].items.find(r=>r.ruleKey==='painting:material')
  expect(material).toMatchObject({unitCost:46.98,quantity:3,priceDate:'2026-10-17',price:{status:'public_observed',verifiedZip:null}})
  if(alternative)expect(material.price.referenceSelection).toMatchObject({requested:'SKU UNKNOWN-REQUESTED',accepted:true})
  await page.reload();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000});expect((await record()).document).toEqual(saved.document)
  const download=page.waitForEvent('download');await page.getByRole('button',{name:language==='es'?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/${name}.pdf`)
  await page.getByTestId('complete-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}-390.png`,fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await writeFile(`${out}/${name}.json`,JSON.stringify(saved,null,2));report.checks.push({case:name,publicPrice:material.unitCost,observed:material.priceDate,store:null,jobZip:null,supplierAccount:false,supplierContact:false,reload:true,pdf:true,alternativeAccepted:alternative})
  console.info(name+' passed');await context.close();active=null
 }
 expect(report.errors).toEqual([])
}catch(e){report.failure=e.message;process.exitCode=1;console.error(e.message);if(active){await active.screenshot({path:out+'/failure.png'});await writeFile(out+'/failure-dom.txt',await active.locator('body').innerText())}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}
