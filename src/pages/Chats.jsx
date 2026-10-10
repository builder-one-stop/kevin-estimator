import { useEffect,useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { aiRequest,createConversation } from '../services/ai.js'
import { useAiText,errorText } from '../components/ai/strings.js'
import '../styles/ai.css'
import { compactTitle } from '../../shared/chatPresentation.js'
export default function Chats(){
 const {a,language}=useAiText();const navigate=useNavigate();const [rows,setRows]=useState(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function load(){try{setRows(await aiRequest('conversations'));setError('')}catch(e){setError(e.code)}}
 useEffect(()=>{let active=true;aiRequest('conversations').then(data=>{if(active)setRows(data)}).catch(e=>{if(active)setError(e.code)});return()=>{active=false}},[])
 async function create(){setBusy(true);try{const row=await createConversation(a('new'),language);navigate(`/chat/${row.id}`)}catch(e){setError(e.code)}finally{setBusy(false)}}
 return <div className="page ai-page"><div className="page-head"><h1>{a('history')}</h1><button className="btn btn-primary" disabled={busy} onClick={create}>{a('new')}</button></div><Link to="/chat/settings">{a('settings')}</Link>
 <label>{a('search')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {error&&<p role="alert">{errorText(error,a)} <button onClick={load}>{a('retry')}</button></p>}
 {!rows&&!error&&<p role="status">{a('loading')}</p>}
 {rows?.filter(x=>x.title.toLowerCase().includes(query.toLowerCase())).map(row=><Link className="ai-history-row" to={`/chat/${row.id}`} key={row.id}><b>{compactTitle(row.title)}</b><time>{new Date(row.updated_at).toLocaleString(language)}</time></Link>)}
 </div>
}
