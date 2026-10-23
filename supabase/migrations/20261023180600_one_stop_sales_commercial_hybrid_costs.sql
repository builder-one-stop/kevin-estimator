-- REVIEW DRAFT ONLY: no enrollment or synthetic data. Remote application requires explicit approval.
-- Atomic schema expansion; fails closed if expected objects or constraints differ.
begin;
-- LOCAL DRAFT ONLY. Not a registered migration and never applied remotely.
-- Explicit organization enrollment is required; no email/domain-based membership.

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
create or replace function public.finalize_estimate(p_id uuid,p_expected integer,p_request_id uuid)
returns public.estimates language plpgsql security invoker set search_path='' as $$
declare e public.estimates; s jsonb; i jsonb;
begin
 if public.beta_account_role() not in ('operator','admin','seller') or public.beta_account_role() is null then
  raise exception 'ACCESS_DENIED' using errcode='42501';
 end if;
 select * into e from public.estimates where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'INVALID_INPUT'; end if;
 if e.finalization_request_id=p_request_id and e.finalized_version=e.version then return e; end if;
 if e.version<>p_expected then raise exception 'ESTIMATE_CONFLICT'; end if;
 if e.finalized_version=e.version then return e; end if;
 if length(trim(e.title))=0 or jsonb_array_length(e.document->'sections')=0 then raise exception 'INVALID_ESTIMATE'; end if;
 for s in select value from jsonb_array_elements(e.document->'sections') loop
  if jsonb_typeof(s->'items')<>'array' or jsonb_array_length(s->'items')=0 then raise exception 'INVALID_ESTIMATE'; end if;
  for i in select value from jsonb_array_elements(s->'items') loop
   if coalesce(length(trim(i->>'description')),0)=0 or (i->>'quantity') is null or (i->>'unitCost') is null
      or (i->>'quantity')::numeric<0 or (i->>'unitCost')::numeric<0 then raise exception 'INVALID_ESTIMATE'; end if;
  end loop;
 end loop;
 perform set_config('app.change_origin','finalized',true);
 update public.estimates set finalized_at=clock_timestamp(),finalized_version=e.version+1,finalization_request_id=p_request_id
 where id=e.id returning * into e;
 return e;
end $$;
revoke all on function public.finalize_estimate(uuid,integer,uuid) from public,anon;
grant execute on function public.finalize_estimate(uuid,integer,uuid) to authenticated;

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
  if (member.role='seller' and (doc.project_id is not null or doc.client_id is not null)) or doc.id is null or (doc.owner_id<>actor and not(member.role='manager' and link.organization_id=member.organization_id)) then raise exception 'SALES_DOCUMENT_DENIED' using errcode='42501';end if;
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

-- LOCAL PGLITE DRAFT ONLY. No remote migration or legal invoice issuance.

