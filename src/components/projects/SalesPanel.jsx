import {useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {salesRequest} from '../../services/sales.js'
import './sales.css'
export default function SalesPanel({project,onUpdated}){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),text=(en,esText)=>es?esText:en
 const [context,setContext]=useState(null),[notes,setNotes]=useState([]),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[noteId,setNoteId]=useState(()=>crypto.randomUUID())
 const [seller,setSeller]=useState(project.assigned_to||'')
 const loadErrorText=es?'No se pudo cargar el seguimiento. Recarga para reintentar.':'Could not load follow-up. Reload to retry.'
 useEffect(()=>{let active=true;Promise.all([salesRequest('context'),salesRequest('notes',{projectId:project.id})]).then(([c,n])=>{if(active){setContext(c);setNotes(n)}}).catch(()=>{if(active)setError(loadErrorText)});return()=>{active=false}},[project.id,loadErrorText])
 async function run(action,data){if(busy)return;setBusy(true);setError('');try{await salesRequest(action,{projectId:project.id,...data});setNotes(await salesRequest('notes',{projectId:project.id}));if(action==='note'){setBody('');setNoteId(crypto.randomUUID())}await onUpdated?.()}catch{setError(text('Not saved. Check access or reload if the assignment changed. Your note is preserved.','No se guardó. Revisa el acceso o recarga si cambió la asignación. Tu nota se conserva.'))}finally{setBusy(false)}}
 return <section className="workspace-panel sales-panel"><h2>{text('Lead follow-up','Seguimiento del lead')}</h2>
  <p><b>{text('Assigned seller','Vendedor asignado')}: </b>{project.assigned_name||text('Unassigned','Sin asignar')}</p>
  {context?.role==='manager'&&<div className="sales-assignment"><label>{text('Assign seller','Asignar vendedor')}<select value={seller} onChange={e=>setSeller(e.target.value)} disabled={busy}><option value="">{text('Unassigned','Sin asignar')}</option>{context.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="btn btn-ghost" disabled={busy||seller===(project.assigned_to||'')} onClick={()=>run('assign',{sellerId:seller||null,version:project.assignment_version})}>{text('Save assignment','Guardar asignación')}</button></div>}
  <p className="muted">{text('Reassignment shares lead follow-up, never another seller’s estimates or proposals. Previous documents keep their saved snapshot.','La reasignación comparte el seguimiento, nunca los estimados ni propuestas de otro vendedor. Los documentos anteriores conservan su copia guardada.')}</p>
  <form onSubmit={e=>{e.preventDefault();run('note',{id:noteId,body:body.trim()})}}><label htmlFor="sales-note">{text('Follow-up note','Nota de seguimiento')}</label><textarea id="sales-note" rows={3} maxLength={4000} value={body} onChange={e=>setBody(e.target.value)} disabled={busy}/><button className="btn" disabled={busy||!body.trim()}>{busy?text('Saving…','Guardando…'):text('Save note','Guardar nota')}</button></form>
  {error&&<p role="alert">{error}</p>}<ol className="sales-notes" aria-label={text('Follow-up history','Historial de seguimiento')}>{notes.map(n=><li key={n.id}><b>{n.author_name}</b> · <time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString(es?'es-US':'en-US')}</time><p>{n.kind==='assignment'?`${text('Assigned seller','Vendedor asignado')}: ${n.body==='Unassigned'?text('Unassigned','Sin asignar'):n.body}`:n.body}</p></li>)}</ol>
 </section>
}
