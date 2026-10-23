import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {summarizeConversationUsage} from '../shared/apiUsage.js'
import {reviseManualPrice} from '../src/lib/estimateDocument.js'
import {markReviewedPaintChange} from '../shared/paintReconciliation.js'
import {reconcileEstimateExpenses} from '../shared/estimateReconciliation.js'
import {buildApprovedPdf} from '../src/lib/approvedProposalPdf.js'
const root=resolve('.local-review/real-ai-isolated'),file=resolve(root,'hybrid-acceptance.json')
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{id:randomUUID(),messageId:randomUUID(),environment:'Real OpenAI, isolated PGlite, synthetic data only',stage:'new'}
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save()
const headers={Authorization:'Bearer fixture-a','Content-Type':'application/json'},origin='http://127.0.0.1:8796'
async function request(path,method='GET',body,extra={}){const r=await fetch(origin+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,`Local HTTP ${r.status}: ${data.error||data.code||''}`);return data}
let row=await request('/api/ai/conversations','POST',{id:report.id,title:'LOCAL HYBRID QA painting',language:'en'})
const settle=async()=>{const until=Date.now()+130000;while(row.state.run?.status==='working'&&Date.now()<until){await new Promise(r=>setTimeout(r,500));row=await request('/api/ai/conversations/'+row.id)}assert.equal(row.state.run?.status,'ready',row.state.run?.error||'Run did not finish')}
const command=async(action,extra={},id=randomUUID())=>{row=await request('/api/ai/conversations/'+row.id+'/commands','POST',{requestId:id,version:row.version,action,...extra});if(row.state.run?.status==='working')await settle()}
if(!row.state.receipts.includes(report.messageId)){
 report.stage='interpretation-dispatched';save()
 await command('message',{content:'Synthetic QA only: Paint interior walls of one room 12 x 10 x 8 ft, gross walls without deductions, two coats, minor nail-hole preparation and cleanup. Use disclosed provisional default paint/patch products; additional equipment remains a pending allowance. No ceiling, trim, doors, full primer, demolition, structural or other work. No real customer or project.'},report.messageId)
}else await settle()
report.usageAfterInterpretation=summarizeConversationUsage(row.state);report.stage='interpreted';save()
assert.equal(row.state.plan.tasks[0].id,'hybrid-paint-walls');assert.equal(report.usageAfterInterpretation.apiCalls,1)
if(row.state.approvedRevision!==row.state.planRevision)await command('approve',{revision:row.state.planRevision})
if(!row.estimate_id)await command('generate')
let estimate=await request('/api/ai/conversations/'+row.id+'/estimate')
assert.equal(estimate.document.hybrid.trade,'paint');assert.equal(estimate.document.sections[0].items.find(i=>i.ruleKey==='painting:material').quantity,report.edited?4:3)
if(!report.edited){
 const document=structuredClone(estimate.document),section=document.sections[0],i=section.items.findIndex(i=>i.ruleKey==='painting:material'),before=section.items[i]
 section.items[i]=markReviewedPaintChange(before,{...reviseManualPrice(before,{unitCost:49}),quantity:4})
 const saved=await request('/test-supabase/rest/v1/estimates?id=eq.'+estimate.id+'&version=eq.'+estimate.version,'PATCH',{document:reconcileEstimateExpenses(document)},{Accept:'application/vnd.pgrst.object+json'})
 estimate=saved;report.edited=true;report.stage='manual-edit-saved';save()
}
row=await request('/api/ai/conversations/'+row.id)
report.usageAfterManualEdit=summarizeConversationUsage(row.state);assert.deepEqual(report.usageAfterManualEdit,report.usageAfterInterpretation)
assert.equal(estimate.document.sections[0].items.find(i=>i.ruleKey==='painting:material').quantity,4)
assert(estimate.document.sections[0].items.some(i=>i.costType==='equipment'&&i.priceMissing))
const calibration=await request('/api/ai/calibration/'+estimate.id);assert.equal(calibration.scope,'isolated-current-owner-only')
const other=await fetch(origin+'/api/ai/calibration/'+estimate.id,{headers:{Authorization:'Bearer fixture-b'}});assert.equal(other.status,403)
for(const language of ['en','es'])buildApprovedPdf({...estimate,document:{...estimate.document,language}}).save(resolve(root,'hybrid-paint-'+language+'-r'+estimate.version+'.pdf'))
report.estimateId=estimate.id;report.estimateVersion=estimate.version;report.calibrationRead=true;report.otherOwnerDenied=true;report.pdfEnEs=true;report.stage='verified';save()
console.info(JSON.stringify({conversation:report.id,estimate:estimate.id,apiCalls:report.usageAfterManualEdit.apiCalls,inputTokens:report.usageAfterManualEdit.inputTokens,outputTokens:report.usageAfterManualEdit.outputTokens,estimatedApiCostUsd:report.usageAfterManualEdit.estimatedCostUsd,rateVersions:report.usageAfterManualEdit.rateVersions,manualEditAdditionalCalls:0,otherOwnerDenied:true,preliminaryPdfEnEs:true}))
