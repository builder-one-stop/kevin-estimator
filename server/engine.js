import { estimatePublicMessage } from './publicText.js'
import { directEstimateChange } from '../shared/estimateCommands.js'
import { isPdfRequest } from '../shared/estimatePresentation.js'
import { ESTIMATING_MARKET, pricingAvailability } from '../shared/estimatingMarket.js'
import { effectiveCatalog } from '../shared/researchCatalog.js'
import { isInteriorWallPaint, paintDimensions, makePaintItems, paintMarkupBps, defaultPaintTemplate, PAINT_RULE_VERSION } from '../shared/paintJob.js'
import { randomUUID } from 'node:crypto'
import { compactTitle } from '../shared/chatPresentation.js'
import { z } from 'zod'
import { assertPlan, assertDocument, documentFromLines, proposedChange, fail, localText } from '../shared/aiDomain.js'
import { defaultSettings, parseModelResult, planSchema } from '../shared/aiSchemas.js'
const bodySchema=z.object({requestId:z.string().uuid(),version:z.number().int().min(1),action:z.enum(['message','retry','generate','savePlan','approve','apply','cancel','language','links','restore']),
  content:z.string().max(8000).optional(),plan:planSchema.optional(),revision:z.number().int().optional(),language:z.enum(['en','es']).optional(),
  clientId:z.string().uuid().nullable().optional(),projectId:z.string().uuid().nullable().optional(),estimateVersion:z.number().int().optional(),restoreVersion:z.number().int().optional()}).strict()
