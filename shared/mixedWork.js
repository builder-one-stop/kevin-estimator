import {assertDocument} from './aiDomain.js'
const bi=x=>({en:x,es:x})
// Explicitly approved saved scopes only. Natural-language mixed interpretation is
// still unsupported by the single-job provider and remains a pending draft.
export function combineApprovedEstimates(ownerId,entries){
 if(!entries.length||entries.length>8)throw Error('INVALID_COMPOSITION')
 if(entries.some(e=>e.record.owner_id!==ownerId))throw Error('OWNER_MISMATCH')
 const first=entries[0].record,document={language:first.document.language,market:{country:'US',region:'CA',city:'Los Angeles',currency:'USD'},business:structuredClone(first.document.business||{}),proposal:{intro:'',scope:'',exclusions:'',terms:'',notes:'Each section retains its original item markup; no additional document markup is stacked. One final rounding is applied. Taxes/delivery are not assumed.'},sections:[],rules:{paint:{},trades:{},finishing:{}},scope:{revision:1,approvalType:'plan',plan:{title:bi('Mixed approved scopes'),address:'',zip:'',markupBps:0,pending:[],assumptions:bi('Composition of explicitly approved scopes by distinct work area. No extra labor, expense or markup layer.'),tasks:[]}},composition:{version:'approved-composition-1',sources:[],issues:[]}}
 const seen=new Set(),zoneTrades=new Map()
 const pending=(zone,reason)=>{const id=crypto.randomUUID(),text=`Review ${zone}: ${reason}`;document.scope.plan.tasks.push({id,room:bi(zone),work:bi(text),included:bi(text),excluded:bi('No automatic quantity or price'),measurements:bi('Pending'),preparation:bi('Pending'),product:bi('Pending'),finish:bi('Pending'),assumptions:bi('Manual review required; does not block preliminary budget'),provenance:bi('Composition validation'),confirmed:true,components:[bi(text)]});document.sections.push({id,title:text,items:[{id:crypto.randomUUID(),taskId:id,description:text,quantity:1,quantityPending:true,unit:'lot',unitCost:0,priceMissing:true,costType:'other',origin:'pending-scope',needsReview:true}]});document.composition.issues.push({zone,reason})}
 for(const {record,zone} of entries){
  if(!zone?.trim()){pending('Undefined area','WORK_AREA_REQUIRED');continue}
  const market=record.document.market
  if(market?.country!=='US'||!['CA','California'].includes(market?.region)||market?.city!=='Los Angeles')throw Error('MARKET_MISMATCH')
  try{assertDocument(record.document,record.markup_bps)}catch{pending(zone,'INVALID_SOURCE_MATH_OR_SCOPE');continue}
  const map=new Map(record.document.sections.map(s=>[s.id,crypto.randomUUID()]))
  for(const section of record.document.sections){
   const rules=record.document.rules||{},trade=rules.trades?.[section.id]?.trade||(rules.paint?.[section.id]?'paint':rules.finishing?.[section.id]?'joint-finishing':section.id),key=zone+'|'+trade
   if(seen.has(key)){pending(zone,'DUPLICATE_WORK_SCOPE');continue}seen.add(key)
   const types=zoneTrades.get(zone)||new Set();types.add(trade);zoneTrades.set(zone,types)
   const id=map.get(section.id),task=record.document.scope.plan.tasks.find(t=>t.id===section.id)
   document.sections.push({...structuredClone(section),id,title:zone+' · '+section.title,items:section.items.map(i=>({...structuredClone(i),id:crypto.randomUUID(),taskId:id,markupBps:i.markupBps??record.markup_bps}))})
   document.scope.plan.tasks.push({...structuredClone(task),id,room:bi(zone+' · '+(task.room?.en||''))})
   for(const kind of ['paint','trades','finishing'])if(rules[kind]?.[section.id]){const r=structuredClone(rules[kind][section.id]);if(r.baseSectionId)r.baseSectionId=map.get(r.baseSectionId)||r.baseSectionId;document.rules[kind][id]=r}
  }
  document.composition.sources.push({id:record.id,version:record.version,zone})
 }
 for(const [zone,trades] of zoneTrades)if(trades.has('paint')&&trades.has('drywall'))pending(zone,'DRYWALL_FINISH_PRIMER_SURFACE_READINESS_NOT_ASSUMED')
 assertDocument(document,0)
 return {title:'Mixed approved scopes',owner_id:ownerId,markup_bps:0,document}
}
