import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest'
import {localDatabase,A,B} from '../../tests/ai/localRepository.js'
const U='10000000-0000-4000-8000-000000000003',V='10000000-0000-4000-8000-000000000004'
let db,w,v,p
const id=()=>crypto.randomUUID(),fix=()=>({latitude:34.0522,longitude:-118.2437,accuracy:25,capturedAt:new Date().toISOString()})
const cmd=async(actor,action,input={})=>(await db.query('select workers_command($1,$1,$2,$3) x',[actor,action,JSON.stringify(input)])).rows[0].x
beforeAll(async()=>{db=await localDatabase();w=id();v=id();p=id();await db.query('insert into auth.users(id) values($1),($2)',[U,V]);await db.query('insert into auth.sessions(id,user_id) values($1,$1),($2,$2)',[U,V]);await db.query("insert into projects(id,owner_id,name) values($1,$2,'LOCATION QA project')",[p,A]);await db.query("insert into workers(id,user_id,manager_id,name,email) values($1,$2,$3,'Worker A','location-a@test.invalid'),($4,$5,$3,'Worker B','location-b@test.invalid')",[w,U,A,v,V]);await db.query('insert into worker_assignments(worker_id,project_id) values($1,$3),($2,$3)',[w,v,p])},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('reset role;delete from worker_commands;delete from worker_corrections;delete from worker_shifts;update workers set active=true;update worker_assignments set active=true;')})
const clock=(location=fix(),extra={})=>cmd(U,'clock',{id:id(),projectId:p,kind:'in',...(location===undefined?{}:{location}),...extra})
it('rejects missing, malformed, invalid and stale locations before creating a shift or notice',async()=>{
 const cases=[null,{},[],{...fix(),latitude:91},{...fix(),longitude:-181},{...fix(),accuracy:-1},{...fix(),latitude:'34'},{...fix(),capturedAt:'invalid'},{...fix(),capturedAt:new Date(Date.now()-121000).toISOString()},{...fix(),capturedAt:new Date(Date.now()+61000).toISOString()}]
 await expect(cmd(U,'clock',{id:id(),projectId:p,kind:'in'})).rejects.toThrow('LOCATION_REQUIRED')
 for(const l of cases)await expect(clock(l)).rejects.toThrow(/LOCATION/)
 expect((await db.query('select count(*)::int n from worker_shifts')).rows[0].n).toBe(0);expect((await db.query('select count(*)::int n from worker_notifications')).rows[0].n).toBe(0)
})
it('saves official server time and exactly one durable notice for the real manager; retries retain original capture',async()=>{
 const request={id:id(),projectId:p,kind:'in',location:fix()};const start=Date.now(),s=await cmd(U,'clock',request);expect(Date.parse(s.entry_recorded_at)).toBeGreaterThanOrEqual(start-1000);expect(s.entry_recorded_at).toBe(s.original_events[0].at);expect(s.entry_location).toEqual(request.location)
 expect((await cmd(U,'clock',{...request,location:{...request.location,capturedAt:'2020-01-01T00:00:00Z'}})).id).toBe(s.id)
 const attempts=await Promise.allSettled([clock(),clock()]);expect(attempts.every(x=>x.status==='rejected'&&x.reason.message==='SHIFT_ALREADY_OPEN')).toBe(true)
 const n=(await cmd(A,'notifications')).notifications;expect(n).toHaveLength(1);expect(n[0].recipient_id).toBe(A);expect(n[0].shift_id).toBe(s.id);expect(n[0].read_at).toBeNull();expect((await cmd(B,'notifications')).notifications).toEqual([])
 const marked=await cmd(A,'notification_read',{notificationId:n[0].id});expect(marked.unreadCount).toBe(0);expect(marked.notifications[0].read_at).toBeTruthy();expect((await cmd(A,'notification_read',{notificationId:n[0].id})).notifications[0].read_at).toBe(marked.notifications[0].read_at)
})
it('rejects inactive or unassigned workers, and serializes concurrent first entries',async()=>{
 await db.query('update worker_assignments set active=false where worker_id=$1',[w]);await expect(clock()).rejects.toThrow('ACCESS_DENIED');await db.query('update worker_assignments set active=true where worker_id=$1',[w]);await db.query('update workers set active=false where id=$1',[w]);await expect(clock()).rejects.toThrow('ACCESS_DENIED');await db.query('update workers set active=true where id=$1',[w]);
 const attempts=await Promise.allSettled([clock(),clock()]);expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((await cmd(A,'notifications')).notifications).toHaveLength(1)
})
it('isolates notification UUIDs and GPS between workers and administrative scopes in API and RLS',async()=>{
 const s=await clock();const n=(await cmd(A,'notifications')).notifications[0];await expect(cmd(U,'notifications')).rejects.toThrow('ACCESS_DENIED');await expect(cmd(V,'notification_read',{notificationId:n.id})).rejects.toThrow('ACCESS_DENIED');await expect(cmd(B,'notification_read',{notificationId:n.id})).rejects.toThrow('ACCESS_DENIED');expect((await cmd(V,'dashboard')).shifts).toEqual([])
 await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[V]);await tx.exec('set local role authenticated');expect((await tx.query('select * from worker_shifts where id=$1',[s.id])).rows).toEqual([]);expect((await tx.query('select * from worker_notifications where id=$1',[n.id])).rows).toEqual([]);await expect(tx.query('select workers_command($1,$1,$2,$3)',[U,'clock','{}'])).rejects.toThrow('permission denied')})
})
it('accepts low accuracy, preserves original GPS through breaks/out/corrections and labels administrative/historical rows',async()=>{
 let s=await clock({...fix(),accuracy:800});const original=structuredClone(s.entry_location),at=s.entry_recorded_at
 await cmd(U,'clock',{id:id(),projectId:p,kind:'break_start'});await cmd(U,'clock',{id:id(),projectId:p,kind:'out',closeBreak:true})
 await cmd(A,'admin_correction',{shiftId:s.id,eventId:s.events[0].id,kind:null,at:new Date(Date.parse(at)-60000).toISOString(),reason:'Confirmed correction'})
 s=(await cmd(U,'dashboard')).shifts.find(x=>x.id===s.id);expect(s.entry_location).toEqual(original);expect(s.entry_recorded_at).toBe(at);expect(s.events.map(e=>e.kind)).toEqual(['in','break_start','break_end','out'])
 await expect(db.query('update worker_shifts set entry_location=null where id=$1',[s.id])).rejects.toThrow('ORIGINAL_LOCATION_IMMUTABLE')
 const administrative={id:id(),workerId:w,projectId:p,events:[{id:id(),kind:'in',at:'2026-07-01T15:00:00Z'},{id:id(),kind:'out',at:'2026-07-01T16:00:00Z'}],reason:'Missing historical record'}
 await expect(cmd(A,'admin_shift',{...administrative,reason:''})).rejects.toThrow('INVALID_INPUT');const admin=await cmd(A,'admin_shift',administrative);expect(admin.entry_source).toBe('admin');expect(admin.entry_location).toBeNull();expect((await cmd(A,'notifications')).notifications).toHaveLength(1)
 await db.query("insert into worker_shifts(worker_id,project_id,events,original_events,started_at,ended_at) values($1,$2,'[]','[]','2026-07-02T15:00:00Z','2026-07-02T16:00:00Z')",[w,p]);expect((await cmd(U,'dashboard')).shifts.some(s=>s.entry_source==='legacy'&&s.entry_location===null)).toBe(true)
})
it('rolls back the shift if notification persistence fails',async()=>{
 await db.exec("create function public.qa_fail_notice() returns trigger language plpgsql as $$begin raise exception 'QA_NOTICE_FAILURE';end$$;create trigger qa_fail_notice before insert on worker_notifications for each row execute function public.qa_fail_notice();")
 try{await expect(clock()).rejects.toThrow('QA_NOTICE_FAILURE');expect((await db.query('select count(*)::int n from worker_shifts')).rows[0].n).toBe(0)}finally{await db.exec('drop trigger qa_fail_notice on worker_notifications;drop function public.qa_fail_notice()')}
})