export class EstimatorEngine {
 constructor(repo,provider,{logger=console.info,runMode='inline'}={}) { this.repo=repo;this.provider=provider;this.active=new Map();this.logger=logger;this.runMode=runMode }
 async create(owner,body) {
  const input=z.object({id:z.string().uuid(),title:z.string().min(1).max(160),language:z.enum(['en','es'])}).strict().parse(body)
  try{return await this.repo.get(owner,input.id)}catch(e){if(e.status!==404)throw e}
  return this.repo.commit(owner,{id:input.id,title:input.title,client_id:null,project_id:null,state:{messages:[],plan:null,planRevision:0,approvedRevision:null,documentLanguage:input.language,receipts:[],runs:[]}},0)
 }
 async context(owner,row) {
  const estimate=row.estimate_id ? await this.repo.estimate(owner,row.estimate_id):null
  const clientId=estimate?estimate.client_id:row.client_id
  const projectId=estimate?estimate.project_id:row.project_id
  const client=clientId ? await this.repo.owned(owner,'clients',clientId):null
  const project=projectId ? await this.repo.owned(owner,'projects',projectId):null
  return {market:ESTIMATING_MARKET,pricing:pricingAvailability(),plan:row.state.plan,pendingPlan:row.state.run?.contextPlan||row.state.pending?.plan||null,approvedRevision:row.state.approvedRevision,estimate,client,project,documentLanguage:estimate?.document.language||row.state.documentLanguage}
 }
 async command(owner,id,input,{dispatch}={}) {
  const body=bodySchema.parse(input); await this.repo.expire(owner)
  let row=await this.repo.get(owner,id)
  if(row.state.receipts.includes(body.requestId))return row
  if(row.version!==body.version)throw fail('CONFLICT',409)
  const s=row.state, working=s.run?.status==='working'
  if(working && body.action!=='cancel')throw fail('RUN_BUSY',409)
  if(body.action==='message' && body.content?.trim()) {
   const pdf=isPdfRequest(body.content)
   const directRecord=!pdf&&row.estimate_id?await this.repo.estimate(owner,row.estimate_id):null
   const direct=directRecord?directEstimateChange(directRecord,body.content,s.planRevision+1,directRecord.document.language||s.documentLanguage):null
   if(pdf||direct){
    if(s.messages.length+2>80)throw fail('TURN_LIMIT')
    const response=pdf?(s.documentLanguage==='es'?'Usa Descargar PDF en el documento para guardar y exportar la revisión actual. No se ha creado ningún enlace de descarga.':'Use Download PDF on the document to save and export the current revision. No download link has been created.'):direct.message
    s.messages.push({id:body.requestId,role:'user',content:body.content,createdAt:new Date().toISOString()},{id:randomUUID(),role:'assistant',content:response,createdAt:new Date().toISOString()})
    if(direct)s.pending=direct.pending||null
    s.receipts=[...s.receipts,body.requestId].slice(-200)
    return this.repo.commit(owner,row,row.version)
   }
  }
  let estimate=null,estimateVersion=null,origin='ai'
  if(body.action==='cancel') {
   s.run={...s.run,status:'cancelled',preview:''};this.active.get(s.run.id)?.abort()
  } else if(body.action==='savePlan') {
   assertPlan(body.plan)
   if(row.estimate_id) {
    const current=await this.repo.estimate(owner,row.estimate_id)
    s.pending={plan:body.plan,revision:s.planRevision+1,estimateVersion:current.version,operations:[],blocked:true,costDelta:null,saleDelta:null}
   } else {s.plan=body.plan;s.planRevision++;s.approvedRevision=null}
  } else if(body.action==='approve') {
   if(body.revision!==s.planRevision || !s.plan)throw fail('CONFLICT',409)
   assertPlan(s.plan,true);s.approvedRevision=s.planRevision
  } else if(body.action==='links') {
   if(row.estimate_id)throw fail('EDIT_LINKS_IN_ESTIMATE',409)
   const project=body.projectId?await this.repo.owned(owner,'projects',body.projectId):null
   if(body.clientId)await this.repo.owned(owner,'clients',body.clientId)
   if(project && project.client_id!==(body.clientId||null))throw fail('FORBIDDEN_RELATION',403)
   row.client_id=body.clientId||null;row.project_id=body.projectId||null
  } else if(body.action==='language') {
   if(!body.language)throw fail('INVALID_LANGUAGE')
   s.documentLanguage=body.language
   if(row.estimate_id){estimate=await this.repo.estimate(owner,row.estimate_id);estimateVersion=estimate.version;estimate.document.language=body.language;origin='document-language'}
  } else if(body.action==='restore') {
   const current=await this.repo.estimate(owner,row.estimate_id)
   if(current.version!==body.estimateVersion)throw fail('ESTIMATE_CONFLICT',409)
   const revision=(await this.repo.revisions(owner,row.estimate_id)).find(r=>r.version===body.restoreVersion)
   if(!revision)throw fail('NOT_FOUND',404)
   estimate={...current,title:revision.snapshot.title,document:revision.snapshot.document,markup_bps:revision.snapshot.markup_bps};estimateVersion=current.version
   assertDocument(estimate.document,estimate.markup_bps)
   s.plan=estimate.document.scope?.plan||null;s.planRevision++;s.approvedRevision=s.planRevision
   if(estimate.document.scope)estimate.document.scope.revision=s.planRevision
   s.pending=null;origin='restore'
  } else if(body.action==='apply') {
   if(!s.pending || body.revision!==s.pending.revision)throw fail('CONFLICT',409)
   if(s.pending.blocked)throw fail('PLAN_HAS_QUESTIONS',409)
   const current=await this.repo.estimate(owner,row.estimate_id)
   if(current.version!==s.pending.estimateVersion)throw fail('ESTIMATE_CONFLICT',409)
   estimate={...current,document:s.pending.document,markup_bps:s.pending.markupBps};estimateVersion=current.version
   s.plan=s.pending.plan;s.planRevision=s.pending.revision;s.approvedRevision=s.planRevision;s.pending=null;origin='chat-approved'
  } else {
   if(s.messages.length+(body.content?2:1)>80)throw fail('TURN_LIMIT')
   if(body.action==='retry' && s.run?.status!=='error')throw fail('INVALID_RETRY',409)
   const mode=body.action==='retry'?s.run.mode:body.action==='generate'?'generate':row.estimate_id?'change':'plan'
   if(mode==='generate' && (row.estimate_id||!s.plan||s.approvedRevision!==s.planRevision))throw fail('PLAN_NOT_APPROVED',409)
   if(mode==='generate')assertPlan(s.plan,true)
   if(mode!=='generate' && body.action!=='retry' && !body.content?.trim())throw fail('EMPTY_MESSAGE')
   if(this.active.size>=8)throw fail('SERVER_BUSY',429)
   if(body.content && !s.messages.length)row.title=compactTitle(body.content)
   if(body.content)s.messages.push({id:body.requestId,role:'user',content:body.content,createdAt:new Date().toISOString()})
   if(mode==='plan')s.approvedRevision=null
   s.run={id:randomUUID(),status:'working',stage:this.runMode==='deferred'?'queued':'preparing',mode,contextPlan:s.pending?.plan||null,startedAt:new Date().toISOString()}
   s.pending=null
  }
  s.receipts=[...s.receipts,body.requestId].slice(-200)
  row=await this.repo.commit(owner,row,row.version,estimate,estimateVersion,origin)
  if(['message','retry','generate'].includes(body.action)) {
   if(this.runMode==='deferred') {
    try { if(!dispatch)throw fail('DISPATCH_UNAVAILABLE',503);await dispatch({owner,id,runId:row.state.run.id}) }
    catch {
     const latest=await this.repo.get(owner,id)
     if(latest.state.run?.id===row.state.run.id && latest.state.run.status==='working') {
      latest.state.run={...latest.state.run,status:'error',error:'DISPATCH_UNAVAILABLE'}
      try{row=await this.repo.commit(owner,latest,latest.version)}catch{row=await this.repo.get(owner,id)}
     }
    }
   } else {
    const controller=new AbortController();this.active.set(row.state.run.id,controller)
    // A persisted lease allows reloading the UI while work continues. No success is sent before commit.
    this.perform(owner,row,controller).catch(()=>{}).finally(()=>this.active.delete(row.state.run.id))
   }
  }
  return row
 }
 async performQueued(owner,id,runId) {
  if(this.runMode!=='deferred')throw fail('DISPATCH_UNAVAILABLE',503)
  let row=await this.repo.get(owner,id)
  if(row.state.run?.id!==runId || row.state.run.status!=='working' || row.state.run.stage!=='queued')return false
  row.state.run={...row.state.run,stage:'preparing',startedAt:new Date().toISOString()}
  try{row=await this.repo.commit(owner,row,row.version)}catch(e){if(e.code==='CONFLICT')return false;throw e}
  await this.perform(owner,row,new AbortController())
  return true
 }
 async perform(owner,initial,controller) {
  let row=initial;const runId=row.state.run.id;const start=Date.now()
  const timer=setTimeout(()=>controller.abort(),120000)
  const stage=async(value)=>{row.state.run.stage=value;row=await this.repo.commit(owner,row,row.version)}
  let lastPreview=0,previewUpdates=0,firstTextMs=null
  const onText=async(text,{complete=false}={})=>{
   if(controller.signal.aborted)throw fail('CANCELLED')
   if(firstTextMs===null)firstTextMs=Date.now()-start
   if(!complete && lastPreview && Date.now()-lastPreview<700)return
   row.state.run.preview=estimatePublicMessage(text,row.state.documentLanguage);row=await this.repo.commit(owner,row,row.version)
   lastPreview=Date.now();previewUpdates++
  }
  try {
   const context=await this.context(owner,row)
   const settings=(await this.repo.settings(owner))?.data||defaultSettings()
   settings.catalog=effectiveCatalog(settings.catalog)
   const assets=await this.repo.assets(owner,row.id)
   if(assets.length)await stage('images')
   const images=await Promise.all(assets.map(a=>this.repo.image(owner,a.id)))
   await stage(row.state.run.mode==='generate'?'generating':'planning')
   const {result:raw,metrics}=await this.provider.run({mode:row.state.run.mode,messages:row.state.messages,context,settings,images,signal:controller.signal,onStage:stage,onText})
   if(controller.signal.aborted)throw fail('CANCELLED')
   await stage('validating')
   const result=parseModelResult(raw);let estimate=null,estimateVersion=null
   const s=row.state
   if(s.run.mode==='plan') {
    if(result.lines.length||result.changes.length)throw fail('MODEL_INVALID_OUTPUT')
    if(result.plan){assertPlan(result.plan);row.title=compactTitle(localText(result.plan.title,s.documentLanguage));s.plan=result.plan;s.planRevision++;s.approvedRevision=null}
   } else if(s.run.mode==='generate') {
    if(result.plan||result.changes.length)throw fail('MODEL_CHANGED_APPROVED_PLAN')
    const eligible=s.plan.tasks.map(task=>({task,inputs:isInteriorWallPaint(task)?paintDimensions(task):null})).filter(x=>x.inputs)
    const paintTasks=s.plan.tasks.length===1 && eligible.length===1 ? eligible : []
    const planned=new Set(paintTasks.map(x=>x.task.id))
    const placeholder=paintTasks.map(({task})=>({id:randomUUID(),taskId:task.id,description:task.components[0],quantity:0,unit:'ea',unitCost:0,costType:'material',markupBps:null,basis:{en:'Rule calculation pending',es:'Cálculo por reglas pendiente'},catalogId:null}))
    const document={...documentFromLines(s.plan,[...result.lines.filter(line=>!planned.has(line.taskId)),...placeholder],s.documentLanguage,settings.catalog,settings.business,s.planRevision), conversationId:row.id}
    let markupBps=s.plan.markupBps
    if(paintTasks.length){
      const template=structuredClone(settings.paintTemplate||defaultPaintTemplate())
      markupBps=paintMarkupBps(template.marginPercent)
      const paint={}
      for(const {task,inputs} of paintTasks){
        const approved=[task.product.en,task.product.es,...task.components.flatMap(x=>[x.en,x.es])].join(' ').toLowerCase()
        const selectedPaint=settings.catalog.find(x=>x.id===template.paintCatalogId)
        const selectedRepair=settings.catalog.find(x=>x.id===template.repairCatalogId)
        const forTask={...template,
          paintCatalogId:selectedPaint && approved.includes(selectedPaint.brand.toLowerCase()) && approved.includes(selectedPaint.product.toLowerCase()) ? template.paintCatalogId : null,
          repairCatalogId:selectedRepair && approved.includes(selectedRepair.brand.toLowerCase()) && approved.includes(selectedRepair.product.toLowerCase()) ? template.repairCatalogId : null}
        const calculated=makePaintItems(task.id,inputs,forTask,settings.catalog,s.documentLanguage,s.plan.zip)
        document.sections.find(section=>section.id===task.id).items=calculated.items
        paint[task.id]={version:PAINT_RULE_VERSION,inputs,template:structuredClone(forTask),catalogSnapshots:settings.catalog.filter(x=>[forTask.paintCatalogId,forTask.repairCatalogId].includes(x.id)).map(x=>structuredClone(x)),areaSqFt:calculated.areaSqFt}
      }
      document.rules={paint}
      document.scope.plan.markupBps=markupBps
      assertDocument(document,markupBps)
    }
    estimate={id:randomUUID(),title:localText(s.plan.title,s.documentLanguage),markup_bps:markupBps,document};estimateVersion=0
   } else {
    if(result.lines.length)throw fail('MODEL_INVALID_OUTPUT')
    if(result.changes.length || result.plan) {
     if(result.plan?.pending.length) {
      assertPlan(result.plan)
      s.pending={plan:result.plan,revision:s.planRevision+1,estimateVersion:context.estimate.version,operations:[],blocked:true,costDelta:null,saleDelta:null}
     } else s.pending={...proposedChange(context.estimate,result,settings.catalog,s.planRevision+1),revision:s.planRevision+1}
    }
   }
   s.messages.push({id:randomUUID(),role:'assistant',content:estimatePublicMessage(result.message,s.documentLanguage),createdAt:new Date().toISOString()})
   s.run={...s.run,status:'ready',stage:'ready',preview:'',metrics:{...metrics,previewUpdates,firstTextMs}};s.runs=[...s.runs,s.run].slice(-30)
   row=await this.repo.commit(owner,row,row.version,estimate,estimateVersion,'ai-approved-plan')
   this.logger(JSON.stringify({event:'estimator_run',runId,...metrics,status:'ready'}))
  } catch(error) {
   const code=controller.signal.aborted?'CANCELLED_OR_TIMEOUT':typeof error.code==='string' && /^[A-Z_]+$/.test(error.code)?error.code: (error.name==='ZodError'?'MODEL_INVALID_OUTPUT':'MODEL_UNAVAILABLE')
   // Never log SDK bodies, prompts, images, tokens or personal context.
   this.logger(JSON.stringify({event:'estimator_run',runId,status:'error',code,durationMs:Date.now()-start,model:this.provider.model||'controlled-test',...(error.metrics?{metrics:error.metrics}:{})}))
   try {
    const latest=await this.repo.get(owner,initial.id)
    if(latest.state.run?.id===runId && latest.state.run.status==='working') {
     latest.state.run={...latest.state.run,status:'error',preview:'',error:code,...(error.metrics?{metrics:error.metrics}:{})};latest.state.runs=[...latest.state.runs,latest.state.run].slice(-30)
     await this.repo.commit(owner,latest,latest.version)
    }
   } catch { /* A competing cancellation/recovery owns the newer state. */ }
  } finally { clearTimeout(timer) }
 }
}
