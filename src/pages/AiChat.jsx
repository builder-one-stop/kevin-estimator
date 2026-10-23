import {useBetaAccess} from '../components/auth/BetaAccessContext.jsx'
import {localSalesEnabled} from '../services/sales.js'
import { lazy,Suspense,useCallback,useEffect,useLayoutEffect,useRef,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { setLanguage } from '../i18n/index.js'
import { aiRequest,command } from '../services/ai.js'
import { getClients } from '../services/clients.js'
import { getProjects } from '../services/projects.js'
import { useAiText,errorText } from '../components/ai/strings.js'
import Plan from '../components/ai/Plan.jsx'
import EstimateWorkspace from './EstimateWorkspace.jsx'
import { bridgeText, isPdfRequest } from '../../shared/estimatePresentation.js'
import HistoryDrawer from '../components/ai/HistoryDrawer.jsx'
import { ArrowUp, ImagePlus, ArrowDown, Settings2 } from 'lucide-react'
import { compactTitle } from '../../shared/chatPresentation.js'
import ChatActivity from '../components/ai/ChatActivity.jsx'
import ApiUsagePanel from '../components/ai/ApiUsagePanel.jsx'
import HybridBudgetPanel from '../components/ai/HybridBudgetPanel.jsx'
import ActualCostsPanel from '../components/ai/ActualCostsPanel.jsx'
import '../styles/ai.css'
const LocalLibraryPanel=lazy(()=>import('../components/ai/LocalLibraryPanel.jsx'))
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
export default function AiChat(){
 const seller=useBetaAccess()?.role==='seller'
 const {id}=useParams(),{a,language}=useAiText()
 const estimateEditor=useRef(null),b=bridgeText(language)
 const [documentNotice,setDocumentNotice]=useState('')
 const [assetTick,setAssetTick]=useState(0)
 const [row,setRow]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[planDraft,setPlanDraft]=useState(null)
 const [estimate,setEstimate]=useState(null),[assets,setAssets]=useState([]),[mode,setMode]=useState('real'),[clients,setClients]=useState([]),[projects,setProjects]=useState([])
 const [clientId,setClientId]=useState(''),[projectId,setProjectId]=useState(''),[revisions,setRevisions]=useState([])
 const requestRef=useRef(null),draftKey=useRef(null),mounted=useRef(true),lock=useRef(false),rowRef=useRef(null)
 const [outbox,setOutbox]=useState(null),[newContent,setNewContent]=useState(false)
 const [localLibraryAvailable,setLocalLibraryAvailable]=useState(false)
 const [actualCostsAvailable,setActualCostsAvailable]=useState(false)
 const scroll=useRef(null),content=useRef(null),atEnd=useRef(true),input=useRef(null)
 const accept=useCallback(next=>{if(mounted.current){
  if(!draftKey.current){
   draftKey.current=`onestop-chat-draft:${next.owner_id}:${id}`
   setClientId(next.client_id||'');setProjectId(next.project_id||'')
   try{const saved=JSON.parse(sessionStorage.getItem(draftKey.current)||'null');if(saved){setText(saved.text||'');setPlanDraft(saved.planDraft||null);setOutbox(saved.outbox?{...saved.outbox,status:'failed'}:null)}}catch{/* Corrupt tab-local drafts never block server history. */}
  }
  setOutbox(old=>old&&next.state.receipts.includes(old.id)?null:old);setRow(old=>!old||next.version>=old.version?next:old);if(!rowRef.current||next.version>=rowRef.current.version)rowRef.current=next
 }},[id])
 const refresh=useCallback(async()=>{const next=await aiRequest(`conversations/${id}`);accept(next);return next},[id,accept])
 useEffect(()=>{
  mounted.current=true
  refresh().catch(e=>{if(mounted.current)setError(e.code)})
  Promise.all([aiRequest('status'),getClients(),getProjects()]).then(([status,c,p])=>{
   if(!mounted.current)return
   setMode(status.mode);setActualCostsAvailable(Boolean(status.actualCostsAvailable));setLocalLibraryAvailable(Boolean(status.localLibraryAvailable));setClients(c);setProjects(p)
  }).catch(e=>{if(mounted.current)setError(e.code)})
  let timer
  const poll=async()=>{try{await refresh()}catch(e){if(mounted.current)setError(e.code)}if(mounted.current)timer=setTimeout(poll,rowRef.current?.state.run?.status==='working'?850:3000)}
  timer=setTimeout(poll,850)
  return()=>{mounted.current=false;clearTimeout(timer)}
 },[id,refresh,accept])
 useEffect(()=>{if(draftKey.current)try{sessionStorage.setItem(draftKey.current,JSON.stringify({text,planDraft,outbox}))}catch{queueMicrotask(()=>setError('DRAFT_STORAGE_FAILED'))}},[text,planDraft,outbox])
 const changeKey=JSON.stringify([row?.state.messages.length,row?.state.run?.preview,row?.state.planRevision,estimate?.version,outbox?.id])
 useLayoutEffect(()=>{if(!scroll.current)return;if(atEnd.current)scroll.current.scrollTop=scroll.current.scrollHeight;else setNewContent(true)},[changeKey])
 const hasRow=!!row
 useEffect(()=>{if(!content.current)return;const observer=new ResizeObserver(()=>{if(atEnd.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight});observer.observe(content.current);return()=>observer.disconnect()},[hasRow])
 function latest(){atEnd.current=true;setNewContent(false);scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'})}
 const rowVersion=row?row.estimate_id+':'+(row.state.run?.status==='working'?'working':row.version):null
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
 async function act(action,body={},version=row?.version,requestId){
  if(lock.current)return false;lock.current=true;setBusy(true);setError('')
  const signature=JSON.stringify({action,body,version})
  if(requestRef.current?.signature!==signature)requestRef.current={signature,id:crypto.randomUUID()}
  try{if(estimateEditor.current&&['message','apply','restore','language'].includes(action))await estimateEditor.current.flush();const next=await command({...row,version},action,body,requestId||requestRef.current.id);accept(next);requestRef.current=null;return true}
  catch(e){setError(e.code||'ESTIMATE_CONFLICT');return false}finally{lock.current=false;setBusy(false)}
 }

 async function sendMessage(pending=outbox){
  if(lock.current||rowRef.current?.state.run?.status==='working')return
  if(!pending&&isPdfRequest(text)){setDocumentNotice('');if(!estimateEditor.current){setDocumentNotice(b('noEstimate'));return}lock.current=true;setBusy(true);try{if(await estimateEditor.current.download()){setText('');setDocumentNotice(b('downloaded'))}}finally{lock.current=false;setBusy(false)}return}
  let message=pending||{id:crypto.randomUUID(),version:row.version,content:text.trim()}
  if(pending){try{const latest=await refresh();if(latest.state.receipts.includes(pending.id)){setOutbox(null);return}message={...pending,version:latest.version}}catch{setOutbox({...pending,status:'failed'});setError('API_UNAVAILABLE');return}}
  if(!message.content)return
  setOutbox({...message,status:'sending'});if(!pending)setText('');latest()
  if(await act('message',{content:message.content},message.version,message.id))setOutbox(null)
  else setOutbox(rowRef.current?.state.receipts.includes(message.id)?null:{...message,status:'failed'})
 }
 async function editUnsent(){
  if(lock.current)return
  try{const next=await refresh();if(!next.state.receipts.includes(outbox.id)){setText(outbox.content);setError('')}setOutbox(null);input.current?.focus()}catch(e){setError(e.code)}
 }
 async function upload(e){const file=e.target.files?.[0];e.target.value='';if(!file||lock.current)return;if(file.size>4194304){setError('IMAGE_SIZE');return}lock.current=true;setBusy(true)
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)})
   await aiRequest(`conversations/${id}/assets`,{data});setAssetTick(x=>x+1);await refresh()
  }catch(e){setError(e.code||'UPLOAD_FAILED')}finally{lock.current=false;setBusy(false)}
 }
 async function loadRevisions(){try{setRevisions(await aiRequest(`conversations/${id}/revisions`))}catch(e){setError(e.code)}}
 if(!row)return <div className="page ai-page"><Link to="/chat">{a('history')}</Link><p role={error?'alert':'status'}>{error?errorText(error,a):a('loading')}</p><button onClick={()=>refresh().catch(e=>setError(e.code))}>{a('retry')}</button></div>
 const s=row.state,working=s.run?.status==='working',disabled=busy||working||!!outbox
 return <div className="ai-page ai-chat"><header className="ai-chat-toolbar"><div className="ai-chat-title"><span className="home-eyebrow">{a('chat')}</span><h1>{compactTitle(s.plan?.title?.[language]||row.title)}</h1></div><div className="ai-toolbar-actions">{!seller&&<Link to="/chat/settings" aria-label={a('settings')} title={a('settings')}><Settings2 size={19}/></Link>}<label className="ai-ui-language"><span className="sr-only">{a('uiLanguage')}</span><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label><HistoryDrawer /></div></header>
 <div className="ai-thread" ref={scroll} onScroll={()=>{const node=scroll.current;atEnd.current=node.scrollHeight-node.scrollTop-node.clientHeight<90;if(atEnd.current)setNewContent(false)}}><div className="ai-thread-content" ref={content}>
 {documentNotice&&<p role="status">{documentNotice}</p>}
 {['controlled-test','isolated-real-ai'].includes(mode)&&<><p className="ai-banner">{mode==='isolated-real-ai'?(language==='es'?'IA REAL OPENAI · BASE LOCAL AISLADA · solo datos sintéticos; sin Supabase productivo.':'REAL OPENAI AI · ISOLATED LOCAL DATABASE · synthetic data only; no production Supabase.'):a('test')}</p></>}{localLibraryAvailable&&<Suspense fallback={<p role="status">{a('loading')}</p>}><LocalLibraryPanel isolated={mode!=='real'} language={language} onExample={value=>{setText(value);input.current?.focus()}}/></Suspense>}
 <ApiUsagePanel state={s} language={language}/>
 {error&&<div className="estimate-error" role="alert">{errorText(error,a)} <button onClick={()=>refresh().catch(e=>setError(e.code))}>{a('reload')}</button></div>}
 <aside className="ai-market"><strong>{a('market')}</strong><small>{a('marketHelp')}</small></aside>
 <div className="ai-document-language"><label>{a('language')}<select value={s.documentLanguage} disabled={disabled} onChange={e=>act('language',{language:e.target.value})}><option value="en">English</option><option value="es">Español</option></select></label></div>
 {!localSalesEnabled&&!row.estimate_id&&<details><summary>{a('client')} / {a('project')}</summary><div className="ai-grid"><label>{a('client')}<select value={clientId} disabled={disabled} onChange={e=>{setClientId(e.target.value);setProjectId('')}}><option value="">{a('none')}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>{a('project')}<select value={projectId} disabled={disabled} onChange={e=>{setProjectId(e.target.value);setClientId(projects.find(p=>p.id===e.target.value)?.client_id||'')}}><option value="">{a('none')}</option>{projects.filter(p=>!clientId||p.client_id===clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={disabled} onClick={()=>act('links',{clientId:clientId||null,projectId:projectId||null})}>{a('links')}</button><Link to="/contacts">{a('client')}</Link><Link to="/projects">{a('project')}</Link></div></details>}
 <div className="ai-messages" role="log" aria-label={a('messages')} aria-live="off">{s.messages.filter(m=>m.content).map(m=><article className={`ai-message ${m.role}`} key={m.id} data-message-id={m.id}><div className="ai-message-label">{m.role==='user'?a('you'):'One Stop'} <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.content}</p></article>)}{outbox&&!s.receipts.includes(outbox.id)&&<article className="ai-message user pending" data-message-id={outbox.id} aria-label={a(outbox.status==='failed'?'notSent':'sending')}><div className="ai-message-label">{a('you')} · {a(outbox.status==='failed'?'notSent':'sending')}</div><p>{outbox.content}</p>{outbox.status==='failed'&&<div className="ai-actions"><button disabled={busy||working} onClick={()=>sendMessage()}>{a('retrySend')}</button><button disabled={busy} onClick={editUnsent}>{a('editMessage')}</button></div>}</article>}{!s.messages.length&&!outbox&&<div className="ai-chat-empty"><h2>{a('startTitle')}</h2><p>{a('empty')}</p></div>}
 {working&&s.run.preview&&<article className="ai-message assistant ai-preview" data-testid="stream-preview"><div className="ai-message-label">One Stop · {a('receiving')}</div><p>{s.run.preview}</p></article>}
 </div>
 <ChatActivity run={s.run} sending={outbox?.status==='sending'} language={language} onCancel={()=>act('cancel',{runId:s.run.id})} cancelDisabled={busy}/>
 {s.run?.status==='cancelled'&&<p role="status" className="ai-cancelled">{language==='es'?'Ejecución cancelada. El trabajo guardado se conserva.':'Run cancelled. Saved work is preserved.'}</p>}
 {s.run?.status==='error'&&<p className="estimate-error" role="alert">{errorText(s.run.error,a)} <button disabled={disabled} onClick={()=>act('retry')}>{a('retry')}</button></p>}
 <div className="ai-photos">{assets.map(x=><figure key={x.id}><img src={x.url} alt={a('photos')}/><button disabled={disabled} onClick={async()=>{try{await aiRequest(`assets/${x.id}`,{},'DELETE');setAssetTick(x=>x+1);await refresh()}catch(e){setError(e.code)}}}>{a('remove')}</button></figure>)}</div>
 {s.plan&&!row.estimate_id&&<section className="ai-card"><h2>{a('plan')} · {a('revision')} {s.planRevision}</h2>
 {planDraft?<><p role="status">{a('dirty')}</p><Plan plan={planDraft.plan} onChange={p=>setPlanDraft({...planDraft,plan:p})}/><button disabled={disabled} onClick={async()=>{if(await act('savePlan',{plan:planDraft.plan},planDraft.version))setPlanDraft(null)}}>{a('savePlan')}</button><button onClick={()=>setPlanDraft(null)}>{a('discard')}</button></>:<><Plan plan={s.plan}/><div className="ai-actions"><button disabled={disabled} onClick={()=>setPlanDraft({plan:structuredClone(s.plan),version:row.version})}>{a('edit')}</button>
 {s.approvedRevision===s.planRevision?<><b>{a('approveStatus')} {s.planRevision}</b><button className="btn btn-primary" disabled={disabled} onClick={()=>act('generate')}>{a('generate')}</button></>:<button className="btn btn-primary" disabled={disabled} onClick={()=>act('approve',{revision:s.planRevision})}>{a('approve')}</button>}</div></>}
 </section>}
 {estimate&&<section className="ai-card" data-testid="estimate-result">
 <EstimateWorkspace key={estimate.id} estimateId={estimate.id} embedded editorRef={estimateEditor} onSaved={setEstimate} disabled={disabled}/>
 <HybridBudgetPanel record={estimate} language={language}/>
 {actualCostsAvailable&&estimate.document.hybrid&&<ActualCostsPanel isolated={mode!=='real'} record={estimate} language={language}/>}
 <div className="ai-actions"><Link to={`/estimates/${estimate.id}`}>{a('open')}</Link><button onClick={loadRevisions}>{a('revisions')}</button></div>
 {revisions.map(r=><p key={r.id}>{a('revision')} {r.version} · {r.origin} <button disabled={disabled||r.version===estimate.version} onClick={async()=>{if(window.confirm(a('restoreConfirm'))&&await act('restore',{estimateVersion:estimate.version,restoreVersion:r.version})){setRevisions([]);await estimateEditor.current?.refresh()}}}>{a('restore')}</button></p>)}
 </section>}
 {s.pending&&<section className="ai-card"><h2>{a('changes')} · {a('revision')} {s.pending.revision}</h2>{planDraft?<><Plan plan={planDraft.plan} onChange={p=>setPlanDraft({...planDraft,plan:p})}/><button disabled={disabled} onClick={async()=>{if(await act('savePlan',{plan:planDraft.plan},planDraft.version))setPlanDraft(null)}}>{a('savePlan')}</button><button onClick={()=>setPlanDraft(null)}>{a('discard')}</button></>:<><Plan plan={s.pending.plan}/><button disabled={disabled} onClick={()=>setPlanDraft({plan:structuredClone(s.pending.plan),version:row.version})}>{a('edit')}</button></>}{s.pending.operations.map(op=><div className="ai-diff" key={op.id}><b>{a(op.action==='remove'?'remove':op.action)}</b><span>{op.before&&`${op.before.description}: ${op.before.quantity} ${op.before.unit} × ${op.before.unitCost}`} → {op.after&&`${op.after.description}: ${op.after.quantity} ${op.after.unit} × ${op.after.unitCost}`}<small className="ai-change-source">{a('provenance')}: {op.before?.priceSource||'—'} → {op.after?.priceSource||'—'} · {a('markup')}: {op.before?.markupBps==null?'—':op.before.markupBps/100} → {op.after?.markupBps==null?'—':op.after.markupBps/100}</small></span></div>)}<p>{s.pending.blocked?a('pending'):`${a('costImpact')}: ${money(s.pending.costDelta)} · ${a('saleImpact')}: ${money(s.pending.saleDelta)}`}</p>{s.pending.blocked&&<button disabled={disabled||!!planDraft} onClick={()=>act('message',{content:a('priceRevisedPrompt')})}>{a('priceRevised')}</button>}<button className="btn btn-primary" disabled={disabled||s.pending.blocked||!!planDraft} onClick={()=>act('apply',{revision:s.pending.revision})}>{a('apply')}</button></section>}
 </div></div>
 <div className="ai-composer-dock">{newContent&&<button className="ai-new-content" onClick={latest}><ArrowDown size={16}/>{a('newContent')}</button>}
 <form className="ai-composer" onSubmit={e=>{e.preventDefault();sendMessage()}}><label className="sr-only" htmlFor="chat-message">{a('message')}</label><textarea ref={input} id="chat-message" rows={2} maxLength={8000} placeholder={a('message')} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();if(!disabled)sendMessage()}}}/><div className="ai-composer-actions"><label className={`ai-photo-button ${disabled?'disabled':''}`} title={a('photos')}><ImagePlus size={19}/><span>{a('photos')}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={upload}/></label><small>{a('composerHelp')}</small><button className="ai-send" aria-label={a('send')} disabled={disabled||!text.trim()}><ArrowUp size={20}/></button></div></form><details className="ai-photo-help"><summary>{a('photoGuidance')}</summary><small>{a('photoHelp')}</small></details>
 </div></div>
}
