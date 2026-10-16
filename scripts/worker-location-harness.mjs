// Isolated migrated PostgreSQL + actual workers HTTP handler. Auth transport is controlled.
import {createServer} from 'node:http'
import {createServer as createViteServer} from 'vite'
import {localDatabase,A,B} from '../tests/ai/localRepository.js'
import {createWorkersHandler} from '../server/workers.js'
export async function startLocationHarness(){
 const db=await localDatabase(),U='10000000-0000-4000-8000-000000000003',V='10000000-0000-4000-8000-000000000004',w=crypto.randomUUID(),v=crypto.randomUUID(),p=crypto.randomUUID(),origin='http://127.0.0.1:5182'
 await db.query('insert into auth.users(id) values($1),($2)',[U,V]);await db.query('insert into auth.sessions(id,user_id) values($1,$1),($2,$2)',[U,V]);await db.query("insert into projects(id,owner_id,name) values($1,$2,'LOCATION QA site')",[p,A]);await db.query("insert into workers(id,user_id,manager_id,name,email) values($1,$2,$3,'LOCATION QA Worker A','location-a@test.invalid'),($4,$5,$3,'LOCATION QA Worker B','location-b@test.invalid')",[w,U,A,v,V]);await db.query('insert into worker_assignments(worker_id,project_id) values($1,$3),($2,$3)',[w,v,p]);
 const identities=[A,B,U,V],token=id=>'fixture.'+Buffer.from(JSON.stringify({sub:id,session_id:id,amr:[{method:'password'}]})).toString('base64url')+'.controlled',owner=t=>identities.find(x=>token(x)===t),command=async(id,action,input={})=>(await db.query('select workers_command($1,$1,$2,$3) x',[id,action,JSON.stringify(input)])).rows[0].x
 const adapter={auth:{getUser:async t=>({data:{user:owner(t)?{id:owner(t)}:null}})},rpc:async(_name,args)=>{try{return {data:await command(args.p_actor,args.p_action,args.p_input)}}catch(e){return {error:{message:e.message,code:e.code}}}}}
 const handle=createWorkersHandler({db:adapter,env:{APP_ORIGIN:origin}})
 const api=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  const url=new URL(req.url,origin)
  if(url.pathname.startsWith('/api/workers')){const chunks=[];for await(const c of req)chunks.push(c);const r=await handle(new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return}
  res.setHeader('Content-Type','application/json');const id=owner(req.headers.authorization?.replace('Bearer ',''));if(!id){res.statusCode=401;res.end('{}');return}
  if(url.pathname.endsWith('/beta_session_access')){res.end(JSON.stringify({userId:id,role:id===A?'operator':id===B?'admin':'worker'}));return}
  if(url.pathname.endsWith('/auth/v1/user')){res.end(JSON.stringify({id,email:'fixture@example.invalid',role:'authenticated',aud:'authenticated'}));return}
  res.end('[]')
 })
 await new Promise(r=>api.listen(8793,'127.0.0.1',r));const vite=await createViteServer({configFile:false,plugins:[(await import('@vitejs/plugin-react')).default()],define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:8793/fixture'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('fixture-public-key')},server:{host:'127.0.0.1',port:5182,strictPort:true,proxy:{'/api/workers':'http://127.0.0.1:8793'}}});await vite.listen()
 const session=id=>({access_token:token(id),refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}})
 return {db,origin,A,B,U,V,w,v,p,session,token,command,close:async()=>{await vite.close();api.closeAllConnections();await new Promise(r=>api.close(r));await db.close()}}
}
