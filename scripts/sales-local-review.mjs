import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {startHarness} from './ai-local-harness.mjs'
import {LocalReviewProvider} from './local-review-provider.mjs'
const root=resolve('.local-review/sales');mkdirSync(root,{recursive:true})
const h=await startHarness({salesMode:true,provider:new LocalReviewProvider(),dataDir:resolve(root,'database'),port:5190,apiPort:8800})
console.info('SALES LOCAL QA: '+h.url+'/__fixture/session?as=kevin')
console.info('Synthetic users: kevin, a, b, otherManager, other, worker. Isolated PGlite; controlled AI; no production access or credentials.')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await h.close();process.exit(0)})
