import { reconcileEstimateExpenses } from './estimateReconciliation.js'
import Decimal from 'decimal.js'
import { calculateEstimate, reviseManualPrice } from '../src/lib/estimateDocument.js'
import { assertDocument } from './aiDomain.js'
import { markReviewedPaintChange } from './paintReconciliation.js'
const normalized=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[!?]|[.,](?!\d)/g,'').trim()
const numbers={one:1,two:2,three:3,four:4,five:5,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5}
// Narrow, deterministic edits. Anything else continues through the reviewed AI diff flow.
export function directEstimateChange(record,request,revision,language='en') {
 if(!record.document?.scope?.plan)return null
 const text=normalized(request),es=language==='es',document=structuredClone(record.document),ops=[]
 const all=document.sections.flatMap(s=>s.items.map(item=>({section:s,item})))
 const labor=text.match(/^(?:(?:manten (?:los )?materiales|keep (?:the )?materials)(?: unchanged)? (?:y|and) )?(?:baja|reduce|lower|decrease) (?:la |the )?(?:mano de obra|labor) (?:un |by )?(\d+(?:\.\d+)?)\s*%$/)
 const quantity=text.match(/^(?:cambia|change|set) (.+?) (?:a|to) (\d+(?:\.\d+)?|one|two|three|four|five|uno|una|dos|tres|cuatro|cinco) (galones?|gallons?|gal|horas?|hours?|hr|unidades?|units?|ea)$/)
 if(!labor&&!quantity)return null
 let candidates,patch
 if(labor){const percent=Number(labor[1]);if(percent>100)return {message:es?'Indica un porcentaje entre 0 y 100.':'Specify a percentage between 0 and 100.'};candidates=all.filter(x=>x.item.costType==='labor');patch=i=>reviseManualPrice(i,{unitCost:new Decimal(i.unitCost).times(new Decimal(100).minus(percent).div(100)).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber()},language)}
 else{
  const selector=quantity[1].replace(/^(?:la |el |the )/,'').replace(/[()]/g,'')
  const amount=Number(quantity[2])||numbers[quantity[2]]||0,unit=/^(gal|gallon)/.test(quantity[3])?'gal':/^(hora|hour|hr)/.test(quantity[3])?'hr':'ea'
  const tokens=selector.split(/\s+/)
  candidates=all.filter(({section,item})=>{const task=document.scope?.plan.tasks.find(t=>t.id===section.id);const label=normalized([section.title,item.description,item.translations?.en,item.translations?.es,task?.room?.en,task?.room?.es,task?.work?.en,task?.work?.es].filter(Boolean).join(' '));return item.unit===unit&&tokens.every(t=>label.includes(t))})
  if(candidates.length!==1)return {message:es?'Especifica la partida y el ambiente que quieres cambiar; no se aplicó ningún cambio.':'Specify the item and room to change; no changes were applied.'}
  patch=i=>({...i,quantity:amount,quantityPending:false,quantityPendingReason:undefined})
 }
 if(!candidates.length)return {message:es?'No encontré una partida de mano de obra. Indica cuál quieres modificar.':'No labor item was found. Specify which item to change.'}
 for(const {section,item} of candidates){const next=markReviewedPaintChange(item,patch(item));section.items[section.items.indexOf(item)]=next;ops.push({action:'replace',id:item.id,before:item,after:next})}
 document.sections=reconcileEstimateExpenses(document).sections
 for(const section of document.sections)for(const item of section.items){
  if(!['expenses:expenses','trade:expenses'].includes(item.ruleKey)||ops.some(op=>op.id===item.id))continue
  const previous=record.document.sections.flatMap(s=>s.items).find(row=>row.id===item.id)
  if(previous&&Number(previous.unitCost)!==Number(item.unitCost))ops.push({action:'replace',id:item.id,before:previous,after:item})
 }
 assertDocument(document,record.markup_bps)
 const plan=structuredClone(document.scope.plan);plan.markupBps=record.markup_bps;document.scope={...document.scope,plan,revision}
 const before=calculateEstimate(record.document,record.markup_bps),after=calculateEstimate(document,record.markup_bps)
 return {message:es?'Revisa los cambios propuestos antes de aplicarlos. Las demás partidas y condiciones se conservan.':'Review the proposed changes before applying them. Other items and conditions are preserved.',pending:{plan,revision,document,markupBps:record.markup_bps,estimateVersion:record.version,operations:ops,costDelta:after.costCents-before.costCents,saleDelta:after.priceCents-before.priceCents}}
}
