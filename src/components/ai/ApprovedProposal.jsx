import { useState } from 'react'
import { proposalView,localText } from '../../../shared/aiDomain.js'
import { proposalPrices, itemUnitSaleCents, itemCostCents } from '../../lib/estimateDocument.js'
import { useAiText,strings } from './strings.js'
import '../../styles/ai.css'
export default function ApprovedProposal({estimate,onLanguage,saved}){
 const {a}=useAiText();const [format,setFormat]=useState('proposal'),[includeCosts,setCosts]=useState(false),[error,setError]=useState('')
 let view;try{view=proposalView(estimate)}catch{/* Scope must be reconciled through an approved chat change. */}
 const lang=estimate.document.language||'en',d=k=>strings[lang][k]||k,money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 const prices=proposalPrices(estimate.document,estimate.markup_bps)
 async function pdf(preview){try{const {buildApprovedPdf}=await import('../../lib/approvedProposalPdf.js');const doc=buildApprovedPdf(estimate,{format,includeCosts});if(preview){const url=doc.output('bloburl');window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000)}else doc.save(`${estimate.id.slice(0,8)}-${format}-${lang}-r${estimate.version}.pdf`)}catch{setError(a('invalidScope'))}}
 return <div className="ai-page"><div className="ai-actions"><label>{a('language')}<select value={lang} onChange={e=>onLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label><select aria-label={a('proposal')} value={format} onChange={e=>setFormat(e.target.value)}><option value="proposal">{a('proposal')}</option><option value="detailed">{a('detailed')}</option></select><label><input type="checkbox" checked={includeCosts} onChange={e=>setCosts(e.target.checked)}/>{a('internal')}</label></div>
 {!view&&<p role="alert">{a('invalidScope')}</p>}{!saved&&<p role="status">{a('saveFirst')}</p>}{error&&<p role="alert">{error}</p>}
 <button className="btn btn-ghost" disabled={!view||!saved} onClick={()=>pdf(true)}>{a('preview')}</button><button className="btn btn-primary" disabled={!view||!saved} onClick={()=>pdf(false)}>{a('pdf')}</button>
 {view&&<article className="ai-proposal"><h2>{view.business.name||'One Stop Building & Remodeling'}</h2><p>{[view.business.address,view.business.phone,view.business.license].filter(Boolean).join(' · ')}</p><p>{d(format==='detailed'?'detailed':'proposal')}</p><h2>{view.title}</h2><p>{d('client')}: {view.client||d('none')}</p><p>{d('address')}: {view.address||d('none')}</p><p>{estimate.id.slice(0,8).toUpperCase()} · {d('revision')} {view.revision} · {d('plan')} {view.scopeRevision} · {new Date(estimate.created_at).toLocaleDateString(lang)}</p>
 {view.provisional&&<p>{d('provisional')}</p>}{view.assumptions&&<p>{d('assumptions')}: {view.assumptions}</p>}
 {view.tasks.map(task=>{const section=estimate.document.sections.find(s=>s.id===task.id);return <section key={task.id}><h3>{task.room} — {task.work}</h3>{['included','excluded','measurements','preparation','product','finish','assumptions'].map(k=>task[k]&&<p key={k}><b>{d(k)}: </b>{task[k]}</p>)}{format==='detailed'&&section.items.map(i=><div className="proposal-line" key={i.id}><span>{localText(i.translations||i.description,lang)} · {i.quantity} {i.unit} · {d('unitPrice')}: {money(itemUnitSaleCents(i,estimate.markup_bps))}{includeCosts&&` · ${d('cost')}: ${money(itemCostCents(i))}`}</span><b>{money(prices.get(i.id)||0)}</b></div>)}<b>{d('total')}: {money(section.items.reduce((n,i)=>n+(prices.get(i.id)||0),0))}</b></section>})}
 <hr/><h2>{d('total')}: {money(view.sums.priceCents)}</h2>{includeCosts&&<p>{d('cost')}: {money(view.sums.costCents)}</p>}</article>}
 </div>
}
