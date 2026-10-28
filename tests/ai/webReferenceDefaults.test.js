import {it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {prepareMaterialPlan} from '../../server/materialCatalog.js'
import {defaultSettings} from '../../shared/aiSchemas.js'
import {paintPlan,PaintProvider} from './paintProvider.js'
import {localDatabase,LocalRepository,A} from './localRepository.js'
import {EstimatorEngine} from '../../server/engine.js'
import {researchCatalog} from '../../shared/researchCatalog.js'
import {constructionLibrary} from '../../shared/constructionLibrary.js'
import {publicReferenceLibrary} from '../../shared/publicReferenceLibrary.js'
import {libraryCounts} from '../../shared/localPriceLibrary.js'
import {assessPrice} from '../../shared/priceEvidence.js'
import {buildApprovedPdf} from '../../src/lib/approvedProposalPdf.js'

it('keeps all50 existing public amounts usable as references without supplier accounts or local verification',()=>{
 const library=publicReferenceLibrary(constructionLibrary)
 expect(libraryCounts(library)).toEqual({records:59,withPrice:50,withoutPrice:9,localVerified:0})
 for(const row of library.records.filter(r=>r.unitCost!==null))expect(assessPrice({...row,status:'public_observed'},'','2026-10-28').status).toBe('public_observed')
})
it('uses web defaults without a store or ZIP and does not refresh source dates when a candidate is selected',async()=>{
 const original=await prepareMaterialPlan(paintPlan,defaultSettings())
 const candidate=await prepareMaterialPlan({...original.plan,pricingContext:{supplierId:'sherwin-williams',storeId:'704362',storeZip:'90260',jobZip:''}},defaultSettings())
 expect(candidate.plan.materialEvidence).toEqual(original.plan.materialEvidence)
 expect(original.plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({unitCost:46.98,status:'public_observed',checkedAt:'2026-10-17'})
 expect(candidate.snapshots.every(s=>s.status!=='verified'&&s.checkedAt==='2026-10-17')).toBe(true)
})
it('requires explicit alternative selection and retains the missing original request without pretending equivalence',async()=>{
 const missing=await prepareMaterialPlan(paintPlan,defaultSettings(),[{role:'user',content:'Paint SKU MISSING-SKU'}])
 const requested=missing.plan.materialRequests.find(r=>r.role==='paint')
 const revised={...missing.plan,materialRequests:missing.plan.materialRequests.map(r=>r===requested?{taskId:r.taskId,role:r.role,id:researchCatalog[0].id,alternativeFor:'SKU MISSING-SKU',alternativeAccepted:false}:r)}
 expect((await prepareMaterialPlan(revised,defaultSettings())).plan.materialEvidence.find(r=>r.role==='paint')).toMatchObject({unitCost:null,reason:'ALTERNATIVE_NOT_ACCEPTED'})
 revised.materialRequests.find(r=>r.role==='paint').alternativeAccepted=true
 const accepted=await prepareMaterialPlan(revised,defaultSettings())
 expect(accepted.snapshots.find(r=>r.id===researchCatalog[0].id)).toMatchObject({unitCost:46.98,status:'public_observed',checkedAt:'2026-10-17',referenceSelection:{kind:'accepted-alternative',requested:'SKU MISSING-SKU',accepted:true}})
 expect(accepted.plan.tasks[0].product.en).toContain('equivalence not confirmed')
})
it.each(['en','es'])('saves, reloads and exports web-only references without supplier credentials, contacts, store or ZIP in %s',async language=>{
 const db=await localDatabase()
 try{
  const repo=new LocalRepository(db),engine=new EstimatorEngine(repo,new PaintProvider(),{logger:()=>{}})
  expect(await repo.settings(A)).toBeNull()
  let row=await engine.create(A,{id:randomUUID(),title:'Web references only',language})
  const command=async(action,extra={})=>{row=await engine.command(A,row.id,{action,requestId:randomUUID(),version:row.version,...extra});for(let n=0;n<400&&row.state.run?.status==='working';n++){await new Promise(r=>setTimeout(r,10));row=await repo.get(A,row.id)}}
  await command('message',{content:'Paint interior walls12 x10 x8 ft; web references are fine.'})
  expect(row.state.plan.pending).toEqual([]);await command('approve',{revision:row.state.planRevision});await command('generate')
  expect(row.state.run.status).toBe('ready')
  const saved=await repo.estimate(A,row.estimate_id),reloaded=await repo.estimate(A,row.estimate_id)
  expect(reloaded.document).toEqual(saved.document);expect(saved.client_id).toBeNull();expect(saved.project_id).toBeNull();expect(saved.document.scope.plan.zip).toBe('')
  const paint=saved.document.sections[0].items.find(r=>r.ruleKey==='painting:material')
  expect(paint).toMatchObject({quantity:3,unitCost:46.98,priceDate:'2026-10-17',price:{status:'public_observed',verifiedZip:null}})
  expect(paint.priceMissing).not.toBe(true)
  const pdf=buildApprovedPdf(saved).output();expect(pdf).toContain(language==='es'?'referencia para presupuestar':'Web prices are budgeting references')
 }finally{await db.close()}
},30000)
