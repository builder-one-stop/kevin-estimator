// Isolated browser acceptance harness. No remote credentials/data or real-model fallback.
import { createServer } from 'node:http'
import { localDatabase,LocalRepository,A } from '../tests/ai/localRepository.js'
import { ControlledProvider } from '../tests/ai/controlledProvider.js'
import { createEstimatorServer } from '../server/http.js'
import { createServer as createViteServer } from 'vite'
export async function startHarness(){
 const db=await localDatabase(),repo=new LocalRepository(db),provider=new ControlledProvider();provider.delay=650
 const {server:api}=createEstimatorServer({repo,provider,origin:'http://127.0.0.1:5180',testMode:true,logger:()=>{}})
 const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/ai')){api.emit('request',req,res);return}
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5180');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,prefer,accept');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  res.setHeader('Content-Type','application/json')
  try{
   const token=req.headers.authorization?.replace('Bearer ','');const owner=await repo.authenticate(token)
   const url=new URL(req.url,'http://localhost')
   if(url.pathname.endsWith('/rest/v1/rpc/beta_session_access')){res.end(JSON.stringify({userId:owner,role:await repo.access(owner)}));return}
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
   if(req.method==='GET')rows=await repo.query(`select * from ${table} where ${where.join(' and ')} order by created_at desc`,args)
   else if(req.method==='POST'){
    const allowed=table==='estimates'?['id','client_id','project_id','title','status','markup_bps','document']:table==='clients'?['name','phone','email','address']:['name','address','client_id','stage']
    const entries=Object.entries(body).filter(([k])=>allowed.includes(k));rows=await repo.query(`insert into ${table}(owner_id,${entries.map(([k])=>k).join(',')}) values($1,${entries.map((_,i)=>`$${i+2}`).join(',')}) returning *`,[owner,...entries.map(([,v])=>typeof v==='object'&&v!==null?JSON.stringify(v):v)])
   }else if(req.method==='PATCH'){
    const allowed=table==='estimates'?['client_id','project_id','title','status','markup_bps','document']:table==='clients'?['name','phone','email','address']:['name','address','client_id','stage']
    const entries=Object.entries(body).filter(([k])=>allowed.includes(k));const set=entries.map(([k,v])=>{args.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return `${k}=$${args.length}`});rows=await repo.query(`update ${table} set ${set.join(',')} where ${where.join(' and ')} returning *`,args)
   }else if(req.method==='DELETE')rows=await repo.query(`delete from ${table} where ${where.join(' and ')} returning *`,args)
   for(const row of rows||[]){if(row.client_id)row.client=await repo.owned(owner,'clients',row.client_id);if(row.project_id)row.project=await repo.owned(owner,'projects',row.project_id)}
   if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')))
   const single=req.headers.accept?.includes('vnd.pgrst.object')
   res.end(JSON.stringify(single?(rows[0]||null):rows))
  }catch(e){console.error('Controlled adapter error',req.method,new URL(req.url,'http://localhost').pathname,e.message);res.statusCode=e.status||400;res.end(JSON.stringify({message:e.code||'Test adapter rejected operation',code:e.code||'FIXTURE_ERROR'}))}
 })
 await new Promise(r=>server.listen(8790,'127.0.0.1',r))
 const fixturePlugin={name:'local-fixture-session',configureServer(vite){vite.middlewares.use('/__fixture/session', (_req,res)=>{
  const session={access_token:'fixture-a',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:A,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}}
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store')
  res.end(`<h1>Local controlled validation</h1><p>This session uses only an ephemeral local database and a controlled AI fixture. It does not verify email authentication or real AI.</p><button id="enter">Enter test workspace</button><script>document.getElementById('enter').onclick=()=>{localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});location.href='/chat'}</script>`)
 })}}
 const vite=await createViteServer({configFile:false,plugins:[(await import('@vitejs/plugin-react')).default(),fixturePlugin],define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:8790/test-supabase'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-public-key')},server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:{'/api/ai':'http://127.0.0.1:8790'}}})

 await vite.listen()
 return {db,repo,provider,user:A,url:'http://127.0.0.1:5180',close:async()=>{await vite.close();await new Promise(r=>server.close(r));await db.close()}}
}
if(process.argv[1]?.endsWith('ai-local-harness.mjs')){const h=await startHarness();console.info('LOCAL CONTROLLED VALIDATION at http://127.0.0.1:5180/__fixture/session (isolated ephemeral database)');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await h.close();process.exit(0)})}
