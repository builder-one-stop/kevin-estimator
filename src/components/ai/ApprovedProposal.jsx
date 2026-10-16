import { useState } from 'react'
import { proposalView } from '../../../shared/aiDomain.js'
import EstimateDocument from '../estimates/EstimateDocument.jsx'
import { useAiText,strings } from './strings.js'
import '../../styles/ai.css'
export default function ApprovedProposal({estimate,onLanguage,saved,flush}){
 const {a}=useAiText();const [format,setFormat]=useState('proposal'),[includeCosts,setCosts]=useState(false),[error,setError]=useState('')
 let view;try{view=proposalView(estimate)}catch{/* Scope must be reconciled through an approved chat change. */}
 const lang=estimate.document.language||'en',d=k=>strings[lang][k]||k,money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 async function pdf(preview){try{const record=flush?await flush():estimate;const {buildApprovedPdf}=await import('../../lib/approvedProposalPdf.js');const doc=buildApprovedPdf(record,{format,includeCosts});if(preview){const url=doc.output('bloburl');window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000)}else doc.save(`${estimate.id.slice(0,8)}-${format}-${lang}-r${record.version}.pdf`)}catch{setError(a('invalidScope'))}}
 return <div className="ai-page"><div className="ai-actions"><label>{a('language')}<select value={lang} onChange={e=>onLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label><select aria-label={a('proposal')} value={format} onChange={e=>setFormat(e.target.value)}><option value="proposal">{a('proposal')}</option><option value="detailed">{a('detailed')}</option></select><label><input type="checkbox" checked={includeCosts} onChange={e=>setCosts(e.target.checked)}/>{a('internal')}</label></div>
 {!view&&<p role="alert">{a('invalidScope')}</p>}{!saved&&<p role="status">{a('saveFirst')}</p>}{error&&<p role="alert">{error}</p>}
 <button className="btn btn-ghost" disabled={!view||!saved} onClick={()=>pdf(true)}>{a('preview')}</button><button className="btn btn-primary" disabled={!view||!saved} onClick={()=>pdf(false)}>{a('pdf')}</button>
 {view&&<div className="ai-proposal"><EstimateDocument record={estimate}/>{includeCosts&&<p>{d('cost')}: {money(view.sums.costCents)}</p>}</div>}
 </div>
}
