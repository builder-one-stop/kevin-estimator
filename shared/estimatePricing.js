export const missingPriceItems=document=>(document?.sections||[]).flatMap(section=>section.items||[]).filter(item=>item.priceMissing===true||item.quantityPending===true)
export const hasMissingPrices=document=>missingPriceItems(document).length>0
