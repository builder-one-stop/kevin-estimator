-- LOCAL DRAFT ONLY. Not a registered migration and never applied remotely.
-- Explicit organization enrollment is required; no email/domain-based membership.
begin;
alter table public.beta_accounts drop constraint beta_accounts_role_key;
alter table public.beta_accounts drop constraint beta_accounts_role_check;
alter table public.beta_accounts add constraint beta_accounts_role_check check(role in ('operator','admin','seller'));
create unique index beta_legacy_role_unique on public.beta_accounts(role) where role in ('operator','admin');
create schema sales_private;
revoke all on schema sales_private from public,anon;
grant usage on schema sales_private to authenticated;
create table public.sales_organizations(id uuid primary key,name text not null);
create table public.sales_memberships(
 user_id uuid primary key references public.beta_accounts(user_id),organization_id uuid not null references public.sales_organizations(id),
 name text not null check(length(trim(name)) between 1 and 120),role text not null check(role in ('manager','seller')),active boolean not null default true,
 unique(organization_id,user_id));
create table public.sales_project_access(
 project_id uuid primary key references public.projects(id),organization_id uuid not null references public.sales_organizations(id),
 assigned_to uuid,version integer not null default 1,updated_at timestamptz not null default now(),
 foreign key(organization_id,assigned_to) references public.sales_memberships(organization_id,user_id));
create index sales_assigned on public.sales_project_access(assigned_to,organization_id);
create table public.sales_lead_notes(
 id uuid primary key,project_id uuid not null references public.sales_project_access(project_id),author_id uuid not null references public.sales_memberships(user_id),
 author_name text not null,body text not null check(length(trim(body)) between 1 and 4000),kind text not null default 'note' check(kind in ('note','assignment')),
 created_at timestamptz not null default now());
create index sales_note_project on public.sales_lead_notes(project_id,created_at);
-- Links preserve document ownership. Reassignment never changes or shares a document.
create table public.sales_document_links(
 estimate_id uuid primary key references public.estimates(id) on delete cascade,project_id uuid not null references public.sales_project_access(project_id),
 organization_id uuid not null references public.sales_organizations(id),creator_id uuid not null references public.sales_memberships(user_id),assignment_version integer not null,snapshot jsonb not null);
create index sales_document_project on public.sales_document_links(project_id,creator_id);
revoke all on public.sales_organizations,public.sales_memberships,public.sales_project_access,public.sales_lead_notes,public.sales_document_links from public,anon,authenticated;
alter table public.sales_organizations enable row level security;
alter table public.sales_memberships enable row level security;
alter table public.sales_project_access enable row level security;
alter table public.sales_lead_notes enable row level security;
alter table public.sales_document_links enable row level security;
-- No direct table grants: a narrowly scoped RPC is the only sales data interface.
-- Existing owner RLS remains authoritative for editing estimates and proposals.
create policy seller_no_clients on public.clients as restrictive for all to authenticated using(public.beta_account_role()<>'seller') with check(public.beta_account_role()<>'seller');
create policy seller_no_projects on public.projects as restrictive for all to authenticated using(public.beta_account_role()<>'seller') with check(public.beta_account_role()<>'seller');
create policy seller_settings_readonly on public.ai_settings as restrictive for insert to authenticated with check(public.beta_account_role()<>'seller');
create policy seller_settings_no_update on public.ai_settings as restrictive for update to authenticated using(public.beta_account_role()<>'seller') with check(public.beta_account_role()<>'seller');
create policy seller_settings_no_delete on public.ai_settings as restrictive for delete to authenticated using(public.beta_account_role()<>'seller');
create function sales_private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_memberships m where m.user_id=auth.uid() and m.role='seller' and m.active)
$$;
revoke all on function sales_private.active_member() from public,anon;
grant execute on function sales_private.active_member() to authenticated;
do $$declare t text;begin
 foreach t in array array['estimates','estimate_messages','estimate_revisions','ai_conversations','ai_settings','ai_attachments'] loop
  execute format('create policy sales_active_member on public.%I as restrictive for all to authenticated using(public.beta_account_role()<>''seller'' or sales_private.active_member()) with check(public.beta_account_role()<>''seller'' or sales_private.active_member())',t);
 end loop;
end $$;
-- Only extends the own-document role check; preserves installed validation.
do $$declare definition text;begin
 select pg_get_functiondef('public.finalize_estimate(uuid,integer,uuid)'::regprocedure) into definition;
 if position('''operator'',''admin''' in definition)=0 then raise exception 'FINALIZATION_DRAFT_REVIEW_REQUIRED';end if;
 execute replace(definition,'''operator'',''admin''','''operator'',''admin'',''seller''');
end $$;

