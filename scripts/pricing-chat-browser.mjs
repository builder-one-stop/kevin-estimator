import {researchCatalog} from '../shared/researchCatalog.js'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {MaterialChatProvider} from '../tests/ai/materialChatProvider.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
const out='evidence/pricing-chat-2026-10-28';await mkdir(out,{recursive:true})
const h=await startHarness({provider:new MaterialChatProvider(),port:5302,apiPort:8892})
const browser=await chromium.launch({channel:'chrome',headless:true})
const report={environment:'New headless Chrome contexts, controlled provider, isolated ephemeral PGlite. No real AI, supplier API, remote SQL or shared browser profile.',checks:[],errors:[],externalRequestsBlocked:[]}
const check=text=>{report.checks.push(text);console.info(text)}
let activePage
try{
 for(const [language,sku]of [['en','433052'],['es','DOES-NOT-EXIST']]){
  const es=language==='es',context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true})
  await context.addInitScript(lang=>localStorage.setItem('os-lang',lang),language)
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(h.url)||url.startsWith('http://127.0.0.1:8892'))return route.continue();report.externalRequestsBlocked.push(new URL(url).hostname);return route.abort()})
  const page=await context.newPage();activePage=page;page.on('pageerror',e=>report.errors.push(e.message))
  await page.goto(h.url+'/__fixture/session');await page.getByRole('button',{name:'Enter test workspace'}).click()
  await page.getByRole('button',{name:es?'Nueva conversación':'New conversation',exact:true}).click();await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const chatId=page.url().split('/').at(-1),chatUrl=page.url()
  await page.locator('#chat-message').fill((es?'Pintar paredes interiores':'Paint interior walls')+' 144 x120 x96 in SKU '+sku)
  await page.getByRole('button',{name:es?'Enviar':'Send',exact:true}).click()
  const approve=page.getByRole('button',{name:es?'Aprobar esta revisión':'Approve this revision'})
  await expect(approve).toBeEnabled({timeout:30000});await expect(page.locator('.plan-materials')).toContainText(sku)
  const planRow=await h.repo.get(h.user,chatId)
  expect(planRow.state.plan.pending.length).toBeLessThanOrEqual(2)
  expect(planRow.state.plan.materialEvidence.find(r=>r.role==='paint').unitCost).toBe(es?null:46.98)
  await page.screenshot({path:`${out}/plan-${language}-desktop.png`,fullPage:true})
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);await page.locator('.plan-materials').scrollIntoViewIfNeeded()
  await page.screenshot({path:`${out}/plan-${language}-390.png`,fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  await page.setViewportSize({width:1440,height:1000})
  const chosen=es?null:researchCatalog.find(r=>r.sourceId==='LO01')
  if(!es){
   await page.getByRole('button',{name:'Edit plan',exact:true}).click()
   await page.getByLabel('Choose exact reference (paint)',{exact:true}).selectOption(chosen.id)
   await page.getByLabel('Optional buying store candidate',{exact:true}).selectOption('hd-0620')
   await page.getByRole('button',{name:'Save plan revision',exact:true}).click()
   await expect(page.getByRole('button',{name:'Approve this revision'})).toBeEnabled({timeout:15000})
   const editedPlan=(await h.repo.get(h.user,chatId)).state.plan
   expect(editedPlan.pricingContext).toMatchObject({storeId:'0620',storeZip:'90250',jobZip:''})
   expect(editedPlan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({id:chosen.id,status:'public_observed'})
   check('Manual plan reference switch re-resolves exact identity; store candidate remains separate and unverified')
  }
  await approve.click()
  await page.getByRole('button',{name:es?'Generar estimado':'Generate estimate',exact:true}).click()
  await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:30000})
  const conversation=await h.repo.get(h.user,chatId),record=()=>h.repo.estimate(h.user,conversation.estimate_id)
  const first=await record(),material=first.document.sections[0].items.find(r=>r.ruleKey==='painting:material')
  expect(first.document.rules.paint['bedroom-walls'].areaSqFt).toBe(352)
  if(es){expect(material.priceMissing).toBe(true);expect(material.quantityPending).toBe(true)}
  else{expect(material).toMatchObject({unitCost:chosen.unitCost,unit:chosen.unit,quantity:3,price:{status:'public_observed',sku:chosen.sku}})}
  await page.reload();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  expect((await record()).document.sections[0].items.find(r=>r.id===material.id)).toEqual(material)
  if(!es){
   await page.getByRole('button',{name:'Edit document',exact:true}).click()
   const index=first.document.sections[0].items.findIndex(r=>r.id===material.id)
   await page.getByLabel('Unit cost',{exact:true}).nth(index).fill('49')
   await expect(page.locator('.estimate-save')).toHaveText('Saved',{timeout:15000})
   const rule=page.locator('.paint-rule-editor');await rule.locator('summary').click();await rule.getByLabel('Length (ft)').fill('13');await rule.getByRole('button',{name:'Recalculate painting'}).click()
   await expect(page.locator('.estimate-save')).toHaveText('Saved',{timeout:15000})
   expect((await record()).document.sections[0].items.find(r=>r.id===material.id)).toMatchObject({unitCost:49,price:{status:'manual',previousSnapshot:{sku:chosen.sku,unitCost:chosen.unitCost}}})
   await page.getByRole('button',{name:'Review document',exact:true}).click()
  }
  const download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/proposal-${language}.pdf`)
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);await page.getByTestId('complete-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/estimate-${language}-390.png`,fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  const final=await record();await writeFile(`${out}/saved-${language}.json`,JSON.stringify(final,null,2));report[language]={chatUrl,estimateId:final.id,totals:calculateEstimate(final.document,final.markup_bps),material:final.document.sections[0].items.find(r=>r.id===material.id)}
  check(`${language}: actual chat -> exact catalog plan -> approval -> deterministic estimate -> reload -> PDF;390px fit; ${es?'unknown SKU remains pending':'override survives recalc'}`)
  await context.close();activePage=null
 }
 expect(report.errors).toEqual([])
}catch(error){report.failure=error.message;process.exitCode=1;console.error(error.message);if(activePage){await activePage.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure-dom.txt',await activePage.locator('body').innerText())}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}
