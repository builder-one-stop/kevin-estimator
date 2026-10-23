-- REVIEW DRAFT. Apply only after explicit remote-security approval and schema preflight.
-- Requires the reviewed sales schema; no data seeds, users or owner reassignment.
begin;
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
