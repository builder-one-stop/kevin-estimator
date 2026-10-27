import {z} from 'zod'
const uuid=z.string().uuid(),name=z.string().trim().min(1).max(120)
export const teamSchemas={create:z.object({id:uuid,name,email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(12).max(128)}).strict(),update:z.object({userId:uuid,name,active:z.boolean(),version:z.number().int().positive()}).strict()}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
const error=(code,status=400)=>Object.assign(Error(code),{code,status})
// Dependency injection supports the same handler with an isolated Auth double and real SQL.
export function createTeamHandler({db,env=process.env}){
 return async request=>{
  try{
   const url=new URL(request.url)
   if(request.headers.get('origin')&&request.headers.get('origin')!==(env.APP_ORIGIN||url.origin))throw error('TEAM_ACCESS_DENIED',403)
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
   if(!token)throw error('UNAUTHORIZED',401)
   const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)throw error('UNAUTHORIZED',401)
   let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{throw error('UNAUTHORIZED',401)}
   if(claims.sub!==auth.data.user.id||!claims.amr?.some(x=>x.method==='password')||!uuid.safeParse(claims.session_id).success)throw error('TEAM_ACCESS_DENIED',403)
   const command=async(action,input={})=>{
    const r=await db.rpc('team_command',{p_actor:auth.data.user.id,p_session:claims.session_id,p_action:action,p_input:input})
    if(r.error){const code=r.error.message||''
     if(r.error.code==='42883'||r.error.code==='PGRST202')throw error('TEAM_SETUP_REQUIRED',503)
     if(/^TEAM_[A-Z_]+$/.test(code))throw error(code,/ACCESS_DENIED/.test(code)?403:/CONFLICT|UNAVAILABLE|PENDING/.test(code)?409:400)
     throw error('TEAM_SERVICE_UNAVAILABLE',503)
    }return r.data
   }
   const action=url.pathname.replace(/^\/(?:api\/workers|\.netlify\/functions\/workers)\/team\/?/,'')
   if(request.method==='GET'&&!action)return Response.json(await command('list'),{headers})
   if(request.method!=='POST'||!teamSchemas[action])throw error('NOT_FOUND',404)
   // Check authorization and schema presence BEFORE reading credentials or calling Auth admin.
   await command('list')
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw error('TEAM_INVALID_INPUT')
   let size=0;const parts=[]
   for await(const chunk of request.body||[]){size+=chunk.length;if(size>4096)throw error('TEAM_INVALID_INPUT',413);parts.push(Buffer.from(chunk))}
   let input;try{input=teamSchemas[action].parse(JSON.parse(Buffer.concat(parts).toString()))}catch{throw error('TEAM_INVALID_INPUT')}
   let result
   if(action==='create'){
    const {password,...reservation}=input;const seat=await command('reserve',reservation)
    const known=await command('lookup',{id:seat.id})
    if(!known.userId){
     const created=await db.auth.admin.createUser({email:seat.email,password,email_confirm:true,app_metadata:{one_stop_team_seat:seat.id}})
     if(created.error){
      const recovered=await command('lookup',{id:seat.id})
      if(!recovered.userId)throw error(created.error.code==='weak_password'?'TEAM_PASSWORD_POLICY':/already|registered|exists/.test(created.error.code||'')?'TEAM_EMAIL_UNAVAILABLE':'TEAM_PROVISION_PENDING',409)
     }
    }
    result=await command('activate',{id:seat.id})
   }else result=await command('update',input)
   return Response.json(result,{headers})
  }catch(e){return Response.json({error:e.code||'TEAM_SERVICE_UNAVAILABLE'},{status:e.status||503,headers})}
 }
}
