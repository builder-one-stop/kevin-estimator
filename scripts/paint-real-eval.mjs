// Synthetic, read-only real-model evaluation. No database, user session or supplier access.
import { mkdir, writeFile } from 'node:fs/promises'
import { ResponsesProvider } from '../server/openai.js'
import { defaultSettings } from '../shared/aiSchemas.js'
import { effectiveCatalog } from '../shared/researchCatalog.js'
import { paintDimensions } from '../shared/paintJob.js'

const settings=defaultSettings();settings.catalog=effectiveCatalog()
const provider=new ResponsesProvider()
const report={environment:'Real OpenAI provider, synthetic prompt, no database/browser/supplier access',model:provider.model,checks:[]}
try {
  const messages=[{role:'user',content:'Please estimate painting only the interior walls of one 12 × 10 × 8 ft bedroom in Los Angeles. Use the gross wall area without subtracting openings, two coats, and patch a few minor nail holes. No ceiling or trim. Use the configured template and disclose provisional assumptions. I will review the plan and any public catalog product before approval.'}]
  const {result,metrics}=await provider.run({mode:'plan',messages,
    context:{plan:null,estimate:null,documentLanguage:'en'},settings,images:[],signal:AbortSignal.timeout(120000),onStage:async()=>{}})
  const task=result.plan?.tasks?.[0]
  report.checks.push({planReturned:!!result.plan,pending:result.plan?.pending.length??null,tasks:result.plan?.tasks.length??0,
    dimensions:task?paintDimensions(task):null,wallPaint:!!task && /paint/i.test(task.work.en) && /wall/i.test(task.included.en),
    selectedPaintDisclosed:!!task && /BEHR/i.test(task.product.en) && /BEHR ULTRA/i.test(task.product.en),
    messageQuestionCount:(result.message.match(/\?/g)||[]).length})
  report.metrics={model:metrics.model,responseModels:metrics.responseModels,promptVersion:metrics.promptVersion,usage:metrics.usage,estimatedCostUsd:metrics.estimatedCostUsd}
  if (!report.checks[0].dimensions) process.exitCode=1
  if (result.plan && !result.plan.pending.length) {
    const generation=await provider.run({mode:'generate',messages:[...messages,{role:'user',content:'I approve the displayed scope and assumptions. Generate the estimate.'}],
      context:{plan:result.plan,approvedRevision:1,estimate:null,documentLanguage:'en'},settings,images:[],signal:AbortSignal.timeout(120000),onStage:async()=>{}})
    report.generation={validStructuredResult:true,lines:generation.result.lines.length,taskIdsValid:generation.result.lines.every(line=>result.plan.tasks.some(task=>task.id===line.taskId)),
      model:generation.metrics.model,promptVersion:generation.metrics.promptVersion}
  }
} catch(error) {report.error=error.code||error.name;process.exitCode=1}
await mkdir('evidence/paint-job',{recursive:true})
await writeFile('evidence/paint-job/real-model.json',JSON.stringify(report,null,2))
console.info(JSON.stringify(report,null,2))
