-- REVIEWED LOCAL DRAFT ONLY. Not applied remotely or registered as a migration.
-- Existing identity creation is server-only. Never convert or adopt an existing Auth user.
begin;
create schema if not exists team_private;
revoke all on schema team_private from public,anon,authenticated;
grant usage on schema team_private to service_role;
create table public.team_seats(
 id uuid primary key,organization_id uuid not null references public.sales_organizations(id),
 requested_by uuid not null references public.sales_memberships(user_id),
 email text not null unique check(email=lower(trim(email))),name text not null check(length(trim(name)) between 1 and 120),
 user_id uuid unique references auth.users(id),created_at timestamptz not null default now());
create table public.team_member_versions(user_id uuid primary key references public.sales_memberships(user_id),version integer not null check(version>0));
create table public.team_audit(id bigint generated always as identity primary key,organization_id uuid not null references public.sales_organizations(id),
 actor uuid not null,target uuid not null,action text not null check(action in ('created','updated','deactivated','reactivated')),created_at timestamptz not null default now());
alter table public.team_seats enable row level security;
alter table public.team_member_versions enable row level security;
alter table public.team_audit enable row level security;
revoke all on public.team_seats,public.team_member_versions,public.team_audit from public,anon,authenticated,service_role;

create function team_private.command(p_actor uuid,p_session uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare manager public.sales_memberships;seat public.team_seats;target public.sales_memberships;uid uuid;v integer;nm text;em text;active_value boolean;
begin
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()))
 or not exists(select 1 from public.beta_accounts where user_id=p_actor and role='admin') then raise exception 'TEAM_ACCESS_DENIED' using errcode='42501';end if;
 select * into manager from public.sales_memberships where user_id=p_actor and role='manager' and active;
 if not found then raise exception 'TEAM_ACCESS_DENIED' using errcode='42501';end if;
 if p_action='list' then
  return jsonb_build_object('members',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from(
   select jsonb_build_object('id',coalesce(s.id,m.user_id),'userId',m.user_id,'name',m.name,'email',u.email,'active',m.active,'status','ready','version',coalesce(v.version,1)) x
    from public.sales_memberships m join auth.users u on u.id=m.user_id left join public.team_seats s on s.user_id=m.user_id left join public.team_member_versions v on v.user_id=m.user_id
    where m.organization_id=manager.organization_id and m.role='seller'
   union all select jsonb_build_object('id',s.id,'userId',null,'name',s.name,'email',s.email,'active',false,'status','pending','version',1)
    from public.team_seats s where s.organization_id=manager.organization_id and s.user_id is null
  ) rows),'organizationName',(select name from public.sales_organizations where id=manager.organization_id));
 end if;
 if p_action='reserve' then
  nm:=trim(p_input->>'name');em:=lower(trim(p_input->>'email'));
  if nm is null or length(nm) not between 1 and 120 or em is null or length(em)>254 or em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'TEAM_INVALID_INPUT';end if;
  perform pg_advisory_xact_lock(hashtextextended(em,0));
  select * into seat from public.team_seats where id=(p_input->>'id')::uuid for update;
  if found then
   if seat.organization_id<>manager.organization_id or seat.requested_by<>p_actor or seat.email<>em or seat.name<>nm then raise exception 'TEAM_CONFLICT';end if;
   return to_jsonb(seat);
  end if;
  if exists(select 1 from auth.users where lower(email)=em) or exists(select 1 from public.team_seats where email=em) or exists(select 1 from public.workers where email=em) then raise exception 'TEAM_EMAIL_UNAVAILABLE';end if;
  insert into public.team_seats(id,organization_id,requested_by,email,name) values((p_input->>'id')::uuid,manager.organization_id,p_actor,em,nm) returning * into seat;
  return to_jsonb(seat);
 end if;
 if p_action in ('lookup','activate') then
  select * into seat from public.team_seats where id=(p_input->>'id')::uuid and organization_id=manager.organization_id for update;
  if not found or seat.requested_by<>p_actor then raise exception 'TEAM_ACCESS_DENIED' using errcode='42501';end if;
  select id into uid from auth.users where raw_app_meta_data->>'one_stop_team_seat'=seat.id::text and lower(email)=seat.email;
  if p_action='lookup' then return jsonb_build_object('userId',uid);end if;
  if seat.user_id is not null then return jsonb_build_object('id',seat.id,'userId',seat.user_id);end if;
  if uid is null then raise exception 'TEAM_PROVISION_PENDING';end if;
  if exists(select 1 from public.beta_accounts where user_id=uid) or exists(select 1 from public.workers where user_id=uid) or exists(select 1 from public.sales_memberships where user_id=uid) then raise exception 'TEAM_EMAIL_UNAVAILABLE';end if;
  insert into public.beta_accounts(user_id,role) values(uid,'seller');
  insert into public.sales_memberships(user_id,organization_id,name,role,active) values(uid,manager.organization_id,seat.name,'seller',true);
  insert into public.team_member_versions(user_id,version) values(uid,1);
  update public.team_seats set user_id=uid where id=seat.id;
  insert into public.team_audit(organization_id,actor,target,action) values(manager.organization_id,p_actor,uid,'created');
  return jsonb_build_object('id',seat.id,'userId',uid);
 end if;
 if p_action='update' then
  select * into target from public.sales_memberships where user_id=(p_input->>'userId')::uuid and organization_id=manager.organization_id and role='seller' for update;
  if not found then raise exception 'TEAM_ACCESS_DENIED' using errcode='42501';end if;
  select coalesce((select version from public.team_member_versions where user_id=target.user_id),1) into v;
  nm:=trim(p_input->>'name');active_value:=(p_input->>'active')::boolean;
  if nm is null or length(nm) not between 1 and 120 or active_value is null then raise exception 'TEAM_INVALID_INPUT';end if;
  if v is distinct from (p_input->>'version')::integer then
   if nm=target.name and active_value=target.active then return jsonb_build_object('ok',true,'version',v);end if;
   raise exception 'TEAM_CONFLICT' using errcode='40001';
  end if;
  update public.sales_memberships set name=nm,active=active_value where user_id=target.user_id;
  insert into public.team_member_versions(user_id,version) values(target.user_id,v+1) on conflict(user_id) do update set version=excluded.version;
  if not active_value then delete from auth.refresh_tokens where user_id::text=target.user_id::text;delete from auth.sessions where user_id=target.user_id;end if;
  insert into public.team_audit(organization_id,actor,target,action) values(manager.organization_id,p_actor,target.user_id,case when active_value<>target.active then case when active_value then 'reactivated' else 'deactivated' end else 'updated' end);
  return jsonb_build_object('ok',true,'version',v+1);
 end if;
 raise exception 'TEAM_INVALID_ACTION';
end $$;
revoke all on function team_private.command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function team_private.command(uuid,uuid,text,jsonb) to service_role;
create function public.team_command(p_actor uuid,p_session uuid,p_action text,p_input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select team_private.command(p_actor,p_session,p_action,p_input)$$;
revoke all on function public.team_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.team_command(uuid,uuid,text,jsonb) to service_role;
commit;
