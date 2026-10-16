import { useCallback,useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { workersApi } from '../../services/workers.js'
import { formatWorkerTime } from '../../../shared/workerTime.js'
import EntryLocation from './EntryLocation.jsx'
import '../../styles/workers.css'
export default function WorkerNotifications(){
 const {t,i18n}=useTranslation(),[data,setData]=useState({notifications:[],unreadCount:0}),[open,setOpen]=useState(false),[error,setError]=useState(false),[limit,setLimit]=useState(20),[marking,setMarking]=useState(null)
 const alive=useRef(true),polling=useRef(false),generation=useRef(0),markLock=useRef(false)
 const reload=useCallback(async()=>{if(polling.current)return;polling.current=true;const version=generation.current;try{const next=await workersApi('notifications');if(alive.current&&version===generation.current){setData(next);setError(false)}}catch{if(alive.current)setError(true)}finally{polling.current=false}},[])
 useEffect(()=>{alive.current=true;const initial=setTimeout(reload,0),timer=setInterval(()=>{if(document.visibilityState!=='hidden')reload()},5000);const visible=()=>{if(document.visibilityState!=='hidden')reload()};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{alive.current=false;clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}},[reload])
 async function mark(id){if(markLock.current)return;markLock.current=true;generation.current++;setMarking(id);try{const next=await workersApi('notification-read',{notificationId:id});if(alive.current){setData(next);setError(false)}}catch{if(alive.current)setError(true)}finally{markLock.current=false;if(alive.current)setMarking(null)}}
 return <div className="worker-notifications">
  <button className="btn" type="button" aria-label={t('workers.notifications.title')} aria-expanded={open} aria-controls="worker-notification-panel" onClick={()=>{setOpen(x=>!x);reload()}}><Bell size={18}/><span>{t('workers.notifications.title')}</span>{data.unreadCount>0&&<span className="worker-unread" aria-label={t('workers.notifications.unreadCount',{count:data.unreadCount})}>{data.unreadCount}</span>}</button>
  {open&&<section id="worker-notification-panel" aria-label={t('workers.notifications.title')} className="worker-notification-panel">
   <header><h2>{t('workers.notifications.title')}</h2><button className="btn" onClick={()=>setOpen(false)}>{t('workers.close')}</button></header><p>{t('workers.timezone')}</p>
   {error&&<p role="alert">{t('workers.notifications.error')} <button className="btn" onClick={reload}>{t('workers.location.retry')}</button></p>}
   {!data.notifications.length&&<p>{t('workers.notifications.empty')}</p>}
   {data.notifications.slice(0,limit).map(n=><article className="worker-card" key={n.id} data-notification-id={n.id}>
    <p>{t('workers.notifications.message',{name:n.worker_name,project:n.project_name,time:formatWorkerTime(n.entry_recorded_at,i18n.language)})}</p>
    <p><strong>{t(n.read_at?'workers.notifications.read':'workers.notifications.unread')}</strong></p>
    <EntryLocation shift={n}/><div className="worker-actions"><Link to={`/time?shift=${n.shift_id}`} onClick={()=>setOpen(false)}>{t('workers.notifications.openShift')}</Link>{!n.read_at&&<button className="btn" disabled={!!marking} onClick={()=>mark(n.id)}>{t('workers.notifications.markRead')}</button>}</div>
   </article>)}
   {data.notifications.length>limit&&<button className="btn" onClick={()=>setLimit(x=>x+20)}>{t('workers.notifications.more')}</button>}
  </section>}
 </div>
}