create schema if not exists commercial_private;
revoke all on schema commercial_private from public,anon;
grant usage on schema commercial_private to authenticated;
create table if not exists public.commercial_followups(
 id uuid primary key,organization_id uuid not null references public.sales_organizations(id),project_id uuid not null references public.sales_project_access(project_id),
 responsible_id uuid not null references public.sales_memberships(user_id),title text not null,notes text not null default '',due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','completed')),version integer not null default 1,
 created_by uuid not null references public.sales_memberships(user_id),updated_by uuid not null references public.sales_memberships(user_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists followups_org_due on public.commercial_followups(organization_id,due_at);
create index if not exists followups_project on public.commercial_followups(project_id,due_at);
create table if not exists public.commercial_invoices(
 id uuid primary key,organization_id uuid not null references public.sales_organizations(id),project_id uuid not null references public.sales_project_access(project_id),
 source_estimate_id uuid not null references public.estimates(id),source_version integer not null,source_snapshot jsonb not null,
 title text not null,lines jsonb not null,tax_amount numeric, tax_note text not null default '',notes text not null default '',currency text not null default 'USD' check(currency='USD'),
 known_subtotal_cents bigint not null,tax_cents bigint,total_cents bigint,preliminary boolean not null,
 status text not null default 'internal_draft' check(status in ('internal_draft','internal_reviewed')),version integer not null default 1,
 created_by uuid not null references public.sales_memberships(user_id),updated_by uuid not null references public.sales_memberships(user_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists invoices_org_project on public.commercial_invoices(organization_id,project_id);
create table if not exists commercial_private.receipts(actor uuid not null,request_id uuid not null,action text not null,input jsonb not null,response jsonb not null,primary key(actor,request_id));
alter table public.commercial_followups enable row level security;
alter table public.commercial_invoices enable row level security;
alter table commercial_private.receipts enable row level security;
revoke all on public.commercial_followups,public.commercial_invoices,commercial_private.receipts from public,anon,authenticated;

create or replace function commercial_private.gateway(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();m public.sales_memberships;p public.sales_project_access;f public.commercial_followups;v public.commercial_invoices;
 e public.estimates;l public.sales_document_links;receipt commercial_private.receipts;rid uuid;pid uuid;response jsonb;items jsonb:='[]';line jsonb;
 subtotal numeric:=0;tax numeric;total numeric;pending boolean:=false;qty numeric;price numeric;n integer:=0;
begin
 if public.beta_account_role() is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into m from public.sales_memberships where user_id=actor and active;
 if not found or (m.role='manager' and public.beta_account_role() not in ('admin','operator')) or (m.role='seller' and public.beta_account_role()<>'seller') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if octet_length(p_data::text)>200000 then raise exception 'INPUT_TOO_LARGE';end if;
 if p_action='ops:context' then return jsonb_build_object('id',actor,'name',m.name,'role',m.role,'organizationId',m.organization_id,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',name,'role',role)),'[]') from public.sales_memberships where organization_id=m.organization_id and active));end if;
 if p_action like 'ops:invoice%' and m.role<>'manager' then raise exception 'MANAGER_REQUIRED' using errcode='42501';end if;
 pid:=(p_data->>'projectId')::uuid;
 if p_action in ('ops:followup-save','ops:followups') and pid is not null then
  select * into p from public.sales_project_access where project_id=pid and organization_id=m.organization_id for update;
  if not found or (m.role='seller' and p.assigned_to is distinct from actor) then raise exception 'LEAD_ACCESS_DENIED' using errcode='42501';end if;
 elsif p_action in ('ops:followup-save','ops:followups') and m.role<>'manager' then raise exception 'LEAD_REQUIRED' using errcode='42501';end if;
 if p_action='ops:followups' then return (select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('responsible_name',s.name,'author_name',a.name,'updated_name',u.name,'project_name',pr.name) order by x.due_at),'[]') from public.commercial_followups x join public.sales_memberships s on s.user_id=x.responsible_id join public.sales_memberships a on a.user_id=x.created_by join public.sales_memberships u on u.user_id=x.updated_by join public.projects pr on pr.id=x.project_id where x.organization_id=m.organization_id and (pid is null or x.project_id=pid));end if;
 if p_action='ops:invoice-sources' then return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'version',x.version,'project_id',sl.project_id,'owner_name',sm.name) order by x.updated_at desc),'[]') from public.estimates x left join public.sales_document_links sl on sl.estimate_id=x.id left join public.sales_memberships sm on sm.user_id=x.owner_id where (sl.organization_id=m.organization_id or (sl.estimate_id is null and x.owner_id=actor)) and (pid is null or sl.project_id=pid));end if;
 if p_action='ops:invoices' then return (select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('project_name',pr.name) order by x.updated_at desc),'[]') from public.commercial_invoices x join public.projects pr on pr.id=x.project_id where x.organization_id=m.organization_id and (pid is null or x.project_id=pid));end if;
 if p_action='ops:followup-save' then
  if pid is null then raise exception 'LEAD_REQUIRED';end if;
  if coalesce(length(trim(p_data->>'title')),0) not between 1 and 200 or coalesce(length(p_data->>'notes'),0)>4000 or p_data->>'status' is null or p_data->>'status' not in ('pending','completed') then raise exception 'INVALID_FOLLOWUP';end if;
  if p_data->>'dueAt' is null or p_data->>'dueAt' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or not isfinite((p_data->>'dueAt')::timestamptz) then raise exception 'INVALID_DATE';end if;
  if not exists(select 1 from public.sales_memberships where user_id=(p_data->>'responsibleId')::uuid and organization_id=m.organization_id and active) or (m.role='seller' and (p_data->>'responsibleId')::uuid<>actor) then raise exception 'RESPONSIBLE_DENIED' using errcode='42501';end if;
  select * into f from public.commercial_followups where id=(p_data->>'id')::uuid for update;
  if found and (f.project_id<>pid or f.organization_id<>m.organization_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 elsif p_action='ops:invoice-create' then
  select * into e from public.estimates where id=(p_data->>'sourceId')::uuid for share;
  select * into l from public.sales_document_links where estimate_id=e.id;
  if e.id is null or (l.estimate_id is not null and l.organization_id<>m.organization_id) or (l.estimate_id is null and e.owner_id<>actor) then raise exception 'SOURCE_DENIED' using errcode='42501';end if;
  pid:=coalesce(l.project_id,pid);
  if not exists(select 1 from public.sales_project_access where project_id=pid and organization_id=m.organization_id) then raise exception 'PROJECT_DENIED' using errcode='42501';end if;
 elsif p_action='ops:invoice-save' then
  select * into v from public.commercial_invoices where id=(p_data->>'id')::uuid and organization_id=m.organization_id for update;
  if not found then raise exception 'INVOICE_DENIED' using errcode='42501';end if;
 else raise exception 'ACTION_DENIED' using errcode='42501';end if;
 rid:=(p_data->>'requestId')::uuid;if rid is null then raise exception 'REQUEST_ID_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||rid::text,0));

 -- Replacement-free explicit alias avoids actor/column ambiguity.
 select r.* into receipt from commercial_private.receipts r where r.actor=auth.uid() and r.request_id=rid;
 if found then if receipt.action<>p_action or receipt.input<>p_data then raise exception 'REQUEST_CONFLICT' using errcode='40001';end if;return receipt.response;end if;
 if p_action='ops:followup-save' then
  if f.id is null then
   if (p_data->>'version')::integer is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
   insert into public.commercial_followups(id,organization_id,project_id,responsible_id,title,notes,due_at,status,created_by,updated_by) values((p_data->>'id')::uuid,m.organization_id,pid,(p_data->>'responsibleId')::uuid,trim(p_data->>'title'),coalesce(p_data->>'notes',''),(p_data->>'dueAt')::timestamptz,p_data->>'status',actor,actor) returning to_jsonb(commercial_followups.*) into response;
  else
   if f.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
   update public.commercial_followups set responsible_id=(p_data->>'responsibleId')::uuid,title=trim(p_data->>'title'),notes=coalesce(p_data->>'notes',''),due_at=(p_data->>'dueAt')::timestamptz,status=p_data->>'status',version=version+1,updated_by=actor,updated_at=now() where id=f.id returning to_jsonb(commercial_followups.*) into response;
  end if;
 elsif p_action='ops:invoice-create' then
  if exists(select 1 from public.commercial_invoices where id=(p_data->>'id')::uuid) then raise exception 'INVOICE_ID_CONFLICT' using errcode='40001';end if;
  -- Match proposalPrices: rounded costs, aggregated markup and largest-remainder
  -- cent allocation. Keep sufficient unit-price precision to preserve each line.
  with raw as (
   select i.value as item,row_number() over(order by sec.ordinality,i.ordinality) as idx
   from jsonb_array_elements(e.document->'sections') with ordinality sec
   cross join lateral jsonb_array_elements(sec.value->'items') with ordinality i
  ), costs as (
   select *,case when coalesce((item->>'priceMissing')::boolean,false) or coalesce((item->>'quantityPending')::boolean,false) or coalesce(length(trim(item->>'description')),0)=0 then 0
    else round((item->>'quantity')::numeric*round((item->>'unitCost')::numeric*100)) end as cost,
    coalesce((item->>'markupBps')::numeric,e.markup_bps)/10000 as markup from raw
  ), amounts as (
   select *,cost*(1+markup) as exact,sum(cost) over()+round(sum(cost*markup) over()) as target from costs
  ), ranked as (
   select *,floor(exact) as base,row_number() over(order by exact-floor(exact) desc,idx) as rank,sum(floor(exact)) over() as bases from amounts
  ) select coalesce(jsonb_agg(jsonb_build_object(
   'id',idx::text,'description',coalesce(nullif(trim(item->>'description'),''),'Pending source detail'),'unit',coalesce(item->>'unit','ea'),
   'quantity',case when coalesce((item->>'quantityPending')::boolean,false) or coalesce(length(trim(item->>'description')),0)=0 then null else (item->>'quantity')::numeric end,
   'unitPrice',case when coalesce((item->>'priceMissing')::boolean,false) or coalesce(length(trim(item->>'description')),0)=0 then null
    when coalesce((item->>'quantityPending')::boolean,false) then round((item->>'unitCost')::numeric*(1+markup),2)
    when (item->>'quantity')::numeric=0 then 0 else (base+case when rank<=target-bases then 1 else 0 end)/100/(item->>'quantity')::numeric end
  ) order by idx),'[{"id":"pending","description":"Pending source detail","unit":"lot","quantity":null,"unitPrice":null}]'::jsonb) into items from ranked;
 else items:=p_data->'lines';end if;
 if p_action like 'ops:invoice%' then
  if p_action='ops:invoice-create' then tax:=null;pending:=true;else
   if coalesce(length(trim(p_data->>'title')),0) not between 1 and 200 or length(coalesce(p_data->>'notes',''))>4000 or length(coalesce(p_data->>'taxNote',''))>1000 or p_data->>'status' is null or p_data->>'status' not in ('internal_draft','internal_reviewed') then raise exception 'INVALID_INVOICE';end if;
   tax:=(p_data->>'taxAmount')::numeric;pending:=tax is null;
   if tax is not null and (tax<0 or tax>100000000 or tax::text in ('NaN','Infinity','-Infinity')) then raise exception 'INVALID_TAX';end if;
  end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 300 then raise exception 'INVALID_LINES';end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(items))<>jsonb_array_length(items) then raise exception 'DUPLICATE_LINES';end if;
  for line in select value from jsonb_array_elements(items) loop
   if coalesce(length(trim(line->>'description')),0) not between 1 and 500 or coalesce(length(line->>'unit'),0) not between 1 and 30 then raise exception 'INVALID_LINE';end if;
   qty:=(line->>'quantity')::numeric;price:=(line->>'unitPrice')::numeric;
   if qty::text in ('NaN','Infinity','-Infinity') or price::text in ('NaN','Infinity','-Infinity') or qty<0 or price<0 or qty>100000000 or price>100000000 then raise exception 'INVALID_AMOUNT';end if;
   if qty is null or price is null then pending:=true;else subtotal:=subtotal+round(qty*price*100);end if;
  end loop;
  if subtotal+coalesce(round(tax*100),0)>900000000000000 then raise exception 'AMOUNT_LIMIT';end if;
  total:=case when pending then null else subtotal+round(tax*100) end;
  if p_action='ops:invoice-create' then
   insert into public.commercial_invoices(id,organization_id,project_id,source_estimate_id,source_version,source_snapshot,title,lines,tax_amount,known_subtotal_cents,tax_cents,total_cents,preliminary,created_by,updated_by)
    values((p_data->>'id')::uuid,m.organization_id,pid,e.id,e.version,to_jsonb(e),'Internal draft · '||left(e.title,180),items,tax,subtotal,null,total,pending,actor,actor) returning to_jsonb(commercial_invoices.*) into response;
  else
   if v.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
   update public.commercial_invoices set title=trim(p_data->>'title'),lines=items,tax_amount=tax,tax_note=coalesce(p_data->>'taxNote',''),notes=coalesce(p_data->>'notes',''),known_subtotal_cents=subtotal,tax_cents=round(tax*100),total_cents=total,preliminary=pending,status=p_data->>'status',version=version+1,updated_by=actor,updated_at=now() where id=v.id returning to_jsonb(commercial_invoices.*) into response;
  end if;
 end if;
 insert into commercial_private.receipts(actor,request_id,action,input,response) values(actor,rid,p_action,p_data,response);
 return response;
