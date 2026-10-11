import { useState } from 'react'
import { localText } from '../../../shared/aiDomain.js'
import { useAiText } from './strings.js'
export default function Plan({plan,onChange}) {
 const {a,language}=useAiText();const [editingLanguage,setEditingLanguage]=useState(language);const lang=onChange?editingLanguage:language
 const field=(key,value,change)=>onChange?<label>{a(key)}<textarea value={value} onChange={e=>change(e.target.value)} rows={2}/></label>:value?<div><b>{a(key)}: </b><span>{value}</span></div>:null
 const update=(key,value)=>onChange({...plan,[key]:value})
 const bi=(obj,key,value)=>({...obj,[key]:{...obj[key],[lang]:value}})
 return <div className="ai-plan">
  <p className="ai-pricing-notice">{a('pricingLimits')}</p><p className="ai-approval-meaning">{a('approvalMeaning')}</p>
  {onChange&&<label>{a('planLanguage')}<select value={lang} onChange={e=>setEditingLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label>}
  {field('title',localText(plan.title,lang),v=>onChange(bi(plan,'title',v)))}
  {field('address',plan.address,v=>update('address',v))}{field('zip',plan.zip,v=>update('zip',v))}
  {field('assumptions',localText(plan.assumptions,lang),v=>onChange(bi(plan,'assumptions',v)))}
  {onChange?<label>{a('markup')}<input type="number" min="0" max="1000" value={plan.markupBps/100} onChange={e=>update('markupBps',Math.round(Number(e.target.value)*100))}/></label>:<p>{a('markup')}: {plan.markupBps/100}</p>}
  {plan.tasks.map((task,index)=><details key={task.id} open={!!onChange||index===0}><summary>{localText(task.room,lang)} — {localText(task.work,lang)} · {a(task.confirmed?'confirmed':'assumed')}</summary>
   {['room','work','included','excluded','measurements','preparation','product','finish','assumptions','provenance'].map(key=><div key={key}>{field(key,localText(task[key],lang),v=>update('tasks',plan.tasks.map(t=>t.id===task.id?bi(t,key,v):t)))}</div>)}
   <h4>{a('components')}</h4>{task.components.map((component,i)=><div key={i}>{field('component',localText(component,lang),v=>update('tasks',plan.tasks.map(t=>t.id===task.id?{...t,components:t.components.map((c,n)=>n===i?{...c,[lang]:v}:c)}:t)))}{onChange&&<button onClick={()=>update('tasks',plan.tasks.map(t=>t.id===task.id?{...t,components:t.components.filter((_,n)=>n!==i)}:t))}>{a('remove')}</button>}</div>)}
   {onChange&&<button onClick={()=>update('tasks',plan.tasks.map(t=>t.id===task.id?{...t,components:[...t.components,{en:'',es:''}]}:t))}>{a('addComponent')}</button>}
   {onChange&&<><label><input type="checkbox" checked={task.confirmed} onChange={e=>update('tasks',plan.tasks.map(t=>t.id===task.id?{...t,confirmed:e.target.checked}:t))}/>{a('confirmed')}</label><button onClick={()=>update('tasks',plan.tasks.filter(t=>t.id!==task.id))}>{a('removeTask')}</button></>}
  </details>)}
  {onChange&&<button onClick={()=>update('tasks',[...plan.tasks,{id:crypto.randomUUID(),...Object.fromEntries(['room','work','included','excluded','measurements','preparation','product','finish','assumptions','provenance'].map(k=>[k,{en:'',es:''}])),components:[{en:'',es:''}],confirmed:false}])}>{a('addTask')}</button>}
  {!!plan.pending.length&&<h3>{a('pending')}</h3>}
  {plan.pending.map((q,i)=><div key={i}>{field('question',localText(q,lang),v=>update('pending',plan.pending.map((x,n)=>n===i?{...x,[lang]:v}:x)))}{onChange&&<button onClick={()=>update('pending',plan.pending.filter((_,n)=>n!==i))}>{a('remove')}</button>}</div>)}
  {onChange&&<button onClick={()=>update('pending',[...plan.pending,{en:'',es:''}])}>{a('addQuestion')}</button>}
 </div>
}
