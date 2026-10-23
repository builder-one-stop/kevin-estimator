import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {localTradePlan,buildLocalTradeDocument} from '../shared/localTradePlan.js'
import {addDrywallFinishing} from '../shared/drywallFinishing.js'
import {combineApprovedEstimates} from '../shared/mixedWork.js'
import {reconcileEstimateExpenses} from '../shared/estimateReconciliation.js'
import {calculateEstimate} from '../src/lib/estimateDocument.js'
import {assertDocument} from '../shared/aiDomain.js'
import {A} from '../tests/ai/localRepository.js'
const file=resolve('.local-review/pricing-coverage-acceptance.json'),origin='http://127.0.0.1:8792'
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{drywallId:randomUUID(),mixedId:randomUUID(),stage:'new'}
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));save()
async function api(path,method='GET',body){const r=await fetch(origin+'/test-supabase/rest/v1/'+path,{method,headers:{Authorization:'Bearer fixture-a','Content-Type':'application/json',Accept:'application/vnd.pgrst.object+json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,`Controlled local HTTP${r.status}: ${data?.code||''}`);return data}
async function put(id,title,document,markup=2500){assertDocument(document,markup);let old=await api('estimates?id=eq.'+id);if(!old)old=await api('estimates','POST',{id,title,document,markup_bps:markup});return old}
const base=buildLocalTradeDocument(localTradePlan({trade:'drywall',inputs:{lengthFt:40,widthFt:8}}),'en')
const config={boardAreaSqFt:320,measuredJointLengthFt:44,wastePercent:10,finishingSqFtPerHour:null,hourlyRate:0,expensesPercent:5,includeFasteners:true,includeRemoval:true}
const finished=reconcileEstimateExpenses(addDrywallFinishing(base,base.sections[0].id,config,{scopeConfirmed:true}))
const stored=await put(report.drywallId,'LOCAL QA · drywall board + confirmed joint treatment',finished)
assert.equal(stored.document.sections[0].items[0].quantity,11)
const added=stored.document.sections[1];assert.equal(added.items.find(i=>i.ruleKey==='finish:compound').unitCost,26.99);assert.equal(added.items.find(i=>i.ruleKey==='finish:tape').unitCost,6.59)
assert.equal(added.items.find(i=>i.ruleKey==='finish:removal').priceMissing,true)
const entries=['lvp','baseboard','drywall'].map((trade,n)=>({zone:'Separate QA zone'+n,record:{id:'synthetic-'+trade,owner_id:A,version:1,markup_bps:2500,document:buildLocalTradeDocument(localTradePlan({trade,inputs:trade==='baseboard'?{lengthFt:120}:{lengthFt:20,widthFt:20}}),'en')}}))
const mixed=combineApprovedEstimates(A,entries),mixedStored=await put(report.mixedId,'LOCAL QA · three separately approved scopes',mixed.document,0)
assert.equal(mixedStored.document.sections.length,3);assert.equal(mixedStored.document.sections.flatMap(s=>s.items).filter(i=>i.ruleKey==='trade:labor').length,3)
report.stage='http-verified';report.drywallVersion=stored.version;report.mixedVersion=mixedStored.version;report.drywallKnownCostCents=calculateEstimate(stored.document,stored.markup_bps).costCents;report.noPaidAiCalls=true;report.reviewUrl='http://127.0.0.1:5182/estimates/'+report.drywallId;report.mixedUrl='http://127.0.0.1:5182/estimates/'+report.mixedId;report.mixedAutomaticNaturalLanguage=false;save();console.info(JSON.stringify(report,null,2))
