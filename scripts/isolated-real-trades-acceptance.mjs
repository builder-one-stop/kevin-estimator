import assert from 'node:assert/strict'
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {buildApprovedPdf} from '../src/lib/approvedProposalPdf.js'
const root=resolve('.local-review/real-ai-isolated'),reportFile=resolve(root,'acceptance.json');mkdirSync(root,{recursive:true})
const report=existsSync(reportFile)?JSON.parse(readFileSync(reportFile,'utf8')):{environment:'Real OpenAI scope selection + isolated persistent PGlite; synthetic data only; no production Supabase',cases:[]}
const save=()=>writeFileSync(reportFile,JSON.stringify(report,null,2))
const api='http://127.0.0.1:8796',headers={Authorization:'Bearer fixture-a','Content-Type':'application/json'}
async function request(path,method='GET',body){const response=await fetch(api+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,`Local HTTP ${response.status}: ${data.error||''}`);return data}
for(const [trade,content,packages]of[
 ['lvp','Synthetic QA only: install click-lock LVP floor in one rectangular room 20 x 20 ft. Use the disclosed provisional default product. Existing suitable dry flat substrate. No removal, stairs, leveling, trim or other work.',22],
 ['baseboard','Solo prueba sintética: instalar zócalos interiores, largo neto medido 120 lf. Acepto el producto provisional predeterminado. Sin retiro, pintura, sellado ni otros trabajos.',17],
 ['drywall','Synthetic QA only: simple interior drywall board-only rectangular panel area 40 x 8 ft. Accept provisional default panel. Existing suitable substrate. No framing, fastening, tape, joint finishing, demolition, fire rating, wet assembly or paint.',11]
]){
 let item=report.cases.find(x=>x.trade===trade)
 if(item?.complete){console.info(trade+' already verified; no repeated OpenAI call');continue}
 if(!item){item={trade,id:randomUUID(),requestId:randomUUID(),stage:'created'};report.cases.push(item);save()}
 let row=await request('/api/ai/conversations','POST',{id:item.id,title:'ISOLATED REAL AI QA '+trade,language:trade==='baseboard'?'es':'en'})
 const command=async(action,extra={},requestId=randomUUID())=>{
  row=await request(`/api/ai/conversations/${row.id}/commands`,'POST',{requestId,version:row.version,action,...extra})
  const deadline=Date.now()+135000
  while(row.state.run?.status==='working'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,500));row=await request('/api/ai/conversations/'+row.id)}
  assert.equal(row.state.run?.status,'ready',row.state.run?.error||'run incomplete')
 }
 if(!row.state.receipts.includes(item.requestId)){item.stage='message-dispatched';save();await command('message',{content},item.requestId)}
 else{while(row.state.run?.status==='working'){await new Promise(r=>setTimeout(r,500));row=await request('/api/ai/conversations/'+row.id)}assert.equal(row.state.run?.status,'ready',row.state.run?.error)}
 item.planMetrics=row.state.run.metrics;item.stage='plan';save()
 assert.equal(row.state.plan.tasks[0].id,'local-trade-'+trade)
 assert.equal(row.state.plan.pending.length,0)
 if(row.state.approvedRevision!==row.state.planRevision)row=await request(`/api/ai/conversations/${row.id}/commands`,'POST',{requestId:randomUUID(),version:row.version,action:'approve',revision:row.state.planRevision})
 if(!row.estimate_id)await command('generate')
 const estimate=await request(`/api/ai/conversations/${row.id}/estimate`),material=estimate.document.sections[0].items[0]
 assert.equal(material.quantity,packages);assert.equal(estimate.document.sections[0].items[1].priceMissing,true)
 const pdfs=[]
 for(const language of ['en','es']){const pdf=buildApprovedPdf({...estimate,document:{...estimate.document,language}}),path=resolve(root,trade+'-'+language+'.pdf');const text=pdf.output();assert(text.includes(language==='es'?'PRESUPUESTO PRELIMINAR':'PRELIMINARY BUDGET'));pdf.save(path);pdfs.push(path)}
 item.estimateId=estimate.id;item.packages=packages;item.materialUnitCost=material.priceMissing?null:material.unitCost;item.pdfs=pdfs;item.complete=true;item.stage='verified';save()
 console.info(JSON.stringify({trade,conversation:item.id,estimate:estimate.id,packages,model:item.planMetrics?.model,usage:item.planMetrics?.usage,preliminaryPdfEnEs:true}))
}
console.info('Three real-model selections verified against deterministic rules and isolated persistence. Report '+reportFile)
