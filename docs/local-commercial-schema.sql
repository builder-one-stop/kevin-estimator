-- LOCAL PGLITE DRAFT ONLY. No remote migration or legal invoice issuance.
begin;
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
commit;
