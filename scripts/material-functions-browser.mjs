import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {MaterialChatProvider} from '../tests/ai/materialChatProvider.js'
import {researchCatalog} from '../shared/researchCatalog.js'
import {strings} from '../src/components/ai/strings.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
const out='evidence/material-functions-2026-10-28';await mkdir(out,{recursive:true})
const h=await startHarness({provider:new MaterialChatProvider(),port:5320,apiPort:8910}),browser=await chromium.launch({channel:'chrome',headless:true})
const report={environment:'Isolated headless Chrome, loopback only, ephemeral database, controlled model and existing public catalog. No live AI/supplier query or new prices.',checks:[],errors:[]};let active
const message='Paint walls 12 x10 x8 ft; paint SKU 433052; primer SKU UGPR00-1-WH-1; protection SKU 590695; protection SKU 3487100; abrasive SKU 6014059'
try{
 for(const language of ['en','es']){
  const es=language==='es',a=key=>strings[language][key],context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
  await context.addInitScript(lang=>localStorage.setItem('os-lang',lang),language)
  await context.route('**/*',r=>r.request().url().startsWith(h.url)||r.request().url().startsWith('http://127.0.0.1:8910')?r.continue():r.abort())
  const page=await context.newPage();active=page;page.on('pageerror',e=>report.errors.push(e.message))
  await page.goto(h.url+'/__fixture/session');await page.getByRole('button',{name:'Enter test workspace'}).click();await page.getByRole('button',{name:a('new'),exact:true}).click();await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const id=page.url().split('/').at(-1)
  await page.locator('#chat-message').fill(message);await page.getByRole('button',{name:a('send'),exact:true}).click();await expect(page.getByRole('button',{name:a('approve'),exact:true})).toBeEnabled({timeout:20000})
  const planned=await h.repo.get(h.user,id);expect(planned.state.plan.materialEvidence.find(x=>x.role==='paint')).toMatchObject({unitCost:46.98});expect(planned.state.plan.pending).toEqual([])
  await page.getByRole('button',{name:a('edit'),exact:true}).click()
  const quantityLabel=es?'Envases completos de compra (vacío pendiente)':'Whole purchase packages (blank pending)'
  for(const role of ['primer','protection','abrasive']){const rows=page.locator(`article[data-material-role=${role}]`);for(let i=0;i<await rows.count();i++)await rows.nth(i).getByLabel(quantityLabel,{exact:true}).fill(role==='protection'&&i===0?'2':'1')}
  const primer=page.locator('article[data-material-role=primer]');await expect(primer.getByLabel(es?'Elegir referencia exacta (primer)':'Choose exact reference (primer)',{exact:true})).not.toContainText('BEHR ULTRA')
  await page.screenshot({path:`${out}/plan-${language}-390.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.getByRole('button',{name:a('savePlan'),exact:true}).click();await expect(page.getByRole('button',{name:a('approve'),exact:true})).toBeEnabled({timeout:15000});await page.getByRole('button',{name:a('approve'),exact:true}).click();await page.getByRole('button',{name:a('generate'),exact:true}).click();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  const conversation=await h.repo.get(h.user,id),record=()=>h.repo.estimate(h.user,conversation.estimate_id),supplements=async()=>(await record()).document.sections[0].items.filter(x=>x.materialSelectionId)
  let saved=await record();expect(await supplements()).toHaveLength(4);expect(saved.document.sections[0].items.find(x=>x.ruleKey==='supplement:primer:labor').quantityPending).toBe(true)
  expect(saved.document.sections[0].items.some(x=>x.ruleKey==='protection:material'||x.ruleKey==='preparation:material')).toBe(false)
  let download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/pending-${language}.pdf`);await writeFile(`${out}/pending-${language}.json`,JSON.stringify(saved,null,2))
  await page.getByRole('button',{name:es?'Editar documento':'Edit document',exact:true}).click()
  const primerIndex=saved.document.sections[0].items.findIndex(x=>x.materialRole==='primer'),laborIndex=saved.document.sections[0].items.findIndex(x=>x.ruleKey==='supplement:primer:labor'),qty=index=>page.locator('.estimate-item-row').nth(index).locator('input[type=number]').first()
  await qty(primerIndex).fill('2');await qty(laborIndex).fill('0');await expect.poll(async()=>(await record()).document.sections[0].items[laborIndex].quantityPending).toBe(false)
  const rule=page.locator('.paint-rule-editor');await rule.locator('summary').click();const functions=rule.locator('.paint-material-functions>div')
  // First extra is primer in the deterministic approved plan. Exact product choice remains role-filtered.
  const selected=functions.first().getByLabel(es?'Referencia de la función':'Function reference',{exact:true});await expect(selected).not.toContainText('BEHR ULTRA');await selected.selectOption(researchCatalog.find(x=>x.sourceId==='CA02').id)
  await rule.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}).click();await expect.poll(async()=>(await supplements()).find(x=>x.materialRole==='primer').quantityPending).toBe(true)
  const switched=(await supplements()).find(x=>x.materialRole==='primer');expect(switched).toMatchObject({unitCost:52.1,previousMaterialSelection:{price:{sku:'UGPR00-1-WH-1',unitCost:69}}})
  await qty(primerIndex).fill('1');await expect.poll(async()=>(await supplements()).find(x=>x.materialRole==='primer').quantityPending).toBe(false)
  await rule.getByLabel(es?'Largo (ft)':'Length (ft)',{exact:true}).fill('13');await rule.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}).click();await expect.poll(async()=>(await record()).document.rules.paint['bedroom-walls'].areaSqFt).toBe(368)
  await page.getByRole('button',{name:es?'Revisar documento':'Review document',exact:true}).click();await page.reload();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  saved=await record();expect(saved.document.sections[0].items.find(x=>x.materialRole==='primer')).toMatchObject({quantity:1,quantityPending:false,unitCost:52.1,price:{sku:'0460001',checkedAt:'2026-10-17'}});expect(saved.document.sections[0].items.find(x=>x.ruleKey==='supplement:primer:labor')).toMatchObject({quantity:0,quantityPending:false,ruleOverrides:{quantity:true}})
  download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/reviewed-${language}.pdf`)
  await page.getByTestId('complete-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/reviewed-${language}-390.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await writeFile(`${out}/reviewed-${language}.json`,JSON.stringify(saved,null,2));report.checks.push({language,distinctFunctions:4,protectionItems:2,defaultPaintPrice:46.98,primerOriginalPrice:69,primerReplacementPrice:52.1,primerPendingLaborReviewedExplicitZero:true,manualPrimerQuantity:1,sourceDatePreserved:'2026-10-17',restoredAfterReload:true,recalculatedArea:368,noDuplicatePhaseAllowances:true,viewport:390,totals:calculateEstimate(saved.document,saved.markup_bps)});console.info(language+' material functions passed');await context.close();active=null
 }
 expect(report.errors).toEqual([])
}catch(e){report.failure=e.message;process.exitCode=1;console.error(e.message);if(active){await active.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure-dom.txt',await active.locator('body').innerText())}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}
