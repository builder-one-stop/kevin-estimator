import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {startHarness} from './ai-local-harness.mjs'
import {MaterialChatProvider} from '../tests/ai/materialChatProvider.js'
import {researchCatalog} from '../shared/researchCatalog.js'
import {strings} from '../src/components/ai/strings.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
const out='evidence/catalog-p2-2026-10-28/technical';await mkdir(out,{recursive:true})
const h=await startHarness({provider:new MaterialChatProvider(),port:5324,apiPort:8914}),browser=await chromium.launch({channel:'chrome',headless:true})
const report={environment:'Controlled local chat and ephemeral database; new isolated headless Chrome; browser network loopback only. Official technical research is checked-in metadata; no live supplier/AI/price calls.',checks:[],errors:[]};let active
try{
 for(const language of ['en','es']){
  const es=language==='es',a=key=>strings[language][key],context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
  await context.addInitScript(lang=>localStorage.setItem('os-lang',lang),language)
  await context.route('**/*',r=>r.request().url().startsWith(h.url)||r.request().url().startsWith('http://127.0.0.1:8914')?r.continue():r.abort())
  const page=await context.newPage();active=page;page.on('pageerror',e=>report.errors.push(e.message))
  await page.goto(h.url+'/__fixture/session');await page.getByRole('button',{name:'Enter test workspace'}).click();await page.getByRole('button',{name:a('new'),exact:true}).click();await page.waitForURL(/\/chat\/[0-9a-f-]+$/)
  const id=page.url().split('/').at(-1)
  await page.locator('#chat-message').fill('Paint walls 12 x10 x8 ft; paint SKU 433052; primer model 20941');await page.getByRole('button',{name:a('send'),exact:true}).click();await expect(page.getByRole('button',{name:a('approve'),exact:true})).toBeEnabled({timeout:20000})
  expect((await h.repo.get(h.user,id)).state.plan.pending).toEqual([])
  await page.getByRole('button',{name:a('approve'),exact:true}).click();await page.getByRole('button',{name:a('generate'),exact:true}).click();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  const conversation=await h.repo.get(h.user,id),record=()=>h.repo.estimate(h.user,conversation.estimate_id),line=async key=>(await record()).document.sections[0].items.find(x=>x.ruleKey===key),primer=async()=>(await record()).document.sections[0].items.find(x=>x.materialRole==='primer')
  const original=await record();expect(await line('painting:material')).toMatchObject({quantity:3,unitCost:46.98,priceDate:'2026-10-17'});expect((await primer()).quantityPending).toBe(true)
  await page.getByRole('button',{name:es?'Editar documento':'Edit document',exact:true}).click();const rule=page.locator('.paint-rule-editor');await rule.locator('summary').click()
  await rule.getByRole('button',{name:es?'Usar extremo inferior de ficha (paint)':'Use sheet lower bound (paint)',exact:true}).click();await rule.getByRole('button',{name:es?'Usar extremo inferior de ficha (primer)':'Use sheet lower bound (primer)',exact:true}).click()
  expect((await record()).document.rules.paint['bedroom-walls'].template.coverageSqFtPerGallon).toBe(350);expect((await line('painting:material')).quantity).toBe(3)
  await expect(rule.getByLabel(es?'Manos de imprimante':'Primer coats',{exact:true})).toHaveValue('');await expect(rule.getByLabel(es?'Superficie de imprimación':'Primer area scope',{exact:true})).toHaveValue('')
  const recalculate=()=>rule.getByRole('button',{name:es?'Recalcular pintura':'Recalculate painting',exact:true}).click()
  await recalculate();await expect.poll(async()=>(await line('painting:material')).quantity).toBe(4);expect((await primer()).quantityPending).toBe(true)
  await rule.getByLabel(es?'Manos de imprimante':'Primer coats',{exact:true}).fill('1');await rule.getByLabel(es?'Superficie de imprimación':'Primer area scope',{exact:true}).selectOption('room-walls');await recalculate()
  await expect.poll(async()=>(await primer()).quantityPending).toBe(false);expect(await primer()).toMatchObject({quantity:2,unitCost:22.98,priceDate:'2026-10-17',takeoff:{areaSqFt:352,coats:1,wastePercent:10,requiredGallons:1.2907},technicalCoverage:{profile:{manufacturerNumber:'2000',consultedAt:'2026-10-28'}}});expect((await line('supplement:primer:labor')).quantityPending).toBe(true)
  await page.screenshot({path:`${out}/rules-${language}-390.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.getByRole('button',{name:es?'Revisar documento':'Review document',exact:true}).click();let download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/applied-${language}.pdf`);await writeFile(`${out}/applied-${language}.json`,JSON.stringify(await record(),null,2))
  await page.getByRole('button',{name:es?'Editar documento':'Edit document',exact:true}).click();const current=await record(),primerIndex=current.document.sections[0].items.findIndex(x=>x.materialRole==='primer'),paintIndex=current.document.sections[0].items.findIndex(x=>x.ruleKey==='painting:material'),qty=i=>page.locator('.estimate-item-row').nth(i).locator('input[type=number]').first()
  await qty(primerIndex).fill('5');await page.getByLabel(es?'Costo unitario':'Unit cost',{exact:true}).nth(paintIndex).fill('49');await expect.poll(async()=>(await primer()).quantity).toBe(5)
  // The rule panel remains open when returning from proposal view.
  if(!await rule.getByLabel(es?'Largo (ft)':'Length (ft)',{exact:true}).isVisible())await rule.locator('summary').click()
  await rule.getByLabel(es?'Largo (ft)':'Length (ft)',{exact:true}).fill('30');await recalculate();await expect.poll(async()=>(await record()).document.rules.paint['bedroom-walls'].areaSqFt).toBe(640);expect(await primer()).toMatchObject({quantity:5,ruleOverrides:{quantity:true}});expect(await line('painting:material')).toMatchObject({quantity:6,unitCost:49,price:{status:'manual',previousSnapshot:{checkedAt:'2026-10-17',unitCost:46.98}}})
  const selectionId=(await primer()).materialSelectionId;await rule.getByRole('checkbox',{name:(es?'Restablecer cantidad calculada ':'Reset calculated quantity ')+`supplement:${selectionId}:material`,exact:true}).check();await recalculate();await expect.poll(async()=>(await primer()).quantity).toBe(3)
  const ref=rule.getByLabel(es?'Referencia de la función':'Function reference',{exact:true});await ref.selectOption(researchCatalog.find(x=>x.sourceId==='DE03').id);await recalculate();await expect.poll(async()=>(await primer()).quantityPending).toBe(true);expect(await primer()).toMatchObject({unitCost:69,technicalCoverage:{status:'product-mismatch'}})
  await ref.selectOption(researchCatalog.find(x=>x.sourceId==='HD02').id);await recalculate();await expect.poll(async()=>(await primer()).quantityPending).toBe(false);expect(await primer()).toMatchObject({quantity:3,unitCost:22.98,technicalCoverage:{profile:{manufacturerNumber:'2000'}}})
  await page.getByRole('button',{name:es?'Revisar documento':'Review document',exact:true}).click();await page.reload();await expect(page.getByTestId('complete-estimate')).toBeVisible({timeout:20000})
  const final=await record();expect(final.document.rules.paint['bedroom-walls'].template.technicalProfile).toMatchObject({identity:{model:'275001'},revision:'11/2020'});expect((await line('supplement:primer:labor')).quantityPending).toBe(true)
  download=page.waitForEvent('download');await page.getByRole('button',{name:es?'Descargar PDF':'Download PDF',exact:true}).click();await(await download).saveAs(`${out}/resized-${language}.pdf`);await writeFile(`${out}/resized-${language}.json`,JSON.stringify(final,null,2));await page.screenshot({path:`${out}/proposal-${language}-390.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  report.checks.push({language,oldPaintQuantity:3,unchangedBeforeExplicitRecalc:true,appliedPaintQuantity:4,appliedPrimerQuantity:2,explicitPrimerCoats:1,explicitPrimerArea:'room-walls',wasteAppliedOnce:true,manualPrimerQuantityRetained:5,resetPrimerQuantity:3,resizedPaintQuantity:6,areaSqFt:640,wrongPrimerProfilePending:true,returnedExactPrimerQuantity:3,priceObservationPreserved:'2026-10-17',technicalConsultedAt:'2026-10-28',manualPaintPricePreserved:49,primerLaborStillPending:true,reload:true,viewport:390,originalTotals:calculateEstimate(original.document,original.markup_bps),totals:calculateEstimate(final.document,final.markup_bps)});console.info(language+' technical coverage passed');await context.close();active=null
 }
 expect(report.errors).toEqual([])
}catch(e){report.failure=e.message;process.exitCode=1;console.error(e.message);if(active){await active.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure-dom.txt',await active.locator('body').innerText())}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await h.close()}
