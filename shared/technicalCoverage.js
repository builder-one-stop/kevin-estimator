import {matchesMaterialRole} from './materialSelection.js'
import registry from './research/technical-coverage-2026-10-28.json' with {type:'json'}
const ordered=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(ordered):Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value
const stable=value=>JSON.stringify(ordered(value))
const normalized=value=>String(value??'').trim().toLowerCase()
const identityMatches=(entry,profile)=>Boolean(entry&&profile&&matchesMaterialRole(entry,profile.role)&&['brand','product','model','package','unit','variant'].every(k=>normalized(entry[k])===normalized(profile.identity[k]))&&profile.identity.skus.some(sku=>normalized(sku)===normalized(entry.sku)))
export const validTechnicalSnapshot=snapshot=>Boolean(snapshot&&registry.profiles.some(p=>p.id===snapshot.id&&stable(p)===stable(snapshot)))
export function technicalCoverageFor(entry,role){const profile=registry.profiles.find(p=>(!role||p.role===role)&&identityMatches(entry,p));return profile?structuredClone(profile):null}
export const acceptedTechnicalCoverage=(entry,snapshot,role)=>validTechnicalSnapshot(snapshot)&&(!role||snapshot.role===role)&&identityMatches(entry,snapshot)?structuredClone(snapshot):null
export function coverageEvidence(entry,snapshot,value,role='paint'){
 if(!snapshot)return {status:'provisional',value,reason:'No exact technical profile explicitly applied.'}
 const profile=acceptedTechnicalCoverage(entry,snapshot,role)
 if(!profile)return {status:'product-mismatch',value,reason:'Saved technical profile does not match this exact product/package; review or enter a manual assumption.'}
 if(value==null)return {status:'parameters-pending',value:null,profile,range:profile.range,sourceUrl:profile.sourceUrl,documentRevision:profile.revision}
 const within=Number(value)>=profile.range[0]&&Number(value)<=profile.range[1]
 return {status:within?'documented-range-assumption':'manual-outside-documented-range',value,profile,range:profile.range,sourceUrl:profile.sourceUrl,documentRevision:profile.revision,criterion:Number(value)===profile.range[0]?profile.criterion:'seller-edited-estimating-value',manufacturerGuarantee:false}
}
export function technicalCoverageNote(evidence,language='en'){
 if(!evidence||evidence.status==='provisional')return ''
 const es=language==='es'
 if(evidence.status==='product-mismatch')return es?'La ficha guardada no coincide con el producto/envase seleccionado; rendimiento automático pendiente de revisión.':'Saved sheet does not match the selected product/package; automatic coverage awaits review.'
 const p=evidence.profile
 const identity=es?`Ficha asociada al modelo ${p.identity.model}; ${p.base} / ${p.sheen}; ${p.identity.package}. `:`Sheet matched to model ${p.identity.model}; ${p.base} / ${p.sheen}; ${p.identity.package}. `
 if(evidence.status==='parameters-pending')return es?`${identity}Rendimiento de obra pendiente; rango de la ficha ${p.range.join('-')} sf/gal por mano; ${p.sourceUrl}. No es garantía.`:`${identity}Job coverage pending; sheet range ${p.range.join('-')} sf/gal per coat; ${p.sourceUrl}. Not a guarantee.`
 return es?`${identity}Rendimiento elegido ${evidence.value} sf/gal por mano; rango documentado ${p.range.join('-')}. ${evidence.criterion===p.criterion?'Extremo inferior elegido para estimar; no garantía.':'Valor editable del vendedor; no recomendación numérica del fabricante.'} ${evidence.status==='manual-outside-documented-range'?'Fuera del rango publicado. ':''}Ficha ${p.revision}; consultada ${p.consultedAt}; ${p.sourceUrl}. ${p.conditions.es}`
 :`${identity}Selected coverage ${evidence.value} sf/gal per coat; documented range ${p.range.join('-')}. ${evidence.criterion===p.criterion?'Lower bound chosen for estimating; not a guarantee.':'Editable seller value; not a manufacturer-selected figure.'} ${evidence.status==='manual-outside-documented-range'?'Outside published range. ':''}Sheet ${p.revision}; consulted ${p.consultedAt}; ${p.sourceUrl}. ${p.conditions.en}`
}
