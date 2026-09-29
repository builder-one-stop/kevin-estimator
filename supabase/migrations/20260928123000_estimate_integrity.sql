-- Keep a linked estimate's client aligned with its project's client, when set.
create function public.validate_estimate_project_client() returns trigger language plpgsql as $$
declare project_client uuid;
begin
  if new.project_id is not null then
    select client_id into project_client from public.projects where id = new.project_id;
    if project_client is not null and new.client_id is distinct from project_client then
      raise exception 'Estimate client must match project client' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_estimate_project_client before insert or update of client_id, project_id on public.estimates
  for each row execute function public.validate_estimate_project_client();

-- Browser clients may save user prompts. Only a trusted server may add assistant replies.
drop policy "Owners create estimate messages" on public.estimate_messages;
create policy "Owners create estimate prompts" on public.estimate_messages for insert to authenticated
  with check (role = 'user' and exists (
    select 1 from public.estimates where id = estimate_id and owner_id = (select auth.uid())
  ));
