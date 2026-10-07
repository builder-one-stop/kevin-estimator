import { jsPDF } from 'jspdf'
import { proposalView, localText } from '../../shared/aiDomain.js'
import { proposalPrices, itemCostCents, itemUnitSaleCents } from './estimateDocument.js'
import { strings } from '../components/ai/strings.js'
export function buildApprovedPdf(estimate,{format='proposal',includeCosts=false}={}) {
 const view=proposalView(estimate),a=k=>strings[view.language][k]||k,money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 const pdf=new jsPDF({unit:'pt',format:'letter'}),left=48,right=564,bottom=736
 const prices=proposalPrices(estimate.document,estimate.markup_bps)
 let y=60,group=''
 function newPage(){pdf.addPage();y=58;pdf.setFontSize(9);pdf.setTextColor(100);pdf.text(`${view.business.name||'One Stop'} · ${estimate.id.slice(0,8).toUpperCase()} · ${a('revision')} ${view.revision}`,left,30);if(group)block(`${group} (${a('continued')})`,11,true)}
 function ensure(h){if(y+h>bottom)newPage()}
 function block(value,size=10,bold=false){if(!value)return;pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(30);const lines=pdf.splitTextToSize(String(value),right-left);for(const line of lines){ensure(size+7);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(30);pdf.text(line,left,y);y+=size+4}y+=3}
 block(view.business.name||'One Stop Building & Remodeling',19,true)
 block([view.business.address,view.business.phone,view.business.license].filter(Boolean).join(' | '),9)
 block(a(format==='detailed'?'detailed':'proposal'),12,true);block(view.title,17,true)
 block(`${a('client')}: ${view.client||a('none')}`)
 block(`${a('address')}: ${view.address||a('none')}`)
 block(`${estimate.id.slice(0,8).toUpperCase()} | ${new Date(estimate.created_at).toLocaleDateString(view.language)} | ${a('revision')} ${view.revision} | ${a('plan')} ${view.scopeRevision}`,9)
 if(view.provisional)block(a('provisional'),10,true)
 if(view.assumptions)block(`${a('assumptions')}: ${view.assumptions}`)
 for(const task of view.tasks){
  // Keep the final room and grand total together whenever they fit on a fresh page.
  const last = task.id === view.tasks.at(-1).id
  const sectionForHeight = estimate.document.sections.find(s=>s.id===task.id)
  const measure = (value,size=10,bold=false) => { pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);return pdf.splitTextToSize(String(value),right-left).length*(size+4)+3 }
  let roomHeight=measure(`${task.room} — ${task.work}`,12,true)+27
  for(const key of ['included','excluded','measurements','preparation','product','finish','assumptions'])if(task[key])roomHeight+=measure(`${a(key)}: ${task[key]}`)
  if(format==='detailed')for(const item of sectionForHeight.items)roomHeight+=measure(localText(item.translations||item.description,view.language),10,true)+measure('price row',9)+(includeCosts?measure('cost row',9):0)
  group='';ensure(last && roomHeight+75<=bottom-58 ? roomHeight+75 : 70);group=task.room;block(`${task.room} — ${task.work}`,12,true)
  for(const key of ['included','excluded','measurements','preparation','product','finish','assumptions'])if(task[key])block(`${a(key)}: ${task[key]}`)
  const section=estimate.document.sections.find(s=>s.id===task.id)
  if(format==='detailed')for(const item of section.items){
   ensure(60)
   block(localText(item.translations||item.description,view.language),10,true)
   const amount=prices.get(item.id)||0
   const unitSale=itemUnitSaleCents(item,estimate.markup_bps)
   block(`${item.quantity} ${item.unit.toUpperCase()}  |  ${a('unitPrice')}: ${money(unitSale)}  |  ${a('total')}: ${money(amount)}`,9)
   if(includeCosts)block(`${a('cost')}: ${money(itemCostCents(item))}`,9)
  }
  const total=section.items.reduce((n,i)=>n+(prices.get(i.id)||0),0)
  if(last)ensure(105)
  block(`${a('total')}: ${money(total)}`,11,true);group='';y+=6
 }
 group='';ensure(75);pdf.setDrawColor(210);pdf.line(left,y,right,y);y+=24
 block(`${a('total')}: ${money(view.sums.priceCents)}`,17,true)
 if(includeCosts)block(`${a('cost')}: ${money(view.sums.costCents)}`,11)
 const pages=pdf.getNumberOfPages()
 for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(110);pdf.text(`${a('page')} ${i}/${pages}`,right,765,{align:'right'})}
 return pdf
}
