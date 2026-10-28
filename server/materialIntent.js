import {createHash} from 'node:crypto'
import {matchesMaterialRole,materialRoles,materialSearchText} from '../shared/materialSelection.js'
const hints=[['paint',/\b(?:paint|painting|pintura|terminacion)\s*:?\s*$/],['repair',/\b(?:repair|patch|filler|spackling|reparacion|masilla)\s*:?\s*$/],['primer',/\b(?:primer|imprimante|imprimacion|sellador)\s*:?\s*$/],['protection',/\b(?:protection|tape|cloth|proteccion|cinta|plastico)\s*:?\s*$/],['abrasive',/\b(?:abrasive|sandpaper|sanding|abrasivo|lija)\s*:?\s*$/]]
const canonical=query=>Object.fromEntries(Object.entries(query).map(([key,value])=>[key,String(value).trim().toLowerCase()]))
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
export const materialSlot=(role,query)=>`${role}-${createHash('sha256').update(JSON.stringify(canonical(query))).digest('hex').slice(0,16)}`
// Exact identifiers only. Role hints restrict catalog lookup; they never change a product's category.
export function requestedMaterials(messages=[],rows=[]){
 const core=new Map(),extra=new Map()
 for(const message of messages.filter(x=>x.role==='user')){
  const text=String(message.content),matches=[...text.matchAll(/\b(SKU|model|modelo)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,99})\b/gi)],inMessage=[],replacementRoles=new Set()
  for(const match of matches){
   const query={[match[1].toLowerCase()==='sku'?'sku':'model']:match[2]},prefix=materialSearchText(text.slice(Math.max(0,match.index-60),match.index))
   const hinted=hints.find(([,pattern])=>pattern.test(prefix))?.[0]
   if(hinted&&!['paint','repair'].includes(hinted)&&/\b(?:change|replace|cambia|cambiar|sustituye|reemplaza)\s+(?:the\s+|el\s+|la\s+)?(?:primer|imprimante|imprimacion|sellador|protection|tape|cloth|proteccion|cinta|plastico|abrasive|sandpaper|sanding|abrasivo|lija)\s*:?\s*$/.test(prefix))replacementRoles.add(hinted)
   const found=rows.filter(r=>Object.entries(query).every(([k,v])=>String(r[k]||'').toLowerCase()===v.toLowerCase()))
   const roles=materialRoles.filter(role=>role!=='unassigned'&&found.some(r=>matchesMaterialRole(r,role)))
   const role=hinted||(roles.length===1?roles[0]:/\b(?:consumables?|consumibles?)\s*:?\s*$/.test(prefix)?'unassigned':matches.length===1?'paint':'unassigned')
   if(!inMessage.some(r=>r.role===role&&same(r.query,query)))inMessage.push({role,query})
  }
  for(const role of ['paint','repair']){
   const candidates=inMessage.filter(r=>r.role===role)
   if(candidates.length)core.set(role,candidates.length===1?{role,...candidates[0].query}:{role,id:'ambiguous-selection',requestedLabel:candidates.map(r=>Object.entries(r.query).map(([k,v])=>`${k} ${v}`).join(' ')).join(' / '),selectionReason:'MULTIPLE_PRODUCTS_FOR_ROLE'})
  }
  for(const role of replacementRoles)for(const [key,value]of extra)if(value.role===role)extra.delete(key)
  for(const {role,query} of inMessage.filter(r=>!['paint','repair'].includes(r.role))){const selectionId=materialSlot(role,query);extra.set(selectionId,{role,selectionId,...query})}
 }
 return [...core.values(),...extra.values()]
}
export const requestedMaterial=(messages=[],rows=[])=>{
 const selection=requestedMaterials(messages,rows).find(r=>r.role==='paint')
 return selection?Object.fromEntries(['id','sku','model'].filter(k=>selection[k]).map(k=>[k,selection[k]])):null
}
