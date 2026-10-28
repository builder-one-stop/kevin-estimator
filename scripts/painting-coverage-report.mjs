// Read-only inventory of existing painting evidence. Does not fetch or refresh prices.
import {writeFile,mkdir} from 'node:fs/promises'
import {researchCatalog} from '../shared/researchCatalog.js'
import {assessPrice} from '../shared/priceEvidence.js'
import {packageGallons} from '../shared/materialTakeoff.js'
import {matchesMaterialRole} from '../shared/materialSelection.js'
const asOf=process.argv[2]||'2026-10-28'
const rows=researchCatalog.map(r=>({id:r.id,sourceId:r.sourceId,category:r.category,brand:r.brand,product:r.product,sku:r.sku||null,package:r.package||null,unit:r.unit,unitCost:r.unitCost,currency:r.currency,checkedAt:r.checkedAt,url:r.url,storeZip:null,locallyVerified:false,assessment:assessPrice(r,'',asOf),packageGallons:packageGallons(r),automaticRole:matchesMaterialRole(r,'paint')?'paint':matchesMaterialRole(r,'repair')?'repair':null}))
const categories=Object.entries(Object.groupBy(rows,r=>r.category)).map(([category,records])=>({category,references:records.length,withAmount:records.filter(r=>r.unitCost!==null).length,missingAmount:records.filter(r=>r.unitCost===null).length,withAmountAndSku:records.filter(r=>r.unitCost!==null&&r.sku).length,stale:records.filter(r=>['SOURCE_REVIEW_DUE','PRICE_EXPIRED'].includes(r.assessment.reason)).length,ids:records.map(r=>r.sourceId)}))
const report={asOf,scope:'Existing base painting/preparation catalog only; no owner data, no construction catalog and no new supplier collection.',externallyQueried:false,totals:{references:rows.length,withAmount:rows.filter(r=>r.unitCost!==null).length,missingAmount:rows.filter(r=>r.unitCost===null).length,locallyVerified:0},categories,missing:rows.filter(r=>r.unitCost===null),rows}
await mkdir('evidence',{recursive:true});await writeFile('evidence/painting-coverage-2026-10-28.json',JSON.stringify(report,null,2));console.log(JSON.stringify({asOf,totals:report.totals,categories},null,2))
