import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { localDatabase,LocalRepository,A,B } from './localRepository.js'
import { ControlledProvider } from './controlledProvider.js'
import { createEstimatorServer, createEstimatorHandler } from '../../server/http.js'
import { ResponsesProvider } from '../../server/openai.js'
import { defaultSettings } from '../../shared/aiSchemas.js'
let db,repo,provider,server,url
beforeAll(async()=>{db=await localDatabase();repo=new LocalRepository(db);provider=new ControlledProvider();({server}=createEstimatorServer({repo,provider,logger:()=>{},requestsPerMinute:1000}));await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/api/ai`},30000)
afterAll(async()=>{await new Promise(r=>server.close(r));await db.close()})
async function request(path,body,token='fixture-a',method=body?'POST':'GET') {const response=await fetch(`${url}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});const data=response.headers.get('content-type')?.includes('json')?await response.json():await response.arrayBuffer();return {status:response.status,data}}
async function create(token='fixture-a'){const {data,status}=await request('conversations',{id:randomUUID(),title:'Validation test',language:'en'},token);expect(status).toBe(200);return data}
async function cmd(row,action,extra={},requestId=randomUUID()){return request(`conversations/${row.id}/commands`,{requestId,version:row.version,action,...extra})}
async function settled(id){for(let n=0;n<100;n++){const r=await repo.get(A,id);if(r.state.run.status!=='working')return r;await new Promise(r=>setTimeout(r,10))}throw Error('run did not finish')}
async function approved(){let row=await create();row=(await cmd(row,'message',{content:'Reference rooms'})).data;row=await settled(row.id);row=(await cmd(row,'message',{content:'Confirm explicit height assumption'})).data;row=await settled(row.id);row=(await cmd(row,'approve',{revision:row.state.planRevision})).data;return row}
async function generated(){let row=await approved();row=(await cmd(row,'generate')).data;row=await settled(row.id);expect(row.state.run.status).toBe('ready');expect(row.estimate_id).toBeTruthy();return row}
describe('real HTTP + migrated PostgreSQL, controlled model',()=>{
 it('persists owner-only progressive text without approving partial plans and clears it after cancellation',async()=>{
  let release, previewed
  const waiting=new Promise(resolve=>{release=resolve}),progress=new Promise(resolve=>{previewed=resolve})
  const streaming={run:async input=>{await input.onText('A public response is arriving');previewed();await waiting;await input.onText('A public response is arriving now');return {result:{message:'Complete',plan:null,lines:[],changes:[]},metrics:{}}}}
  const {engine}=createEstimatorHandler({repo,provider:streaming,logger:()=>{}})
  const row=await engine.create(A,{id:randomUUID(),title:'Streaming test',language:'en'})
  await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action:'message',content:'A public question'})
  await progress
  const partial=await repo.get(A,row.id)
  expect(partial.state.run.preview).toBe('A public response is arriving')
  expect(partial.state.plan).toBeNull();expect(partial.estimate_id).toBeNull()
  expect((await request(`conversations/${row.id}`,undefined,'fixture-b')).status).toBe(404)
  await expect(engine.command(A,row.id,{requestId:randomUUID(),version:partial.version,action:'approve',revision:0})).rejects.toMatchObject({code:'RUN_BUSY'})
  const cancelled=await engine.command(A,row.id,{requestId:randomUUID(),version:partial.version,action:'cancel'})
  expect(cancelled.state.run.preview).toBe('');release()
  for(let n=0;n<30&&engine.active.size;n++)await new Promise(r=>setTimeout(r,10))
  expect((await repo.get(A,row.id)).state.run.status).toBe('cancelled')
 })

 it('queues a Netlify-style request once, authenticates it and commits only after background execution',async()=>{
  const launched=[]
  const {handle,engine}=createEstimatorHandler({repo,provider,runMode:'deferred',origin:'https://onestop-beta.netlify.app',dispatch:async item=>launched.push(item),logger:()=>{}})
  const send=async(path,body,token='fixture-a')=>{
   const response=await handle(new Request(`https://onestop-beta.netlify.app/.netlify/functions/ai/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}))
   return {status:response.status,data:await response.json()}
  }
  expect((await send('status',undefined,'forged')).status).toBe(401)
  const created=await send('conversations',{id:randomUUID(),title:'Netlify test',language:'en'})
  expect(created.status).toBe(200)
  const first=await send(`conversations/${created.data.id}/commands`,{requestId:randomUUID(),version:created.data.version,action:'message',content:'Paint test walls'})
  expect(first.data.state.run.stage).toBe('queued')
  expect(launched).toHaveLength(1)
  const runId=first.data.state.run.id
  const [claimed,duplicate]=await Promise.all([engine.performQueued(A,created.data.id,runId),engine.performQueued(A,created.data.id,runId)])
  expect([claimed,duplicate].filter(Boolean)).toHaveLength(1)
  const ready=await repo.get(A,created.data.id)
  expect(ready.state.run.status).toBe('ready')
  expect(ready.state.messages.at(-1).role).toBe('assistant')
  expect(await engine.performQueued(A,created.data.id,runId)).toBe(false)
  expect((await send(`conversations/${created.data.id}`,undefined,'fixture-b')).status).toBe(404)
 })
 it('persists a visible error if Netlify cannot start the background worker',async()=>{
  const {handle}=createEstimatorHandler({repo,provider,runMode:'deferred',dispatch:async()=>{throw Error('offline')},logger:()=>{}})
  const send=async(path,body)=>{
   const response=await handle(new Request(`https://onestop-beta.netlify.app/api/ai/${path}`,{method:'POST',headers:{Authorization:'Bearer fixture-a','Content-Type':'application/json'},body:JSON.stringify(body)}))
   return response.json()
  }
  const row=await send('conversations',{id:randomUUID(),title:'Dispatch test',language:'en'})
  const result=await send(`conversations/${row.id}/commands`,{requestId:randomUUID(),version:row.version,action:'message',content:'Paint test walls'})
  expect(result.state.run.status).toBe('error')
  expect(result.state.run.error).toBe('DISPATCH_UNAVAILABLE')
  expect(result.state.messages[0].content).toBe('Paint test walls')
 })
 it('rejects anonymous and forged auth on every route, including attachments/settings',async()=>{for(const path of ['conversations','settings','status',`assets/${randomUUID()}`]){expect((await request(path,undefined,'')).status).toBe(401);expect((await request(path,undefined,'forged')).status).toBe(401)}})
 it('isolates conversations, links and all private images between users',async()=>{
  const row=await create();expect((await request(`conversations/${row.id}`,undefined,'fixture-b')).status).toBe(404)
  const [client]=await repo.query('insert into clients(owner_id,name) values($1,$2) returning *',[B,'TEST B client'])
  expect((await cmd(row,'links',{clientId:client.id,projectId:null})).status).toBe(403)
  const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#abc'}}).png().toBuffer()
  const upload=await request(`conversations/${row.id}/assets`,{data:bytes.toString('base64')});expect(upload.status).toBe(200)
  const asset=upload.data;expect((await request(`assets/${asset.id}`,undefined,'fixture-b')).status).toBe(404)
  expect((await request(`assets/${asset.id}`,{},'fixture-b','DELETE')).status).toBe(404)
  expect((await request(`assets/${asset.id}`)).status).toBe(200)
  expect((await request(`conversations/${row.id}/assets`,{data:Buffer.from('<svg/>').toString('base64')})).status).toBe(415)
  expect((await request(`assets/${asset.id}`,{},'fixture-a','DELETE')).status).toBe(200)
 })
 it('RLS denies new tables and service-only RPC writes, isolates all new reads and keeps bucket private',async()=>{
  const a=await create(),b=await create('fixture-b')
  await repo.saveSettings(A,defaultSettings(),0)
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${B}'`)
  try{
   const rows=(await db.query('select owner_id from ai_conversations')).rows;expect(rows.length).toBeGreaterThan(0);expect(rows.every(x=>x.owner_id===B)).toBe(true)
   expect((await db.query('select * from ai_settings')).rows).toEqual([])
   for(const table of ['ai_conversations','ai_settings','ai_attachments','estimate_revisions'])await expect(db.exec(`delete from ${table}`)).rejects.toMatchObject({code:'42501'})
   await expect(db.query('select ai_commit($1,$2,1,$3)',[A,a.id,JSON.stringify(a)])).rejects.toMatchObject({code:'42501'})
   await db.exec('reset role;set role anon')
   for(const table of ['ai_conversations','ai_settings','ai_attachments','estimate_revisions'])await expect(db.query(`select * from ${table}`)).rejects.toMatchObject({code:'42501'})
   await expect(db.exec("insert into storage.objects(bucket_id,name) values('estimate-evidence','foreign')")).rejects.toMatchObject({code:'42501'})
   expect((await db.query("select * from storage.objects where bucket_id='estimate-evidence'")).rows).toEqual([])
   await db.exec('reset role;set role authenticated')
   await expect(db.exec("insert into storage.objects(bucket_id,name) values('estimate-evidence','foreign')")).rejects.toMatchObject({code:'42501'})
  }finally{await db.exec('reset role')}
  expect((await db.query("select public from storage.buckets where id='estimate-evidence'")).rows).toEqual([{public:false}]);expect(b.owner_id).toBe(B)
 })
 it('requires exact scope approval while unanswered commercial questions remain advisory',async()=>{
  let row=await create();expect((await cmd(row,'generate')).status).toBe(409)
  row=(await cmd(row,'message',{content:'Paint reference rooms'})).data;row=await settled(row.id)
  expect(row.estimate_id).toBeNull();expect(row.state.plan.pending.length).toBe(1)
  expect((await cmd(row,'approve',{revision:row.state.planRevision-1})).status).toBe(409)
  row=(await cmd(row,'savePlan',{plan:{...row.state.plan,pending:[]}})).data
  row=(await cmd(row,'approve',{revision:row.state.planRevision})).data
  row=(await cmd(row,'savePlan',{plan:{...row.state.plan,zip:'90001'}})).data
  expect(row.state.approvedRevision).toBeNull();expect((await cmd(row,'generate')).status).toBe(409)
 })
 it('deduplicates retries and double clicks, persists messages/results and makes one estimate',async()=>{
  let row=await approved();const id=randomUUID();const initial=row;const first=await cmd(initial,'generate',{},id);expect(first.status).toBe(200)
  expect((await cmd(initial,'generate',{},id)).status).toBe(200)
  expect((await cmd(initial,'generate')).status).toBe(409)
  row=await settled(row.id);const eid=row.estimate_id
  expect((await cmd(initial,'generate',{},id)).data.estimate_id).toBe(eid)
  expect((await repo.query('select count(*)::int as n from estimates where id=$1',[eid]))[0].n).toBe(1)
  expect((await request(`conversations/${row.id}`)).data.state.messages).toEqual(row.state.messages)
 })
 it('reads latest manual changes, requires review, blocks concurrent overwrites, applies once and restores atomically',async()=>{
  let row=await generated();let estimate=await repo.estimate(A,row.estimate_id)
  const doc=estimate.document;doc.sections[0].items[0].description='Manual product';doc.sections[0].items[0].unitCost=90
  await repo.query('update estimates set document=$1 where id=$2',[JSON.stringify(doc),estimate.id])
  row=(await cmd(row,'message',{content:'Change only Bedroom 2'})).data;row=await settled(row.id)
  expect(row.state.pending.document.sections[0].items[0].description).toBe('Manual product')
  estimate=await repo.estimate(A,row.estimate_id);expect(estimate.document.sections[1].items[0].quantity).toBe(2)
  await repo.query('update estimates set title=$1 where id=$2',['Manual title',estimate.id])
  expect((await cmd(row,'apply',{revision:row.state.pending.revision})).data.error).toBe('ESTIMATE_CONFLICT')
  row=(await cmd(row,'message',{content:'Prepare again using latest estimate'})).data;row=await settled(row.id)
  const initial=row,id=randomUUID(),revision=row.state.pending.revision
  row=(await cmd(initial,'apply',{revision},id)).data
  expect((await cmd(initial,'apply',{revision},id)).status).toBe(200)
  estimate=await repo.estimate(A,row.estimate_id);expect(estimate.document.sections[1].items[0].quantity).toBe(3);expect(estimate.title).toBe('Manual title')
  const revisions=await repo.revisions(A,estimate.id);expect(revisions.some(x=>x.origin==='manual')).toBe(true)
  row=(await cmd(row,'restore',{estimateVersion:estimate.version,restoreVersion:1})).data
  expect((await repo.estimate(A,row.estimate_id)).document.sections[1].items[0].quantity).toBe(2)
  expect((await repo.revisions(A,row.estimate_id))[0].origin).toBe('restore')
 })
 it('persists manually revised scope and questions until a reviewed change can be applied',async()=>{
  let row=await generated();const plan={...row.state.plan,address:'TEST ONLY address',pending:[{en:'Height?',es:'¿Altura?'}]}
  row=(await cmd(row,'savePlan',{plan})).data
  expect(row.state.pending.blocked).toBe(true)
  expect((await cmd(row,'apply',{revision:row.state.pending.revision})).data.error).toBe('PLAN_HAS_QUESTIONS')
  const originalRun=provider.run.bind(provider)
  provider.run=async input=>{const response=await originalRun(input);if(input.mode==='change'){response.result.plan=input.context.pendingPlan;if(input.context.pendingPlan.pending.length)response.result.changes=[]}return response}
  try{
   row=(await cmd(row,'message',{content:'Use my revised plan'})).data;row=await settled(row.id)
   expect(row.state.pending.blocked).toBe(true);expect(row.state.pending.plan.address).toBe('TEST ONLY address')
   row=(await cmd(row,'savePlan',{plan:{...plan,pending:[]}})).data
   row=(await cmd(row,'message',{content:'Price revised plan'})).data;row=await settled(row.id)
   row=(await cmd(row,'apply',{revision:row.state.pending.revision})).data
   expect((await repo.estimate(A,row.estimate_id)).document.scope.plan.address).toBe('TEST ONLY address')
  }finally{provider.run=originalRun}
 })
 it('cancellation and a persistent one-run lease prevent late commits and duplicate work',async()=>{
  provider.delay=200;let first=await create(),second=await create()
  first=(await cmd(first,'message',{content:'First'})).data
  expect((await cmd(second,'message',{content:'Second'})).status).toBe(409)
  // The stage may advance, so use latest revision for the explicit cancellation.
  first=await repo.get(A,first.id);first=(await cmd(first,'cancel')).data
  await new Promise(r=>setTimeout(r,250));expect((await repo.get(A,first.id)).state.run.status).toBe('cancelled');expect((await repo.get(A,first.id)).state.messages).toHaveLength(1)
  provider.delay=20
 })
 it('returns explicit provider errors, preserves input, and never fabricates credentials or token usage',async()=>{
  let row=await create();row=(await cmd(row,'message',{content:'TEST_PROVIDER_ERROR'})).data;row=await settled(row.id)
  expect(row.state.run.status).toBe('error');expect(row.state.messages[0].content).toBe('TEST_PROVIDER_ERROR');expect(row.estimate_id).toBeNull()
  await expect(new ResponsesProvider({}).run({})).rejects.toMatchObject({code:'OPENAI_NOT_CONFIGURED'})
 })
 it('keeps price context owner-scoped and never promotes Accepted or plan approval into approved price history',async()=>{
  let row=await generated()
  await repo.query("update estimates set status='Accepted' where id=$1",[row.estimate_id])
  const settings={...defaultSettings(),catalog:[{id:randomUUID(),product:'PRIVATE B PRICE',brand:'Fixture',package:'',unit:'ea',unitCost:987,currency:'USD',vendor:'Fixture',location:'90001',url:'',sku:'',checkedAt:'2026-10-11',status:'manual',evidence:''}]}
  await repo.saveSettings(B,settings,0)
  const beforeA=await repo.settings(A),beforeB=await repo.settings(B)
  let seen
  const {engine}=createEstimatorHandler({repo,provider:{run:async input=>{seen=input;return {result:{message:'No change',plan:null,lines:[],changes:[]},metrics:{}}}},logger:()=>{}})
  try{
   const context=await engine.context(A,row)
   expect(context.estimate.status).toBe('Accepted');expect(context.approvedRevision).toBeTruthy()
   expect(context.pricing).toMatchObject({approvedHistory:{status:'unavailable'},approvals:{internalPrice:'not-recorded'}})
   await expect(engine.context(B,row)).rejects.toMatchObject({code:'FORBIDDEN_RELATION'})
   await engine.command(A,row.id,{requestId:randomUUID(),version:row.version,action:'message',content:'Reuse Kevin-approved prices from any other account'})
   row=await settled(row.id);expect(row.state.run.status).toBe('ready')
   expect(seen.settings.catalog).toHaveLength(25);expect(JSON.stringify(seen.settings.catalog)).not.toContain('PRIVATE B PRICE');expect(JSON.stringify(seen.context)).not.toContain('PRIVATE B PRICE')
   expect(await repo.settings(A)).toEqual(beforeA);expect(await repo.settings(B)).toEqual(beforeB)
  }finally{await repo.query('delete from ai_settings where owner_id=$1',[B])}
 })

})
