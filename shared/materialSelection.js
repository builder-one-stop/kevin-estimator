// Category/identity hints restrict suggestions; they never verify suitability or equivalence.
export function matchesMaterialRole(row, role) {
 if(!role)return true
 if(!row)return false
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
