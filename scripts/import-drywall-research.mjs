import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {drywallObservations} from '../shared/research/drywallSources.js'
import {importLibrary,libraryCounts} from '../shared/localPriceLibrary.js'
const file=resolve('.local-review/price-library.json'),backup=resolve('.local-review/price-library-before-drywall-2026-10-22.json')
const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null
const next=importLibrary(previous,drywallObservations,{batchId:'primary-drywall-2026-10-22'})
if(previous&&!existsSync(backup))writeFileSync(backup,JSON.stringify(previous,null,2))
writeFileSync(file,JSON.stringify(next,null,2))
console.info(JSON.stringify({counts:libraryCounts(next),import:next.report,outOfMarketScrewPriceImported:false,remoteWrites:false}))
