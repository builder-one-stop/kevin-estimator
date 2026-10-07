import { supabase } from '../supabaseClient.js'
export async function aiRequest(path, body, method=body?'POST':'GET', binary=false) {
 const {data}=await supabase.auth.getSession()
 if(!data.session)throw Object.assign(new Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'})
 let response
 try{response=await fetch(`/api/ai/${path}`,{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(method!=='GET'?{'Content-Type':'application/json'}:{})},...(method!=='GET'?{body:JSON.stringify(body||{})}:{})})}
 catch{throw Object.assign(new Error('API_UNAVAILABLE'),{code:'API_UNAVAILABLE'})}
 if(!response.ok){let value;try{value=await response.json()}catch{/* Vite proxy may return a non-JSON 502 */}throw Object.assign(new Error(value?.error||'API_UNAVAILABLE'),{code:value?.error||'API_UNAVAILABLE'})}
 return binary?response.blob():response.json()
}
export const createConversation=(title,language='en',id=crypto.randomUUID())=>aiRequest('conversations',{id,title,language})
export const command=(row,action,body={},requestId=crypto.randomUUID())=>aiRequest(`conversations/${row.id}/commands`,{requestId,version:row.version,action,...body})
