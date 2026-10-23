import fs from 'node:fs'
import path from 'node:path'
import { importLibrary,libraryCounts } from '../shared/localPriceLibrary.js'
import { constructionObservations } from '../shared/constructionLibrary.js'
const [inputFile,batchId]=process.argv.slice(2)
if(!inputFile||!batchId)throw Error('Usage: node scripts/import-local-library.mjs <public-observations.json> <batch-id>')
const source=inputFile==='--starter'?constructionObservations:JSON.parse(fs.readFileSync(path.resolve(inputFile),'utf8'))
const root=path.resolve('.local-review'),dest=path.join(root,'price-library.json')
const previous=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):null
const result=importLibrary(previous,Array.isArray(source)?source:source.observations,{batchId})
fs.mkdirSync(root,{recursive:true})
const temporary=path.join(root,'price-library.next.json')
fs.writeFileSync(temporary,JSON.stringify(result,null,2));fs.renameSync(temporary,dest)
console.info(JSON.stringify({destination:dest,...libraryCounts(result),...result.report,remoteDataChanged:false},null,2))
