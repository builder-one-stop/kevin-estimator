import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {MaterialChatProvider} from '../tests/ai/materialChatProvider.js'
import {normalizeAuthorizedQuotes} from '../server/authorizedQuoteImport.js'
import {defaultSettings} from '../shared/aiSchemas.js'
import {strings} from '../src/components/ai/strings.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
const out='evidence/paint-precision-2026-10-28';await mkdir(out,{recursive:true})
const h=await startHarness({provider:new MaterialChatProvider(),port:5308,apiPort:8898})
const [five]=normalizeAuthorizedQuotes([{quoteId:'synthetic-five-gallon',product:'Synthetic interior paint',brand:'QA fixture',sku:'SYNTHETIC-5G',model:'TEST5',variant:'synthetic',package:'5 US gal',unit:'ea',unitCost:100,currency:'USD',vendor:'Synthetic fixture only',checkedAt:'2026-10-28',validUntil:null,url:'https://example.invalid/fixture',offer:{supplierId:'fixture',storeId:'',storeZip:'',jobZip:'',fulfillment:'unspecified',accountContext:''},taxUsd:null,freightUsd:null,stockQuantity:null}],{authorized:true})
await h.repo.saveSettings(h.user,{...defaultSettings(),catalog:[five]},0)
const browser=await chromium.launch({channel:'chrome',headless:true}),report={environment:'Isolated headless Chrome, ephemeral PGlite and controlled model; synthetic five-gallon fixture is not a supplier price.',checks:[],errors:[]};let active
try{
 for(const language of ['en','es']){
  const es=language==='es',a=key=>strings[language][key],context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
  await context.addInitScript(lang=>localStorage.setItem('os-lang',lang),language)
  await context.route('**/*',r=>r.request().url().startsWith(h.url)||r.request().url().startsWith('http://127.0.0.1:8898')?r.continue():r.abort())
  const page=await context.newPage();active=page;page.on('pageerror',e=>report.errors.push(e.message))
  await page.goto(h.url+'/__fixture/session');await page.getByRole('button',{name:'Enter test workspace'}).click();await page.getByRole('button',{name:a('new'),exact:true}).click();await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const id=page.url().split('/').at(-1)
  await page.locator('#chat-message').fill('Paint interior walls 12 x10 x8 ft SKU 433052');await page.getByRole('button',{name:a('send'),exact:true}).click()
  await expect(page.getByRole('button',{name:a('approve'),exact:true})).toBeEnabled({timeout:20000});await page.getByRole('button',{name:a('approve'),exact:true}).click();await page.getByRole('button',{name:a('generate'),exact:true}).click();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  const conversation=await h.repo.get(h.user,id),record=()=>h.repo.estimate(h.user,conversation.estimate_id),paint=async()=> (await record()).document.sections[0].items.find(r=>r.ruleKey==='painting:material')
  expect(await paint()).toMatchObject({quantity:3,unit:'gal',unitCost:46.98})
  await page.getByRole('button',{name:es?'Editar documento':'Edit document',exact:true}).click()
  const index=(await record()).document.sections[0].items.findIndex(r=>r.ruleKey==='painting:material'),quantity=()=>page.locator('.estimate-item-row').nth(index).locator('input[type=number]').first()
  await quantity().fill('4');await expect.poll(async()=>(await paint()).quantity).toBe(4)
  const rule=page.locator('.paint-rule-editor');await rule.locator('summary').click()
  await rule.getByLabel(es?'Reparaciones menores':'Minor patches',{exact:true}).fill('8')
  await rule.getByLabel(es?'Envases de reparación (supuesto)':'Repair purchase packages (allowance)',{exact:true}).fill('1')
  const choices=rule.getByLabel(es?'Pintura':'Paint',{exact:true});await expect(choices).not.toContainText('DryDex');await expect(choices).not.toContainText('KILZ');await expect(choices).toContainText('Synthetic interior paint');await choices.selectOption(five.id)
  await rule.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}).click()
  await expect.poll(async()=>(await paint()).quantityPending).toBe(true)
  let pending=await record();expect(pending.document.sections[0].items.find(r=>r.ruleKey==='repair:material').quantity).toBe(1);expect(pending.document.sections[0].items.find(r=>r.ruleKey==='repair:labor').quantity).toBe(1)
  await expect(quantity()).toHaveValue('')
  await page.getByRole('button',{name:es?'Revisar documento':'Review document',exact:true}).click()
  let download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/pending-${language}.pdf`)
  await page.reload();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000});expect((await paint()).quantityPending).toBe(true)
  await page.getByRole('button',{name:es?'Editar documento':'Edit document',exact:true}).click();await quantity().fill('1');await expect.poll(async()=>(await paint()).quantityPending).toBe(false)
  const freshRule=page.locator('.paint-rule-editor');await freshRule.locator('summary').click();await freshRule.getByLabel(es?'Largo (ft)':'Length (ft)',{exact:true}).fill('13');await freshRule.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}).click()
  await expect.poll(async()=>(await record()).document.rules.paint['bedroom-walls'].areaSqFt).toBe(368);expect(await paint()).toMatchObject({quantity:1,quantityPending:false,unit:'ea',unitCost:100,price:{procurement:{taxUsd:null,freightUsd:null,stockQuantity:null}}})
  await page.getByRole('button',{name:es?'Revisar documento':'Review document',exact:true}).click()
  download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/resolved-${language}.pdf`)
  await page.getByTestId('complete-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/resolved-${language}-390.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  const final=await record();await writeFile(`${out}/saved-${language}.json`,JSON.stringify(final,null,2));await writeFile(`${out}/pending-${language}.json`,JSON.stringify(pending,null,2));report.checks.push({language,chatApproved:true,oneGallonQuantity:3,manualQuantity:4,packageChangedPending:true,reloadPending:true,repairLaborCount:8,repairPackages:1,confirmedFiveGallonQuantity:1,recalculatedArea:368,unknownFeesPreserved:true,pdfPendingAndResolved:true,viewport:390,totals:calculateEstimate(final.document,final.markup_bps)});console.info(language+' precision browser passed')
  await context.close();active=null
 }
 expect(report.errors).toEqual([])
}catch(e){report.failure=e.message;process.exitCode=1;console.error(e.message);if(active){await active.screenshot({path:out+'/failure.png'});await writeFile(out+'/failure-dom.txt',await active.locator('body').innerText())}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}

