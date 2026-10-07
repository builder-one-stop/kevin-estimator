import { useCallback,useEffect,useRef,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { setLanguage } from '../i18n/index.js'
import { aiRequest,command } from '../services/ai.js'
import { getClients } from '../services/clients.js'
import { getProjects } from '../services/projects.js'
import { calculateEstimate } from '../lib/estimateDocument.js'
import { useAiText,errorText } from '../components/ai/strings.js'
import Plan from '../components/ai/Plan.jsx'
import '../styles/ai.css'
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
export default function AiChat(){
 const {id}=useParams(),{a,language}=useAiText()
 const [assetTick,setAssetTick]=useState(0)
 const [row,setRow]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[planDraft,setPlanDraft]=useState(null)
 const [estimate,setEstimate]=useState(null),[assets,setAssets]=useState([]),[mode,setMode]=useState('real'),[clients,setClients]=useState([]),[projects,setProjects]=useState([])
 const [clientId,setClientId]=useState(''),[projectId,setProjectId]=useState(''),[revisions,setRevisions]=useState([])
 const requestRef=useRef(null),draftKey=useRef(null),mounted=useRef(true)
 const refresh=useCallback(async()=>{const next=await aiRequest(`conversations/${id}`);if(mounted.current)setRow(next);return next},[id])
 useEffect(()=>{
  mounted.current=true
  Promise.all([aiRequest(`conversations/${id}`),aiRequest('status'),getClients(),getProjects()]).then(([r,status,c,p])=>{
   if(!mounted.current)return
   setRow(r);setMode(status.mode);setClients(c);setProjects(p);setClientId(r.client_id||'');setProjectId(r.project_id||'')
   draftKey.current=`onestop-chat-draft:${r.owner_id}:${id}`
   try{const saved=JSON.parse(sessionStorage.getItem(draftKey.current)||'null');if(saved){setText(saved.text||'');setPlanDraft(saved.planDraft||null)}}catch{/* corrupt tab-local draft does not block server history */}
  }).catch(e=>setError(e.code))
  const timer=setInterval(()=>{refresh().catch(e=>{if(mounted.current)setError(e.code)})},2500)
  return()=>{mounted.current=false;clearInterval(timer)}
 },[id,refresh])
 useEffect(()=>{if(draftKey.current)try{sessionStorage.setItem(draftKey.current,JSON.stringify({text,planDraft}))}catch{queueMicrotask(()=>setError('DRAFT_STORAGE_FAILED'))}},[text,planDraft])
 const rowVersion=row?.version
 useEffect(()=>{
  if(!rowVersion)return
  let active=true
  aiRequest(`conversations/${id}/estimate`).then(e=>{if(active)setEstimate(e)}).catch(e=>setError(e.code))
  aiRequest(`conversations/${id}/assets`).then(async rows=>{
   const loaded=await Promise.all(rows.map(async x=>({...x,url:URL.createObjectURL(await aiRequest(`assets/${x.id}`,undefined,'GET',true))})))
   if(active)setAssets(old=>{old.forEach(x=>URL.revokeObjectURL(x.url));return loaded});else loaded.forEach(x=>URL.revokeObjectURL(x.url))
  }).catch(e=>setError(e.code))
  return()=>{active=false}
 },[rowVersion,id,assetTick])
 useEffect(()=>()=>{assets.forEach(x=>URL.revokeObjectURL(x.url))},[assets])
 async function act(action,body={},version=row?.version){
  if(busy)return false;setBusy(true);setError('')
  const signature=JSON.stringify({action,body,version})
  if(requestRef.current?.signature!==signature)requestRef.current={signature,id:crypto.randomUUID()}
  try{const next=await command({...row,version},action,body,requestRef.current.id);setRow(next);requestRef.current=null;return true}
  catch(e){setError(e.code);return false}finally{setBusy(false)}
 }
 async function upload(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>5242880){setError('IMAGE_SIZE');return}setBusy(true)
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)})
   await aiRequest(`conversations/${id}/assets`,{data});setAssetTick(x=>x+1);await refresh()
  }catch(e){setError(e.code||'UPLOAD_FAILED')}finally{setBusy(false)}
 }
 async function loadRevisions(){try{setRevisions(await aiRequest(`conversations/${id}/revisions`))}catch(e){setError(e.code)}}
 if(!row)return <div className="page ai-page"><Link to="/chat">{a('history')}</Link><p role={error?'alert':'status'}>{error?errorText(error,a):a('loading')}</p><button onClick={()=>refresh().catch(e=>setError(e.code))}>{a('retry')}</button></div>
 const s=row.state,working=s.run?.status==='working',disabled=busy||working
 const sums=estimate?calculateEstimate(estimate.document,estimate.markup_bps):null
 return <div className="page ai-page"><div className="ai-chat-head"><Link to="/chat">← {a('history')}</Link><Link to="/chat/settings">{a('settings')}</Link><label>{a('uiLanguage')}<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label></div><h1>{row.title}</h1>
 {mode==='controlled-test'&&<p className="ai-banner">{a('test')}</p>}
 {error&&<div className="estimate-error" role="alert">{errorText(error,a)} <button onClick={()=>refresh().catch(e=>setError(e.code))}>{a('reload')}</button></div>}
 <label>{a('language')}<select value={s.documentLanguage} disabled={disabled} onChange={e=>act('language',{language:e.target.value})}><option value="en">English</option><option value="es">Español</option></select></label>
 {!row.estimate_id&&<details><summary>{a('client')} / {a('project')}</summary><div className="ai-grid"><label>{a('client')}<select value={clientId} disabled={disabled} onChange={e=>{setClientId(e.target.value);setProjectId('')}}><option value="">{a('none')}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>{a('project')}<select value={projectId} disabled={disabled} onChange={e=>{setProjectId(e.target.value);setClientId(projects.find(p=>p.id===e.target.value)?.client_id||'')}}><option value="">{a('none')}</option>{projects.filter(p=>!clientId||p.client_id===clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={disabled} onClick={()=>act('links',{clientId:clientId||null,projectId:projectId||null})}>{a('links')}</button><Link to="/contacts">{a('client')}</Link><Link to="/projects">{a('project')}</Link></div></details>}
 <div className="ai-messages" aria-live="polite">{s.messages.map(m=><article className={`ai-message ${m.role}`} key={m.id}><p>{m.content}</p></article>)}{!s.messages.length&&<p>{a('empty')}</p>}</div>
 {working&&<div role="status" className="ai-banner">{a(s.run.stage)}… <button disabled={busy} onClick={()=>act('cancel')}>{a('cancel')}</button></div>}
 {s.run?.status==='error'&&<p className="estimate-error" role="alert">{errorText(s.run.error,a)} <button disabled={disabled} onClick={()=>act('retry')}>{a('retry')}</button></p>}
 <div className="ai-photos">{assets.map(x=><figure key={x.id}><img src={x.url} alt={a('photos')}/><button disabled={disabled} onClick={async()=>{try{await aiRequest(`assets/${x.id}`,{},'DELETE');setAssetTick(x=>x+1);await refresh()}catch(e){setError(e.code)}}}>{a('remove')}</button></figure>)}</div>
 <form onSubmit={async e=>{e.preventDefault();if(await act('message',{content:text}))setText('')}}><label>{a('message')}<textarea rows={3} maxLength={8000} value={text} onChange={e=>setText(e.target.value)}/></label><div className="ai-actions"><label className="btn btn-ghost">{a('photos')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={upload}/></label><button className="btn btn-primary" disabled={disabled||!text.trim()}>{a('send')}</button></div><small>{a('photoHelp')}</small></form>
 {s.plan&&!row.estimate_id&&<section className="ai-card"><h2>{a('plan')} · {a('revision')} {s.planRevision}</h2>
 {planDraft?<><p role="status">{a('dirty')}</p><Plan plan={planDraft.plan} onChange={p=>setPlanDraft({...planDraft,plan:p})}/><button disabled={disabled} onClick={async()=>{if(await act('savePlan',{plan:planDraft.plan},planDraft.version))setPlanDraft(null)}}>{a('savePlan')}</button><button onClick={()=>setPlanDraft(null)}>{a('discard')}</button></>:<><Plan plan={s.plan}/><div className="ai-actions"><button disabled={disabled} onClick={()=>setPlanDraft({plan:structuredClone(s.plan),version:row.version})}>{a('edit')}</button>
 {s.approvedRevision===s.planRevision?<><b>{a('approveStatus')} {s.planRevision}</b><button className="btn btn-primary" disabled={disabled} onClick={()=>act('generate')}>{a('generate')}</button></>:<button className="btn btn-primary" disabled={disabled||!!s.plan.pending.length} onClick={()=>act('approve',{revision:s.planRevision})}>{a('approve')}</button>}</div></>}
 </section>}
 {estimate&&<section className="ai-card" data-testid="estimate-result"><h2>{estimate.title}</h2><p>{estimate.id.slice(0,8).toUpperCase()} · {estimate.document.sections.reduce((n,g)=>n+g.items.length,0)} {a('lines')} · {a('revision')} {estimate.version}</p><strong>{money(sums.priceCents)}</strong><dl className="ai-financial">{[['cost',money(sums.costCents)],['markupAmount',money(sums.markupCents)],['margin',`${sums.marginPercent.toFixed(1)}%`],['materialsCost',money(sums.costsByType.material)],['laborCost',money(sums.costsByType.labor)],['laborHours',sums.laborHours]].map(([label,value])=><div key={label}><dt>{a(label)}</dt><dd>{value}</dd></div>)}</dl><p>{a(estimate.document.sections.some(g=>g.items.some(i=>i.needsReview))?'provisional':'catalogPrices')}</p><Link className="btn btn-primary" to={`/estimates/${estimate.id}`}>{a('open')}</Link><button onClick={loadRevisions}>{a('revisions')}</button>
 {revisions.map(r=><p key={r.id}>{a('revision')} {r.version} · {r.origin} <button disabled={disabled||r.version===estimate.version} onClick={async()=>{if(window.confirm(a('restoreConfirm'))&&await act('restore',{estimateVersion:estimate.version,restoreVersion:r.version}))setRevisions([])}}>{a('restore')}</button></p>)}
 </section>}
 {s.pending&&<section className="ai-card"><h2>{a('changes')} · {a('revision')} {s.pending.revision}</h2>{planDraft?<><Plan plan={planDraft.plan} onChange={p=>setPlanDraft({...planDraft,plan:p})}/><button disabled={disabled} onClick={async()=>{if(await act('savePlan',{plan:planDraft.plan},planDraft.version))setPlanDraft(null)}}>{a('savePlan')}</button><button onClick={()=>setPlanDraft(null)}>{a('discard')}</button></>:<><Plan plan={s.pending.plan}/><button disabled={disabled} onClick={()=>setPlanDraft({plan:structuredClone(s.pending.plan),version:row.version})}>{a('edit')}</button></>}{s.pending.operations.map(op=><div className="ai-diff" key={op.id}><b>{a(op.action==='remove'?'remove':op.action)}</b><span>{op.before&&`${op.before.description}: ${op.before.quantity} ${op.before.unit} × ${op.before.unitCost}`} → {op.after&&`${op.after.description}: ${op.after.quantity} ${op.after.unit} × ${op.after.unitCost}`}<small className="ai-change-source">{a('provenance')}: {op.before?.priceSource||'—'} → {op.after?.priceSource||'—'} · {a('markup')}: {op.before?.markupBps==null?'—':op.before.markupBps/100} → {op.after?.markupBps==null?'—':op.after.markupBps/100}</small></span></div>)}<p>{s.pending.blocked?a('pending'):`${a('costImpact')}: ${money(s.pending.costDelta)} · ${a('saleImpact')}: ${money(s.pending.saleDelta)}`}</p>{s.pending.blocked&&<button disabled={disabled||!!planDraft} onClick={()=>act('message',{content:a('priceRevisedPrompt')})}>{a('priceRevised')}</button>}<button className="btn btn-primary" disabled={disabled||s.pending.blocked||!!planDraft} onClick={()=>act('apply',{revision:s.pending.revision})}>{a('apply')}</button></section>}
 </div>
}
