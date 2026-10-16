begin;
create schema if not exists workers_private;
revoke all on schema workers_private from public;
grant usage on schema workers_private to authenticated,service_role;

-- Keep the existing two CRM grants unchanged. Workers never get a beta_accounts row.
create table public.workers (
 id uuid primary key,
 user_id uuid unique references auth.users(id) on delete restrict,
 manager_id uuid not null references public.beta_accounts(user_id) on delete restrict,
 email text not null unique check(email=lower(trim(email))),
 name text not null check(length(trim(name)) between 1 and 120),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index workers_manager on public.workers(manager_id,active);
create table public.worker_assignments (
 worker_id uuid not null references public.workers(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(worker_id,project_id)
);
create index worker_assignments_project on public.worker_assignments(project_id,active);
create table public.worker_shifts (
 id uuid primary key default gen_random_uuid(),
 worker_id uuid not null references public.workers(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 events jsonb not null default '[]',
 original_events jsonb not null default '[]',
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 check(ended_at is null or ended_at>=started_at)
);
create unique index worker_one_open_shift on public.worker_shifts(worker_id) where ended_at is null;
create index worker_shifts_project on public.worker_shifts(project_id,started_at);
create table public.worker_commands (
 worker_id uuid not null references public.workers(id),
 id uuid not null,
 action text not null,
 shift_id uuid not null references public.worker_shifts(id),
 primary key(worker_id,id)
);
create table public.worker_corrections (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null references public.worker_shifts(id) on delete restrict,
 requested_by uuid not null references auth.users(id),
 event_id uuid,
 kind text check(kind in ('in','break_start','break_end','out')),
 proposed_at timestamptz not null,
 reason text not null check(length(trim(reason)) between 3 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_reason text,
 before_events jsonb,
 after_events jsonb
);
create index worker_corrections_shift on public.worker_corrections(shift_id,status);
create table public.worker_evidence (
 id uuid primary key,
 worker_id uuid not null references public.workers(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 path text not null unique,
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 bytes integer not null check(bytes>0 and bytes<=26214400),
 status text not null default 'pending' check(status in ('pending','ready','failed')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 cleaned_at timestamptz,
 check(mime like 'video/%' or bytes<=8388608)
);
create index worker_evidence_project on public.worker_evidence(project_id,created_at);

create function workers_private.session_valid(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session and user_id=p_user and (not_after is null or not_after>now()))
$$;
create function workers_private.worker_id() returns uuid
language sql stable security definer set search_path='' as $$
 select id from public.workers where user_id=auth.uid() and active
 and workers_private.session_valid(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method'='password')
$$;
create function workers_private.can_read(p_worker uuid,p_project uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workers w where w.id=p_worker and
 ((w.manager_id=auth.uid() and public.beta_account_role() in ('operator','admin')) or
 (w.id=workers_private.worker_id() and (p_project is null or exists(select 1 from public.worker_assignments a where a.worker_id=w.id and a.project_id=p_project and a.active)))))
$$;
revoke all on all functions in schema workers_private from public,anon;
grant execute on all functions in schema workers_private to authenticated,service_role;

create or replace function public.beta_session_access() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('role',coalesce(public.beta_account_role(),case when workers_private.worker_id() is not null then 'worker' end),'userId',auth.uid())
$$;

do $$ declare t text; begin
 foreach t in array array['workers','worker_assignments','worker_shifts','worker_commands','worker_corrections','worker_evidence'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.workers,public.worker_assignments,public.worker_shifts,public.worker_corrections,public.worker_evidence to authenticated;
create policy workers_read on public.workers for select to authenticated using(workers_private.can_read(id));
create policy assignments_read on public.worker_assignments for select to authenticated using(workers_private.can_read(worker_id,project_id));
create policy shifts_read on public.worker_shifts for select to authenticated using(workers_private.can_read(worker_id,project_id));
create policy evidence_read on public.worker_evidence for select to authenticated using(workers_private.can_read(worker_id,project_id));
create policy corrections_read on public.worker_corrections for select to authenticated using(exists(select 1 from public.worker_shifts s where s.id=shift_id));

-- Effective chronology is validated under the worker row lock on EVERY change.
create function workers_private.validate_shift(p_shift uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.worker_shifts; e jsonb; prior timestamptz; ts timestamptz; state text:='none'; first_at timestamptz; last_at timestamptz;
begin
 select * into strict s from public.worker_shifts where id=p_shift;
 if jsonb_array_length(s.events)=0 then raise exception 'INVALID_SEQUENCE'; end if;
 for e in select value from jsonb_array_elements(s.events) loop
  ts:=(e->>'at')::timestamptz;
  if ts is null or ts>clock_timestamp() or (prior is not null and ts<prior) then raise exception 'INVALID_CHRONOLOGY'; end if;
  if state='none' and e->>'kind'='in' then state:='working'; first_at:=ts;
  elsif state='working' and e->>'kind'='break_start' then state:='break';
  elsif state='break' and e->>'kind'='break_end' then state:='working';
  elsif state='working' and e->>'kind'='out' then state:='closed'; last_at:=ts;
  else raise exception 'INVALID_SEQUENCE'; end if;
  prior:=ts;
 end loop;
 if exists(select 1 from public.worker_shifts x where x.worker_id=s.worker_id and x.id<>s.id
   and tstzrange(x.started_at,x.ended_at,'[)') && tstzrange(first_at,last_at,'[)')) then raise exception 'SHIFT_OVERLAP'; end if;
 update public.worker_shifts set started_at=first_at,ended_at=last_at where id=p_shift;
end $$;
revoke all on function workers_private.validate_shift(uuid) from public,anon,authenticated;
grant execute on function workers_private.validate_shift(uuid) to service_role;

-- Service-only API: actor/session come from a verified password JWT, never from JSON input.
create function workers_private.command(p_actor uuid,p_session uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare manager boolean; w public.workers; s public.worker_shifts; c public.worker_corrections; ev public.worker_evidence;
 wid uuid; pid uuid; rid uuid; uid uuid; kind text; last_kind text; next_events jsonb; item jsonb; ts timestamptz; output jsonb;
begin
 if not workers_private.session_valid(p_actor,p_session) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 manager:=exists(select 1 from public.beta_accounts where user_id=p_actor and role in ('operator','admin'));
 if not manager then
  select * into w from public.workers where user_id=p_actor and active for update;
  if w.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 end if;
 if p_action='dashboard' then
  return jsonb_build_object(
   'role',case when manager then 'manager' else 'worker' end,
   'workers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.workers x where (manager and x.manager_id=p_actor) or x.id=w.id),'[]'),
   'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.address)) from public.projects p where
     (manager and p.owner_id=p_actor) or exists(select 1 from public.worker_assignments a where a.project_id=p.id and a.worker_id=w.id and a.active)),'[]'),
   'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.worker_assignments a join public.workers x on x.id=a.worker_id where a.active and ((manager and x.manager_id=p_actor) or x.id=w.id)),'[]'),
   'shifts',coalesce((select jsonb_agg(to_jsonb(q) order by q.started_at desc) from (select s.* from public.worker_shifts s join public.workers x on x.id=s.worker_id where (manager and x.manager_id=p_actor) or (x.id=w.id and exists(select 1 from public.worker_assignments a where a.worker_id=w.id and a.project_id=s.project_id and a.active)) order by s.started_at desc ) q),'[]'),
   'evidence',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (select e.* from public.worker_evidence e join public.workers x on x.id=e.worker_id where (manager and x.manager_id=p_actor) or (x.id=w.id and exists(select 1 from public.worker_assignments a where a.worker_id=w.id and a.project_id=e.project_id and a.active)) order by e.created_at desc ) q),'[]'),
   'corrections',coalesce((select jsonb_agg(to_jsonb(c) order by c.requested_at desc) from public.worker_corrections c join public.worker_shifts s on s.id=c.shift_id join public.workers x on x.id=s.worker_id where (manager and x.manager_id=p_actor) or x.id=w.id),'[]'),
   'serverTime',clock_timestamp());
 end if;
 if p_action='reserve_worker' then
  if not manager then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  rid:=(p_input->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_input->>'email')),0));
  select * into w from public.workers where id=rid for update;
  if w.id is not null then
   if w.manager_id<>p_actor or w.email<>lower(trim(p_input->>'email')) then raise exception 'CONFLICT'; end if;
  else
   if exists(select 1 from auth.users where lower(email)=lower(trim(p_input->>'email'))) then raise exception 'ACCOUNT_EXISTS'; end if;
   insert into public.workers(id,manager_id,email,name) values(rid,p_actor,lower(trim(p_input->>'email')),trim(p_input->>'name')) returning * into w;
  end if;
  return to_jsonb(w);
 end if;
 if manager then
  wid:=(p_input->>'workerId')::uuid;
  if wid is null and p_input ? 'shiftId' then select worker_id into wid from public.worker_shifts where id=(p_input->>'shiftId')::uuid; end if;
  if wid is null and p_input ? 'evidenceId' then select worker_id into wid from public.worker_evidence where id=(p_input->>'evidenceId')::uuid; end if;
  if wid is null and p_input ? 'correctionId' then select s.worker_id into wid from public.worker_corrections c join public.worker_shifts s on s.id=c.shift_id where c.id=(p_input->>'correctionId')::uuid; end if;
  select * into w from public.workers where id=wid and manager_id=p_actor for update;
  if w.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 end if;
 if p_action in ('admin_shift','admin_batch') and manager then
  if length(trim(coalesce(p_input->>'reason','')))<3 or jsonb_typeof(p_input->'events')<>'array' or jsonb_array_length(p_input->'events')=0 then raise exception 'INVALID_INPUT'; end if;
  if p_action='admin_shift' then
   pid:=(p_input->>'projectId')::uuid; rid:=(p_input->>'id')::uuid;
   if not exists(select 1 from public.projects where id=pid and owner_id=p_actor) or not exists(select 1 from public.worker_assignments where worker_id=w.id and project_id=pid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   select * into s from public.worker_shifts where id=rid;
   if s.id is not null then
    if s.worker_id<>w.id or s.project_id<>pid then raise exception 'CONFLICT'; end if;
    return to_jsonb(s);
   end if;
   insert into public.worker_shifts(id,worker_id,project_id,events,original_events,started_at,ended_at)
    values(rid,w.id,pid,'[]','[]',(p_input->'events'->0->>'at')::timestamptz,case when p_input->'events'->-1->>'kind'='out' then (p_input->'events'->-1->>'at')::timestamptz end) returning * into s;
  else
   select * into s from public.worker_shifts where id=(p_input->>'shiftId')::uuid and worker_id=w.id for update;
   if s.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   if s.version<>(p_input->>'version')::integer then raise exception 'CONFLICT'; end if;
   if exists(select 1 from jsonb_array_elements(s.events) e where not exists(select 1 from jsonb_array_elements(p_input->'events') n where n->>'id'=e->>'id' and n->>'kind'=e->>'kind')) then raise exception 'INVALID_EVENT'; end if;
  end if;
  next_events:=p_input->'events';
  if (select count(distinct value->>'id') from jsonb_array_elements(next_events))<>jsonb_array_length(next_events) then raise exception 'INVALID_EVENT'; end if;
  update public.worker_shifts set events=next_events,version=version+1 where id=s.id;
  perform workers_private.validate_shift(s.id);
  insert into public.worker_corrections(shift_id,requested_by,proposed_at,reason,status,reviewed_by,reviewed_at,review_reason,before_events,after_events)
   values(s.id,p_actor,(next_events->0->>'at')::timestamptz,trim(p_input->>'reason'),'approved',p_actor,now(),trim(p_input->>'reason'),s.events,next_events);
  select to_jsonb(sh) into output from public.worker_shifts sh where id=s.id; return output;
 end if;
 if p_action='provision_lookup' and manager then
  select id into uid from auth.users where raw_app_meta_data->>'workers_provision_id'=w.id::text and lower(email)=w.email;
  return jsonb_build_object('userId',uid,'worker',to_jsonb(w));
 elsif p_action='activate_account' and manager then
  select id into uid from auth.users where raw_app_meta_data->>'workers_provision_id'=w.id::text and lower(email)=w.email;
  if uid is null then raise exception 'PROVISION_PENDING'; end if;
  update public.workers set user_id=uid where id=w.id returning * into w;
  return to_jsonb(w);
 elsif p_action='update_worker' and manager then
  if (coalesce((p_input->>'active')::boolean,w.active)=false or exists(select 1 from public.worker_shifts s where s.worker_id=w.id and s.ended_at is null and not (p_input->'projects' ? s.project_id::text)))
   and exists(select 1 from public.worker_shifts where worker_id=w.id and ended_at is null) then raise exception 'OPEN_SHIFT_RESOLUTION_REQUIRED'; end if;
  if jsonb_typeof(p_input->'projects')<>'array' then raise exception 'INVALID_INPUT'; end if;
  for item in select value from jsonb_array_elements(p_input->'projects') loop
   pid:=(item#>>'{}')::uuid;
   if not exists(select 1 from public.projects where id=pid and owner_id=p_actor) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  end loop;
  update public.workers set name=trim(p_input->>'name'),active=(p_input->>'active')::boolean where id=w.id returning * into w;
  update public.worker_assignments set active=false where worker_id=w.id;
  for item in select value from jsonb_array_elements(p_input->'projects') loop
   insert into public.worker_assignments(worker_id,project_id) values(w.id,(item#>>'{}')::uuid) on conflict(worker_id,project_id) do update set active=true;
  end loop;
  if not w.active then delete from auth.refresh_tokens where user_id::text=w.user_id::text; delete from auth.sessions where user_id=w.user_id; end if;
  return to_jsonb(w);
 elsif p_action='reset_password' and manager then
  if w.user_id is null then raise exception 'PROVISION_PENDING'; end if;
  if p_input->>'hash' is null or p_input->>'hash' !~ '^\$2[aby]\$10\$[./A-Za-z0-9]{53}$' then raise exception 'INVALID_INPUT'; end if;
  perform workers_private.reset_password(w.user_id,p_input->>'hash');
  return jsonb_build_object('reset',true);
 elsif p_action='clock' and not manager then
  kind:=p_input->>'kind'; rid:=(p_input->>'id')::uuid; pid:=(p_input->>'projectId')::uuid;
  select to_jsonb(s) into output from public.worker_commands c join public.worker_shifts s on s.id=c.shift_id where c.worker_id=w.id and c.id=rid and c.action=kind and s.project_id=pid;
  if output is not null then return output; end if;
  if not exists(select 1 from public.worker_assignments where worker_id=w.id and project_id=pid and active) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into s from public.worker_shifts where worker_id=w.id and ended_at is null for update;
  if kind='in' then
   if s.id is not null then raise exception 'SHIFT_ALREADY_OPEN'; end if;
   insert into public.worker_shifts(worker_id,project_id) values(w.id,pid) returning * into s;
  elsif s.id is null or s.project_id<>pid then raise exception 'NO_OPEN_SHIFT'; end if;
  next_events:=s.events; ts:=clock_timestamp(); last_kind:=s.events->-1->>'kind';
  if kind='out' and last_kind='break_start' then
   if coalesce((p_input->>'closeBreak')::boolean,false)=false then raise exception 'CONFIRM_BREAK_CLOSE'; end if;
   next_events:=next_events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','break_end','at',ts));
  end if;
  next_events:=next_events||jsonb_build_array(jsonb_build_object('id',rid,'kind',kind,'at',ts));
  update public.worker_shifts set events=next_events,original_events=original_events||(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(next_events) with ordinality x(value,n) where n>jsonb_array_length(s.events)),version=version+1 where id=s.id;
  perform workers_private.validate_shift(s.id);
  insert into public.worker_commands(worker_id,id,action,shift_id) values(w.id,rid,kind,s.id);
  select to_jsonb(x) into output from public.worker_shifts x where id=s.id; return output;
 elsif p_action in ('request_correction','admin_correction','review_correction') then
  if p_action='review_correction' then
   if not manager then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   select c.* into c from public.worker_corrections c join public.worker_shifts s on s.id=c.shift_id where c.id=(p_input->>'correctionId')::uuid and s.worker_id=w.id for update of c;
   if c.id is null or c.status<>'pending' then raise exception 'CONFLICT'; end if;
   if length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'REASON_REQUIRED'; end if;
   if p_input->>'decision'='reject' then
    update public.worker_corrections set status='rejected',reviewed_by=p_actor,reviewed_at=now(),review_reason=p_input->>'reason' where id=c.id returning * into c; return to_jsonb(c);
   elsif p_input->>'decision'<>'approve' then raise exception 'INVALID_INPUT'; end if;
  else
   if p_action='admin_correction' and not manager then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   select * into s from public.worker_shifts where id=(p_input->>'shiftId')::uuid and worker_id=w.id;
   if s.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   if not manager and not exists(select 1 from public.worker_assignments where worker_id=w.id and project_id=s.project_id and active) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
   if p_input->>'eventId' is not null and not exists(select 1 from jsonb_array_elements(s.events) e where e->>'id'=p_input->>'eventId') then raise exception 'INVALID_EVENT'; end if;
   if not manager and p_input->>'eventId' is null then raise exception 'INVALID_EVENT'; end if;
   insert into public.worker_corrections(shift_id,requested_by,event_id,kind,proposed_at,reason)
    values(s.id,p_actor,(p_input->>'eventId')::uuid,p_input->>'kind',(p_input->>'at')::timestamptz,trim(p_input->>'reason')) returning * into c;
   if not manager then return to_jsonb(c); end if;
  end if;
  select * into s from public.worker_shifts where id=c.shift_id and worker_id=w.id for update;
  if c.event_id is null then
   next_events:=s.events||jsonb_build_array(jsonb_build_object('id',c.id,'kind',c.kind,'at',c.proposed_at));
   select jsonb_agg(value order by (value->>'at')::timestamptz) into next_events from jsonb_array_elements(next_events);
  else
   if not exists(select 1 from jsonb_array_elements(s.events) e where e->>'id'=c.event_id::text) then raise exception 'INVALID_EVENT'; end if;
   select jsonb_agg(case when value->>'id'=c.event_id::text then jsonb_set(value,'{at}',to_jsonb(c.proposed_at)) else value end order by n) into next_events from jsonb_array_elements(s.events) with ordinality x(value,n);
  end if;
  update public.worker_shifts set events=next_events,version=version+1 where id=s.id;
  perform workers_private.validate_shift(s.id);
  update public.worker_corrections set status='approved',reviewed_by=p_actor,reviewed_at=now(),review_reason=coalesce(p_input->>'reason',c.reason),before_events=s.events,after_events=next_events where id=c.id returning * into c;
  return to_jsonb(c);
 elsif p_action='reserve_evidence' and not manager then
  rid:=(p_input->>'id')::uuid; pid:=(p_input->>'projectId')::uuid;
  if not exists(select 1 from public.worker_assignments where worker_id=w.id and project_id=pid and active) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into ev from public.worker_evidence where id=rid for update;
  if ev.id is not null then
   if ev.worker_id<>w.id or ev.project_id<>pid or ev.mime<>p_input->>'mime' or ev.bytes<>(p_input->>'bytes')::integer then raise exception 'CONFLICT'; end if;
   return to_jsonb(ev);
  end if;
  if (select count(*) from public.worker_evidence where worker_id=w.id and status='pending' and created_at>now()-interval '24 hours')>=5 or (select count(*) from public.worker_evidence where worker_id=w.id and created_at>now()-interval '24 hours')>=100 then raise exception 'UPLOAD_LIMIT'; end if;
  insert into public.worker_evidence(id,worker_id,project_id,path,mime,bytes) values(rid,w.id,pid,w.id::text||'/'||rid::text,p_input->>'mime',(p_input->>'bytes')::integer) returning * into ev;
  return to_jsonb(ev);
 elsif p_action in ('get_evidence','finish_evidence','fail_evidence') then
  select * into ev from public.worker_evidence where id=(p_input->>'evidenceId')::uuid and worker_id=w.id for update;
  if ev.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if not manager and not exists(select 1 from public.worker_assignments where worker_id=w.id and project_id=ev.project_id and active) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if p_action='finish_evidence' and ev.status<>'ready' and ev.created_at<=now()-interval '24 hours' then raise exception 'UPLOAD_EXPIRED'; end if;
  if p_action='finish_evidence' and ev.status<>'ready' then update public.worker_evidence set status='ready',completed_at=now() where id=ev.id returning * into ev;
  elsif p_action='fail_evidence' and ev.status<>'ready' then update public.worker_evidence set status='failed' where id=ev.id returning * into ev; end if;
  return to_jsonb(ev);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function workers_private.command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function workers_private.command(uuid,uuid,text,jsonb) to service_role;

create function public.workers_command(p_actor uuid,p_session uuid,p_action text,p_input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select workers_private.command(p_actor,p_session,p_action,p_input)
$$;
revoke all on function public.workers_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.workers_command(uuid,uuid,text,jsonb) to service_role;

create function workers_private.reset_password(p_user uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workers where user_id=p_user) then raise exception 'ACCESS_DENIED'; end if;
 perform set_config('app.beta_password_admin','enabled',true);
 update auth.users set encrypted_password=p_hash,updated_at=now(),recovery_token='',recovery_sent_at=null where id=p_user;
 perform set_config('app.beta_password_admin','',true);
 delete from auth.one_time_tokens where user_id=p_user;
 delete from auth.refresh_tokens where user_id::text=p_user::text;
 delete from auth.sessions where user_id=p_user;
end $$;
revoke all on function workers_private.reset_password(uuid,text) from public,anon,authenticated;
grant execute on function workers_private.reset_password(uuid,text) to service_role;

create function workers_private.upload_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.worker_evidence e join public.worker_assignments a on a.worker_id=e.worker_id and a.project_id=e.project_id
 where e.path=p_path and e.worker_id=workers_private.worker_id() and a.active and e.status in ('pending','failed') and e.created_at>now()-interval '24 hours')
$$;
revoke all on function workers_private.upload_allowed(text) from public,anon;
grant execute on function workers_private.upload_allowed(text) to authenticated,service_role;
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('worker-progress','worker-progress',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
  execute 'create policy worker_progress_insert on storage.objects for insert to authenticated with check(bucket_id=''worker-progress'' and workers_private.upload_allowed(name))';
  execute 'create policy worker_progress_boundary on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>''worker-progress'') with check(bucket_id<>''worker-progress'' or workers_private.upload_allowed(name))';
 end if;
end $$;
commit;
