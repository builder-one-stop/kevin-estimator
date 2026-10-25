// Product identity and commercial offer context are separate. No supplier network calls.
import {z} from 'zod'
export const offerContextSchema=z.object({
 supplierId:z.string().max(100).default(''),storeId:z.string().max(100).default(''),
 storeZip:z.string().regex(/^\d{5}$/).or(z.literal('')).default(''),
 jobZip:z.string().regex(/^\d{5}$/).or(z.literal('')).default(''),
 fulfillment:z.enum(['unspecified','pickup','delivery']).default('unspecified'),
 accountContext:z.string().max(100).default('public'),
}).strict()
const normalize=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
export const priceJobZip=document=>document.pricingContext?.jobZip??document.scope?.plan?.zip??''
export const productIdentity=row=>['product','brand','sku','model','variant','package','unit'].map(key=>normalize(row[key]))
export const offerIdentity=row=>JSON.stringify([productIdentity(row),normalize(row.vendor),row.currency||'USD',[row.country||'US',row.region||'CA',row.city||'Los Angeles'].map(normalize),row.branch||(/^[0-9]{5}$/.test(row.location||'')?'':row.location)||'',row.verifiedZip||null,offerContextSchema.parse(row.offer||{})])
export const sameOffer=(a,b)=>offerIdentity(a)===offerIdentity(b)
export const priceFreshness=assessment=>assessment.reason==='PRICE_MISSING'?'unavailable':['PRICE_EXPIRED','SOURCE_REVIEW_DUE'].includes(assessment.reason)?'stale':assessment.reason?'unavailable':'fresh'
export const supplierConnections=Object.freeze([
 {id:'lowes',name:"Lowe's",connection:'not-configured',source:'https://developer.lowes.com/portal/solutions/product-discovery/'},
 {id:'home-depot',name:'The Home Depot',connection:'not-configured',source:'https://www.homedepot.com/c/SF_MS_Affiliate_Program_FAQs'},
])
