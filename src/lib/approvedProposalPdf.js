import { jsPDF } from 'jspdf'
import { assertDocument } from '../../shared/aiDomain.js'
import { estimatePresentation } from '../../shared/estimatePresentation.js'
import { strings } from '../components/ai/strings.js'
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
const clean=x=>String(x??'').replace(/[\u2010-\u2015]/g,'-').replace(/\u2026/g,'...')
export function buildApprovedPdf(estimate,{format='proposal',includeCosts=false}={}) {
 if(estimate.document.scope)assertDocument(estimate.document,estimate.markup_bps)
 const v=estimatePresentation(estimate),{t}=v,pdf=new jsPDF({unit:'pt',format:'letter'}),left=44,right=568,bottom=726
 let y=55,tableActive=false
 const widths=[268,48,42,82,84],xs=[left,left+268,left+316,left+358,left+440]
 const style=(size=10,bold=false,color=35)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color)}
 const lines=(text,width=right-left,size=10,bold=false)=>{style(size,bold);return pdf.splitTextToSize(clean(text),width)}
 function nextPage(){pdf.addPage();const header=lines(`${v.business.name||'One Stop'} | #${v.number} | ${t('revision')} ${v.revision}`,right-left,9);style(9,false,95);pdf.text(header,left,26);const ruleY=30+header.length*11;pdf.setDrawColor(220);pdf.line(left,ruleY,right,ruleY);y=ruleY+22;if(tableActive)tableHead()}
 function ensure(height){if(y+height>bottom)nextPage()}
 function block(text,size=10,bold=false,gap=8){if(!text)return;const wrapped=lines(text,right-left,size,bold);for(const line of wrapped){ensure(size+5);style(size,bold);pdf.text(line,left,y);y+=size+4}y+=gap}
 function heading(text){ensure(42);block(text,12,true,4)}
 function tableHead(){pdf.setFillColor(37,43,49);pdf.rect(left,y-12,right-left,26,'F');style(9,true,255);['description','quantity','unit','unitPrice','amount'].forEach((k,i)=>pdf.text(t(k),i===0?xs[i]+7:xs[i]+widths[i]-7,y+4,{align:i===0?'left':'right'}));y+=27}
 function tableRow(item){
  const description=lines(item.label+(item.notes?'\n'+item.notes:'')+(item.priceSource?'\n'+item.priceSource+(item.priceDate?' · '+item.priceDate:''):''),widths[0]-14,9)
  const height=Math.max(30,description.length*12+14)
  // Ordinary rows move intact. Exceptional long text continues explicitly with repeated headers.
  if(height<=bottom-100)ensure(height)
  let remaining=[...description],first=true
  while(remaining.length){
   ensure(30)
   const count=Math.max(1,Math.floor((bottom-y-14)/12)),chunk=remaining.splice(0,count),h=Math.max(30,chunk.length*12+14)
   style(9);pdf.text(chunk,xs[0]+7,y+5)
   if(first){[item.quantityPending?'-':item.quantity,item.unit,item.unitPriceDisplay,item.priceMissing||item.quantityPending?t('pricePending'):money(item.amount)].forEach((value,n)=>pdf.text(clean(value),xs[n+1]+widths[n+1]-7,y+5,{align:'right'}));first=false}
   else {style(8,false,100);pdf.text(t('continued'),right-7,y+5,{align:'right'})}
   y+=h;pdf.setDrawColor(225);pdf.line(left,y-8,right,y-8)
   if(remaining.length)nextPage()
  }
 }
 // Geometry reused from the application's LogoMark (Sidebar), not a fabricated signature.
 pdf.setFillColor(240,122,34);pdf.lines([[13,-10.5],[13,10.5],[0,15.5],[-26,0],[0,-15.5]],left,55,[1,1],'F',true)
 pdf.setFillColor(26,26,26);pdf.rect(left+8,62,10,8,'F');pdf.setDrawColor(141,198,63);pdf.setLineWidth(2.4);pdf.lines([[10,-7.8],[10,7.8]],left+3,55.3,[1,1],'S',false);pdf.setLineWidth(.5)
 const businessLines=lines(v.business.name||'One Stop Building & Remodeling',right-left-41,18,true);pdf.text(businessLines,left+41,58);y=Math.max(88,58+businessLines.length*22)
 block([v.business.address,v.business.phone,v.business.license].filter(Boolean).join(' | '),9)
 block(strings[v.lang][format==='detailed'?'detailed':'proposal'],11,true)
 if(v.incomplete){block(t('preliminary'),14,true);block(t('incompletePricing'),10,true)}
 block(v.title,17,true)
 block(`#${v.number} | ${t('date')}: ${v.date} | ${t('revision')} ${v.revision} | ${v.finalized?t('finalized'):t('draft')}`,9)
 if(v.status)block(`${t('status')}: ${v.status}`,9)
 block(`${t('client')}: ${v.client||t('unprovided')}\n${t('project')}: ${v.project||t('unprovided')}${v.address?'\n'+v.address:''}`)
 if(v.clientContact)block(v.clientContact,9)
 if(v.provisional)block(t('provisional'),10,true)
 if(v.hybrid)block(t('currentMarkup')+': '+v.markupBps/100+'%',10,true)
 if(v.proposal.intro){heading(t('intro'));block(v.proposal.intro)}
 heading(t('scope'));block(v.proposal.scope)
 for(const task of v.scope){const height=lines(task.title,right-left,12,true).length*16+4+task.blocks.reduce((n,b)=>n+lines(`${strings[v.lang][b.key]||t(b.key)}: ${b.value}`).length*14+8,0);if(height<bottom-70)ensure(height);heading(task.title);for(const b of task.blocks)block(`${strings[v.lang][b.key]||t(b.key)}: ${b.value}`)}
 ensure(76);tableActive=true;tableHead()
 for(const section of v.sections){
  const sectionLines=lines(section.title,right-left-14,10,true),h=sectionLines.length*14+15
  ensure(Math.min(h+45,bottom-100));pdf.setFillColor(243,245,246);pdf.rect(left,y-12,right-left,h,'F');style(10,true);pdf.text(sectionLines,left+7,y+2);y+=h
  for(const item of section.items)tableRow(item)
 }
 tableActive=false;y+=8;ensure(includeCosts?94:70)
 style(10);pdf.text(t(v.incomplete?'knownSubtotal':'subtotal'),left+285,y);pdf.text(money(v.sums.priceCents),right-7,y,{align:'right'});y+=23
 pdf.setDrawColor(240,122,34);pdf.setLineWidth(2);pdf.line(left+265,y-8,right,y-8);style(14,true);pdf.text(t(v.incomplete?'preliminary':'total'),left+265,y+12);pdf.text(v.incomplete?t('pricePending'):money(v.sums.priceCents),right-7,y+34,{align:'right'});y+=55
 if(includeCosts)block(`${strings[v.lang].cost}: ${money(v.sums.costCents)}`,10)
 if(v.assumptions){heading(t('assumptions'));block(v.assumptions)}
 for(const [key,label] of [['notes','notes'],['exclusions','excluded'],['terms','conditions']])if(v.proposal[key]){heading(t(label));block(v.proposal[key])}
 const signer=[v.business.signerName,v.business.signerTitle].filter(Boolean).join(' | ');const signatureHeight=121+(signer?lines(signer,right-left,9,true).length*13+4:0)+lines(t('acceptanceHelp'),right-left,8).length*12+3+lines(t('finalizationHelp'),right-left,8).length*12+8;ensure(signatureHeight);pdf.setDrawColor(215);pdf.setLineWidth(.5);pdf.line(left,y,right,y);y+=23;style(11,true);pdf.text(t('preparedBy'),left,y);pdf.text(t('customerAcceptance'),left+285,y);y+=18
 if(v.business.signatureImage){try{const props=pdf.getImageProperties(v.business.signatureImage),w=Math.min(180,60*props.width/props.height),h=w*props.height/props.width;pdf.addImage(v.business.signatureImage,props.fileType,left,y,w,h)}catch{throw new Error('INVALID_SIGNATURE')}}
 else{style(8,false,100);pdf.text(lines(t('signatureMissing'),220,8),left,y+10)}
 style(9);pdf.text(`${t('customerName')}: ____________________`,left+285,y+10);pdf.text(`${t('customerSignature')}: ________________`,left+285,y+40);pdf.text(`${t('acceptanceDate')}: __________________`,left+285,y+70);y+=80
 block([v.business.signerName,v.business.signerTitle].filter(Boolean).join(' | '),9,true,4);block(t('acceptanceHelp'),8,false,3);block(t('finalizationHelp'),8)
 const pages=pdf.getNumberOfPages()
 for(let i=1;i<=pages;i++){pdf.setPage(i);style(8,false,105);pdf.text(`#${v.number} - ${t('revision')} ${v.revision}`,left,765);pdf.text(`${t('page')} ${i}/${pages}`,right,765,{align:'right'})}
 return pdf
}
