import {drywallObservations} from './research/drywallSources.js'
import starter from './research/construction-starter-2026-10-21.json' with {type:'json'}
import { importLibrary } from './localPriceLibrary.js'

export const constructionObservations=starter.rows.map(values=>{
 const row=Object.fromEntries(starter.columns.map((column,index)=>[column,values[index]])),url=`https://www.homedepot.com/p/${row.retailerProductId}`
 const priceSourceUrl=row.priceSource==='direct'?url:starter.priceSources[row.priceSource]
 return{id:'hd-'+row.retailerProductId,category:row.trade,model:row.model,sku:'',retailerProductId:row.retailerProductId,product:`${row.brand} ${row.name}`,brand:row.brand,vendor:'The Home Depot',package:`${row.purchaseUnit}: ${row.pack}`,unit:'ea',unitCost:row.priceUsd,currency:'USD',url,checkedAt:starter.retrievedDate,
  evidenceMethod:row.priceUsd===null?'public_specification':'indexed_public_price',evidence:`Primary retailer research; ${starter.retrievalMethod}; index age unknown. Price source: ${priceSourceUrl}. ${row.notes}`,
  country:'US',region:'CA',city:'Los Angeles',localVerified:false,branch:'',zip:null,
  coverage:row.coveragePerPurchaseUnit===null?null:{quantity:row.coveragePerPurchaseUnit,unit:row.coverageUnit,sourceUrl:url,basis:'documented_package'},
  priceSourceUrl,specSourceUrl:url,autoEligible:row.autoEligible,
  limitations:['Public index, not a live query; target LA is unverified.','Tax, delivery and stock unknown.',...(row.notes?[row.notes]:[])]}
})
export const constructionLibrary=importLibrary(null,[...constructionObservations,...drywallObservations],{batchId:starter.schemaVersion,importedAt:'2026-10-21T00:00:00.000Z'})
export const tradeDefaultProducts={drywall:'hd-202530243',baseboard:'hd-204318363',lvp:'hd-311573425'}
