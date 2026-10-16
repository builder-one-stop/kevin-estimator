begin;
alter table public.estimates add column finalized_at timestamptz,
 add column finalized_version integer,
 add column finalization_request_id uuid,
 add constraint estimate_finalization_shape check (
  (finalized_at is null and finalized_version is null and finalization_request_id is null) or
  (finalized_at is not null and finalized_version = version and finalization_request_id is not null));

-- Any subsequent edit requires finalizing the new revision. Customer status is independent.
create or replace function public.touch_estimate() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=now(); new.version=old.version+1;
 if (new.title,new.client_id,new.project_id,new.status,new.markup_bps,new.document)
    is distinct from (old.title,old.client_id,old.project_id,old.status,old.markup_bps,old.document)
    or new.finalization_request_id is not distinct from old.finalization_request_id then
  new.finalized_at=null; new.finalized_version=null; new.finalization_request_id=null;
 end if;
 return new;
end $$;

create function public.finalize_estimate(p_id uuid,p_expected integer,p_request_id uuid)
returns public.estimates language plpgsql security invoker set search_path='' as $$
declare e public.estimates; s jsonb; i jsonb;
begin
 if public.beta_account_role() not in ('operator','admin') or public.beta_account_role() is null then
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
commit;
