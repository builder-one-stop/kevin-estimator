import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { paintPlan } from './paintProvider.js'
import { researchCatalog } from '../../shared/researchCatalog.js'
import { defaultPaintTemplate, paintDimensions, makePaintItems, paintMarkupBps, recalculatePaintDocument } from '../../shared/paintJob.js'
import { reconcilePaintExpenses, resetPaintExpense, paintLineNotes } from '../../shared/paintReconciliation.js'
import { calculateEstimate, itemCostCents, reviseManualPrice, proposalPrices } from '../../src/lib/estimateDocument.js'
import { estimatePresentation } from '../../shared/estimatePresentation.js'
import { directEstimateChange } from '../../shared/estimateCommands.js'
import { buildApprovedPdf } from '../../src/lib/approvedProposalPdf.js'

const taskId='bedroom-walls'
function fixture() {
  const inputs=paintDimensions(paintPlan.tasks[0]),template=defaultPaintTemplate()
  const calculated=makePaintItems(taskId,inputs,template,researchCatalog)
  return {language:'en',sections:[{id:taskId,title:'Bedroom',items:calculated.items}],scope:{plan:structuredClone(paintPlan),revision:1,approvalType:'plan'},
    proposal:{intro:'',scope:'',notes:'',exclusions:'',terms:''},business:{name:'One Stop'},
    rules:{paint:{[taskId]:{version:'interior-walls-1',inputs,template,catalogSnapshots:researchCatalog.filter(row=>[template.paintCatalogId,template.repairCatalogId].includes(row.id)),areaSqFt:352}}}}
}
const line=(doc,key)=>doc.sections[0].items.find(item=>item.ruleKey===key)
const record=document=>({id:randomUUID(),title:'Synthetic bedroom',created_at:'2026-10-21T12:00:00Z',version:3,status:'Draft',markup_bps:paintMarkupBps(25),document})

describe('painting manual edits, expenses and saved presentation',()=>{
  it('updates expenses after quantity and unit-cost edits, keeps margin arithmetic consistent and never compounds on repeated reconciliation',()=>{
    const document=fixture(),paint=line(document,'painting:material')
    Object.assign(paint,reviseManualPrice(paint,{unitCost:49}),{quantity:4,ruleOverrides:{price:true,quantity:true}})
    const updated=reconcilePaintExpenses(document),expense=line(updated,'expenses:expenses')
    expect(expense).toMatchObject({quantity:1,unitCost:38.27,expenseCalculation:{mode:'percentage',percent:5,baseCents:76532,amountCents:3827}})
    expect(line(document,'expenses:expenses').unitCost).toBe(35.51)
    expect(reconcilePaintExpenses(updated)).toEqual(updated)
    const totals=calculateEstimate(updated,3333)
    expect(totals).toMatchObject({costCents:80359,markupCents:26784,priceCents:107143})
    expect(totals.marginPercent).toBeCloseTo(25,1)
    expect([...proposalPrices(updated,3333).values()].reduce((sum,value)=>sum+value,0)).toBe(107143)
    updated.sections[0].items.push({id:'material-added',description:'Extra material',quantity:1.5,unitCost:1.005,costType:'material',unit:'ea'})
    updated.sections[0].items.push({id:'equipment-added',description:'Equipment',quantity:1,unitCost:100,costType:'equipment',unit:'lot'})
    expect(line(reconcilePaintExpenses(updated),'expenses:expenses').expenseCalculation.baseCents).toBe(76684)
  })
  it('preserves explicit expense cost and quantity exceptions through recalculation, and resets only on an explicit action',()=>{
    const document=fixture(),expense=line(document,'expenses:expenses')
    Object.assign(expense,reviseManualPrice(expense,{unitCost:40}),{quantity:2,ruleOverrides:{price:true,quantity:true,notes:true},notes:'Explicit allowance'})
    const updated=reconcilePaintExpenses(document)
    expect(line(updated,'expenses:expenses')).toMatchObject({quantity:2,unitCost:40,expenseCalculation:{mode:'manual',amountCents:8000}})
    const rebuilt=recalculatePaintDocument(updated,taskId,{}, {lengthFt:13},researchCatalog)
    expect(line(rebuilt,'expenses:expenses')).toMatchObject({quantity:2,unitCost:40})
    expect(recalculatePaintDocument(rebuilt,taskId,{}, {},researchCatalog)).toEqual(rebuilt)
    expect(paintLineNotes(line(rebuilt,'expenses:expenses'),rebuilt.rules.paint[taskId])).toContain('Manual expense override')
    expect(paintLineNotes(line(rebuilt,'expenses:expenses'),rebuilt.rules.paint[taskId])).toContain('Explicit allowance')
    const reset=structuredClone(rebuilt)
    reset.sections[0].items=reset.sections[0].items.map(item=>item.ruleKey==='expenses:expenses'?resetPaintExpense(item):item)
    const automatic=reconcilePaintExpenses(reset)
    const base=automatic.sections[0].items.filter(item=>['material','labor'].includes(item.costType)).reduce((sum,item)=>sum+itemCostCents(item),0)
    expect(line(automatic,'expenses:expenses')).toMatchObject({quantity:1,unitCost:Math.round(base*0.05)/100,expenseCalculation:{mode:'percentage'}})
  })
  it('shows derived expense changes in reviewed chat diffs and retains quantity and rate overrides during later recalculation',()=>{
    const initial=record(fixture())
    const change=directEstimateChange(initial,'Change paint to 4 gal',2)
    expect(line(change.pending.document,'painting:material')).toMatchObject({quantity:4,ruleOverrides:{quantity:true},takeoff:undefined})
    expect(change.pending.operations.map(op=>op.after.ruleKey)).toContain('expenses:expenses')
    expect(change.pending.costDelta).toBe(4933)
    const rebuilt=recalculatePaintDocument(change.pending.document,taskId,{}, {},researchCatalog)
    expect(line(rebuilt,'painting:material').quantity).toBe(4)
    const reduced=directEstimateChange(initial,'Reduce labor by 10%',2)
    expect(reduced.pending.document.sections[0].items.filter(item=>item.costType==='labor').every(item=>item.unitCost===67.5)).toBe(true)
    expect(reduced.pending.operations.some(op=>op.after.ruleKey==='expenses:expenses')).toBe(true)
  })
  it('renders final manual quantities and coherent totals in both proposals/PDFs without claiming the old takeoff is current',()=>{
    const document=fixture(),paint=line(document,'painting:material')
    Object.assign(paint,reviseManualPrice(paint,{unitCost:49}),{quantity:4,ruleOverrides:{price:true,quantity:true}})
    for(const language of ['en','es']){
      const saved=record({...reconcilePaintExpenses(document),language})
      const view=estimatePresentation(saved),paintView=line({sections:view.sections},'painting:material')
      expect(paintView.notes).toContain('4 gal')
      expect(paintView.notes).not.toContain('2.2126')
      expect(paintView.notes).not.toContain('3 ×')
      expect(view.sums.priceCents).toBe(107143)
      const output=buildApprovedPdf(saved).output().replaceAll(',','')
      expect(output).toContain('1071.43')
      expect(output).not.toContain('2.2126')
    }
  })
})
