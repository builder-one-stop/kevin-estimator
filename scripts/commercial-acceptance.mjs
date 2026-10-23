import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {isDeepStrictEqual} from 'node:util'
import {resolve} from 'node:path'
import {SALES as S} from '../tests/ai/salesFixture.js'
import {laDateToIso} from '../shared/commercialDocuments.js'
import {proposalPrices,calculateEstimate,itemUnitSaleCents} from '../src/lib/estimateDocument.js'
import {invoiceTotals} from '../shared/commercialDocuments.js'
const root=resolve('.local-review/sales'),file=resolve(root,'commercial-acceptance.json'),origin='http://127.0.0.1:8800'
const sales=JSON.parse(readFileSync(resolve(root,'acceptance.json'),'utf8'))
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{followupId:randomUUID(),followupRequest:randomUUID(),invoiceId:randomUUID(),invoiceRequest:randomUUID(),stage:'new'}
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save()
async function rpc(who,action,input={},expected=200){const r=await fetch(origin+'/test-supabase/rest/v1/rpc/sales_gateway',{method:'POST',headers:{Authorization:'Bearer sales-'+who,'Content-Type':'application/json'},body:JSON.stringify({p_action:'ops:'+action,p_data:input})});const value=await r.json();assert.equal(r.status,expected,`Local commercial ${action}: HTTP ${r.status} ${value.code||''}`);return value}
const task={id:report.followupId,requestId:report.followupRequest,version:0,projectId:S.leadA,responsibleId:S.a,title:'PRUEBA QA · confirmar medidas',notes:'Seguimiento interno sintético; no enviar mensajes.',dueAt:laDateToIso('2026-10-23T09:00'),status:'pending'}
const first=await rpc('a','followup-save',task),retry=await rpc('a','followup-save',task);assert.equal(first.id,retry.id)
const invInput={id:report.invoiceId,requestId:report.invoiceRequest,sourceId:sales.estimateA,projectId:S.leadA}
const inv=await rpc('kevin','invoice-create',invInput);assert.equal((await rpc('kevin','invoice-create',invInput)).id,inv.id)
assert.equal(inv.tax_amount,null);assert.equal(inv.total_cents,null);assert.equal(inv.preliminary,true)
if(!report.roundingChecked){
 const current=(await rpc('kevin','invoices')).find(r=>r.id===inv.id)
 if(!report.roundingPayload&&current.version===1&&current.title===inv.title&&!current.notes){
  const src=current.source_snapshot,prices=proposalPrices(src.document,src.markup_bps),original=src.document.sections.flatMap(s=>s.items)
  const lines=original.map((i,n)=>({id:String(n+1),description:i.description?.trim()||'Pending source detail',unit:i.unit||'ea',quantity:i.quantityPending||!i.description?.trim()?null:i.quantity,unitPrice:i.priceMissing||!i.description?.trim()?null:i.quantityPending?itemUnitSaleCents(i,src.markup_bps)/100:i.quantity===0?0:prices.get(i.id)/100/i.quantity}))
  report.roundingPayload={id:current.id,requestId:randomUUID(),version:current.version,title:current.title,lines,taxAmount:null,taxNote:current.tax_note,notes:current.notes,status:current.status};save()
 }
 if(report.roundingPayload){
  const input=report.roundingPayload
  if(!isDeepStrictEqual(current.lines,input.lines)){
   assert.equal(current.version,input.version,'QA invoice was edited independently; not overwritten')
   await rpc('kevin','invoice-save',input)
  }
  const after=(await rpc('kevin','invoices')).find(r=>r.id===inv.id)
  assert.equal(invoiceTotals({title:after.title,lines:after.lines,taxAmount:null,taxNote:after.tax_note,notes:after.notes,status:after.status}).knownSubtotalCents,calculateEstimate(after.source_snapshot.document,after.source_snapshot.markup_bps).priceCents)
  report.roundingChecked=true;report.invoiceVersion=after.version;save()
 }
}
if(report.roundingChecked){const current=(await rpc('kevin','invoices')).find(r=>r.id===inv.id);assert.equal(Number(current.known_subtotal_cents),calculateEstimate(current.source_snapshot.document,current.source_snapshot.markup_bps).priceCents)}
await rpc('a','invoices',{},403);await rpc('a','followups',{},403);await rpc('b','followups',{projectId:S.leadA},403);await rpc('otherManager','followup-save',{...task,requestId:randomUUID()},403);await rpc('worker','context',{},403)
const rows=await rpc('kevin','followups');assert.equal(rows.filter(r=>r.id===report.followupId).length,1)
assert.equal((await rpc('otherManager','invoices')).some(r=>r.id===report.invoiceId),false)
assert.equal((await rpc('kevin','invoices')).filter(r=>r.id===report.invoiceId).length,1)
report.stage='http-verified';report.sourceId=sales.estimateA;report.sourceVersion=inv.source_version;report.preliminary=true;report.taxPending=true;report.noExternalMessages=true;report.noPaidAiCalls=true;report.reviewUrl='http://127.0.0.1:5190/__fixture/session?as=kevin';save();const {roundingPayload:_roundingPayload,...publicReport}=report;console.info(JSON.stringify(publicReport,null,2))
