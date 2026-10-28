import {localTeamRequest} from './team-local-adapter.mjs'
import {salesDatabase,SalesRepository,salesRpc,asSalesUser,SALES} from '../tests/ai/salesFixture.js'
// Isolated browser acceptance harness. No remote credentials/data or real-model fallback.
import { localQaFault } from './local-qa-fault.mjs'
import { createServer } from 'node:http'
import { localDatabase,LocalRepository,A } from '../tests/ai/localRepository.js'
import { ControlledProvider } from '../tests/ai/controlledProvider.js'
import { createEstimatorServer } from '../server/http.js'
import { createServer as createViteServer } from 'vite'
export async function startHarness({ salesMode=false, provider = new ControlledProvider(), dataDir, qaFaultFile, port = Number(process.env.LOCAL_REVIEW_PORT || 5180), apiPort = Number(process.env.LOCAL_REVIEW_API_PORT || 8790) } = {}){
 const origin=`http://127.0.0.1:${port}`, apiOrigin=`http://127.0.0.1:${apiPort}`
 const db=await (salesMode?salesDatabase:localDatabase)(dataDir),repo=salesMode?new SalesRepository(db):new LocalRepository(db);provider.delay=650
 const {server:api}=createEstimatorServer({repo,provider,origin:origin,testMode:true,logger:()=>{}})
 const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/ai')){if(localQaFault(req,res,qaFaultFile,provider))return;api.emit('request',req,res);return}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,prefer,accept');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  res.setHeader('Content-Type','application/json')
  try{
   const token=req.headers.authorization?.replace('Bearer ','');const owner=await repo.authenticate(token)
   const url=new URL(req.url,'http://localhost')
   const restQuery=(sql,args=[])=>salesMode?asSalesUser(db,owner,async tx=>(await tx.query(sql,args)).rows):repo.query(sql,args)
   if(salesMode&&url.pathname.startsWith('/api/workers/team/')){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Object.assign(Error('Too large'),{status:413});chunks.push(chunk)}const body=req.method==='POST'?Buffer.concat(chunks).toString():undefined;const response=await localTeamRequest(db,owner,url.href,req.headers,body);res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(await response.text());return}
   if(salesMode&&url.pathname==='/api/workers/'){
    if(req.method!=='GET')throw Object.assign(Error('Fixture workers read only'),{status:403})
    const row=await repo.query('select public.workers_command($1,$1,$2,$3) as value',[owner,'dashboard','{}']);res.end(JSON.stringify(row[0].value));return
   }
   if(salesMode&&url.pathname.endsWith('/rest/v1/rpc/sales_gateway')){
    if(req.method!=='POST')throw Object.assign(Error('Method denied'),{status:405})
    const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>200000)throw Object.assign(Error('Too large'),{status:413});chunks.push(c)}
    const input=JSON.parse(Buffer.concat(chunks).toString());res.end(JSON.stringify(await salesRpc(db,owner,input.p_action,input.p_data||{})));return
   }
   if(url.pathname.endsWith('/rest/v1/rpc/beta_session_access')){res.end(JSON.stringify({userId:owner,role:await repo.access(owner)}));return}
   if(url.pathname.endsWith('/rest/v1/rpc/finalize_estimate')){
    const chunks=[];for await(const c of req)chunks.push(c)
    const body=JSON.parse(Buffer.concat(chunks).toString())
    const result=await db.transaction(async tx=>{
     await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({amr:[{method:'password'}]})]);await tx.exec('set local role authenticated')
     return (await tx.query('select to_jsonb(public.finalize_estimate($1,$2,$3)) as value',[body.p_id,body.p_expected,body.p_request_id])).rows[0].value
    });res.end(JSON.stringify(result));return
   }
   if(url.pathname.endsWith('/auth/v1/user')){res.end(JSON.stringify({id:owner,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}));return}
   if(url.pathname.endsWith('/auth/v1/logout')){res.end('{}');return}
   const table=url.pathname.split('/').at(-1)
   if(!['estimates','clients','projects','estimate_messages'].includes(table))throw Error('Unknown test route')
   const chunks=[];for await(const c of req)chunks.push(c)
   let body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):null
   if(Array.isArray(body))body=body[0]
   const args=[owner],where=['owner_id=$1']
   for(const key of ['id','version','project_id','client_id']){const filter=url.searchParams.get(key);if(filter?.startsWith('eq.')){args.push(filter.slice(3));where.push(`${key}=$${args.length}`)}}
   let rows
   if(req.method==='GET')rows=await restQuery(`select * from ${table} where ${where.join(' and ')} order by created_at desc`,args)
   else if(req.method==='POST'){
    const allowed=table==='estimates'?['id','client_id','project_id','title','status','markup_bps','document']:table==='clients'?['name','phone','email','address']:['name','address','client_id','stage']
    const entries=Object.entries(body).filter(([k])=>allowed.includes(k));rows=await restQuery(`insert into ${table}(owner_id,${entries.map(([k])=>k).join(',')}) values($1,${entries.map((_,i)=>`$${i+2}`).join(',')}) returning *`,[owner,...entries.map(([,v])=>typeof v==='object'&&v!==null?JSON.stringify(v):v)])
   }else if(req.method==='PATCH'){
    const allowed=table==='estimates'?['client_id','project_id','title','status','markup_bps','document']:table==='clients'?['name','phone','email','address']:['name','address','client_id','stage']
    const entries=Object.entries(body).filter(([k])=>allowed.includes(k));const set=entries.map(([k,v])=>{args.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return `${k}=$${args.length}`});rows=await restQuery(`update ${table} set ${set.join(',')} where ${where.join(' and ')} returning *`,args)
   }else if(req.method==='DELETE')rows=await restQuery(`delete from ${table} where ${where.join(' and ')} returning *`,args)
   for(const row of rows||[]){if(row.client_id)row.client=await repo.owned(owner,'clients',row.client_id);if(row.project_id)row.project=await repo.owned(owner,'projects',row.project_id)}
   if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')))
   const single=req.headers.accept?.includes('vnd.pgrst.object')
   res.end(JSON.stringify(single?(rows[0]||null):rows))
  }catch(e){console.error('Controlled adapter error',req.method,new URL(req.url,'http://localhost').pathname,e.message);res.statusCode=e.status||(e.code==='42501'?403:e.code==='40001'?409:400);res.end(JSON.stringify({message:e.code||'Test adapter rejected operation',code:e.code||'FIXTURE_ERROR'}))}
 })
 await new Promise(r=>server.listen(apiPort,'127.0.0.1',r))
 const fixturePlugin={name:'local-fixture-session',configureServer(vite){vite.middlewares.use('/__fixture/session', (_req,res)=>{
  const identity=salesMode?new URL(_req.url,'http://localhost').searchParams.get('as')||'kevin':null
  const user=salesMode?SALES[identity]:A
  if(salesMode&&!['kevin','a','b','otherManager','other','worker'].includes(identity)){res.statusCode=400;res.end('Unknown synthetic identity');return}
  const session={access_token:salesMode?`sales-${identity}`:'fixture-a',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:user,email:salesMode?`${identity}@example.invalid`:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}}
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store')
  res.end(`${salesMode?'<h1>Local sales QA — synthetic accounts only</h1><nav>'+['kevin','a','b','otherManager','other','worker'].map(key=>`<a style="margin:8px" href="?as=${key}">${key}</a>`).join('')+'</nav><p>Selected: '+identity+'</p>':''}<h1>${provider.isolatedRealTrades?'Real OpenAI / isolated local database':'Local controlled validation'}</h1><p>${provider.isolatedRealTrades?'Real OpenAI calls can incur usage. Synthetic data only; no production Supabase. Local fixture authentication.':'Controlled provider and isolated local database; not real AI or email authentication.'}</p><button id="enter">Enter test workspace</button><script>document.getElementById('enter').onclick=()=>{localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});location.href=${JSON.stringify(salesMode?'/projects':'/chat')}}</script>`)
 })}}
 const vite=await createViteServer({configFile:false,cacheDir:`.test-tmp/vite-one-stop-${port}`,plugins:[(await import('@vitejs/plugin-react')).default(),fixturePlugin],define:{'import.meta.env.VITE_LOCAL_SALES':JSON.stringify(salesMode?'true':'false'),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(`${apiOrigin}/test-supabase`),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-public-key')},server:{watch:{ignored:['**/.test-tmp/**','**/evidence/pricing-chat-2026-10-28/**']},host:'127.0.0.1',port,strictPort:true,proxy:{'/api/ai':apiOrigin,'/api/workers':apiOrigin}}})

 await vite.listen()
 return {db,repo,provider,user:A,url:origin,close:async()=>{await vite.close();await new Promise(r=>server.close(r));await db.close()}}
}
if(process.argv[1]?.endsWith('ai-local-harness.mjs')){const h=await startHarness();console.info('LOCAL CONTROLLED VALIDATION at http://127.0.0.1:5180/__fixture/session (isolated ephemeral database)');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await h.close();process.exit(0)})}
