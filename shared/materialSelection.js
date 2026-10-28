export const materialRoles=['paint','repair','primer','protection','abrasive','unassigned']
export const supplementalMaterialRoles=['primer','protection','abrasive','unassigned']
export const materialSelectionKey=row=>row.selectionId||row.role
export const consumablePhase=role=>({protection:'protection',abrasive:'preparation'})[role]||null
// Category/identity hints restrict suggestions; they never verify suitability or equivalence.
export function matchesMaterialRole(row, role) {
 if(!role)return true
 if(!row)return false
 if(['primer','protection','abrasive'].includes(role))return row.category===role||(!row.category&&({primer:/primer|imprimante|sellador/i,protection:/tape|cloth|sheeting|rosin paper|cinta|proteccion/i,abrasive:/sanding|sandpaper|abrasiv|lija/i}[role]).test(row.product)&&!(role==='primer'&&/paint\s*(?:[+&]|and)\s*primer/i.test(row.product)))
 if(role==='repair')return row.category==='patch'||(!row.category&&/spackl|patch|filler/i.test(row.product))
 if(role==='paint')return ['interior_paint','paint'].includes(row.category)||(!row.category&&/paint|pintura|esmalte/i.test(row.product)&&!/spackl|patch|filler/i.test(row.product)&&(!/primer/i.test(row.product)||/paint\s*(?:[+&]|and)\s*primer/i.test(row.product)))
 return false
}
export const materialSearchText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
export function materialTextSuggestion(row,query=''){
 const tokens=materialSearchText(query).split(/\s+/).filter(Boolean)
 const searchable=materialSearchText([row.product,row.brand,row.sku,row.model,row.variant,row.package,row.vendor].filter(Boolean).join(' '))
 return tokens.every(token=>searchable.includes(token))
}

export const materialRoleLabel=(role,language='en')=>({paint:['Finish paint','Pintura de terminación'],repair:['Minor repair','Reparación menor'],primer:['Primer','Imprimante'],protection:['Protection consumables','Consumibles de protección'],abrasive:['Preparation abrasives','Abrasivos de preparación'],unassigned:['Function pending','Función pendiente']}[role]||[role,role])[language==='es'?1:0]
