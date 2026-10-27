// Local synthetic Auth adapter. Never accepts a production URL or credentials.
import {randomUUID} from 'node:crypto'
import {createTeamHandler} from '../server/team.js'
export function localTeamClient(db){
 return {
  rpc:async(_name,args)=>{try{const data=await db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query('select public.team_command($1,$2,$3,$4) value',[args.p_actor,args.p_session,args.p_action,JSON.stringify(args.p_input)])).rows[0].value});return {data,error:null}}catch(e){return {data:null,error:{code:e.code,message:e.message}}}},
  auth:{getUser:async token=>{try{const c=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));const users=await db.query('select id from auth.users where id=$1',[c.sub]);return {data:{user:users.rows[0]||null},error:null}}catch{return {data:{user:null},error:{code:'invalid'}}}},
   admin:{createUser:async({email,app_metadata})=>{try{return await db.transaction(async tx=>{if((await tx.query('select id from auth.users where lower(email)=$1',[email])).rows.length)return {error:{code:'email_exists'}};const id=randomUUID();await tx.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,email,JSON.stringify(app_metadata)]);return {data:{user:{id}},error:null}})}catch{return {error:{code:'local_create_failed'}}}}}
  }
 }
}
export async function localTeamRequest(db,owner,url,headers,body){
 const claims=Buffer.from(JSON.stringify({sub:owner,session_id:owner,amr:[{method:'password'}]})).toString('base64url')
 return createTeamHandler({db:localTeamClient(db),env:{APP_ORIGIN:'http://127.0.0.1:5190'}})(new Request(url,{method:body?'POST':'GET',headers:{...headers,Authorization:`Bearer local.${claims}.synthetic`},...(body?{body}:{} )}))
}
