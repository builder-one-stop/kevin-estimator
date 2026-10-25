// Parent-provided official web research, observed 2026-10-25 05:34–05:35 UTC.
// Crawler pages, not checkout, a supplier API, or store-local verification.
export function priceRefresh20261025(records){
 const old=id=>{const row=structuredClone(records.find(r=>r.id===id));for(const key of ['version','batchId','importedAt','history'])delete row[key];return row}
 const refresh=(id,evidence)=>({...old(id),checkedAt:'2026-10-25',evidenceMethod:'public_page_price',evidence,
  limitations:[...old(id).limitations,'Observed 2026-10-25 05:34–05:35 UTC via official web crawl today; store/ZIP unselected, stock unknown; no live API.']})
 const compound=refresh('ace-12922','Official current public page USD26.99 per 4.5 US gal pail, no multipack indicated. Older indexed USD25.99 crawled three weeks earlier conflicts and is not selected. Existing USG-derived joint-treatment coverage remains separate manufacturer evidence, not newly measured yield.')
 const easySand={...compound,id:'ace-1010800',sku:'1010800',model:'384210',product:'USG Sheetrock Natural Easy Sand45 compound',package:'bag: 18 lb',unitCost:16.99,
  url:'https://www.acehardware.com/departments/paint-and-supplies/patch-and-repair/joint-compound/1010800',coverage:null,
  evidence:'Official current public page USD16.99 per 18 lb bag, no multipack indicated. No patch-area yield converted to joint-finishing coverage.'}
 const corner=refresh('ace-50190','Official current page USD4.99; Amerimax58102 galvanized steel 90 degree corner bead,1.25in x8ft. Sale pack quantity unconfirmed; no per-piece price or pack63 inferred.')
 const sponge=refresh('ace-1024487','Official current page USD5.99, Ace2007312 10x3x1in 80/120 Fine/Medium. Current page omits package specifications. Separate older /p/1024487 crawl four months earlier states Number in Package:1pack and Carded; that historical evidence does not validate current pack contents.')
 const hd=[
  ['hd-100321605','258725','USG-Sheetrock-Brand-4-5-gal-All-Purpose-Ready-Mixed-Joint-Compound-380501/100321605','4.5gal pail; price still missing.'],
  ['hd-100321610','632716','USG-Sheetrock-Brand-18-lb-Easy-Sand-45-Lightweight-Setting-Type-Joint-Compound-384210/100321610','18lb bag; Store SO1001390484; price still missing.'],
  ['hd-202530243','893749','USG-Sheetrock-Brand-1-2-in-x-4-ft-x-8-ft-USG-Sheetrock-Brand-UltraLight-Drywall-Panels-14113411708/202530243','Sold by single drywall panel,1/2in x4x8ft,32sf; price still missing.'],
 ].map(([id,sku,path,note])=>{const url='https://www.homedepot.com/p/'+path;return {...old(id),sku,url,priceSourceUrl:url,specSourceUrl:url,checkedAt:'2026-10-25',
  evidence:'Official web crawler specification observed2026-10-25 05:34–05:35UTC, not a store quote or live API. '+note,unitCost:null}})
 return [compound,easySand,corner,sponge,...hd]
}
