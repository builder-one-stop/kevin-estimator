import { estimatePresentation } from '../../../shared/estimatePresentation.js'
import { strings } from '../ai/strings.js'
import { LogoMark } from '../layout/Sidebar.jsx'
import '../../styles/estimate-document.css'
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
export default function EstimateDocument({record}) {
 const v=estimatePresentation(record),{t}=v
 return <article className="estimate-document" data-testid="complete-estimate">
  <header><LogoMark size={38}/><div><h2>{v.business.name||'One Stop Building & Remodeling'}</h2><p>{[v.business.address,v.business.phone,v.business.license].filter(Boolean).join(' · ')}</p></div></header>
  <div className="document-heading"><div><small>{t(v.incomplete?'preliminary':'document')}</small><h2>{v.title}</h2></div><p>#{v.number}<br/>{t('revision')} {v.revision}<br/>{v.finalized?t('finalized'):t('draft')}</p></div>
  <dl className="document-meta">{[['date',v.date],['status',v.status],['client',v.client],['project',v.project]].map(([k,x])=><div key={k}><dt>{t(k)}</dt><dd>{x||t('unprovided')}</dd></div>)}</dl>{v.clientContact&&<p>{v.clientContact}</p>}{v.address&&<p>{v.address}</p>}
  {v.incomplete&&<p className="document-notice" role="status">{t('incompletePricing')}</p>}
  {v.provisional&&<p className="document-notice">{t('provisional')}</p>}
  {v.hybrid&&<p>{t('currentMarkup')}: {v.markupBps/100}%</p>}
  {v.proposal.intro&&<section><h3>{t('intro')}</h3><p>{v.proposal.intro}</p></section>}
  <section><h3>{t('scope')}</h3>{v.proposal.scope&&<p>{v.proposal.scope}</p>}{v.scope.map((s,n)=><div key={n}><h4>{s.title}</h4>{s.blocks.map(b=><p key={b.key}><b>{strings[v.lang][b.key]||t(b.key)}: </b>{b.value}</p>)}</div>)}</section>
  <div className="document-table-scroll"><table><thead><tr>{['description','quantity','unit','unitPrice','amount'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{v.sections.map(s=><Section key={s.id} section={s}/>)}</tbody></table></div>
  <dl className="document-totals"><div><dt>{t(v.incomplete?'knownSubtotal':'subtotal')}</dt><dd>{money(v.sums.priceCents)}</dd></div><div className="grand"><dt>{t(v.incomplete?'preliminary':'total')}</dt><dd>{v.incomplete?t('pricePending'):money(v.sums.priceCents)}</dd></div></dl>
  {v.assumptions&&<section><h3>{t('assumptions')}</h3><p>{v.assumptions}</p></section>}
  {['notes','exclusions','terms'].map(k=>v.proposal[k]&&<section key={k}><h3>{t({exclusions:'excluded',terms:'conditions'}[k]||k)}</h3><p>{v.proposal[k]}</p></section>)}
  <div className="document-signatures"><section><h3>{t('preparedBy')}</h3>{v.business.signatureImage?<img src={v.business.signatureImage} alt={t('preparedBy')}/>:<p className="signature-empty">{t('signatureMissing')}</p>}<p>{v.business.signerName||''}<br/>{v.business.signerTitle||''}</p></section><section><h3>{t('customerAcceptance')}</h3><p>{t('customerName')}: ____________________</p><p>{t('customerSignature')}: _________________</p><p>{t('acceptanceDate')}: ___________________</p><small>{t('acceptanceHelp')}</small></section></div>
  <small>{t('finalizationHelp')}</small>
 </article>
}
function Section({section}) {return <><tr className="document-section"><th colSpan={5}>{section.title}</th></tr>{section.items.map(i=><tr key={i.id}><td>{i.label}{i.notes&&<small>{i.notes}</small>}{i.priceSource&&<small>{i.priceSource}{i.priceDate ? ` · ${i.priceDate}` : ''}</small>}</td><td>{i.quantityPending?'-':i.quantity}</td><td>{i.unit}</td><td>{i.unitPriceDisplay}</td><td>{(i.priceMissing||i.quantityPending)?'—':money(i.amount)}</td></tr>)}</>}
