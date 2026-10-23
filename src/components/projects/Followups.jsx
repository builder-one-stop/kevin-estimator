import {useEffect,useRef,useState} from 'react'
import {salesRequest} from '../../services/sales.js'
import {getProjects} from '../../services/projects.js'
import {formatLaTime,laDateToIso,laInput,requestIdentity} from '../../../shared/commercialDocuments.js'
import {useTranslation} from 'react-i18next'
import './commercial.css'
const blank=()=>({id:crypto.randomUUID(),version:0,title:'',notes:'',due:'',responsibleId:'',projectId:'',status:'pending'})
export default function Followups({projectId}){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),tr=(a,b)=>es?b:a
 const attempt=useRef(null)
 const [rows,setRows]=useState([]),[context,setContext]=useState(null),[projects,setProjects]=useState([]),[form,setForm]=useState(blank),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0)
 useEffect(()=>{let active=true;Promise.all([salesRequest('ops:context'),salesRequest('ops:followups',{projectId:projectId||null}),getProjects()]).then(([c,r,p])=>{if(active){setContext(c);setRows(r);setProjects(p);setError('')}}).catch(()=>{if(active)setError(es?'No se pudo cargar. Reintenta.':'Could not load. Retry.')});return()=>{active=false}},[projectId,tick,es])
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const dueAt=laDateToIso(form.due),input={id:form.id,version:form.version,projectId:projectId||form.projectId,responsibleId:form.responsibleId||context.id,title:form.title,notes:form.notes,dueAt,status:form.status};await salesRequest('ops:followup-save',{...input,requestId:requestIdentity(attempt,input)});setForm(blank());setTick(x=>x+1)}catch(cause){setError(cause.message?.includes('LA_TIME')?tr('Invalid or ambiguous Los Angeles time. Choose another time.','Hora inexistente o ambigua en Los Ángeles. Elige otra hora.'):tr('Not saved. Reload the list after a conflict; your draft is preserved.','No se guardó. Actualiza la lista si hubo un conflicto; tu borrador se conserva.'))}finally{setBusy(false)}}
 return <section className="workspace-panel commercial-panel"><h2>{tr('Internal follow-ups','Seguimientos internos')}</h2><p>{tr('Los Angeles time · America/Los_Angeles. No external reminders are sent.','Hora de Los Ángeles · America/Los_Angeles. No se envían recordatorios externos.')}</p>
 {error&&<p role="alert">{error} <button onClick={()=>setTick(x=>x+1)}>{tr('Reload list','Actualizar lista')}</button></p>}
 {!context?<p role="status">{tr('Loading…','Cargando…')}</p>:<><form className="commercial-form" onSubmit={save}>
 {!projectId&&<label>{tr('Lead / project','Lead / proyecto')}<select required value={form.projectId} onChange={e=>setForm({...form,projectId:e.target.value})}><option value="">—</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
 <label>{tr('Follow-up title','Título del seguimiento')}<input required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <label>{tr('Due in Los Angeles','Fecha y hora en Los Ángeles')}<input required type="datetime-local" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></label>
 <label>{tr('Responsible','Responsable')}<select value={form.responsibleId||context.id} onChange={e=>setForm({...form,responsibleId:e.target.value})}>{context.members.filter(m=>context.role==='manager'||m.id===context.id).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
 <label>{tr('Notes','Notas')}<textarea maxLength={4000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
 <label>{tr('State','Estado')}<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="pending">{tr('Pending','Pendiente')}</option><option value="completed">{tr('Completed','Completado')}</option></select></label>
 <button disabled={busy} className="btn">{tr('Save follow-up','Guardar seguimiento')}</button><button type="button" className="btn btn-ghost" onClick={()=>setForm(blank())}>{tr('New / discard draft','Nuevo / descartar borrador')}</button></form>
 {!rows.length&&<p>{tr('No follow-ups recorded.','No hay seguimientos registrados.')}</p>}<ol className="sales-notes">{rows.map(r=><li key={r.id}><b>{r.title}</b> · {r.status==='pending'?tr('Pending','Pendiente'):tr('Completed','Completado')}<p>{r.project_name} · {r.responsible_name} · {formatLaTime(r.due_at,es?'es':'en')}</p><p>{r.notes}</p><small>{tr('Recorded by','Registrado por')} {r.author_name} · {formatLaTime(r.created_at,es?'es':'en')}</small>{r.updated_at&&r.updated_name&&<p><small>{tr('Updated by','Actualizado por')} {r.updated_name} · {formatLaTime(r.updated_at,es?'es':'en')}</small></p>}<button className="btn btn-ghost" onClick={()=>setForm({id:r.id,version:r.version,requestId:crypto.randomUUID(),title:r.title,notes:r.notes,due:laInput(r.due_at),responsibleId:context.role==='seller'?context.id:r.responsible_id,projectId:r.project_id,status:r.status})}>{tr('Edit / complete','Editar / completar')}</button></li>)}</ol></>}
 </section>
}