end $$;
revoke all on all functions in schema commercial_private from public,anon;
grant execute on function commercial_private.gateway(text,jsonb) to authenticated;
create or replace function public.sales_gateway(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select case when p_action like 'ops:%' then commercial_private.gateway(p_action,p_data) else sales_private.gateway(p_action,p_data) end
$$;
revoke all on function public.sales_gateway(text,jsonb) from public,anon;
grant execute on function public.sales_gateway(text,jsonb) to authenticated;

-- REVIEW DRAFT. Apply after sales/commercial, before enabling production capabilities.

grant usage on schema sales_private to service_role;
grant select(user_id,role,active) on public.sales_memberships to service_role;
create function sales_private.valid_member(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sales_memberships m join public.beta_accounts b on b.user_id=m.user_id where m.user_id=p_owner and m.active
  and ((b.role='seller' and m.role='seller') or (b.role in ('admin','operator') and m.role='manager')))
$$;
revoke all on function sales_private.valid_member(uuid) from public,anon,authenticated;
-- No caller-supplied owner on the browser helper.
create or replace function sales_private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select sales_private.valid_member(auth.uid())
$$;
grant execute on function sales_private.active_member() to authenticated;
do $$declare t text;begin
 foreach t in array array['clients','projects','estimates','estimate_messages','estimate_revisions','ai_conversations','ai_settings','ai_attachments'] loop
  execute format('create policy organization_membership_required on public.%I as restrictive for all to authenticated using(sales_private.active_member()) with check(sales_private.active_member())',t);
 end loop;
end $$;

create function sales_private.guard_owned_write() returns trigger language plpgsql security definer set search_path='' as $$
declare role_name text;
begin
 select role into role_name from public.beta_accounts where user_id=new.owner_id;
 if not sales_private.valid_member(new.owner_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if role_name='seller' then
  if tg_table_name='ai_settings' then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  if new.client_id is not null or new.project_id is not null then raise exception 'SALES_USE_SNAPSHOT_LINK' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function sales_private.guard_owned_write() from public,anon,authenticated;
create trigger sales_estimate_write before insert or update on public.estimates for each row execute function sales_private.guard_owned_write();
create trigger sales_conversation_write before insert or update on public.ai_conversations for each row execute function sales_private.guard_owned_write();
create trigger sales_settings_write before insert or update on public.ai_settings for each row execute function sales_private.guard_owned_write();
create policy seller_standalone_estimates on public.estimates as restrictive for all to authenticated
 using(public.beta_account_role()<>'seller' or (project_id is null and client_id is null)) with check(public.beta_account_role()<>'seller' or (project_id is null and client_id is null));
create policy seller_standalone_conversations on public.ai_conversations as restrictive for all to authenticated
 using(public.beta_account_role()<>'seller' or (project_id is null and client_id is null)) with check(public.beta_account_role()<>'seller' or (project_id is null and client_id is null));

create function sales_private.enroll_new_project() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.sales_memberships;
begin
 select * into m from public.sales_memberships where user_id=new.owner_id and active and role='manager';
 if found and sales_private.valid_member(new.owner_id) then
  insert into public.sales_project_access(project_id,organization_id,assigned_to) values(new.id,m.organization_id,null);
 end if;
 return new;
end $$;
revoke all on function sales_private.enroll_new_project() from public,anon,authenticated;
create trigger sales_new_project after insert on public.projects for each row execute function sales_private.enroll_new_project();

create function sales_private.server_review(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;c public.ai_conversations;e jsonb;r jsonb;
begin
 select m.organization_id into org from public.sales_memberships m join public.beta_accounts b on b.user_id=m.user_id
  where m.user_id=p_actor and m.active and m.role='manager' and b.role='admin';
 if org is null then raise exception 'BETA_ADMIN_REQUIRED' using errcode='42501';end if;
 if p_id is null then return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
  select conversation.id,conversation.title,conversation.estimate_id,conversation.created_at,conversation.updated_at,m.name as owner_name from public.ai_conversations conversation
  join public.sales_memberships m on m.user_id=conversation.owner_id where m.organization_id=org and m.active and sales_private.valid_member(m.user_id)
  order by conversation.updated_at desc limit 100) x);end if;
 select x.* into c from public.ai_conversations x join public.sales_memberships m on m.user_id=x.owner_id
  where x.id=p_id and m.organization_id=org and m.active and sales_private.valid_member(m.user_id);
 if not found then return null;end if;
 select to_jsonb(x) into e from public.estimates x where x.id=c.estimate_id and x.owner_id=c.owner_id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.version desc),'[]') into r from (
  select * from public.estimate_revisions where estimate_id=c.estimate_id and owner_id=c.owner_id order by version desc limit 50) x;
 return jsonb_build_object('conversation',to_jsonb(c),'estimate',e,'revisions',r);
