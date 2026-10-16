begin;
-- New metadata is nullable for historical records; effective/corrected events stay intact.
alter table public.worker_shifts add column entry_location jsonb,
 add column entry_recorded_at timestamptz,
 add column entry_source text not null default 'legacy' check(entry_source in ('legacy','device','admin')),
 add constraint worker_entry_location_shape check (
  (entry_location is null and entry_recorded_at is null and entry_source in ('legacy','admin')) or
  (entry_location is not null and jsonb_typeof(entry_location)='object' and entry_recorded_at is not null and entry_source='device'));

create table public.worker_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 worker_id uuid not null references public.workers(id) on delete cascade,
 shift_id uuid not null unique references public.worker_shifts(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz
);
create index worker_notifications_recipient on public.worker_notifications(recipient_id,created_at desc);
alter table public.worker_notifications enable row level security;
revoke all on public.worker_notifications from public,anon,authenticated;
grant select on public.worker_notifications to authenticated;
grant all on public.worker_notifications to service_role;
create policy worker_notifications_read on public.worker_notifications for select to authenticated
 using(recipient_id=auth.uid() and public.beta_account_role() in ('operator','admin') and
 exists(select 1 from public.workers w where w.id=worker_id and w.manager_id=auth.uid()));

create function workers_private.protect_entry_location() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.entry_source='device' and (new.entry_location,new.entry_recorded_at,new.entry_source)
 is distinct from (old.entry_location,old.entry_recorded_at,old.entry_source) then raise exception 'ORIGINAL_LOCATION_IMMUTABLE'; end if;
 return new;
end $$;
revoke all on function workers_private.protect_entry_location() from public,anon,authenticated;
create trigger protect_worker_entry_location before update on public.worker_shifts
 for each row execute function workers_private.protect_entry_location();

-- Preserve the existing command dispatcher, chronology, correction and upload rules.
alter function workers_private.command(uuid,uuid,text,jsonb) rename to command_before_location;
create function workers_private.command(p_actor uuid,p_session uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare w public.workers; result jsonb; l jsonb; captured timestamptz; official timestamptz; nid uuid;
begin
 if p_action in ('notifications','notification_read') then
  if not workers_private.session_valid(p_actor,p_session) or not exists(select 1 from public.beta_accounts where user_id=p_actor and role in ('operator','admin')) then
   raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  if p_action='notification_read' then
   update public.worker_notifications n set read_at=coalesce(n.read_at,clock_timestamp())
   where n.id=(p_input->>'notificationId')::uuid and n.recipient_id=p_actor
    and exists(select 1 from public.workers w where w.id=n.worker_id and w.manager_id=p_actor)
   returning n.id into nid;
   if nid is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('notifications',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (
   select n.*,w.name as worker_name,p.name as project_name,s.project_id,s.entry_recorded_at,s.entry_location
   from public.worker_notifications n join public.workers w on w.id=n.worker_id
   join public.worker_shifts s on s.id=n.shift_id join public.projects p on p.id=s.project_id
   where n.recipient_id=p_actor and w.manager_id=p_actor) q),'[]'),
   'unreadCount',(select count(*) from public.worker_notifications n join public.workers w on w.id=n.worker_id
    where n.recipient_id=p_actor and w.manager_id=p_actor and n.read_at is null));
 end if;
 if p_action='clock' and p_input->>'kind'='in' then
  -- Same worker lock as the original dispatcher: concurrent devices serialize here.
  if not workers_private.session_valid(p_actor,p_session) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  select * into w from public.workers where user_id=p_actor and active for update;
  if w.id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  -- A previously committed retry may carry an older capture; return its original result.
  if exists(select 1 from public.worker_commands c join public.worker_shifts s on s.id=c.shift_id
   where c.worker_id=w.id and c.id=(p_input->>'id')::uuid and c.action='in' and s.project_id=(p_input->>'projectId')::uuid) then
   return workers_private.command_before_location(p_actor,p_session,p_action,p_input);
  end if;
  l:=p_input->'location';
  if l is null or jsonb_typeof(l)='null' then raise exception 'LOCATION_REQUIRED'; end if;
  if jsonb_typeof(l)<>'object' or not(l ?& array['latitude','longitude','accuracy','capturedAt']) or
    (l-array['latitude','longitude','accuracy','capturedAt'])<>'{}'::jsonb or
    jsonb_typeof(l->'latitude')<>'number' or jsonb_typeof(l->'longitude')<>'number' or jsonb_typeof(l->'accuracy')<>'number' or jsonb_typeof(l->'capturedAt')<>'string' then
   raise exception 'INVALID_LOCATION';
  end if;
  if (l->>'latitude')::numeric not between -90 and 90 or (l->>'longitude')::numeric not between -180 and 180 or (l->>'accuracy')::numeric<0 then raise exception 'INVALID_LOCATION'; end if;
  begin
   if l->>'capturedAt' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'INVALID_LOCATION'; end if;
   captured:=(l->>'capturedAt')::timestamptz;
  exception when others then raise exception 'INVALID_LOCATION'; end;
  if captured<clock_timestamp()-interval '120 seconds' or captured>clock_timestamp()+interval '60 seconds' then raise exception 'LOCATION_STALE'; end if;
  result:=workers_private.command_before_location(p_actor,p_session,p_action,p_input);
  official:=(result->'original_events'->0->>'at')::timestamptz;
  update public.worker_shifts set entry_location=l,entry_recorded_at=official,entry_source='device'
   where id=(result->>'id')::uuid returning to_jsonb(worker_shifts) into result;
  -- Recipient comes exclusively from the existing worker→manager relationship.
  insert into public.worker_notifications(recipient_id,worker_id,shift_id)
   values(w.manager_id,w.id,(result->>'id')::uuid);
  return result;
 end if;
 result:=workers_private.command_before_location(p_actor,p_session,p_action,p_input);
 if p_action='admin_shift' then
  update public.worker_shifts set entry_source='admin' where id=(result->>'id')::uuid and entry_source='legacy'
   returning to_jsonb(worker_shifts) into result;
  if result is null then select to_jsonb(s) into result from public.worker_shifts s where s.id=(p_input->>'id')::uuid; end if;
 end if;
 return result;
end $$;
revoke all on function workers_private.command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function workers_private.command(uuid,uuid,text,jsonb) to service_role;
-- Refresh the public wrapper to target the extended dispatcher after the rename.
create or replace function public.workers_command(p_actor uuid,p_session uuid,p_action text,p_input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select workers_private.command(p_actor,p_session,p_action,p_input)$$;
revoke all on function public.workers_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.workers_command(uuid,uuid,text,jsonb) to service_role;
commit;
