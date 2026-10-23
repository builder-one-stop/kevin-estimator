import { resolve } from 'node:path'
import { mkdirSync,existsSync,readFileSync } from 'node:fs'
import { observationSchema } from '../shared/localPriceLibrary.js'
import { startHarness } from './ai-local-harness.mjs'
import { LocalReviewProvider } from './local-review-provider.mjs'
const root = resolve('.local-review')
mkdirSync(root, { recursive: true })
const publicLibraryFile=resolve(root,'price-library.json')
const library=existsSync(publicLibraryFile)?JSON.parse(readFileSync(publicLibraryFile,'utf8')):undefined
if(library){for(const record of library.records){const {version,batchId,importedAt,history,...observation}=record;observationSchema.parse(observation);if(!Number.isInteger(version)||version<1||!batchId||!importedAt||!Array.isArray(history))throw Error('INVALID_LOCAL_LIBRARY_SNAPSHOT')}}
const h = await startHarness({ provider: new LocalReviewProvider({library}), dataDir: resolve(root, 'database'), qaFaultFile:resolve(root,'qa-fault.json'), port: 5182, apiPort: 8792 })
console.info('ONE STOP LOCAL REVIEW: ' + h.url + '/__fixture/session')
console.info('Controlled simulator, isolated local database. No OpenAI calls or production data. Local review records survive restart; uploaded images do not.')
console.info('Example: Paint only the walls of a 12 x 10 x 8 ft bedroom. Then review scope, approve and generate.')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await h.close(); process.exit(0) })
