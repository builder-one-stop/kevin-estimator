import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { startHarness } from './ai-local-harness.mjs'
import { LocalReviewProvider } from './local-review-provider.mjs'
import { calculateEstimate, reviseManualPrice } from '../src/lib/estimateDocument.js'
import { buildApprovedPdf } from '../src/lib/approvedProposalPdf.js'
import { reconcilePaintExpenses } from '../shared/paintReconciliation.js'
import { estimatePresentation } from '../shared/estimatePresentation.js'

const root = resolve('.local-review/acceptance-' + Date.now())
mkdirSync(root, { recursive: true })
const options = { provider: new LocalReviewProvider(), dataDir: resolve(root,'database'), port:5184, apiPort:8794 }
let h = await startHarness(options)
const origin = 'http://127.0.0.1:8794'
const checks = [], report = { environment:'Isolated local HTTP + persistent PGlite + explicit controlled provider; no real credentials',checks }
const headers = { Authorization:'Bearer fixture-a', 'Content-Type':'application/json' }
async function request(path, method='GET', body, extra={}) {
  const response = await fetch(origin+path,{method,headers:{...headers,...extra},...(body ? {body:JSON.stringify(body)} : {})})
  const data = await response.json()
  assert.equal(response.status,200,`HTTP ${method} ${path}: ${data?.error || 'unexpected status'}`)
  return data
}
let row
const command = async (action, extra={}) => {
  row = await request(`/api/ai/conversations/${row.id}/commands`,'POST',{requestId:randomUUID(),version:row.version,action,...extra})
  const deadline = Date.now()+15000
  while(row.state.run?.status==='working' && Date.now()<deadline) {
    await new Promise(resolve=>setTimeout(resolve,30))
    row=await request(`/api/ai/conversations/${row.id}`)
  }
  assert.notEqual(row.state.run?.status,'error',row.state.run?.error)
  assert.notEqual(row.state.run?.status,'working','Run did not settle')
}
const getSaved = () => request(`/api/ai/conversations/${row.id}/estimate`)
const patch = (record,document) => request(`/test-supabase/rest/v1/estimates?id=eq.${record.id}&version=eq.${record.version}`,'PATCH',{document:reconcilePaintExpenses(document)},{Accept:'application/vnd.pgrst.object+json'})
try {
  row=await request('/api/ai/conversations','POST',{id:randomUUID(),title:'LOCAL ACCEPTANCE - wall painting',language:'en'})
  await command('message',{content:'Paint interior bedroom walls.'})
  assert.equal(row.state.plan.pending.length,2)
  checks.push('Missing dimensions: exactly two material questions; generation remains gated')
  const denied = await fetch(`${origin}/api/ai/conversations/${row.id}/commands`,{method:'POST',headers,body:JSON.stringify({requestId:randomUUID(),version:row.version,action:'generate'})})
  assert.equal(denied.status,409)
  await command('message',{content:'Paint only the walls of a 12 x 10 x 8 ft bedroom, two coats, gross walls.'})
  assert.equal(row.state.plan.pending.length,0)
  await command('approve',{revision:row.state.planRevision})
  await command('generate')
  let saved=await getSaved()
  assert.equal(saved.document.rules.paint['bedroom-walls'].areaSqFt,352)
  const paint = doc=>doc.sections[0].items.find(item=>item.ruleKey==='painting:material')
  assert.equal(paint(saved.document).quantity,3)
  checks.push('Approved scope produces deterministic 352 sf, three whole paint packages and a persisted estimate')
  const edited=structuredClone(saved.document)
  const line=paint(edited)
  Object.assign(line,reviseManualPrice(line,{unitCost:49},'en'),{quantity:4,ruleOverrides:{price:true,quantity:true}})
  const changed=await patch(saved,edited)
  assert.equal(paint(changed.document).quantity,4)
  assert.equal(await patch(saved,saved.document),null)
  saved=await getSaved()
  assert.equal(paint(saved.document).unitCost,49)
  assert.equal(saved.document.sections[0].items.find(item=>item.ruleKey==='expenses:expenses').unitCost,38.27)
  checks.push('Actual local PATCH saves manual edits, refreshes 5% expenses to USD 38.27, and stale version cannot overwrite them')
  const finalized=await request('/test-supabase/rest/v1/rpc/finalize_estimate','POST',{p_id:saved.id,p_expected:saved.version,p_request_id:randomUUID()})
  assert.equal(finalized.finalized_version,finalized.version)
  saved=await getSaved()
  const totals=calculateEstimate(saved.document,saved.markup_bps)
  for(const language of ['en','es']) {
    const document={...structuredClone(saved.document),language}
    const view=estimatePresentation({...saved,document})
    const presentedPaint=view.sections[0].items.find(item=>item.ruleKey==='painting:material')
    assert.ok(presentedPaint.notes.includes(language==='es'?'4 gal':'4 gal'))
    assert.ok(!presentedPaint.notes.includes('2.2126'),'Old takeoff must not describe a manual order')
    const pdf=buildApprovedPdf({...saved,document})
    assert.ok(pdf.output().replaceAll(',','').includes((totals.priceCents/100).toFixed(2)),'PDF must contain the saved total')
    writeFileSync(resolve(root,`proposal-${language}.pdf`),Buffer.from(pdf.output('arraybuffer')))
  }
  checks.push('Finalization is version-bound; EN/ES PDFs contain the same saved sale total')
  const refs=await request('/api/ai/pricing/references')
  assert.ok(refs.references.some(reference=>reference.source.estimateId===saved.id&&reference.source.estimateVersion===saved.version))
  assert.equal(refs.learning,false)
  checks.push('References retain exact source estimate and version; no learning or account sharing')
  writeFileSync(resolve(root,'saved.json'),JSON.stringify(saved,null,2))
  const conversationId=row.id
  await h.close()
  h=await startHarness(options)
  row=await request(`/api/ai/conversations/${conversationId}`)
  const reopened=await getSaved()
  assert.equal(reopened.id,saved.id)
  assert.equal(reopened.version,saved.version)
  assert.equal(paint(reopened.document).unitCost,49)
  checks.push('Closing and reopening the local server preserves conversation, estimate, manual price and revision')
  assert.equal(totals.priceCents,107143)
  report.totalCents=totals.priceCents
  report.errors=[]
  console.info(JSON.stringify({...report,evidenceDirectory:root},null,2))
} catch(error) {
  report.errors=[error.message]
  console.error(error.message)
  process.exitCode=1
} finally {
  await h.close()
  writeFileSync(resolve(root,'report.json'),JSON.stringify(report,null,2))
}