end $$;
revoke all on function sales_private.server_review(uuid,uuid) from public,anon,authenticated;
grant execute on function sales_private.server_review(uuid,uuid) to service_role;
create function public.sales_server_review(p_actor uuid,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select sales_private.server_review(p_actor,p_id)$$;
revoke all on function public.sales_server_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sales_server_review(uuid,uuid) to service_role;
-- Remove the historical global-single-operator review shortcut, including old server callers.
create or replace function public.beta_review(p_actor uuid,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select sales_private.server_review(p_actor,p_id)$$;
revoke all on function public.beta_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beta_review(uuid,uuid) to service_role;

-- REVIEW DRAFT. Apply only after explicit remote-security approval and schema preflight.
-- Requires the reviewed sales schema; no data seeds, users or owner reassignment.

create schema actual_cost_private;
revoke all on schema actual_cost_private from public,anon,authenticated;
grant usage on schema actual_cost_private to service_role;
create table public.estimate_actual_costs(
 owner_id uuid not null references public.beta_accounts(user_id),estimate_id uuid not null references public.estimates(id),request_id uuid not null,
 category text not null check(category in ('material','labor','equipment','other')),amount_cents bigint not null check(amount_cents between 0 and 100000000),
 cost_date date not null,note text not null check(length(note) between 3 and 500),input jsonb not null,
 estimate_version integer not null check(estimate_version>0),budget_snapshot jsonb not null,recorded_at timestamptz not null default now(),
 primary key(owner_id,request_id));
create index actual_cost_owner_estimate on public.estimate_actual_costs(owner_id,estimate_id,recorded_at);
alter table public.estimate_actual_costs enable row level security;
revoke all on public.estimate_actual_costs from public,anon,authenticated;
-- The service has function access only; ordinary clients have neither table nor function grants.
create function actual_cost_private.gateway(p_owner uuid,p_estimate uuid,p_input jsonb,p_snapshot jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.estimates;previous public.estimate_actual_costs;entry public.estimate_actual_costs;rid uuid;amount numeric;
begin
 if not exists(select 1 from public.beta_accounts b join public.sales_memberships m on m.user_id=b.user_id
  where b.user_id=p_owner and b.role in ('admin','operator') and m.role='manager' and m.active) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 -- Serialize retries per owner across instances and validate current estimate version atomically.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into e from public.estimates where id=p_estimate and owner_id=p_owner for share;
 if not found then raise exception 'FORBIDDEN_RELATION' using errcode='42501';end if;
 if p_input is not null then
  if octet_length(p_input::text)>4000 or p_input->>'currency' is distinct from 'USD' then raise exception 'INVALID_ACTUAL_COST';end if;
  rid:=(p_input->>'requestId')::uuid;
  select * into previous from public.estimate_actual_costs where owner_id=p_owner and request_id=rid;
  if found then
   if previous.estimate_id<>p_estimate or previous.input<>p_input then raise exception 'ACTUAL_COST_CONFLICT' using errcode='40001';end if;
  else
   if e.version is distinct from p_version then raise exception 'ACTUAL_COST_CONFLICT' using errcode='40001';end if;
   if jsonb_typeof(p_input->'amountUsd') is distinct from 'number' then raise exception 'INVALID_ACTUAL_COST';end if;
   amount:=(p_input->>'amountUsd')::numeric;
   if amount<0 or amount>1000000 or p_input->>'category' not in ('material','labor','equipment','other') or rid is null
    or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' then raise exception 'INVALID_ACTUAL_COST';end if;
   insert into public.estimate_actual_costs(owner_id,estimate_id,request_id,category,amount_cents,cost_date,note,input,estimate_version,budget_snapshot)
    values(p_owner,p_estimate,rid,p_input->>'category',round(amount*100),(p_input->>'date')::date,p_input->>'note',p_input,p_version,p_snapshot)
    returning * into entry;
  end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('ownerId',x.owner_id,'estimateId',x.estimate_id,'requestId',x.request_id,
  'category',x.category,'amountUsd',x.amount_cents/100.0,'amountCents',x.amount_cents,'date',x.cost_date,'note',x.note,'currency','USD',
  'estimateVersion',x.estimate_version,'recordedAt',x.recorded_at,'budgetSnapshot',x.budget_snapshot,'source','manual-actual-cost',
  'automaticLearning',false,'priceVerification',false) order by x.recorded_at,x.request_id),'[]') from public.estimate_actual_costs x where x.owner_id=p_owner and x.estimate_id=p_estimate);
end $$;
revoke all on function actual_cost_private.gateway(uuid,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function actual_cost_private.gateway(uuid,uuid,jsonb,jsonb,integer) to service_role;
create function public.actual_cost_gateway(p_owner uuid,p_estimate uuid,p_input jsonb default null,p_snapshot jsonb default null,p_version integer default null) returns jsonb
language sql security invoker set search_path='' as $$select actual_cost_private.gateway(p_owner,p_estimate,p_input,p_snapshot,p_version)$$;
revoke all on function public.actual_cost_gateway(uuid,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.actual_cost_gateway(uuid,uuid,jsonb,jsonb,integer) to service_role;

commit;