create function sales_private.gateway(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();member public.sales_memberships;lead public.sales_project_access;target public.sales_memberships;
 result jsonb;doc public.estimates;note public.sales_lead_notes;pid uuid;eid uuid;link public.sales_document_links;
begin
 if public.beta_account_role() is null then raise exception 'SALES_ACCESS_DENIED' using errcode='42501';end if;
 select * into member from public.sales_memberships where user_id=actor and active;
 if not found or (member.role='seller' and public.beta_account_role()<>'seller') or
 (member.role='manager' and public.beta_account_role() not in ('admin','operator')) then raise exception 'SALES_ACCESS_DENIED' using errcode='42501';end if;
 if p_action='context' then
  return jsonb_build_object('name',member.name,'role',member.role,'organizationId',member.organization_id,'members',
   case when member.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',name)), '[]') from public.sales_memberships where organization_id=member.organization_id and role='seller' and active) else '[]'::jsonb end);
 end if;
 if p_action='projects' then
  return (select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('assigned_to',a.assigned_to,'assigned_name',s.name,'assignment_version',a.version,'sales_managed',true,'client',to_jsonb(c)) order by p.created_at desc),'[]')
   from public.sales_project_access a join public.projects p on p.id=a.project_id left join public.clients c on c.id=p.client_id
   left join public.sales_memberships s on s.user_id=a.assigned_to
   where a.organization_id=member.organization_id and (member.role='manager' or a.assigned_to=actor));
 end if;
 if p_action='document' then
  select * into doc from public.estimates where id=(p_data->>'id')::uuid;
  select * into link from public.sales_document_links where estimate_id=doc.id;
  if doc.id is null or (doc.owner_id<>actor and not(member.role='manager' and link.organization_id=member.organization_id)) then raise exception 'SALES_DOCUMENT_DENIED' using errcode='42501';end if;
  return to_jsonb(doc)||jsonb_build_object('sales_snapshot',link.snapshot,'read_only',doc.owner_id<>actor);
 end if;
 pid:=(p_data->>'projectId')::uuid;
 select * into lead from public.sales_project_access where project_id=pid and organization_id=member.organization_id for update;
 if not found or (member.role<>'manager' and lead.assigned_to is distinct from actor) then raise exception 'SALES_LEAD_DENIED' using errcode='42501';end if;
 if p_action='assign' then
  if member.role<>'manager' then raise exception 'SALES_MANAGER_REQUIRED' using errcode='42501';end if;
  if (p_data->>'version')::integer is distinct from lead.version then raise exception 'ASSIGNMENT_CONFLICT' using errcode='40001';end if;
  if p_data->>'sellerId' is not null then
   select * into target from public.sales_memberships where user_id=(p_data->>'sellerId')::uuid and organization_id=member.organization_id and role='seller' and active;
   if not found then raise exception 'SALES_SELLER_DENIED' using errcode='42501';end if;
  end if;
  if lead.assigned_to is distinct from target.user_id then
   update public.sales_project_access set assigned_to=target.user_id,version=version+1,updated_at=now() where project_id=pid;
   insert into public.sales_lead_notes(id,project_id,author_id,author_name,body,kind) values(gen_random_uuid(),pid,actor,member.name,coalesce(target.name,'Unassigned'),'assignment');
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='stage' then
  if p_data->>'stage' is null or p_data->>'stage' not in ('Lead','Draft','Bidding','Approved','In progress','Completed') then raise exception 'INVALID_STAGE';end if;
  update public.projects set stage=p_data->>'stage' where id=pid;
  return jsonb_build_object('ok',true);
 elsif p_action='notes' then
  return (select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at,n.id),'[]') from public.sales_lead_notes n where n.project_id=pid);
 elsif p_action='note' then
  if coalesce(length(trim(p_data->>'body')),0) not between 1 and 4000 then raise exception 'INVALID_NOTE';end if;
  select * into note from public.sales_lead_notes where id=(p_data->>'id')::uuid;
  if found then
   if note.project_id<>pid or note.author_id<>actor or note.body<>p_data->>'body' or note.kind<>'note' then raise exception 'NOTE_RETRY_CONFLICT' using errcode='40001';end if;
   return to_jsonb(note);
  end if;
  insert into public.sales_lead_notes(id,project_id,author_id,author_name,body) values((p_data->>'id')::uuid,pid,actor,member.name,p_data->>'body') returning * into note;
  return to_jsonb(note);
 elsif p_action='documents' then
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.updated_at desc),'[]') from public.sales_document_links l join public.estimates e on e.id=l.estimate_id
   where l.project_id=pid and l.organization_id=member.organization_id and (member.role='manager' or e.owner_id=actor));
 elsif p_action in ('create-document','link-document') then
  eid:=(p_data->>'id')::uuid;
  select * into doc from public.estimates where id=eid;
  if found and doc.owner_id<>actor then raise exception 'SALES_DOCUMENT_DENIED' using errcode='42501';end if;
  if doc.id is not null and (doc.project_id is not null or doc.client_id is not null) then raise exception 'SALES_STANDALONE_DOCUMENT_REQUIRED' using errcode='42501';end if;
  if not found and p_action='link-document' then raise exception 'SALES_DOCUMENT_DENIED' using errcode='42501';end if;
  if doc.id is null then
   if coalesce(length(trim(p_data->>'title')),0) not between 1 and 200 then raise exception 'INVALID_TITLE';end if;
   insert into public.estimates(id,owner_id,title,document) values(eid,actor,p_data->>'title','{"sections":[],"proposal":{"intro":"","scope":"","notes":"","exclusions":"","terms":""}}') returning * into doc;
  end if;
  if exists(select 1 from public.sales_document_links where estimate_id=eid and (project_id<>pid or creator_id<>actor)) then raise exception 'SALES_DOCUMENT_DENIED' using errcode='42501';end if;
  insert into public.sales_document_links(estimate_id,project_id,organization_id,creator_id,assignment_version,snapshot)
   select eid,pid,member.organization_id,actor,lead.version,jsonb_build_object('name',p.name,'address',p.address,'capturedAt',now()) from public.projects p where p.id=pid on conflict(estimate_id) do nothing;
  return to_jsonb(doc);
 end if;
 raise exception 'SALES_ACTION_DENIED' using errcode='42501';
end $$;
revoke all on all functions in schema sales_private from public,anon;
grant execute on function sales_private.gateway(text,jsonb) to authenticated;
create function public.sales_gateway(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select sales_private.gateway(p_action,p_data)$$;
revoke all on function public.sales_gateway(text,jsonb) from public,anon;
grant execute on function public.sales_gateway(text,jsonb) to authenticated;
commit;
