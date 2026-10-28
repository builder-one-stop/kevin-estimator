import {useCallback,useEffect,useRef,useState} from 'react'
import {aiRequest} from '../../services/ai.js'
import {matchesMaterialRole} from '../../../shared/materialSelection.js'
// Each function searches the authenticated account catalog, including later pages.
export default function MaterialReferencePicker({role,value,label,onChange,language}){
 const es=language==='es',tr=(en,sp)=>es?sp:en
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false)
 const controller=useRef(null),version=useRef(0)
 const load=useCallback(async(offset=0,reset=false)=>{
  const current=++version.current;controller.current?.abort();const abort=new AbortController();controller.current=abort
  setLoading(true);setError(false);if(reset){setRows([]);setNext(null)}
  try{
   const params=new URLSearchParams({role,limit:'40',offset:String(offset),...(query.trim()?{q:query.trim()}:{})})
   const result=await aiRequest('pricing/catalog?'+params,undefined,'GET',false,{signal:abort.signal})
   if(abort.signal.aborted||version.current!==current)return
   setRows(previous=>{const unique=new Map();for(const row of [...(reset?[]:previous),...result.rows])if(matchesMaterialRole(row,role)&&!unique.has(row.id))unique.set(row.id,row);return [...unique.values()]})
   setNext(result.nextOffset??null)
  }catch{if(!abort.signal.aborted&&version.current===current)setError(true)}
  finally{if(!abort.signal.aborted&&version.current===current)setLoading(false)}
 },[role,query])
 const cancel=useCallback(()=>{controller.current?.abort();version.current++},[])
 useEffect(()=>{
  cancel()
  const timer=setTimeout(()=>load(0,true),query?180:0)
  return()=>{clearTimeout(timer);cancel()}
 },[load,cancel,query])
 return <div className="material-reference-picker">
 <label>{tr('Search references','Buscar referencias')} ({role})<input aria-label={`${tr('Search references','Buscar referencias')} (${role})`} type="search" maxLength={200} value={query} onChange={e=>{cancel();setQuery(e.target.value);setRows([]);setNext(null);setLoading(true)}}/></label>
 <label>{tr('Choose exact reference','Elegir referencia exacta')} ({role})<select aria-label={`${tr('Choose exact reference','Elegir referencia exacta')} (${role})`} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{tr('Unresolved / keep pending','Sin resolver / mantener pendiente')}</option>{value&&!rows.some(r=>r.id===value)&&<option value={value} disabled>{tr('Saved selection','Selección guardada')}: {label}</option>}{rows.filter(p=>matchesMaterialRole(p,role)).map(p=><option key={p.id} value={p.id}>{p.vendor} | {p.product} | {p.package} | SKU {p.sku||'-'}</option>)}</select></label>
 {loading&&<p role="status">{tr('Loading references…','Cargando referencias…')}</p>}
 {!loading&&!error&&!rows.length&&<p role="status">{tr('No matching references. Keep pending or change the search.','Sin referencias coincidentes. Mantén pendiente o cambia la búsqueda.')}</p>}
 {error&&<p role="status">{tr('Catalog unavailable; saved selection is preserved. Retry the search.','Catálogo no disponible; se conserva la selección. Reintenta la búsqueda.')}</p>}
 {next!=null&&<button type="button" disabled={loading} onClick={()=>load(next)}>{tr('Load more references','Cargar más referencias')} ({role})</button>}
 {error&&<button type="button" disabled={loading} onClick={()=>load(0,true)}>{tr('Retry references','Reintentar referencias')} ({role})</button>}
 </div>
}
